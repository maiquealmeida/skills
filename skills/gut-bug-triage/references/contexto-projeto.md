# Leitura e calibração do projeto

Este procedimento é uma adaptação operacional da skill. O princípio de ligar criticidade aos objetivos e indicadores do produto tem suporte no [Google SRE: Product-Focused Reliability](https://sre.google/resources/practices-and-processes/product-focused-reliability-for-sre/), que usa diretrizes específicas por produto.

## Busca orientada

Leia `AGENTS.md` e instruções aplicáveis. Use `rg --files` para encontrar README, PRD, requisitos, especificações, ADR/RFC, glossário, políticas de incidentes/segurança, contratos de integração, SLO/SLA e runbooks. Pastas como `docs/`, `.specs/` e `specs/` são pistas, não caminhos obrigatórios. Busque conceitos como objetivo, atores, requisito, jornada crítica, disponibilidade, integridade, privacidade, offline, prazo e recuperação.

Não carregue o repositório inteiro. Primeiro identifique as fontes normativas; depois abra as seções e o código/testes relacionados à ocorrência. Registre caminho e seção/linha, versão ou commit quando disponível. Arquivos históricos, rascunhos e requisitos revogados não devem substituir decisões vigentes.

## Perfil mínimo do contexto

| Campo | Informação necessária |
| --- | --- |
| Objetivo | Resultado que o produto precisa entregar e indicador de sucesso |
| Domínio e atores | Quem depende do resultado e quais invariantes precisam ser preservados |
| Jornada afetada | Função essencial ou auxiliar; requisito e critérios de aceite |
| Operação | Produção/homologação/desenvolvimento; versão; horário e calendário de uso |
| Dados | Sensibilidade, integridade, recuperabilidade, fonte de verdade e limites entre clientes |
| Alcance | Usuários, operações, unidades ou dispositivos afetados; denominador e período |
| Compromissos | SLA, SLO, janela de negócio, data de release e obrigações documentadas |
| Contenção | Contorno validado, custo operacional, cobertura, prazo de validade e limitações |
| Autoridade | Política vigente e quem valida premissas de domínio/negócio |

Informe explicitamente o que é desconhecido. Não suponha SLA, multas, legislação aplicável, backup restaurável ou produção afetada. Se for necessário interpretar uma obrigação jurídica, confirme a fonte vigente em vez de inventar o prazo.

## Construção da régua

1. Aproveite a régua local existente, conferindo se cobre o ambiente e o domínio envolvidos. Se houver apenas SEV/P1, não faça conversão numérica automática para GUT.
2. Sem régua GUT, proponha âncoras a partir de [criterios-software.md](criterios-software.md). Marque-as como provisórias; ainda é possível entregar uma triagem fundamentada sem esperar uma reunião.
3. Defina o que significa impacto material, jornada crítica e dano extremo naquele projeto. Um cliente afetado pode ser crítico se houver quebra de isolamento; alcance reduzido não reduz automaticamente G.
4. Defina janelas contínuas ou úteis, fuso horário e calendário. Os limites de U precisam cobrir todos os casos sem sobreposição. T precisa de horizonte longo/intermediário/curto/rápido reconhecível pelo domínio.
5. Calibre com duas ou três ocorrências conhecidas. Confira se resultados distintos refletem diferenças reais e se a mesma evidência recebe a mesma nota.
6. Registre identificador/versão da régua, premissas e data da análise. Ao trocar a régua, reavalie a fila comparada; preserve os pareceres anteriores como histórico.

Uma janela de resposta deve considerar o tempo necessário para conter o dano, não apenas a data em que ele ocorrerá. Um certificado vence amanhã, mas a implantação segura exige um dia: a resposta pode precisar começar agora. Expresse esse raciocínio; não some esforço ao produto GUT.

## Mesmo sintoma, contextos diferentes

Exemplos sintéticos: uma falha de sincronização em app que promete operação offline pode impedir que dados de campo cheguem ao sistema de referência; em um protótipo sem usuários externos, o impacto observado é outro. Um relatório indisponível pode ser auxiliar em um produto e a entrega central em outro. Um defeito aparentemente visual que oculta consentimento, valor cobrado ou comando de segurança não é meramente cosmético.

Documentação é evidência do comportamento esperado. Ela não prova que a falha está ativa, que um contorno funciona ou que a causa é conhecida. Registre conflitos entre requisito, operação e implementação e, quando necessário, classifique como problema a investigar em vez de bug confirmado.
