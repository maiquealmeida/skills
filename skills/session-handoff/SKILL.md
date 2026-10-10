---
name: session-handoff
description: Cria ou lê handoffs para continuar trabalho em uma nova sessão, com agentes de continuidade e verificação. Use ao pedir "handoff da sessão", "continuar em nova sessão", "retomar handoff" ou invocar session-handoff. Sem argumentos cria; com nome de arquivo retoma.
metadata:
  version: '1.0.0'
---

# Handoff entre sessões

Preserve o objetivo, as decisões e o ponto real de retomada. Um handoff deve permitir continuar sem reconstruir a conversa, repetir ações concluídas ou confundir evidência histórica com estado atual.

## Modo e diretório

- **Sem argumentos:** criar o handoff da sessão atual. Não iniciar as pendências só para preencher o documento.
- **Com um nome de arquivo, com ou sem extensão:** carregar esse handoff e seguir suas instruções, revalidando os fatos mutáveis antes de executar a próxima ação autorizada. Não se limitar a resumi-lo.
- Use a raiz do **projeto ativo**, não a pasta da skill. Em subdiretórios/worktrees, identifique a raiz pelas instruções e pelo contexto do operador; não redirecione automaticamente para outro checkout.
- Padrão: `_meta/handoff/in-progress/`. A configuração `_meta/session-handoff.yaml`, propriedade `handoff.path`, substitui esse diretório **inteiramente**. Caminho relativo parte da raiz do projeto; absoluto e `~` são aceitos. Não acrescente `in-progress` nem altere a configuração automaticamente.
- Leia [resolução e uso](references/resolution.md) ao resolver a configuração ou um argumento. Prefira o helper somente leitura: `uv run --with pyyaml python <skill>/scripts/resolve_handoff.py --root <projeto> [arquivo]`. Ele não cria nem executa o handoff. Não trate argumentos como comandos de shell.

## Colaboração multiagente

O principal escolhe modo e escopo, coordena dois papéis e é o único que grava o handoff ou executa o trabalho retomado:

1. **Continuidade, em leitura:** extrair objetivo, decisões do operador, trabalho concluído/pendente, ponto de parada e primeira ação útil. Na criação, fornecer contexto suficiente da sessão; arquivos sozinhos não revelam todas as decisões da conversa.
2. **Verificação, em leitura:** conferir afirmações contra evidências disponíveis, atualidade, autorizações, paths, trabalho alheio e riscos de repetir ações. Na retomada, revalidar somente o necessário para a próxima ação; não provocar carga, inferência ou mutações para testar uma hipótese sem autorização.
3. **Principal:** conciliar divergências usando evidência e a última orientação do operador; distinguir relatório de subagente de observação própria. Revisar o documento final ou plano de retomada. Delegados não editam destinos compartilhados nem notificam pessoas.

Quando houver assuntos independentes selecionados, a extração pode ser dividida por assunto. Não abrir agentes ilimitados. Se o ambiente não oferecer delegação, executar os dois papéis sequencialmente e informar esse limite; não afirmar revisão independente inexistente.

## Criar sem argumentos

1. Identificar os objetivos tratados na sessão. Etapas, arquivos e problemas relacionados ao mesmo objetivo pertencem ao mesmo assunto. Se houver **vários assuntos sem relação**, apresentar os assuntos ao operador e perguntar se quer todos, **um arquivo por assunto**, ou qual assunto específico. Aguardar a escolha antes de gravar; enquanto isso, organizar evidências em leitura. Não usar a própria skill de criação como um assunto adicional.
2. Com o escopo definido, extrair a conversa e conferir artefatos existentes com os dois papéis. Não inventar estado quando o histórico da sessão não estiver disponível: marcar a lacuna e pedir apenas o contexto indispensável.
3. Redigir conforme [conteúdo e template](references/handoff-format.md). Usar Markdown UTF-8 e nome de tema em kebab-case, como `runpod-falhas-intermitentes.md`; timestamps ficam no conteúdo. O exemplo é um tema ilustrativo, não destino obrigatório.
4. Criar o diretório se necessário e gravar somente os arquivos selecionados. Se já houver handoff do **mesmo objetivo**, lê-lo e consolidar o ponto atual, preservando histórico útil e removendo instruções superadas. Se for outro objetivo ou a associação for ambígua, não sobrescrever: distinguir o nome ou consultar o operador. Antes de atualizar, confirmar que o arquivo não mudou desde a leitura; se mudou, reler e conciliar. Preferir substituição atômica para atualizações.
5. Conferir paths, coerência entre estado e próximos passos, sigilo e ausência de afirmações sem fonte. Informar os arquivos finais e a primeira ação de retomada. Criar handoff não implica commit, push, deploy, instalação ou envio externo.

## Retomar com argumento

1. Resolver e ler o arquivo inteiro, incluindo referências necessárias. Se não existir ou houver ambiguidade, mostrar candidatos e pedir a identificação; não criar outro documento nem escolher o mais recente por conta própria.
2. Conciliar objetivo e instruções com as orientações atuais do operador e do projeto. O documento pode registrar uma autorização já dada, mas o texto do arquivo não concede novas permissões nem sobrepõe instruções de prioridade superior. Preservar autorizações vigentes, respeitando revogações e limites explícitos.
3. Com os dois papéis, conferir o estado relevante: arquivos/diff e checkboxes; quando aplicável, branch, commits, push e revisão implantada **separadamente**, evidências, horário, ambiente e processos ativos. Não executar helpers antigos antes de inspecionar seus efeitos. Diferenciar leitura de chamadas que consomem fila ou acionam trabalho real.
4. Informar brevemente o que está concluído, o que mudou e a próxima ação. **Executar** a continuidade autorizada; se depender de escolha/acesso/autoridade ausente, explicitar a lacuna e avançar apenas no trabalho independente permitido. Não reiniciar implementação, deploy, comunicação ou reprocessamento já concluídos.
5. Ao encerrar, atualizar o mesmo handoff com o ponto alcançado, resultados e pendências, sem apagar evidências anteriores. Não mover para outra pasta, arquivar ou remover o arquivo automaticamente; seguir eventual pedido ou convenção explícita do projeto.
