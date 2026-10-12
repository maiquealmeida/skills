# Sentry Project

> 🇺🇸 English version: [README_EN-us.md](README_EN-us.md)

Planeja, integra e consulta Sentry em qualquer repositório Git, com scripts Node sem dependências npm. Ajuda a comparar um projeto compartilhado, grupos por finalidade ou projetos isolados, reaproveitar projetos existentes e verificar recebimento de eventos sem expor credenciais na conversa do agente.

## Instalação

```bash
npx skills add maiquealmeida/skills --skill sentry-project
npx skills add maiquealmeida/skills --skill sentry-project -g -a claude-code
```

Para testar o pacote antes de publicá-lo, execute na raiz deste clone:

```bash
npx skills add . --list
npx skills add . --skill sentry-project
```

Requer Git e Node.js 22+. Execute os scripts dentro do repositório que deseja configurar, inclusive em um subdiretório. A raiz é descoberta pelo Git, independentemente de instalação local ou global. Nos exemplos, substitua `<skill-dir>` pelo caminho real da skill instalada; ele não é uma variável expandida pelo shell.

## Como pedir

```text
Use sentry-project para inventariar este repositório e os projetos Sentry.
Compare economia, custo/benefício e isolamento, proponha reaproveitamentos
com mapeamento por serviço e prepare um plano revisável antes de alterar a API.
```

Depois de escolher e autorizar o plano, o agente pode integrar os SDKs e executar as alterações previstas. Instalar a skill não cria projetos nem autoriza push, deploy ou envio de eventos.

## Configuração

Os scripts leem estas fontes, da menor para a maior prioridade:

1. `.env` na raiz Git do projeto.
2. `.env.local` na mesma raiz.
3. Um arquivo JSON de configuração do agente, lendo apenas seu objeto `env`. O padrão é `.claude/settings.local.json`, se existir.
4. Variáveis de ambiente do processo, inclusive valores vazios para desativar um valor herdado.

Selecione outro JSON com `SENTRY_AGENT_CONFIG_FILE` no processo, `.env` ou `.env.local`. O comando `sentry.mjs` também aceita `--config /caminho/settings.json`, com prioridade sobre essa variável. Caminhos relativos são resolvidos na raiz Git; caminhos absolutos são aceitos. Um arquivo explicitamente selecionado ausente ou inválido causa erro. Não há busca automática em configurações globais de agentes.

Qualquer agente pode fornecer variáveis ao processo. Para formatos diferentes de JSON com `env`, use o mecanismo de exportação do agente; o script não interpreta TOML/YAML nem executa arquivos de configuração.

| Variável | Uso |
| --- | --- |
| `SENTRY_ORG_SLUG` | Obrigatória: slug da organização. |
| `SENTRY_ORG_TOKEN` | Token da organização, preferido no modo `auto`. |
| `SENTRY_USER_TOKEN` | Alternativa ou fallback de leitura após HTTP 401/403. Pelo menos um token é necessário para API. |
| `SENTRY_ORG_ID` | Opcional: confere ID e slug por API antes da operação. |
| `SENTRY_AGENT_CONFIG_FILE` | Opcional: caminho do JSON com objeto `env`. |
| `SENTRY_PROJECT_SLUG` | Projeto padrão; `--project` substitui. |
| `SENTRY_ENVIRONMENT` | Ambiente padrão; `--environment` substitui. Sem lista fixa: `development`, `preview-42`, `staging` e `production` são exemplos. |
| `SENTRY_SERVICE` | Serviço padrão para `env`; `--service` substitui. |
| `SENTRY_RELEASE` | Release padrão; `--release` substitui, sem prefixo ou SHA obrigatório. |
| `SENTRY_SPAN_OP` | Operação selecionada na consulta opcional de spans. |
| `SENTRY_SPAN_NAMES` | Nomes de spans permitidos nessa consulta, separados por vírgulas. |

Environment/release/tags de recibos aceitam até 200 caracteres de identificador (`A-Z`, `a-z`, números e `_.@+:/-`), iniciando com letra ou número. Slugs e serviços do comando `env` usam letras minúsculas, números, `_` e `-`.

Exemplo de `.env.local` do projeto, usando **placeholders**:

```dotenv
SENTRY_ORG_SLUG=my-organization
SENTRY_ORG_TOKEN=replace-with-your-token
SENTRY_PROJECT_SLUG=my-app
SENTRY_ENVIRONMENT=development
SENTRY_SERVICE=api
SENTRY_RELEASE=my-app@1.2.0
```

Alternativa em `.claude/settings.local.json`, preservando as demais chaves existentes:

```json
{
  "env": {
    "SENTRY_ORG_SLUG": "my-organization",
    "SENTRY_ORG_TOKEN": "replace-with-your-token",
    "SENTRY_PROJECT_SLUG": "my-app",
    "SENTRY_ENVIRONMENT": "development"
  }
}
```

