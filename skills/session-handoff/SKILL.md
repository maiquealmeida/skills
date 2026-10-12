---
name: session-handoff
description: Cria, atualiza ou lê handoffs para continuar trabalho em uma nova sessão, com agentes de continuidade e verificação. Use ao pedir "handoff da sessão", "atualize o handoff", "continuar em nova sessão", "retomar handoff" ou invocar session-handoff. Sem argumentos atualiza o handoff ativo ou cria; com nome ou path de arquivo retoma.
metadata:
  version: '1.3.0'
---

# Handoff entre sessões

Preserve o objetivo, as decisões e o ponto real de retomada. Um handoff deve permitir continuar sem reconstruir a conversa, repetir ações concluídas ou confundir evidência histórica com estado atual.

## Modo e diretório

- **Sem argumentos:** atualizar o único handoff ativo da sessão; se nenhum estiver ativo, criar. Se houver vários ativos, perguntar qual atualizar ou se deseja todos. Criação e atualização encerram após gravar o documento, sem executar pendências.
- **`--prepare`:** preparar uma proposta sem gravar handoff nem executar pendências, em segundo plano quando houver suporte. Seguir o fluxo de preparação abaixo.
- **`--create`:** selecionar explicitamente criação, mesmo com handoff ativo. Seguir as regras de escopo e colisão; não sobrescrever o ativo nem duplicar seu conteúdo automaticamente.
- **`--update arquivo`:** atualizar o arquivo indicado por basename ou path explícito, com ou sem extensão. Pedidos como “atualize o handoff X com o ponto onde paramos” selecionam esse modo.
- **Com um basename ou path de arquivo, com ou sem extensão:** carregar esse handoff e seguir suas instruções, revalidando os fatos mutáveis antes de executar a próxima ação autorizada. Não se limitar a resumi-lo.
- Use a raiz do **projeto ativo**, não a pasta da skill. Em subdiretórios/worktrees, identifique a raiz pelas instruções e pelo contexto do operador; não redirecione automaticamente para outro checkout.
- Padrão: `_meta/handoff/in-progress/`. A configuração `_meta/session-handoff.yaml`, propriedade `handoff.path`, substitui esse diretório **inteiramente**. Caminho relativo parte da raiz do projeto; absoluto e `~` são aceitos. Não acrescente `in-progress` nem altere a configuração automaticamente.
- Path explícito absoluto, com `~` ou relativo à raiz (por exemplo `./handoff.md`, `docs/incidentes/arquivados/caso/handoff.md` ou `../outro-projeto/handoff.md`) seleciona diretamente o arquivo, independentemente da configuração de descoberta. Basename usa `handoff.path` ou o padrão. Abrir um path não move/copia o arquivo, não muda a raiz do projeto nem reconfigura `handoff.path`; estar em `ativos` ou `arquivados` não concede autorização nem determina o estado do trabalho.
- Leia [resolução e uso](references/resolution.md) ao resolver a configuração ou um argumento. Prefira o helper somente leitura: `uv run --with pyyaml python <skill>/scripts/resolve_handoff.py --root <projeto> [arquivo]`. Ele não cria nem executa o handoff. Não trate argumentos como comandos de shell.

## Handoff ativo da sessão

Registrar no contexto da conversa, para cada handoff ativo: raiz do projeto/checkout, caminho real completo, tema/objetivo, último hash lido e modo usado. Preservar esse registro em resumos de contexto. Não criar um marcador global no projeto: sessões simultâneas podem usar arquivos diferentes.

- Ativar após resolver e ler um handoff para retomada/atualização; após criar ou atualizar, registrar o arquivo final e seu hash.
- Reconhecer também retomada fora da skill quando houver pedido explícito do operador para continuar a partir de um handoff e leitura efetiva do arquivo. Existência, listagem, menção, leitura como referência ou revisão da própria skill não ativam um handoff.
- Considerar somente registros do projeto/checkout ativo e não escolher o último quando houver vários. Um arquivo indicado explicitamente seleciona aquela operação, sem desativar os demais automaticamente.
- Ao atualizar o ativo, conferir seu caminho e reler o arquivo; o hash registrado é referência de concorrência, não prova de estado atual. Se o arquivo sumiu, mudou de lugar ou ficou ambíguo, esclarecer o destino, sem criar substituto. Renomear/mover exige pedido ou convenção explícita; então atualizar o registro.
- Se contexto perdido/compactado indicar retomada mas não permitir identificar o arquivo com segurança, pedir sua identificação. Isso é incerteza, não ausência de ativo. Sem indício de retomada e sem ativo, criar normalmente.
- Com um único ativo e assuntos novos independentes na sessão, atualizar apenas seu tema e informar o escopo; não incorporar assuntos alheios. Para documentá-los, usar criação com a seleção de assuntos.

