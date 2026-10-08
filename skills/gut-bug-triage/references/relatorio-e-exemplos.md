# Parecer e exemplos de classificação

## Formato de entrega

Adapte o tamanho ao pedido. Uma ocorrência deve conter:

```text
Ocorrência: ID, título, tipo (bug confirmado/incidente/problema a investigar)
Contexto: projeto, objetivo, requisito, ambiente, versão, momento e régua
Esperado / observado: diferença e consequência para a jornada
Evidências: documento/requisito e observação/reprodução; indicar hipóteses
Alcance / contorno: denominador, período, cobertura e validade
G: nota ou intervalo — dano, evidência, âncora e motivo contra nota vizinha
U: nota ou intervalo — prazo/margem, origem e calendário
T: nota ou intervalo — mecanismo, horizonte e cenário sem nova intervenção
Pontuação: G × U × T = valor ou faixa; nunca usar faixa como resultado definitivo
Confiança: alta/média/baixa com motivo; lacunas e investigação necessária
Decisão: recomendação de tratamento; prioridade local somente com política
Exceção: política/motivo de precedência operacional, se houver
Revisão: data/hora ou gatilho; responsável sugerido quando conhecido
```

Para várias ocorrências, acrescente uma tabela de ID, requisito/jornada, G, U, T, produto, posição/empate, confiança e exceção. Mostre avaliações provisórias separadamente, sem tratá-las como baixa prioridade. Não invente responsável ou um prazo aprovado. Entregue o parecer na conversa; crie arquivo/ticket apenas quando o pedido incluir essa ação.

## Exemplos sintéticos

As notas abaixo pressupõem as âncoras descritas em cada cenário. Não são respostas fixas para todos os projetos do mesmo setor.

| Cenário e contexto | G | U | T | Produto | Fundamentação |
| --- | --- | --- | --- | --- | --- |
| Logo desalinhado em painel auxiliar; tarefas preservadas; sem evento próximo; escopo estável | 1 | 1 | 1 | 1 | Sem dano material, pode esperar, não aumenta dano no horizonte analisado |
| Exportação auxiliar falha para pequeno grupo; contorno validado simples; pode entrar no próximo ciclo; escopo limitado | 2 | 3 | 1 | 6 | Dano leve, ciclo próximo adequado, estabilidade sustentada; não elevar T por repetição |
| Fila fiscal bloqueia jornada essencial; janela de despacho acaba hoje; taxa líquida positiva leva à saturação em horas | 4 | 4 | 5 | 80 | Dano elevado, pouca margem ainda disponível, crescimento rápido medido |
| Checkout crítico totalmente indisponível em horário de venda; nenhuma nova transação é gravada; escopo/dano permanecem estáveis no horizonte definido | 5 | 5 | 1 | 25 | Contexto sustenta dano extremo e resposta agora; T1 só vale sob a premissa explícita de estabilidade. Receita perdida acumulada poderia elevar T |
| Cobrança duplicada em fluxo essencial; novas execuções acumulam grande dano a cada minuto; resposta precisa começar agora | 4 | 5 | 5 | 100 | Consequência grande, janela esgotada e dano acumulativo rápido; não presumir dano irreversível para G5 |
| Falha da função central de desenvolvimento bloqueia release com prazo confirmado; ambiente isolado, contorno ausente, extensão estável | 4 | 4 | 1 | 16 | Ambiente de desenvolvimento não implica G1; impacto no objetivo do projeto e prazo sustentam notas |

No checkout, a precedência operacional é uma exceção explícita à fila matemática, não um ajuste artificial para T5. Para justificar T1, é preciso definir a métrica de dano e verificar que ela não acumula materialmente; se a perda cresce, reavalie T.

## Exemplo com lacuna

Relato: “Às vezes o aplicativo perde dados ao sincronizar”. Há requisito de preservação de dados offline, mas faltam logs, ambiente e prova de recuperabilidade.

Não concluir automaticamente “perda irrecuperável em produção, G5/U5/T5”. Uma avaliação pode registrar G[3,5], U desconhecida e T desconhecida, se o relato/contexto sustentar ao menos dano relevante. Produto possível [3,125], confiança baixa, sem ranking exato. Se nem o dano mínimo estiver sustentado, use G desconhecida também.

Perguntas dirigidas: quais registros, dispositivos e versões; qual sistema é a fonte de verdade; existem dados recuperáveis; o dano está ativo; a falha aumenta com novas sincronizações? Recomende preservar evidências e avaliar contenção se perda crítica for plausível. A incerteza exige investigação, não descarte. Não executar uma sincronização destrutiva só para produzir prova.

## Desempate e residual

`(4,4,5)` e `(5,4,4)` têm ambos 80. Registre empate; use prazo confirmado e política local para escolher precedência. O script não troca notas para desempatar.

Após pausar com autorização um processo que duplicava cobranças e verificar que nenhuma nova duplicação ocorre, registre nova avaliação residual. U/T podem cair enquanto o passivo financeiro mantém G alto. Informe a contenção e sua validade; não declare a correção definitiva concluída apenas porque o crescimento parou.
