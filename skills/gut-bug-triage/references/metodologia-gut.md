# Metodologia GUT

## Fundamento e alcance

GUT estrutura a comparação de problemas que disputam atenção e recursos. A página do [Ministério dos Transportes](https://www.gov.br/transportes/pt-br/assuntos/portal-da-estrategia/artigos-gestao-estrategica/como-funciona-a-matriz-gut) apresenta essa finalidade. O verbete da [FGV/Sebrae](https://ead4.fgv.br/producao/sebrae/sebrae_mais/modulo1/centro_rec/pag/verbetes/matriz_gut.htm) caracteriza a ferramenta como complementar à gestão da qualidade e à deliberação em grupo.

É um apoio à decisão, não prova de causa raiz, estimativa de esforço ou autorização para executar mudanças. A [ANTT, manual de 2023, pp. 45–47](https://www.gov.br/antt/pt-br/acesso-a-informacao/acoes-e-programas/agenda-regulatoria/documentos-orientativos-da-agenda-regulatoria/MANUALDEPROCEDIMENTOSDAAGENDAREGULATRIAaprovado1.pdf), explicita que a ordenação não vincula toda decisão de portfólio e admite critérios complementares.

## Dimensões

| Dimensão | Pergunta | O que evitar confundir |
| --- | --- | --- |
| Gravidade | Qual a magnitude do dano observado ou plausível se não houver resposta? | Dificuldade técnica da correção |
| Urgência | Quanto tempo ainda existe para iniciar uma resposta eficaz? | Pressão de quem relata, idade do ticket |
| Tendência | Como o problema/dano evoluirá sem nova intervenção? | Frequência isolada, urgência ou gravidade |

O [material de Mauro Sotille hospedado pelo Ministério dos Transportes, pp. 1–3](https://www.gov.br/transportes/pt-br/centrais-de-conteudo/dicas-pmp-matriz-gut-pdf) trabalha com essas três perguntas, notas de 1 a 5 e consenso na avaliação. Seus prazos de semanas/meses são exemplos de planejamento; não são SLAs para software.

A nomenclatura varia entre fontes. A régua conceitual adotada aqui é:

| Nota | G: dano | U: janela de resposta | T: evolução sem ação |
| --- | --- | --- | --- |
| 1 | Mínimo ou sem consequência material | Pode esperar | Estável, melhora ou desaparece sem novo dano material |
| 2 | Leve | Há ampla margem | Agrava em horizonte longo |
| 3 | Relevante | Necessita resposta programada em prazo intermediário | Agrava em horizonte intermediário |
| 4 | Elevado | Janela curta | Agrava em pouco tempo |
| 5 | Extremo | Resposta imediata | Agrava rapidamente |

Os significados operacionais e os horizontes devem ser calibrados por projeto. Essa síntese não reproduz literalmente uma tabela institucional; resolve ambiguidades para permitir uso consistente em software.

## Cálculo convencional

`pontuação = G × U × T`, com cada nota inteira entre 1 e 5. O mínimo é 1 e o máximo é 125. Ordene em sentido decrescente. A [Antaq, manual de 2024, p. 19](https://www.gov.br/antaq/pt-br/acesso-a-informacao/acoes-e-programas/governanca-regulatoria/agenda-regulatoria-ar/manual-da-agenda-regulatoria-da-antaq.pdf) explicita a multiplicação e a ordem de tratamento.

Exemplos aritméticos desta skill: `(4, 4, 5) → 80`; `(5, 5, 1) → 25`; `(3, 3, 3) → 27`; `(1, 1, 1) → 1`. Uma falha extrema e urgente, mas estável, pode ter produto menor que outra menos grave: mantenha o vetor de notas visível e aplique exceções de resposta quando justificadas.

## Divergências encontradas

O PDF de Sotille escreve `G + U + T` em um trecho da p. 3, mas descreve o campo final como produto logo adiante. A ANTT e a Antaq especificam `G × U × T`. Esta skill adota o produto, registra a inconsistência e não propaga a soma como fórmula convencional. Algumas descrições de T no mesmo PDF também misturam estabilidade com piora intermediária; aqui estabilidade sustentada corresponde a T=1.

As fontes também divergem sobre a data histórica: a página dos Transportes menciona 1981; a nota de rodapé da ANTT menciona os anos 1960. Não tratar uma dessas datas como história definitivamente comprovada. A origem não afeta o procedimento de classificação.

## Limites matemáticos e decisórios

As considerações abaixo são análise metodológica desta skill:

- As notas expressam categorias ordenadas. Não há garantia de que G=4 represente o dobro do dano de G=2.
- O produto é um índice de priorização, não perda financeira esperada, probabilidade ou unidade física de risco. Um resultado 100 não prova risco duas vezes maior que 50.
- Muitos vetores têm o mesmo produto; nem todos os inteiros de 1 a 125 são resultados possíveis. Não inventar precisão decimal.
- Dimensões correlacionadas podem amplificar a mesma percepção. Justifique magnitude, janela e evolução separadamente.
- Comparar projetos com réguas diferentes produz falsa comparabilidade. Uma fila transversal exige calibração comum ou decisões separadas.
- Não existe, nas fontes consultadas, conversão universal para P0–P4 ou faixas obrigatórias de baixo/médio/alto. Faixas locais precisam de propósito, validação e versão.

Use consenso de produto, domínio e operação quando a decisão exigir esses conhecimentos; registre divergências e hipóteses. Não tire a média de opiniões apenas para esconder desacordo.
