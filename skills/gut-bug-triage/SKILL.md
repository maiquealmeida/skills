---
name: gut-bug-triage
description: Classifica e prioriza bugs, incidentes e problemas de software pela matriz GUT (Gravidade, Urgência e Tendência), com notas justificadas por evidências e calibradas pelos objetivos, requisitos e domínio do projeto. Use ao pedir "classificar bug", "priorizar problemas", "triagem GUT", "matriz GUT" ou "avaliar gravidade, urgência e tendência".
---

# Triagem de problemas com GUT

Produza uma classificação rastreável no contexto do projeto: G, U e T inteiros de 1 a 5, pontuação `G × U × T` e recomendação de tratamento. Classificar não autoriza corrigir código, abrir tickets, notificar pessoas ou alterar sistemas.

## Fluxo

1. **Reconheça o projeto.** Leia as instruções locais e procure documentação de objetivo, domínio, requisitos, jornadas essenciais e operação. Siga [contexto-projeto.md](references/contexto-projeto.md). Use políticas locais vigentes; não deduza criticidade apenas pelo nome do módulo ou pelo tamanho do cliente.
2. **Delimite cada ocorrência.** Registre comportamento esperado/observado, requisito afetado, ambiente, versão, abrangência, momento, evidências e contorno. Separe problemas independentes e associe duplicatas; não invente causa raiz nem reproduza uma falha perigosa para conseguir pontuá-la.
3. **Defina a régua antes de pontuar.** Leia [metodologia-gut.md](references/metodologia-gut.md) e [criterios-software.md](references/criterios-software.md). Documente horizontes temporais e âncoras do projeto; identifique a régua como local existente ou proposta provisória. Mantenha a mesma régua para a fila comparada.
4. **Atribua notas separadamente.** G mede magnitude do dano; U, tempo disponível para começar a resposta; T, evolução sem nova intervenção. Justifique cada nota com evidência, critério e motivo para não usar a nota vizinha. Ausência de informação não significa 1 nem 3: use intervalo defensável ou dimensão desconhecida, e indique o dado que falta. Leia [incerteza-e-priorizacao.md](references/incerteza-e-priorizacao.md).
5. **Calcule e ordene.** Prefira o script Node.js em [calculadora.md](references/calculadora.md): `node <diretorio-da-skill>/scripts/gut.mjs <entrada.json>`. Ele valida notas, calcula produtos/intervalos e preserva empates; não interpreta o projeto nem escolhe as notas. Sem Node, calcule explicitamente e confira a aritmética. Pontuações provisórias não devem virar uma fila definitiva.
6. **Entregue o parecer.** Use [relatorio-e-exemplos.md](references/relatorio-e-exemplos.md). Mostre evidências locais, régua, notas, cálculo, confiança, lacunas, recomendação e gatilho de reavaliação. Para uma fila, acrescente ranking e empates. Não converta automaticamente pontuação em P0/P1, SLA ou prazo de correção: isso depende da política do projeto.

## Invariantes

- Não use soma, média, pesos ou esforço dentro da fórmula GUT. Se o projeto adotar outra variante, identifique-a e apresente o produto convencional separadamente.
- Não eleve T só porque o bug acontece frequentemente, existe há meses ou tem G alto. Exija mecanismo e horizonte de agravamento; dano acumulado pode crescer mesmo com taxa de falhas constante.
- Avalie o contorno realmente disponível e sua duração. Não trate uma solução sugerida como mitigação comprovada; registre impacto anterior e residual quando houver contenção validada.
- Uma emergência não deve esperar o fechamento da matriz. Aplique a política local de incidente/segurança e registre a exceção à fila numérica; sem política, recomende avaliação imediata diante de dano crítico plausível, deixando explícita a incerteza. A skill não executa a resposta operacional por conta própria.
- Requisitos descrevem intenção; logs e reprodução descrevem observação. Registre conflitos, versões e hipóteses em vez de misturá-los como fatos.

## Referências

Os arquivos acima contêm a metodologia e suas adaptações operacionais. Consulte [fontes-e-pesquisa.md](references/fontes-e-pesquisa.md) para fontes primárias, achados, limitações de acesso e divergências. Os exemplos são sintéticos e as rubricas de software são propostas desta skill, não uma norma universal.
