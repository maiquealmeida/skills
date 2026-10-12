# Resolução de diretório e arquivo

A skill interpreta os modos antes de chamar o helper:

| Invocação | Ação |
| --- | --- |
| `$session-handoff` | Atualizar o único ativo; criar se nenhum; perguntar se vários ou identificação incerta. |
| `$session-handoff --prepare` | Preparar proposta, em segundo plano se disponível; não gravar nem retomar trabalho. |
| `$session-handoff --create` | Selecionar criação explicitamente, delimitando assuntos e respeitando arquivos existentes. |
| `$session-handoff --update runpod-falhas-intermitentes` | Atualizar o arquivo indicado e encerrar. |
| `$session-handoff runpod-falhas-intermitentes.md` | Ler e continuar o trabalho autorizado. |
| `$session-handoff docs/incidentes/ativos/runpod-falhas-intermitentes/runpod-falhas-intermitentes.md` | Retomar o arquivo relativo à raiz, fora do padrão. |
| `$session-handoff --update "/caminho com espaços/handoff.md"` | Atualizar o arquivo absoluto selecionado e encerrar. |

O arquivo pode ser indicado por basename ou path, com ou sem extensão; espaços devem ser tratados como parte de um único argumento citado. Ele não é tema de pesquisa livre nem comando. `--update` exige um arquivo; `--create` e `--prepare` não recebem arquivo; opções desconhecidas ou modos combinados exigem correção, sem executar outro modo por aproximação. O pedido explícito em linguagem natural tem precedência sobre o modo padrão.

O helper resolve somente diretório/arquivo: não aceita `--create`/`--update`/`--prepare`, não detecta handoff ativo e não acessa o histórico da conversa. O principal usa o argumento extraído do modo explícito ou o caminho completo do registro ativo, preservando espaços e diretórios. Não passar as opções da skill ao helper.

Configuração opcional na raiz do projeto:

```yaml
handoff:
  path: _meta/handoff/in-progress/
```

`handoff.path: _meta/handoff` significa **exatamente** `_meta/handoff`, sem adicionar subdiretório. Um caminho absoluto permite usar outro diretório escolhido pelo operador. A configuração ausente ou a propriedade ausente usa o padrão; uma propriedade presente precisa ser string não vazia. Ao resolver descoberta/criação ou basename, YAML malformado, chaves duplicadas ou estrutura incompatível devem produzir erro, sem fallback silencioso. Um path explícito não consulta essa configuração, mesmo se inválida. Não criar/editar configuração por conta própria.

## Helper somente leitura

Requer Python 3.9+ e PyYAML. Com PyYAML disponível, pode usar `python` diretamente; o comando com `uv --with pyyaml` não exige instalação global. Se não houver esses recursos, resolver com as ferramentas do ambiente, mantendo as mesmas regras e usando um parser YAML quando a configuração for consultada; não improvisar parsing por grep.

```sh
uv run --with pyyaml python <skill>/scripts/resolve_handoff.py --root <projeto>
uv run --with pyyaml python <skill>/scripts/resolve_handoff.py --root <projeto> nome-do-arquivo
uv run --with pyyaml python <skill>/scripts/resolve_handoff.py --root <projeto> "docs/handoffs com espaços/caso.md"
uv run --with pyyaml python <skill>/scripts/resolve_handoff.py --root <projeto> -- /caminho/absoluto/caso.md
```

Sem arquivo, retorna diretório e fonte da configuração para a criação, sem gravar nada; isso não determina o modo da skill. Com arquivo, retorna caminho real e SHA-256 do arquivo existente para leitura/conferência, sem executar seu conteúdo. `source: explicit_path` identifica seleção direta e `directory` informa o diretório da seleção; `file` contém o destino real após resolver links. Paths explícitos mantêm a raiz fornecida em `root`, mesmo fora do projeto. O helper só lê o arquivo selecionado e, quando aplicável, a configuração; nunca passar credenciais como handoff. Não carregar todos os candidatos só para escolher um.

- Basename (sem `/`): buscar apenas no diretório configurado ou padrão. Para indicar um arquivo na raiz do projeto, usar `./arquivo.md`.
- Path com `/` ou absoluto após expandir `~`: relativo à raiz fornecida, nunca ao cwd nem a `handoff.path`. Aceitar diretórios arbitrários dentro/fora do projeto, inclusive `../`, `ativos` e `arquivados`; não pesquisar recursivamente nem fazer fallback para basename. Usar sintaxe de paths do ambiente POSIX; barras invertidas e NUL são rejeitados. `~` é expandido, variáveis como `$HOME`, glob e substituições de shell não são avaliadas. Passar argumentos como dados; no CLI, usar `--` antes de um arquivo cujo nome comece com hífen.
- Com extensão: correspondência exata. Sem extensão: considerar o arquivo exato e o mesmo arquivo com `.md`. Se ambos existirem, é ambíguo; perguntar qual usar, inclusive para paths explícitos. Um diretório não é arquivo válido.
- Na descoberta por basename, o arquivo precisa estar dentro do diretório configurado inclusive após resolver links simbólicos; um link para fora não é selecionado. O diretório configurado em si pode ser absoluto ou um link. Um path explícito pode selecionar links para arquivos externos; registrar seu destino real e preservar a raiz/checkout e o escopo autorizados.
- Arquivo inexistente/ambíguo: JSON com `error: not_found` ou `ambiguous` e código de saída 2, sem criar ou selecionar outro. Basename retorna nomes candidatos no diretório de descoberta; path explícito retorna apenas paths das correspondências, sem listar arquivos alheios. Entrada/configuração inválida retorna `invalid_input`, sem expor valores privados de YAML. Diretório inexistente é permitido na resolução sem arquivo para criação; o principal poderá criá-lo depois de delimitar o escopo.
- O helper não implementa gravação ou locking. A coordenação mantém um escritor; hash/releitura detecta mudanças ocorridas durante a composição. Não sobrescrever uma alteração concorrente nem remover locks de outro processo.

Na criação, usar nome de tema simples, normalmente `.md`, no diretório de descoberta. Na atualização/preparação de um existente, conservar o caminho real completo selecionado, ainda que fora desse diretório; não criar cópia, mover/renomear ou sobrescrever `handoff.path` só para adequá-lo ao padrão. Se o arquivo foi movido e o registro ativo ficou obsoleto, pedir/receber sua nova identificação, sem procurar ou criar substituto automaticamente. Localização em pasta de arquivo não significa retomada autorizada: conciliar o estado do documento e as instruções atuais antes de agir.
