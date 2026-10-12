# Integração conforme a stack encontrada

Revalidar entrypoints, manifests, AGENTS.md, carregamento de env e documentação oficial da versão instalada antes de editar. Não executar wizard interativo com tokens no contexto. Scripts Node são para a API; SDK Python é correto para runtimes Python e não representa fallback da ferramenta API.

## Dependências e inicialização

- Next.js: instalar @sentry/nextjs pelo package manager existente, atualizar lock, preservar instrumentação e configurar server/edge/client conforme versões encontradas. Frontend e servidor podem ter DSNs diferentes apesar de manifest compartilhado. NEXT_PUBLIC_* normalmente entra durante build.
- Node: instalar @sentry/node e inicializar antes dos módulos instrumentados, conforme CommonJS/ESM. Worker independente precisa de bootstrap próprio. Erros tratados exigem captura explícita da exceção original, sem duplicação.
- Python: instalar sentry-sdk pelo gerenciador existente (uv/poetry/pip etc.), atualizar manifests/locks e exports quando existirem. Inicializar antes de aplicação/handler/loop com integração apropriada ao framework.
- Outras stacks: consultar SDK oficial e instalar com gerenciador local, mantendo regras de env/segredos. A linguagem do aplicativo não limita o uso de Node para API.

Um escritor por manifest/lock. Não substituir configuração existente. Env compartilhado pode usar prefixos por componente, desde que bootstrap e arquivo concordem.

## Environment e dados

Inicializações validam o environment configurado no projeto, obtido do env; develop, staging e production são exemplos, não uma lista imposta pela skill. DSN ativo com ambiente ausente/inválido deve falhar claramente, sem default silencioso. DSN ausente permite Sentry desabilitado. Definir tag service estável e release identificável. Nunca inferir production de NODE_ENV: builds staging também usam esse valor. Navegador lê NEXT_PUBLIC_SENTRY_ENVIRONMENT; servidor/worker lê SENTRY_ENVIRONMENT ou prefixo aprovado. Cada execução deve carregar um único ambiente explícito.

Preservar erros originais: mensagens, tipos, stacks, causas e contexto. Não adicionar filtros próprios de sanitização, reconstrução, redação ou descarte no SDK/transporte, incluindo beforeSend, before_send e beforeSendSpan. Dados pessoais adicionais e configurações de remoção de dados no servidor Sentry são decisões explícitas do operador; não alterá-las por padrão. Os resumos das consultas API omitem payloads para proteger o contexto do agente, sem modificar os eventos armazenados. Não habilitar logs, replay, profiling ou anexos automaticamente. Isolar falhas da telemetria para preservar o processamento.

## Arquivos, build e deploy

Principal usa script env por componente/ambiente. .env.example apenas com placeholders. Script adiciona regra específica ao .gitignore e recusa arquivo rastreado. Tokens administrativos ficam na raiz ou ambiente seguro de build quando sourcemaps estiverem contratados; nunca nos runtimes/navegador. DSN público continua em env conforme pedido do operador.

Verificar loaders: Node puro/Python não necessariamente carregam .env.local. Configurar mecanismo existente; escrever arquivo não comprova carregamento. Variáveis do bundle exigem novo build. Docker standalone pode omitir dependências/bootstrap exclusivos de workers: verificar imagem final. Mapear env_file Compose, CI, secrets de servidores e provedores sem editar ambiente remoto nem fazer deploy sem autorização dessa etapa.

## Verificação

Executar lint/typecheck/build/testes apropriados. Testar inicialização nos ambientes configurados, em processo isolado; mocks verificam environment, service, release e preservação da exceção original sem envio. Teste ao vivo se autorizado: marcador único benigno, flush de processos curtos e confirmação de recebimento. Nunca provocar falha em produção nem iniciar inferência/processamento de GPU para testar. Consultar eventos pelo script events; ampliar script para filtros adicionais. Relatar separadamente configuração local, recebimento real e deploy.

Fontes oficiais (consultar stack/versão atual):
- https://docs.sentry.io/platforms/
- https://docs.sentry.io/platforms/javascript/guides/nextjs/
- https://docs.sentry.io/platforms/javascript/guides/node/
- https://docs.sentry.io/platforms/python/
- https://docs.sentry.io/api/guides/create-auth-token/