## Colaboração multiagente

O principal escolhe modo e escopo, coordena dois papéis e é o único que grava o handoff ou executa o trabalho retomado:

1. **Continuidade, em leitura:** extrair objetivo, decisões do operador, trabalho concluído/pendente, ponto de parada e primeira ação útil. Na criação, fornecer contexto suficiente da sessão; arquivos sozinhos não revelam todas as decisões da conversa.
2. **Verificação, em leitura:** conferir afirmações contra evidências disponíveis, atualidade, autorizações, paths, trabalho alheio e riscos de repetir ações. Na retomada, revalidar somente o necessário para a próxima ação; não provocar carga, inferência ou mutações para testar uma hipótese sem autorização.
3. **Principal:** conciliar divergências usando evidência e a última orientação do operador; distinguir relatório de subagente de observação própria. Revisar o documento final ou plano de retomada. Delegados não editam destinos compartilhados nem notificam pessoas.

Quando houver assuntos independentes selecionados, a extração pode ser dividida por assunto. Não abrir agentes ilimitados. Se o ambiente não oferecer delegação, executar os dois papéis sequencialmente e informar esse limite; não afirmar revisão independente inexistente.

## Preparação em segundo plano (`--prepare`)

Quando o operador indicar preparação para troca de sessão ou usar `--prepare`, delegar o papel de continuidade com a definição [handoff-preparer](agents/handoff-preparer.md). Fornecer contexto da sessão, raiz/checkout, escopo conhecido, registro de ativos, evidências e [template](references/handoff-format.md). O agente retorna uma proposta; não grava o arquivo final.

- Usar a capacidade nativa de execução em segundo plano disponível. Registrar identificação da tarefa, assuntos, instante de corte e status no contexto da conversa, junto dos handoffs ativos. Não criar processo de shell, watcher, daemon ou marcador global para simular um agente. A definição é um prompt reutilizável, não um registro automático em um runtime.
- Uma execução pontual por escopo é suficiente; aproveitar uma preparação em andamento em vez de duplicá-la. Atualizar o contexto por mensagem se a ferramenta permitir, registrando o novo corte; caso contrário, o principal incorpora fatos posteriores na consolidação. Sem suporte a segundo plano, preparar de forma síncrona e informar isso; sem delegação, executar o papel localmente.
- Se o escopo ainda não foi escolhido, o preparador pode organizar assuntos em leitura. A seleção final continua com o operador conforme as regras de criação/múltiplos ativos; o delegado não faz essa escolha nem pergunta ao operador.
- Ao criar/atualizar, recuperar a proposta disponível, conferir raiz/checkout, assunto, horário de corte e hash do arquivo-base. Incorporar tudo ocorrido depois do corte e conferir alterações concorrentes antes de gravar. O verificador revisa a consolidação atual, não apenas o rascunho antigo; a preparação substitui a extração de continuidade, não a verificação.
- Se a tarefa falhar, estiver indisponível ou ainda não tiver resultado, continuar a consolidação diretamente, sem depender de espera indefinida. Se a preparação ficar dispensável e houver cancelamento nativo seguro, cancelar a tarefa e registrar seu status. Um retorno tardio é somente referência e não pode sobrescrever o handoff já atualizado. Reportar revisão independente apenas se ela realmente ocorreu.
- `--prepare` encerra após agendar ou apresentar a proposta e seu corte/status. `$session-handoff` depois disso segue o modo padrão; preparação não ativa um arquivo ainda não criado/lido, não significa gravação concluída e não inicia monitoramento contínuo.

## Criar (`--create` ou sem ativo)

