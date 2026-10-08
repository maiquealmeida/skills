# Critérios para problemas de software

Estas rubricas são propostas desta skill, construídas a partir da GUT e de práticas de impacto operacional. Não são uma norma publicada de classificação de bugs. A [Atlassian](https://www.atlassian.com/incident-management/kpis/severity-levels/) exemplifica impacto por indisponibilidade, perda de dados, privacidade, função central e disponibilidade de contorno, e recomenda definições ajustadas à organização. O [Google SRE](https://sre.google/resources/practices-and-processes/product-focused-reliability-for-sre/) vincula criticidade a objetivos específicos do produto.

## Gravidade: magnitude do dano

Avalie entrega do objetivo, integridade/confidencialidade/disponibilidade, segurança física quando aplicável, alcance, duração, perdas de negócio, reversibilidade e contorno. Use a maior âncora de dano efetivamente sustentada, com justificativa; não some subdimensões nem tome sua média. Diferencie dano observado de consequência potencial plausível.

| G | Âncora sugerida | Evidência para sustentar |
| --- | --- | --- |
| 1 | Defeito superficial sem impedir tarefa, sem informação material incorreta ou dano a dados | Jornada e critérios essenciais preservados; problema de apresentação sem consequência funcional |
| 2 | Inconveniência limitada em função auxiliar; contorno simples e seguro; dano reversível pequeno | Escopo delimitado e contorno validado; custo leve mensurável |
| 3 | Função relevante degradada ou indisponível para parte do uso; retrabalho/perda material moderada recuperável | Requisito violado, operações afetadas, recuperação conhecida ou contorno oneroso mas viável |
| 4 | Jornada essencial bloqueada ou fortemente degradada; grande dano operacional/de negócio; recuperação difícil | Fluxo central, impacto elevado no indicador do produto ou parcela relevante do uso; contorno insuficiente |
| 5 | Dano extremo ao objetivo ou à proteção de pessoas/dados: perda irrecuperável crítica, comprometimento grave de isolamento/confidencialidade ou paralisação crítica sem alternativa segura | Consequência extrema demonstrada ou cadeia causal plausível sustentada; contexto de domínio que torna o dano crítico |

Não use percentuais universais para passar de G=3 a G=4. Uma falha em 1 de 10 operações e outra em 1 de 1 milhão exigem denominador, distribuição e natureza do dano. Backup existente não prova recuperabilidade; necessidade de processo manual não prova contorno seguro.

## Urgência: tempo para começar a resposta

Determine a janela até dano inaceitável, quebra de compromisso ou perda de oportunidade de contenção. Considere dano já ativo, prazo documentado, duração do contorno, janela de negócio e tempo de resposta necessário. Não transforme urgência em promessa de resolução.

| U | Âncora sugerida | Pergunta discriminante |
| --- | --- | --- |
| 1 | Pode aguardar planejamento futuro sem dano adicional material ou prazo pressionando | Há razão concreta para agir antes do ciclo futuro? |
| 2 | Pode entrar em ciclo posterior; ampla margem documentada | A margem suporta adiamento e preparação? |
| 3 | Precisa entrar no próximo ciclo/janela programada de resposta | Adiar mais um ciclo comprometeria o resultado? |
| 4 | Precisa começar antes da próxima janela normal; prazo curto e consequência concreta | Há margem curta, mas suficiente para organizar a resposta? |
| 5 | Precisa começar agora; dano crítico ativo ou margem segura esgotada | Esperar a triagem completa pode ampliar dano intolerável? |

### Exemplo temporal opcional

Para uma equipe com operação contínua, uma régua **proposta**, se adequada ao projeto, pode usar a margem para iniciar resposta: U5 ≤1 hora; U4 >1 até 24 horas; U3 >24 horas até 7 dias; U2 >7 até 30 dias; U1 >30 dias ou adiável sem prazo material. Margem negativa entra em U5. Dias aqui são de 24 horas. Esses limites são exemplos desta skill, não requisitos da metodologia nem SLA presumido; substitua-os pelas janelas locais.

Use data/hora, fuso e a origem de cada prazo. O prazo alegado por quem relata deve ser distinguido do compromisso confirmado. Falha estável de checkout em operação crítica pode ser U5 com T1; estabilidade não autoriza esperar.

## Tendência: evolução sem nova intervenção

Avalie se abrangência, dano acumulado, custo de recuperação ou probabilidade sustentada de agravamento mudam no tempo. Indique mecanismo e horizonte; mantenha contenções já verificadas no cenário e declare quando elas expiram.

| T | Âncora sugerida | Evidência discriminante |
| --- | --- | --- |
| 1 | Dano/alcance estáveis ou em queda no horizonte relevante | Escopo limitado ou mecanismo de estabilização verificado; sem acumulação material |
| 2 | Agravamento lento, em horizonte longo | Crescimento pequeno ou evento distante com mecanismo conhecido |
| 3 | Agravamento previsível no horizonte intermediário | Acúmulo gradual de retrabalho/dados incorretos ou aumento de exposição documentado |
| 4 | Agravamento em horizonte curto | Fila crescendo, recursos se esgotando ou contorno perto de expirar; impacto aumenta logo |
| 5 | Agravamento rápido no horizonte imediato | Propagação/cascata, perda progressiva acelerada ou saturação iminente sustentada por evidência |

Calibre esses horizontes separadamente de U. Como exemplo operacional opcional: longo >30 dias; intermediário >7 até 30 dias; curto >1 até 7 dias; rápido ≤1 dia. Para sistemas que mudam em minutos, esses limites são inadequados e precisam ser reduzidos. Inclua a previsão e sua incerteza, não apenas a palavra “rápido”.

### Sinais técnicos úteis

- Fila: se entrada excede processamento, crescimento aproximado = taxa de entrada − taxa de saída. Com capacidade finita, estime a margem antes da saturação. Declare unidades, intervalo e hipótese de taxa constante.
- Armazenamento/memória: tempo estimado até limite = capacidade livre ÷ crescimento líquido por unidade de tempo. Uma única medição não estabelece taxa nem prova vazamento.
- Dados: registros corrompidos ou cobrança duplicada podem acumular dano a cada execução, mesmo com erro percentual constante. T pode ser alto sem aceleração da taxa.
- Integrações: retries sem limite podem aumentar carga e amplificar falha; provar o mecanismo é melhor que supor que “todo bug piora”.
- Calendário: rollout ou vencimento previsto pode aumentar exposição de uma vez. Uma data de release isolada não prova agravamento sem conexão com o problema.

O [Google SRE: Alerting on SLOs](https://sre.google/workbook/alerting-on-slos/) apresenta a taxa de consumo do orçamento de erro como sinal para escolher resposta operacional. Para esta skill, esse é um possível insumo de U/T; não transfira seus limiares de alerta automaticamente para notas GUT. Uma taxa de erro estável pode consumir o orçamento progressivamente, mas um bug recorrente sem aumento de dano/alcance não recebe T alto só por frequência.

## Segurança e acessibilidade

Se o problema for uma vulnerabilidade, use evidências de exploração, exposição e ambiente além da criticidade técnica. O [FIRST, CVSS v4.0 User Guide, seção 2.2](https://www.first.org/cvss/v4.0/user-guide) esclarece que o escore Base mede severidade e não deve determinar risco sozinho. GUT não substitui CVSS; não faça conversão direta de um para outro. CVSS pertence ao FIRST; se publicar escores CVSS, preserve atribuição, versão e vetor conforme suas condições.

Em acessibilidade, avalie o bloqueio da tarefa para o público afetado: a classificação “visual” não reduz a gravidade de impedir acesso a uma função essencial. Não conclua conformidade jurídica automaticamente. Segurança, privacidade ou acessibilidade não recebem G5 por rótulo: a consequência e o domínio sustentam a nota.