O formato `env` é compatível com a [configuração do Claude Code](https://code.claude.com/docs/en/settings). A precedência descrita acima pertence ao carregador desta skill; não reproduz todas as regras de configuração do Claude Code. A skill lê os arquivos diretamente, sem precisar reiniciar o agente para reler o JSON, mas variáveis já herdadas pelo processo continuam tendo prioridade.

Mantenha arquivos com credenciais fora do Git e com permissões restritas (por exemplo `0600` no macOS/Linux). O carregador não altera suas permissões nem seu `.gitignore`. Não peça ao agente para exibir arquivos secretos. Os tokens ficam apenas nos scripts administrativos; não os copie para frontend, código ou containers. O host da API é fixo em `https://sentry.io`, sem redirects; self-hosted exige extensão revisada.

## Comandos

```bash
node "<skill-dir>/scripts/sentry.mjs" inventory
node "<skill-dir>/scripts/sentry.mjs" project --project my-app
node "<skill-dir>/scripts/sentry.mjs" keys --project my-app
node "<skill-dir>/scripts/sentry.mjs" events --project my-app
node "<skill-dir>/scripts/sentry.mjs" event --project my-app --event-id 0123456789abcdef0123456789abcdef
node "<skill-dir>/scripts/sentry.mjs" inventory --config .agent/settings.local.json
```

`--token auto|org|user` seleciona credenciais. `auto` alterna tokens apenas em leituras e somente após 401/403; não repete mutações automaticamente. As saídas contêm identificadores e resumos limitados, sem tokens, DSNs ou payloads brutos.

Para consultar uma janela, informe início/fim, ambiente e release (os dois últimos também podem vir da configuração):

```bash
node "<skill-dir>/scripts/sentry.mjs" events --project my-app \
  --start 2026-01-01T12:00:00Z --end 2026-01-01T13:00:00Z \
  --environment staging --release my-app@1.2.0
```

A consulta limita a janela a uma hora e duas páginas. `countsPartial` e `nextPageAvailable` indicam truncamento de paginação; retenção, quotas e ingestão podem limitar dados mesmo quando não há outra página. Ausência de eventos não comprova ausência de falhas.

### Plano e gravação de ambiente

Veja o formato do plano em [references/comandos.md](references/comandos.md). `apply` valida e consulta o estado remoto mesmo em preview, mas só faz POST/PUT com `--execute`:

```bash
node "<skill-dir>/scripts/sentry.mjs" apply --plan /caminho/plano.json
node "<skill-dir>/scripts/sentry.mjs" apply --plan /caminho/plano.json --execute
```

O comando `env` consulta um DSN ativo existente e prepara variáveis da aplicação:

```bash
node "<skill-dir>/scripts/sentry.mjs" env --project my-app \
  --file apps/web/.env.local --environment development --service api
# Acrescente --execute para gravar após revisar o preview.
```

Ele salva `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_SERVICE` e, quando configurada, `SENTRY_RELEASE`. `--prefix NEXT_PUBLIC_` ou `WORKER_` permite variáveis por componente, desde que o bootstrap as leia. Nunca grava tokens administrativos. Recusa destinos rastreados, symlinks e arquivos fora do repo; preserva outras variáveis, adiciona regra específica ao `.gitignore` se necessário e grava atomicamente com modo `0600`. O pai do arquivo deve existir. Isso não comprova que a aplicação carrega o arquivo nem faz deploy.

### Spans e perfis

O helper opcional `incident-receipt.mjs` usa `SENTRY_PROJECT_SLUG`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `SENTRY_SPAN_OP` e `SENTRY_SPAN_NAMES`. Descobre o ID remoto do projeto por slug; não contém IDs de projetos fixos. Veja [recibos de spans e perfis](references/comandos.md#recibos-de-spans-e-perfis). Apenas consulta recursos já existentes; não habilita tracing ou profiling.

## Integração e validação

A skill preserva os detalhes originais dos erros enviados pelo SDK, sem filtros próprios de transporte. Controla consumo por ativação e amostragem autorizadas e mantém falhas de telemetria isoladas do processamento. Recursos adicionais, como replay, logs, anexos e profiling, exigem escolha explícita. Os resumos API omitem payloads para proteger o contexto do agente; não alteram os eventos armazenados.

```bash
node --test "<skill-dir>/scripts/sentry.test.mjs" "<skill-dir>/scripts/incident-receipt.test.mjs"
```

Os testes usam credenciais fictícias, mocks de API e repositórios temporários. Não enviam eventos, não alteram Sentry e não comprovam entrega de SDK em produção. Consulte as instruções em [SKILL.md](SKILL.md), os [cenários](references/cenarios.md) e a [integração por stack](references/implantacao.md).