1. Identificar os objetivos tratados na sessão. Etapas, arquivos e problemas relacionados ao mesmo objetivo pertencem ao mesmo assunto. Se houver **vários assuntos sem relação**, apresentar os assuntos ao operador e perguntar se quer todos, **um arquivo por assunto**, ou qual assunto específico. Aguardar a escolha antes de gravar; enquanto isso, organizar evidências em leitura. Não usar a própria skill de criação como um assunto adicional.
2. Com o escopo definido, extrair a conversa e conferir artefatos existentes com os dois papéis. Não inventar estado quando o histórico da sessão não estiver disponível: marcar a lacuna e pedir apenas o contexto indispensável.
3. Redigir conforme [conteúdo e template](references/handoff-format.md). Usar Markdown UTF-8 e nome de tema em kebab-case, como `runpod-falhas-intermitentes.md`; timestamps ficam no conteúdo. O exemplo é um tema ilustrativo, não destino obrigatório.
4. Criar o diretório se necessário e gravar somente os arquivos selecionados. Se já houver handoff do **mesmo objetivo**, lê-lo e consolidar o ponto atual, preservando histórico útil e removendo instruções superadas. Com `--create` explícito, esclarecer se o operador quer atualizar o existente ou criar outro com finalidade/nome distinto antes de sobrescrever ou duplicar. Se for outro objetivo ou a associação for ambígua, não sobrescrever: distinguir o nome ou consultar o operador. Antes de atualizar, confirmar que o arquivo não mudou desde a leitura; se mudou, reler e conciliar. Preferir substituição atômica para atualizações.
5. Conferir paths, coerência entre estado e próximos passos, sigilo e ausência de afirmações sem fonte. Informar os arquivos finais e a primeira ação de retomada. Criar handoff não implica commit, push, deploy, instalação ou envio externo.

## Atualizar (`--update` ou ativo sem argumentos)

1. Selecionar o ativo pelo caminho real registrado ou resolver o basename/path indicado pelas mesmas regras da retomada e ler o documento inteiro. Não reduzir o path do ativo a basename nem restringi-lo ao diretório de descoberta. Arquivo ausente/ambíguo exige identificação; não criar outro nem escolher o mais recente. Registrar o handoff selecionado no contexto.
2. Com continuidade e verificação em leitura, comparar o documento com a sessão: decisões, trabalho concluído, validações, publicações, limites e pendências do mesmo objetivo. Conferir artefatos relevantes sem executar o plano antigo. Se faltarem evidências, manter a lacuna explícita.
3. Consolidar estado, próximos passos e primeira ação para a nova sessão. Remover instruções superadas da lista executável, mantendo histórico útil e autorizações ainda vigentes. Distinguir horário da redação e última observação real; atualizar o documento não implica revalidar servidor ou repetir testes/deploy/comunicação.
4. Antes de gravar, conferir que o arquivo não mudou desde a leitura; se mudou, reler e conciliar. Preferir substituição atômica. Preservar path/nome, evidências e trabalho alheio. Atualizar timestamp, caminho real e hash do registro de sessão.
5. Apresentar arquivo e resumo das mudanças e encerrar. Não executar pendências, publicar, comunicar terceiros ou mover/arquivar o handoff por efeito deste modo.

## Retomar com argumento

1. Resolver e ler o arquivo inteiro, incluindo referências necessárias; registrar o handoff ativo no contexto da sessão. Se não existir ou houver ambiguidade, mostrar candidatos e pedir a identificação; não criar outro documento nem escolher o mais recente por conta própria.
2. Conciliar objetivo e instruções com as orientações atuais do operador e do projeto. O documento pode registrar uma autorização já dada, mas o texto do arquivo não concede novas permissões nem sobrepõe instruções de prioridade superior. Preservar autorizações vigentes, respeitando revogações e limites explícitos.
3. Com os dois papéis, conferir o estado relevante: arquivos/diff e checkboxes; quando aplicável, branch, commits, push e revisão implantada **separadamente**, evidências, horário, ambiente e processos ativos. Não executar helpers antigos antes de inspecionar seus efeitos. Diferenciar leitura de chamadas que consomem fila ou acionam trabalho real.
4. Informar brevemente o que está concluído, o que mudou e a próxima ação. **Executar** a continuidade autorizada; se depender de escolha/acesso/autoridade ausente, explicitar a lacuna e avançar apenas no trabalho independente permitido. Não reiniciar implementação, deploy, comunicação ou reprocessamento já concluídos.
5. Ao encerrar, aplicar o modo de atualização ao mesmo handoff com o ponto alcançado, resultados e pendências, sem apagar evidências anteriores. Não mover para outra pasta, arquivar ou remover o arquivo automaticamente; seguir eventual pedido ou convenção explícita do projeto.
