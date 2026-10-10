# Resolução de diretório e arquivo

O argumento da skill é um único nome de arquivo, não um tema para pesquisa livre nem um comando. Exemplos: `$session-handoff` cria; `$session-handoff runpod-falhas-intermitentes` ou `$session-handoff runpod-falhas-intermitentes.md` retoma. Para um nome com espaços, trate a expressão citada como um único nome.

Configuração opcional na raiz do projeto:

```yaml
handoff:
  path: _meta/handoff/in-progress/
```

`handoff.path: _meta/handoff` significa **exatamente** `_meta/handoff`, sem adicionar subdiretório. Um caminho absoluto permite usar outro diretório escolhido pelo operador. A configuração ausente ou a propriedade ausente usa o padrão; uma propriedade presente precisa ser string não vazia. YAML malformado, chaves duplicadas ou estrutura incompatível devem produzir erro, sem fallback silencioso. Não criar/editar configuração por conta própria.

## Helper somente leitura

Requer Python 3.9+ e PyYAML. Com PyYAML disponível, pode usar `python` diretamente; o comando com `uv --with pyyaml` não exige instalação global. Se não houver esses recursos, resolver com o parser YAML e as ferramentas do ambiente, mantendo as mesmas regras; não improvisar parsing por grep.

```sh
uv run --with pyyaml python <skill>/scripts/resolve_handoff.py --root <projeto>
uv run --with pyyaml python <skill>/scripts/resolve_handoff.py --root <projeto> nome-do-arquivo
```

Sem nome, retorna diretório e fonte da configuração para a criação, sem gravar nada. Com nome, retorna caminho real e SHA-256 do arquivo existente para leitura/conferência, sem executar seu conteúdo. Não abre credenciais nem lê outros arquivos do projeto. Não carregar todos os candidatos só para escolher um.

- Argumento com extensão: correspondência exata.
- Sem extensão: considerar o nome exato e o mesmo nome com `.md`. Se ambos existirem, é ambíguo; perguntar qual usar. Não pesquisar recursivamente nem aceitar `../`, caminho absoluto ou separadores no nome.
- O arquivo precisa estar dentro do diretório configurado inclusive após resolver links simbólicos. Um link para fora não é selecionado. O diretório configurado em si pode ser absoluto ou um link, pois é a escolha explícita do projeto.
- Arquivo inexistente/ambíguo: erro com nomes candidatos, sem criar ou selecionar outro. Um diretório inexistente é permitido somente no modo de criação, que o principal poderá criar depois de delimitar o escopo.
- O helper não implementa gravação ou locking. A coordenação mantém um escritor; hash/releitura detecta mudanças ocorridas durante a composição. Não sobrescrever uma alteração concorrente nem remover locks de outro processo.

Na gravação, usar nome de tema simples, normalmente `.md`, e registrar o caminho real do próprio handoff. Não renomear/mover handoffs existentes só para adequá-los ao padrão sem pedido ou convenção aplicável.
