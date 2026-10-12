# Scripts Node

Executar da raiz. Node >=22, sem dependências npm adicionais. O script descobre a raiz Git do diretório atual (inclusive quando a skill está instalada globalmente) e lê `.env`, `.env.local` e configuração de agente conforme o [README](../README.md) com `node:util.parseEnv`; nunca dê cat nesse arquivo. Variáveis de processo prevalecem. Host fixo https://sentry.io; self-hosted exige extensão revisada do script, não trocar host com token existente.

## Consultas

```bash
node "<skill-dir>/scripts/sentry.mjs" inventory
node "<skill-dir>/scripts/sentry.mjs" inventory --token user
node "<skill-dir>/scripts/sentry.mjs" keys --project my-app
node "<skill-dir>/scripts/sentry.mjs" events --project my-app
node "<skill-dir>/scripts/sentry.mjs" project --project my-app
```

`inventory` retorna somente organização, IDs, slugs, nomes, plataformas e equipes, sem chaves ou DSNs. Pode consultar com token de usuário se o da organização receber 401/403. Listagens percorrem todas as páginas. `events` consulta a primeira página dos eventos recentes e retorna somente IDs, timestamps, environment/service/release; não retornar mensagens ou payloads. Para localizar smoke antigo, ampliar paginação/filtros no script em vez de usar curl ou CLI Sentry.

`project` retorna somente ID, slug, highlightTags e flags de remoção de dados sensíveis/IPs; permite conferir ajustes sem expor tokens ou DSNs da resposta de projeto.

## Plano revisável, sem segredos

Exemplo de economia; substitua organização/equipe pelos identificadores consultados. Os nomes dos serviços são tags propostas, não nomes secretos. Escolha environment padrão da interface; isso não atribui o environment aos eventos (SDK/env faz isso).

```json
{
  "org": "organizacao-configurada",
  "scenario": "economy",
  "projects": [
    {
      "slug": "my-app",
      "name": "My application",
      "action": "create",
      "team": "equipe-existente",
      "platform": "javascript-nextjs",
      "services": ["web", "api", "worker"],
      "default_rules": false,
      "settings": {
        "defaultEnvironment": "develop",
        "highlightTags": ["environment", "service", "release"]
      }
    }
  ]
}
```

Para reaproveitar projeto aprovado, usar `action: reuse` e seu slug real. `settings` também altera projeto reutilizado: revisar impacto sobre usuários existentes antes de autorizar. Escolha `default_rules` explicitamente; false desativa a regra padrão de aviso de novos issues, não reduz ingestão. Cenário balanced/ideal usa múltiplas entradas com mapeamento completo. Anote no plano/relatório separado as taxas e os recursos SDK que foram aprovados, pois não são opções do endpoint de projeto.

```bash
node "<skill-dir>/scripts/sentry.mjs" apply --plan /caminho/plano.json
node "<skill-dir>/scripts/sentry.mjs" apply --plan /caminho/plano.json --execute
```

Sem execute, não faz POST/PUT. Preflight verifica projetos/equipes antes de alterar. Mutações são sequenciais; status é emitido por etapa. Não há rollback nem retry automático. Se criação/configuração falhar, preservar os status confirmados; falha de transporte é resultado incerto. Reconsultar, reconciliar e mudar create para reuse quando necessário. Não repetir o plano inteiro cegamente. Em 401/403 de mutação, verificar escopos e escolher `--token user` explicitamente se adequado; autorização de implantação já válida não precisa ser solicitada novamente por trocar token configurado.

## Gravação de variáveis por componente e ambiente

```bash
node "<skill-dir>/scripts/sentry.mjs" env \
  --project my-app --file apps/web/.env.local \
  --environment develop --service api
node "<skill-dir>/scripts/sentry.mjs" env \
  --project my-app --file apps/web/.env.local \
  --environment develop --service api --execute
node "<skill-dir>/scripts/sentry.mjs" env \
  --project my-app --file apps/web/.env.local \
  --environment develop --service web --prefix NEXT_PUBLIC_ --execute
```

