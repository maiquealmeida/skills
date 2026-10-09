# orca-layout

## O que é o Orca

O [Orca](https://www.onorca.dev/) é um ambiente de desenvolvimento para agentes: um aplicativo de desktop, livre e de código aberto, feito para rodar vários agentes de código ao mesmo tempo. Cada tarefa ganha o próprio git worktree, o próprio terminal de agente e a própria aba de navegador. Dá para espalhar o mesmo trabalho entre Claude Code, Codex, Cursor CLI e outros agentes de linha de comando sem stash, sem ficar trocando de branch e sem um agente pisar no arquivo do outro.

O Orca não é um modelo e não substitui o git. Você continua usando a assinatura que já tem, e cada worktree continua sendo um worktree de git de verdade. O que ele reúne num só app são os worktrees, os terminais (com abas e panes lado a lado), os diffs, um navegador Chromium embutido e o CLI `orca`, pelo qual scripts e agentes comandam o editor. Roda em macOS, Windows e Linux. A apresentação de um minuto está em [What is Orca?](https://www.onorca.dev/docs).

Esta skill usa esse terminal e esse CLI: abre uma aba, divide os panes e sobe cada projeto em modo de desenvolvimento.

> Abre no [Orca](https://www.onorca.dev) uma aba com um grid de terminais, um pane por projeto, e já inicia cada projeto em modo de desenvolvimento. Para você parar de abrir quatro terminais na mão toda manhã.

O grid vem de um arquivo JSON que mora no próprio repositório (`.orca/layouts/<nome>.layout.json`), então a mesma skill serve para qualquer projeto e qualquer máquina. É Node puro, sem dependências, e roda em macOS, Linux e Windows.

Este README é para quem usa e mantém a skill. As instruções para o agente estão em [`SKILL.md`](SKILL.md) e em [`references/`](references/).

## Sumário

1. [O que é o Orca](#o-que-é-o-orca)
2. [Requisitos e instalação](#requisitos-e-instalação)
3. [Início rápido](#início-rápido)
4. [Como funciona](#como-funciona)
5. [Comandos e opções](#comandos-e-opções)
6. [O arquivo `*.layout.json`](#o-arquivo-layoutjson)
7. [Confiança e segurança](#confiança-e-segurança)
8. [Windows e outras plataformas](#windows-e-outras-plataformas)
9. [Problemas comuns](#problemas-comuns)
10. [Uso pelo agente (a skill)](#uso-pelo-agente-a-skill)
11. [Estrutura do código e testes](#estrutura-do-código-e-testes)

## Requisitos e instalação

- **Orca** instalado e aberto, com o CLI `orca` registrado em *Settings → General → Orca CLI* ([documentação](https://www.onorca.dev/docs/cli/overview)). Depois de registrar, abra um terminal novo.
- **Node.js 18+** no `PATH`, porque cada pane executa `node …`. Testado em 18.20 e 20.19.
- O repositório precisa estar registrado no Orca como worktree (`orca repo add --path <raiz>`). Sem isso o Orca responde `selector_not_found`.

A skill é distribuída com o [skills CLI](https://github.com/vercel-labs/skills):

```bash
# do GitHub
npx skills add maiquealmeida/skills --skill orca-layout -g -a claude-code

# de um clone local, para testar
npx skills add . --skill orca-layout -g -a claude-code
```

Para usar o script direto, sem passar pelo agente, um alias ajuda:

```bash
alias orca-layout='node ~/.agents/skills/orca-layout/scripts/orca-layout.mjs'
```

No PowerShell: `function orca-layout { node "$HOME/.agents/skills/orca-layout/scripts/orca-layout.mjs" @args }`. Ajuste o caminho se a CLI de skills tiver instalado em outro lugar (o `doctor` mostra o caminho real na linha `Script`). Os exemplos abaixo usam `orca-layout` como esse alias.

## Início rápido

**1.** Crie `.orca/layouts/default.layout.json` na raiz do repositório:

```json
{
  "title": "Dev",
  "panes": [
    { "name": "api", "dir": "api", "cmd": "npm run dev" },
    { "name": "web", "dir": "web", "cmd": "npm run dev", "env": { "PORT": "3000" } }
  ]
}
```

**2.** Veja o que vai rodar, sem tocar no Orca:

```console
$ orca-layout plan
Layout "default" · aba "Dev [default]" · 2 pane(s)
Arquivo: /caminho/do/repo/.orca/layouts/default.layout.json
Hash: 5cf001d95bfa039c
  1. api — api
     $ npm run dev
  2. web — web
     $ PORT=3000 npm run dev
Grade:
  [1] api  |  [2] web
Confiança: NÃO confiável (novo ou alterado)
```

**3.** Abra a aba. Um layout novo (ou alterado) só roda depois que você confirma o conteúdo revisado, repetindo o `Hash:` do plano:

```console
$ orca-layout up
…o mesmo plano…
Erro: O layout "default" é novo ou mudou desde a última confirmação. Revise os comandos acima e confirme com: up default --trust 5cf001d95bfa039c

$ orca-layout up --trust 5cf001d95bfa039c
```

Nas próximas vezes `orca-layout up` basta, enquanto o arquivo não mudar.

**4.** Para encerrar:

```console
$ orca-layout down
```

O `down` manda Ctrl+C para cada projeto, espera eles saírem e fecha só a aba desse layout.

Ainda não tem o arquivo de layout? Peça ao agente (veja [Uso pelo agente](#uso-pelo-agente-a-skill)): ele analisa o repositório e propõe um.

## Como funciona

### Visão geral

```
 .orca/layouts/<nome>.layout.json        dados, versionados no repositório
              │  lido, validado e conferido (hash do conteúdo)
              ▼
 orca-layout.mjs up                      Node, sem dependências
              │  orca terminal create · split · show · switch
              ▼
 aba do Orca  [ pane 1 | pane 2 | … ]
              │  cada pane digita: node orca-layout.mjs run-pane <layout> <índice>
              ▼
 run-pane (dentro de cada pane)          confere a confiança · entra na pasta · aplica o env
              │
              ▼
 cmd do projeto (dotnet run, yarn dev…)  ← o Ctrl+C chega direto aqui
```

### O princípio: o pane só digita uma linha

O Orca digita o `--command` no shell que o pane tiver (zsh, PowerShell ou cmd), e `cd`, `&&` e `VAR=x cmd` mudam de um shell para o outro. Em vez de gerar sintaxe por shell, cada pane digita só:

```
node <caminho do script> run-pane <arquivo do layout> <índice do pane>
```

Essa linha é igual em qualquer shell (os caminhos são citados conforme o SO). Quem entra na pasta, aplica o `env` e inicia o projeto é o Node. É por isso que o arquivo de layout separa `dir`, `env` e `cmd`.

### `up`, passo a passo

1. Acha a raiz do repositório e lê `.orca/layouts/<nome>.layout.json`: arquivo comum, até 64 KiB, sem link simbólico.
2. Valida o JSON (todos os problemas de uma vez) e confere as pastas: cada `dir` precisa existir, ser uma pasta e ficar dentro do repositório.
3. Confere a confiança: o SHA-256 do conteúdo contra o `trusted.json`. Se o layout é novo ou mudou, imprime o plano com o `Hash:` e sai com código 3. Com `--trust <hash>` correspondente, segue e grava a confirmação.
4. Confere que o Orca responde (`orca status`) e que não há uma aba desse layout já aberta.
5. Tira um retrato dos terminais do worktree (para a limpeza saber o que é novo) e monta o grid: `terminal create` para o primeiro pane e `terminal split` para os demais. Depois de cada pane espera o veredito do Orca (`terminal show`: encaixado ou órfão) antes de dividir a partir dele.
6. Se qualquer coisa falhar, ou se você apertar Ctrl+C, fecha tudo o que abriu e sai com erro (veja [Tudo ou nada](#tudo-ou-nada)).
7. Traz a aba para a frente (`terminal switch`, em melhor esforço) e imprime o resumo e o comando de `down`.

### O que cada pane executa (`run-pane`)

1. Lê o layout uma única vez e confere a confiança **do conteúdo lido**. Se não estiver confirmado, recusa com código 3 sem iniciar nada.
2. Valida a pasta do pane de novo (existe, é pasta, fica dentro do repo).
3. Imprime `[orca-layout] start <nome> · <dir>` e `[orca-layout] $ <comando>  (env: NOMES)`. Só os **nomes** das variáveis, nunca os valores.
4. Executa o `cmd` pelo shell do sistema, na pasta `dir`, com o `env` por cima do ambiente do pane e o terminal herdado (cores e teclas interativas, como as do `dotnet watch`, continuam funcionando).
5. Ctrl+C: o terminal entrega o sinal ao grupo de processos, então o projeto o recebe direto. O runner ignora o SIGINT e espera o projeto encerrar. SIGTERM e SIGHUP são repassados.
6. Ao terminar imprime `[orca-layout] exit <nome> code=N` (o código do projeto, 128 + sinal se foi morto por sinal, 127 se nem iniciou) e o shell do pane volta ao prompt.

Esses marcadores `start` e `exit` são o que o `down` usa para saber quando o projeto acabou de encerrar.

### `down`

1. Procura, no worktree, as abas cujo título termina em ` [<nome>]`.
2. Lê o estado de cada pane: já encerrou? E guarda o cursor do fim da saída.
3. Manda Ctrl+C (`terminal send --interrupt`) só aos que ainda estão rodando.
4. Espera até `--grace` segundos (15 por padrão) pelo marcador `exit` na saída nova, lida por cursor. O `terminal read` sozinho só devolve as últimas 120 linhas, e num projeto falante o `start` já saiu dessa janela. Terminal que sumiu conta como encerrado; erro passageiro do Orca não conta.
5. Fecha cada aba com `terminal close --tab`, uma chamada por aba. Nunca usa `--all`, que derrubaria todos os terminais do worktree.

Se o prazo estoura, o `down` avisa e fecha a aba mesmo assim.

### Tudo ou nada

`up` só termina com sucesso se todos os panes foram criados **e encaixados** pelo Orca. Com a janela do Orca sem pintar (tela bloqueada, minimizada), o Orca ainda cria os splits, mas como terminais soltos em segundo plano: o projeto roda, segurando portas, sem nenhum painel visível. Por isso, se algo falhar (encaixe recusado, timeout, erro inesperado, Ctrl+C), o `up` fecha tudo o que abriu, inclusive terminais novos que o Orca criou sem devolver o handle, e diz o que não conseguiu fechar, com o comando para fechar cada um. Terminais que já existiam, ou que você abriu no meio do caminho, ficam intactos.

### Como a aba é identificada

O `up` dá à aba o título `<title> [<nome>]`, por exemplo `Dev Confia [default]`. O `down` e a checagem de "aba já aberta" procuram abas cujo título **termina** em ` [<nome>]`. Assim um layout não consegue fazer o `down` fechar outra aba sua só escolhendo um título, e editar o `title` depois do `up` não impede o `down`.

## Comandos e opções

```
orca-layout [ação] [nome] [opções]
```

| Ação | O que faz |
| --- | --- |
| `up [nome]` (padrão) | Abre a aba do layout e inicia os projetos. |
| `down [nome]` | Envia Ctrl+C, espera os projetos encerrarem e fecha a aba. |
| `plan [nome]` | Valida o layout e mostra o que seria executado, com o `Hash:`. Não toca no Orca. |
| `list` | Lista os layouts do repositório (e aponta os inválidos). |
| `doctor` | Diagnóstico: plataforma e Node, caminho do script, CLI do Orca e versão, se o Orca responde, se o worktree é conhecido, layouts e arquivo de confiança. |
| `run-pane <layout> <índice>` | Interno: é o que cada pane executa. Não chame à mão. |

O nome padrão é `default`. `orca-layout backend` equivale a `orca-layout up backend`.

| Opção | Efeito |
| --- | --- |
| `--trust <hash>` | Confirma um layout novo ou alterado: repete o `Hash:` do plano que você revisou (mínimo de 12 caracteres). |
| `--grace <s>` | Segundos de espera pelo encerramento no `down`. Padrão 15. |
| `--root <dir>` | Raiz do repositório. Padrão: a do diretório atual. |
| `-h`, `--help` | Mostra a ajuda. |

**Códigos de saída**

| Código | Significado |
| --- | --- |
| 0 | Concluído. |
| 1 | Erro (a mensagem vai para o stderr). |
| 2 | Layout não encontrado. |
| 3 | Layout novo ou alterado: falta confirmar com `--trust <hash>`. |
| 130 | `up` interrompido por Ctrl+C (o que foi aberto foi desfeito). |

**Variáveis de ambiente**

| Variável | Efeito |
| --- | --- |
| `ORCA_CLI_COMMAND` | Executável do CLI do Orca. Tem prioridade sobre tudo. |
| `ORCA_DEV_REPO_ROOT` | Num checkout de desenvolvimento do Orca, usa `orca-dev`. |
| `ORCA_LAYOUT_STATE_DIR` | Muda a pasta do `trusted.json` (padrão `~/.config/orca-layout`). Os panes herdam o ambiente do Orca, não o do shell que rodou o `up`: se usar isso, defina no ambiente do próprio Orca. |

Sem `ORCA_CLI_COMMAND`, a escolha do CLI segue os guias oficiais do Orca: `orca-dev` se houver `ORCA_DEV_REPO_ROOT`; no Linux, fora de um terminal do Orca, `orca-ide` (o `orca` puro costuma ser o leitor de tela GNOME); senão `orca`.

## O arquivo `*.layout.json`

### Onde fica e como se chama

```
<raiz do repositório>/.orca/layouts/<nome>.layout.json
```

- A **raiz** é o ancestral mais próximo com `.git` (pasta, ou arquivo, no caso de worktree). Fora de um repositório vale a pasta atual. `--root` força outra.
- O **nome** é o nome do arquivo sem `.layout.json`: letras, números, `-` e `_`, começando por letra ou número. Não pode ser `up`, `down`, `plan`, `list`, `doctor`, `run-pane` nem `help`.
- Cada arquivo é um layout. Um repositório pode ter vários (`default`, `backend`, `web`…), e você escolhe pelo nome: `orca-layout up backend`.

### Exemplo anotado

Os comentários abaixo são só para explicar. O arquivo real é JSON puro, sem comentários.

```jsonc
{
  // opcional: título da aba. Padrão "Layout". Na aba aparece como "Dev Confia [default]"
  "title": "Dev Confia",

  // opcional: quantos panes por linha. Padrão 2
  "columns": 2,

  // obrigatório: de 1 a 16 panes, em ordem de leitura (esquerda→direita, cima→baixo)
  "panes": [
    {
      "name": "ConfiaAPI",                         // obrigatório e único: rótulo no plano e no cabeçalho do pane
      "dir": "microservices/Api/src/ConfiaAPI",    // opcional (padrão "."): pasta relativa à raiz do repositório
      "cmd": "dotnet run --launch-profile https",  // obrigatório: o comando que inicia o projeto (uma linha)
      "env": { "PROMETHEUS_PORT": "5101" }         // opcional: variáveis de ambiente extras
    }
  ]
}
```

### Campos

**Nível raiz**

| Campo | Obrigatório | Padrão | Descrição |
| --- | --- | --- | --- |
| `title` | não | `Layout` | Título da aba, exibido como `<title> [<nome>]`. Até 80 caracteres, sem `"`, `%` nem `\`, e não pode começar com `-`. |
| `columns` | não | `2` | Panes por linha (inteiro maior ou igual a 1). Com menos panes que colunas, vale o número de panes. |
| `panes` | sim | n/a | De 1 a 16 panes. A ordem da lista é a ordem de leitura do grid. |
| `$schema`, `description` | não | n/a | Ignorados. Servem para editores e anotações. |

**Cada item de `panes`**

| Campo | Obrigatório | Padrão | Descrição |
| --- | --- | --- | --- |
| `name` | sim | n/a | Rótulo único, até 80 caracteres. Aparece no plano e no cabeçalho do pane. |
| `dir` | não | `.` | Pasta de trabalho, relativa à raiz do repositório, com `/` como separador. Não pode ser absoluta, conter `\` ou `:`, nem subir com `..`. Precisa ser uma pasta que resolva para dentro do repositório (links simbólicos para fora são recusados). |
| `cmd` | sim | n/a | O comando que inicia o projeto. Uma linha, até 2000 caracteres. |
| `env` | não | `{}` | Variáveis extras. Nomes no formato `[A-Za-z_][A-Za-z0-9_]*`. Valores podem ser texto, número ou booleano (viram texto, até 2000 caracteres). |

Qualquer outra chave é erro, o que pega typos como `colums`.

### Como os panes viram um grid

Os panes entram em **ordem de leitura**: da esquerda para a direita e de cima para baixo, `columns` por linha. A última linha pode ficar mais curta, e então o pane dela ocupa a largura toda.

```
columns: 2 · 4 panes             columns: 2 · 3 panes
┌────────────┬────────────┐      ┌────────────┬────────────┐
│ 1          │ 2          │      │ 1          │ 2          │
├────────────┼────────────┤      ├────────────┴────────────┤
│ 3          │ 4          │      │ 3                       │
└────────────┴────────────┘      └─────────────────────────┘
```

O Orca só divide ao meio, então com 3 ou mais colunas, ou 3 ou mais linhas, os tamanhos saem desiguais (por exemplo 50%, 25% e 25%). Arraste as divisórias se isso incomodar.

Como o grid é montado: o primeiro pane é criado; cada linha nova divide o pane da linha de cima (para baixo); depois cada linha é dividida para a direita até completar as colunas.

### `cmd` e `env` na prática

- O `cmd` roda pelo shell do sistema (`/bin/sh -c` no macOS e Linux, `cmd.exe` no Windows), em `dir`, com `env` por cima do ambiente do pane.
- Escreva o `cmd` como um comando simples que funcione em `sh` e em `cmd.exe`: evite `cd`, `&&`, `;`, pipes e prefixos `VAR=valor cmd`. Isso é por portabilidade, a skill não impõe. A pasta vai em `dir`, as variáveis em `env`, e se o projeto precisa de mais de um passo, ponha os passos num script ou numa tarefa do projeto e chame esse.

```jsonc
// evite
{ "name": "api", "cmd": "cd api && PORT=3000 npm run dev" }

// prefira
{ "name": "api", "dir": "api", "cmd": "npm run dev", "env": { "PORT": "3000" } }
```

- Variáveis que mudam **o que executa** sem aparecer no comando (`NODE_OPTIONS`, `LD_PRELOAD`, `PATH`, `PYTHONPATH`, `JAVA_TOOL_OPTIONS`, `GIT_SSH_COMMAND`, entre outras) são destacadas com ⚠ no plano. Elas são legítimas em alguns casos, então só aparecem em evidência para quem revisa.

### Limites e regras de validação

- O arquivo tem até 64 KiB, precisa ser um arquivo comum (links simbólicos e arquivos especiais são recusados) e pode ter BOM.
- Todo texto (`title`, `name`, `dir`, `cmd`, valores de `env`) rejeita caracteres de controle: sequências de escape, quebras de linha, separadores Unicode de linha e marcas bidi. Eles poderiam esconder ou forjar linhas do plano que você revisa.
- As mensagens de erro juntam **todos** os problemas, para você corrigir de uma vez.

### Erros comuns

| Mensagem | Causa |
| --- | --- |
| `campo desconhecido: "colums"` | Typo no nome de um campo. |
| `panes[1]: "name" repetido: "a"` | Dois panes com o mesmo `name`. |
| `panes[0]: "dir" deve ser relativo à raiz do repositório ("/etc")` | `dir` absoluto. |
| `panes[0]: "dir" não pode sair da raiz do repositório ("../fora")` | `dir` com `..` que escapa do repo. |
| `panes[0]: "cmd" é obrigatório (…)` | Pane sem `cmd`, ou com `cmd` vazio, multilinha ou com caractere de controle. |
| `"title" deve ter até 80 caracteres, sem aspas, "%", "\" nem caracteres de controle, e não pode começar com "-"` | Título fora das regras. |
| `Pastas com problema no layout …` | O JSON é válido, mas um `dir` não existe, não é pasta ou resolve para fora do repo. |

### Exemplo real: os microsserviços do Confia

Quatro projetos em duas colunas. Pela ordem de leitura, a primeira linha é `ConfiaAPI | AuthorizationAPI` e a segunda é `ConfiaBff | AuthorizationWorkerService`:

```json
{
  "title": "Dev Confia",
  "columns": 2,
  "panes": [
    {
      "name": "ConfiaAPI",
      "dir": "microservices/Api/src/ConfiaAPI",
      "cmd": "dotnet run --launch-profile https",
      "env": { "PROMETHEUS_PORT": "5101" }
    },
    {
      "name": "AuthorizationAPI",
      "dir": "microservices/Authorizations/src/AuthorizationAPI",
      "cmd": "dotnet run --launch-profile https",
      "env": { "PROMETHEUS_PORT": "5102" }
    },
    {
      "name": "ConfiaBff",
      "dir": "microservices/BFF/src/ConfiaBff",
      "cmd": "dotnet run --launch-profile https"
    },
    {
      "name": "AuthorizationWorkerService",
      "dir": "microservices/Authorizations/src/AuthorizationWorkerService",
      "cmd": "dotnet run",
      "env": { "PROMETHEUS_PORT": "5103" }
    }
  ]
}
```

### Outros exemplos

Monorepo JavaScript, API e web lado a lado:

```json
{
  "title": "Dev",
  "panes": [
    { "name": "api", "dir": "packages/api", "cmd": "yarn dev" },
    { "name": "web", "dir": "packages/web", "cmd": "yarn dev", "env": { "PORT": "3000" } }
  ]
}
```

Tarefas na raiz, empilhadas numa coluna só:

```json
{
  "title": "Docs",
  "columns": 1,
  "panes": [
    { "name": "site", "cmd": "npm run docs:serve" },
    { "name": "tests", "cmd": "npm run test:watch" }
  ]
}
```

## Confiança e segurança

Um layout faz o Orca digitar comandos na sua máquina, e ele vem de um repositório que pode não ser seu (um `git clone` qualquer pode trazer um). Por isso:

- **Novo ou alterado, não roda.** O `up` mostra o plano (comandos, `env`, grade e `Hash:`) e sai com código 3. Você revisa e confirma com `--trust <hash>`.
- **A confirmação vale para aquele conteúdo.** O `--trust` leva o hash do plano que você viu. Se o arquivo mudou depois da revisão, a confirmação é recusada e o plano novo é mostrado de novo.
- **Fica guardada por arquivo**, em `~/.config/orca-layout/trusted.json` (pasta `0700`, arquivo `0600`, escrita atômica). Mudou um byte, pede de novo. A confiança é por caminho: o mesmo layout em outro clone ou worktree pede confirmação de novo.
- **O `run-pane` também confere.** A linha antiga no histórico do pane (↑ e Enter) não executa o conteúdo novo depois de um `git pull`, e o texto executado é exatamente o que foi conferido.
- **O arquivo é tratado como entrada hostil**: tamanho limitado, só arquivo comum, JSON estrito, texto sem caracteres de controle, `dir` dentro do repositório (inclusive via link simbólico), e título que não vira flag do CLI do Orca.
- **Os nomes de arquivo também**: nomes com caracteres de controle saem escapados em `list` e `doctor`.

**O que a confirmação não cobre:** ela cobre a linha de comando e o `env` que você viu, não o código por trás. `yarn dev` executa o `package.json` do repositório, e `./scripts/dev.sh` executa aquele script. Leia o que o comando faz antes de confirmar.

**Segredos:** o layout vive no git e o plano imprime os valores de `env`. Não ponha segredos nele. O pane imprime só os nomes das variáveis.

## Windows e outras plataformas

- **Shell dos panes.** No Windows os terminais do Orca usam PowerShell (o padrão recomendado) ou CMD, configurável em *Settings → Terminal*. Como o pane só digita `node …`, os dois funcionam. Nos panes CMD, nomes simples de comando são procurados primeiro na pasta atual, então prefira PowerShell.
- **CLI do Orca.** Pode ser um `orca.exe` (chamado direto) ou um `orca.cmd` (que só roda via `cmd.exe`). O script resolve sempre o caminho **absoluto** no `PATH`: ele nunca roda um `orca.cmd` ou `orca.exe` que esteja na pasta do repositório. `ORCA_CLI_COMMAND` pode apontar para um `.exe` num caminho com espaços.
- **Caminhos com `.cmd`.** O `cmd.exe` não aceita aspas dentro de argumentos. Se o CLI for um `.cmd`, mantenha a skill e o repositório em caminhos só com letras ASCII, números e `. _ - /` (sem espaços, acentos ou parênteses). O `doctor` avisa quando isso importa.
- **Caminhos nos comandos.** No Windows os caminhos vão com `/` (o Node e os shells aceitam). Caminhos que contenham `"`, `%`, `^`, `!`, `$`, crase ou aspas curvas (`“` `”` `„`) são recusados, porque o `cmd.exe` e o PowerShell os expandiriam ou os tratariam como aspas.
- **Linux.** Fora de um terminal do Orca o CLI é `orca-ide` (veja [Comandos e opções](#comandos-e-opções)).
- **Testado em:** macOS com Orca 1.4.218. **Windows e Linux não foram testados** (o código foi escrito para eles e tem testes unitários das ramificações de plataforma, mas nunca rodou numa máquina Windows). WSL e Git Bash não são cobertos. Numa máquina nova, comece por `orca-layout doctor`.

## Problemas comuns

| Sintoma | Causa provável | O que fazer |
| --- | --- | --- |
| `O Orca não está acessível (…)` | Orca fechado, ou CLI não registrada. | Abra o Orca (`orca open`) e rode `doctor`. |
| `CLI do Orca não encontrada ("orca")` | O CLI não está no `PATH`. | Registre em *Settings → General → Orca CLI* e abra um terminal novo, ou defina `ORCA_CLI_COMMAND`. |
| `O Orca não reconhece path:… como worktree` | O repositório não está no Orca. | `orca repo add --path <raiz>`. |
| `…mas não o encaixou na aba — a janela do Orca provavelmente está oculta…` | A janela do Orca não está pintando (tela bloqueada, minimizada ou coberta). | Traga o Orca para a frente e rode de novo. O `up` já desfez o que tinha aberto. |
| `A aba do layout "x" já está aberta` | Já existe uma aba desse layout. | Rode `down` antes. |
| Código 3: `O layout "x" é novo ou mudou…` | Layout ainda não confirmado, ou alterado. | Revise o plano e rode `up x --trust <hash>`. |
| Num pane: `O layout "x" não está confirmado (ou mudou desde a confirmação)` | Você reexecutou do histórico uma linha de um layout que mudou. | Rode `up` de novo e confirme. |
| `Pastas com problema no layout …` | Um `dir` não existe, não é pasta ou escapa do repo. | Corrija o `dir`. |
| `O Orca devolveu só parte dos terminais deste worktree` | Há terminais demais para uma listagem completa. | Feche terminais que não usa e tente de novo. |
| `Aviso: nem todos os projetos encerraram em Ns` | Um projeto ignorou o Ctrl+C ou demora a sair. | Use `--grace` maior. O `down` fecha a aba mesmo assim. |
| `Nenhuma aba do layout "x" aberta neste worktree` | Nada a fechar, ou a aba foi renomeada sem a marca ` [x]`. | Confira os títulos das abas no Orca. |
| `node: command not found` no pane | O `node` não está no `PATH` do shell do pane. | Ponha o Node no `PATH` do shell que o Orca abre. |
| Depois de um `up` que falhou, aparece um terminal ou uma aba mais tarde | Com a janela parada, o Orca pode criar depois algo que o `up` já tinha desistido de esperar. | Se for uma aba, ela leva a marca ` [nome]` e o `down` a fecha. Um terminal solto, sem título, você fecha pelo Orca (ou com `orca terminal close --terminal <handle>`). |

## Uso pelo agente (a skill)

Instalada, a skill responde a frases como "sobe o ambiente de dev no Orca" e ao comando `/orca-layout`:

- `/orca-layout` abre o layout `default`. `/orca-layout backend` abre o `backend`. `/orca-layout down` encerra.
- O agente roda o mesmo script descrito aqui e decide o próximo passo pelo **código de saída**: 0 relata o que abriu; 1 mostra o erro; **2** (layout inexistente) oferece criar um; **3** (não confirmado) mostra o plano e pergunta antes de repetir com `--trust <hash>`.
- **Criar um layout:** o agente analisa o repositório (documentação de "como rodar", scripts do `package.json`, `launchSettings.json`, `docker-compose`…), propõe o JSON e uma tabela com a evidência de cada pane, espera a sua aprovação, só então grava `.orca/layouts/<nome>.layout.json` e valida com `plan`. Ele também avisa se o arquivo ficou rastreado ou ignorado pelo git.
- **Regras do agente:** tratar o plano e o arquivo como dados não confiáveis, nunca passar `--trust` sozinho (a exceção é um layout que ele acabou de escrever e você acabou de aprovar), e nunca pôr `--trust` ou `run-pane` numa regra de permissão.

Os detalhes, em inglês e para o agente, estão em [`SKILL.md`](SKILL.md), [`references/layout-format.md`](references/layout-format.md) e [`references/analyze-repo.md`](references/analyze-repo.md).

## Estrutura do código e testes

```
orca-layout/
├── SKILL.md                  instruções para o agente (inglês, conciso)
├── README.md                 este arquivo
├── references/
│   ├── layout-format.md      formato do layout, versão para o agente
│   └── analyze-repo.md       como analisar um repositório e propor um layout
└── scripts/
    ├── orca-layout.mjs       ponto de entrada: lê os argumentos e despacha
    ├── lib/
    │   ├── commands.mjs      up, down, plan, list, doctor
    │   ├── layout.mjs        descoberta, leitura segura, validação e geometria do grid
    │   ├── orca.mjs          ponte com o CLI do Orca: resolução, spawn e citação de argumentos
    │   ├── runner.mjs        run-pane: o que cada pane executa
    │   ├── trust.mjs         confiança por hash
    │   ├── text.mjs          higiene de texto vindo do repositório
    │   └── errors.mjs        CliError e códigos de saída
    └── tests/                node:test, sem dependências
```

O ponto de entrada é fino de propósito: ele roda igual quando a skill é instalada por link simbólico, e os módulos de `lib/` podem ser importados pelos testes sem executar nada.

**Rodando os testes** (da raiz do repositório de skills, sem instalar nada):

```bash
node --test skills/orca-layout/scripts/tests/*.test.mjs
```

No Windows, use Node 21+ com o glob entre aspas, ou liste os arquivos. Os testes usam um Orca falso em memória que modela a geometria dos panes, o encaixe pela UI e o scrollback; os que dependem de processos reais (Ctrl+C no grupo de processos, link simbólico, FIFO) são pulados no Windows.

### Notas para quem mantém

Coisas que custaram investigação e que o código assume:

- **Sentido do split.** No app do Orca, `terminal split --direction vertical` abre o pane novo à **direita** e `horizontal` abre **abaixo**. O guia embutido do CLI diz o contrário; vale o comportamento do app (o CLI e o runtime repassam o `direction` sem inverter, e o renderer o mapeia para `flex-direction: row`). Os testes verificam a **posição física** dos panes, não só os literais.
- **Sem `--focus` no `create`.** Com a janela parada o Orca estoura em 10 s. A aba é revelada depois, com `terminal switch`, em melhor esforço.
- **Encaixe.** `terminal show` devolve `paneRuntimeId` `-1` (pendente) ou `>= 0` (encaixado), e `orphaned: true` quando o Orca desiste, cerca de 2 s depois da criação. Olhar a listagem uma vez só não basta, porque ela ainda mostra o pane na aba durante essa janela.
- **Scrollback.** `terminal read` devolve só as últimas 120 linhas, e `--cursor <n>` devolve só o que veio depois. `terminal list` aceita `--limit` e traz `truncated`: uma lista parcial é recusada.
- **Fechar.** `terminal close --tab` fecha a aba inteira. `--worktree … --all` derruba todos os terminais do worktree e nunca é usado.
- **Mensagens e comentários** do código estão em pt-BR, como na skill `statusline`. O `SKILL.md` e as `references/` ficam em inglês, porque são lidos pelo agente.
