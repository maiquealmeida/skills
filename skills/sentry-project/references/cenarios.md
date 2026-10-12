# Cenários adaptados ao workspace

Comece pelo inventário real: manifests, linguagens, processos independentes, entrypoints, equipe responsável e deploys. Um manifest pode conter frontend/API/worker; uma pasta sem implementação não é automaticamente um projeto implantável. Mostre os dois totais (projetos locais e componentes operacionais) com nomes e evidências.

| Cenário | Projetos Sentry | Mapeamento |
|---|---|---|
| Absoluta economia | Um único projeto/DSN | Todos os projetos e componentes; tag service obrigatória |
| Custo/benefício | Grupos por finalidade | Exemplo: frontend, APIs e workers; adaptar às fronteiras reais de equipe/deploy |
| Ideal por projeto local | Um projeto Sentry por projeto local | Um para cada projeto com manifest e ciclo próprio |

Se o operador desejar isolamento por processo, proponha variação do ideal explicando a diferença entre processo e projeto local. Se o repo tiver só um projeto, os cenários podem convergir; não inventar separações. Projetos Sentry podem receber SDKs de várias linguagens.

Economia: coleta de erros, tracing/replay/profiling/logs desativados inicialmente, amostragem de erros explicitamente decidida, sem anexos. Custo/benefício: erros e tracing seletivo nas rotas/jobs relevantes, sem replay/profiling por padrão. Ideal: isolamento facilita ownership, alertas e investigação; recursos adicionais e suas taxas ainda exigem decisão. Nunca ativar features faturáveis só porque o cenário se chama ideal. Todos usam environment e release.

Agrupar projetos não garante redução da cobrança. Apresente impacto de volume, retenção e recursos conforme plano real do operador, sem preços não verificados. Separar DSNs não impede tracing distribuído: propagar contexto entre componentes quando contratado.

Compare nomes/aliases, slug, plataforma e finalidade dos projetos remotos com o inventário local. Semelhança é candidata, não prova de correspondência. Proponha reaproveitamento ao operador; projeto compartilhado por outros produtos/equipes requer avaliar impacto das novas configurações.