`env` consulta DSN existente e salva SENTRY_DSN/ENVIRONMENT/SERVICE. Use `--release VERSION` para salvar também SENTRY_RELEASE (ou sua variante com prefixo), sem hardcode. Se houver várias chaves ativas, informar --key-id (obter os IDs pelo comando keys, que nunca imprime DSNs). Não cria outra chave automaticamente. Prefixo WORKER_ serve para worker com env compartilhado, desde que seu bootstrap leia essas variáveis. O destino deve ser .env ou .env.local dentro do repo, com pai existente, sem symlinks; arquivo rastreado é recusado. Adiciona regra específica ao .gitignore quando necessário, preserva outras variáveis e grava atomicamente com modo 0600. Saída contém apenas caminho e nomes de variáveis.

Configurar um ambiente por execução, usando os nomes e arquivos efetivamente carregados pelo projeto. Não modificar servidor/provedor sem autorização para essa etapa. SENTRY_RELEASE é definido pelo env/build seguro ou resolução de versão, sem segredo hardcoded. Não copiar SENTRY_ORG_TOKEN/SENTRY_USER_TOKEN para aplicação ou NEXT_PUBLIC_*.

Escopos típicos: project:read para consulta/DSN; org:read para equipes conforme endpoint; project:write ou project:admin para criar/configurar; org:write pode ser necessário quando criação por membros está bloqueada. O nome de um token não comprova seus escopos.

Fontes:
- https://docs.sentry.io/api/organizations/list-an-organizations-projects/
- https://docs.sentry.io/api/teams/list-an-organizations-teams/
- https://docs.sentry.io/api/projects/list-a-projects-client-keys/
- https://docs.sentry.io/api/projects/create-a-new-project/
- https://docs.sentry.io/api/projects/update-a-project/
- https://docs.sentry.io/api/auth/

Se SENTRY_ORG_ID estiver configurado, o script valida ID e slug antes de qualquer comando via consulta à organização. Esse endpoint pode exigir token de usuário; auto permite fallback de leitura, mas --token org explícito preserva essa escolha. Substitua `<skill-dir>` pelo caminho absoluto da skill instalada e execute dentro do workspace desejado.

`event --project SLUG --event-id <32-hex>` confirma um evento específico recebido e retorna apenas ID/instante, tags environment/service/release e contagens de exceções, stacks e causas. Nunca imprime request, usuários, mensagens brutas ou stacks.

## Consulta horária observacional

`events --project SLUG --start ISO-UTC --end ISO-UTC --environment staging --release my-app@VERSION` consulta no máximo uma hora, duas páginas e retorna somente campos sanitizados da release/ambiente. Deduplica por event ID; marcadores aparecem como `integrationSmoke`. `countsPartial`/`nextPageAvailable` indicam paginação limitada. Não sumarizar como total absoluto nem somar aos logs locais. Falhas de ingestão, quota e retenção continuam limites mesmo sem próxima página. Sem início/fim, mantém consulta recente de uma página. [API oficial de eventos](https://docs.sentry.io/api/events/list-a-projects-error-events/) documenta os limites start/end/full/cursor.

## Recibos de spans e perfis

Configure `SENTRY_PROJECT_SLUG`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `SENTRY_SPAN_OP` e `SENTRY_SPAN_NAMES` (lista separada por vírgulas). A operação e os nomes devem ser identificadores, sem espaços; são critérios explícitos de seleção, não uma lista fixa da skill. O script consulta o projeto por slug para obter seu ID, valida a organização quando `SENTRY_ORG_ID` existe e usa o mesmo carregador de credenciais.

```bash
node "<skill-dir>/scripts/incident-receipt.mjs" \
  2026-01-01T12:00:00Z 2026-01-01T13:00:00Z
# Release e projeto podem substituir os valores do ambiente:
node "<skill-dir>/scripts/incident-receipt.mjs" \
  2026-01-01T12:00:00Z 2026-01-01T13:00:00Z my-app@1.2.0 my-app
```

Consulta GET de até uma hora e uma página de até 25 grupos de spans. Se houver profiler ID, tenta obter o recibo de um chunk do mesmo projeto, ambiente e release, retornando somente IDs e contagens. Caso os dados faltem ou a consulta de perfil falhe, tenta outcomes de ingestão agregados por projeto; eles não têm filtro de release e categorias sobrepostas não devem ser somadas. Não habilita nem envia spans/perfis. Falhas de recursos, permissões, quotas e retenção mantêm o resultado inconclusivo.
