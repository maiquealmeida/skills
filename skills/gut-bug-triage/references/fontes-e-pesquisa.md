# Fontes e síntese da pesquisa

Pesquisa realizada em **2026-10-08**, sintetizada sem copiar manuais completos. Foram pesquisadas definição, escala, cálculo, critérios, desempate, aplicação contextual e práticas de incidentes/vulnerabilidades. Priorizou-se documentação institucional e práticas publicadas pelos próprios operadores de software. Blogs genéricos e calculadoras encontrados nas buscas não fundamentam as regras técnicas.

A pesquisa compara fontes e registra divergências; não é revisão sistemática de toda a literatura nem validação empírica das rubricas. URLs podem mudar. Para regras externas de um projeto real, confirme a versão vigente quando a decisão depender delas.

## Fontes consultadas e uso

| Fonte | Localização / acesso | Conhecimento utilizado |
| --- | --- | --- |
| [Ministério dos Transportes — Como funciona a Matriz GUT?](https://www.gov.br/transportes/pt-br/assuntos/portal-da-estrategia/artigos-gestao-estrategica/como-funciona-a-matriz-gut) | Página de 25/11/2015, leitura direta | Finalidade de priorização. Atribui origem a Kepner/Tregoe em 1981; não é prova histórica conclusiva |
| [Mauro Sotille — A ferramenta GUT](https://www.gov.br/transportes/pt-br/centrais-de-conteudo/dicas-pmp-matriz-gut-pdf) | PDF hospedado pelos Transportes, ©2014, pp. 1–3; texto acessado | Definições, escala 1–5, etapas e consenso. Prazos exemplificativos e divergências de cálculo/T documentados |
| [FGV Online / Sebrae — Matriz GUT](https://ead4.fgv.br/producao/sebrae/sebrae_mais/modulo1/centro_rec/pag/verbetes/matriz_gut.htm) | Verbete, introdução textual acessível; restante inclui imagens | Caráter complementar à qualidade e deliberação coletiva; não utilizado para extrair escala não legível no texto |
| [ANTT — Manual de Procedimentos da Agenda Regulatória](https://www.gov.br/antt/pt-br/acesso-a-informacao/acoes-e-programas/agenda-regulatoria/documentos-orientativos-da-agenda-regulatoria/MANUALDEPROCEDIMENTOSDAAGENDAREGULATRIAaprovado1.pdf) | 6ª edição, 2023, pp. 45–47; PDF acessado | Notas 1–5, multiplicação, ordem decrescente, resultado não vinculante e desempate local. Nota histórica diverge dos Transportes |
| [Antaq — Manual da Agenda Regulatória](https://www.gov.br/antaq/pt-br/acesso-a-informacao/acoes-e-programas/governanca-regulatoria/agenda-regulatoria-ar/manual-da-agenda-regulatoria-da-antaq.pdf) | 1ª edição, 2024, pp. 17–20, principalmente p. 19; PDF acessado | Produto G×U×T, máximo 125 e decisões complementares. Regras específicas da agenda não transferidas para bugs |
| [Google SRE — Product-Focused Reliability](https://sre.google/resources/practices-and-processes/product-focused-reliability-for-sre/) | Página, passagens de KPIs e diretrizes específicas; leitura direta | Criticidade relacionada ao objetivo/indicador do produto, fundamentando calibração contextual |
| [Google SRE — Incident Management Guide](https://sre.google/resources/practices-and-processes/incident-management-guide/) | Introdução/preparação; leitura direta | Resposta preparada e coordenada para reduzir impacto. Fundamenta não atrasar resposta crítica por triagem |
| [Google SRE — Alerting on SLOs](https://sre.google/workbook/alerting-on-slos/) | Workbook, burn rate e múltiplas janelas; leitura direta | Consumo do orçamento de erro e tempo até esgotamento informam resposta; insumos de tempo, sem conversão automática para GUT |
| [Atlassian — Understanding incident severity levels](https://www.atlassian.com/incident-management/kpis/severity-levels/) | Definições de severidade e prioridade; leitura direta | Exemplos de dano, contorno e ajuste ao negócio. Fundamenta âncoras de software e distinção severidade/prioridade |
| [FIRST — CVSS v4.0 User Guide](https://www.first.org/cvss/v4.0/user-guide) | Seção 2.2 e condições de uso; leitura direta | CVSS Base mede severidade e não risco contextual sozinho; ambiente/ameaças complementam análise. Não converter diretamente para GUT |

## Achados e decisões

1. ANTT/Antaq explicitam notas 1–5 e produto. A calculadora usa esse contrato.
2. O PDF dos Transportes menciona soma em uma frase e produto no campo final. A skill registra a contradição e usa multiplicação.
3. Os prazos de planejamento encontrados não estabelecem SLAs de software. Os horizontes operacionais devem ser calibrados por projeto.
4. Descrições de T no PDF misturam estabilidade/piora. Esta skill reserva T1 à estabilidade sustentada e exige horizonte/mecanismo para agravamento.
5. Transportes citam 1981; ANTT cita os anos 1960. A skill não afirma data histórica definitiva nem atribui escala/produto a obra original não verificada.
6. As práticas de software consultadas sustentam avaliar impacto no produto e distinguir severidade da decisão de tratamento.
7. Desempates e precedências operacionais exigem governança local; não fazem parte da fórmula.
8. Rubricas detalhadas de software, intervalos, confiança separada, relatório e contrato do script são **adaptações desta skill**. Exemplos são sintéticos, sem validação em projetos reais.
9. Limitações da multiplicação de categorias ordinais e da comparabilidade entre réguas são análise metodológica/matemática da skill, não resultados experimentais atribuídos às fontes.

## Limitações de acesso

Uma busca encontrou o Anexo D do Ministério da Saúde (`diretriz_atuacao_integrada_agentes_combate_endemias.pdf`), mas a abertura direta falhou. Um PDF do Sebrae sobre código de obras redirecionou à página geral de conteúdos. Um capítulo de *The New Rational Manager* hospedado pela Kepner-Tregoe redirecionou à homepage e um artigo relacionado falhou ao abrir. Esses materiais não fundamentam as regras; passagens sobrepostas foram confirmadas nas fontes acessíveis acima.

O workbook de resposta a incidentes do Google também foi consultado; o guia de gestão foi escolhido como referência mais direta. Não se incorporaram execução operacional, procedimentos completos de comando de incidentes ou regras jurídicas além da classificação solicitada.

## Mapa do conhecimento

- Definições, cálculo, divergências e limites: [metodologia-gut.md](metodologia-gut.md).
- Leitura de objetivos/requisitos e calibração: [contexto-projeto.md](contexto-projeto.md).
- Critérios, sinais técnicos e segurança: [criterios-software.md](criterios-software.md).
- Incertezas, empates, exceções e revisão: [incerteza-e-priorizacao.md](incerteza-e-priorizacao.md).
- Parecer e casos: [relatorio-e-exemplos.md](relatorio-e-exemplos.md).
- Automação e contrato: [calculadora.md](calculadora.md).
