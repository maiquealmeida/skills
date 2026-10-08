# Incerteza, ordenação e reavaliação

Estas regras são adaptações desta skill. Os manuais da [ANTT](https://www.gov.br/antt/pt-br/acesso-a-informacao/acoes-e-programas/agenda-regulatoria/documentos-orientativos-da-agenda-regulatoria/MANUALDEPROCEDIMENTOSDAAGENDAREGULATRIAaprovado1.pdf) e da [Antaq](https://www.gov.br/antaq/pt-br/acesso-a-informacao/acoes-e-programas/governanca-regulatoria/agenda-regulatoria-ar/manual-da-agenda-regulatoria-da-antaq.pdf) ilustram que desempates e decisões complementares são locais, não parte fixa do produto GUT.

## Dados incompletos

Não invente uma nota para obter uma tabela completa. Se T pode ser 2 ou 3, registre `[2,3]`, o mecanismo previsto e o dado que distinguiria as opções. Se não há base para restringir uma dimensão, marque desconhecida; o script representa isso como `null` e usa `[1,5]` somente para calcular limites possíveis, sem atribuir uma nota.

Como todos os fatores são positivos, `mínimo = Gmín × Umín × Tmín` e `máximo = Gmáx × Umáx × Tmáx`. Para G4, U3 e T[2,4], a faixa é [24,48]. É um envelope de cenários, não intervalo de confiança estatístico: combinações nos extremos podem não ser simultaneamente plausíveis quando dimensões dependem umas das outras. Nesse caso, descreva cenários correlacionados e seus produtos separadamente.

Não use média, ponto médio, zero ou máximo silenciosamente. Um intervalo largo exige investigação dirigida. Quando a decisão não puder esperar, recomende contenção conservadora com base na consequência plausível e declare a hipótese; não alegue que ela já foi comprovada.

## Confiança

Use confiança qualitativa separada do escore:

- **Alta:** contexto vigente, reprodução/telemetria consistente, alcance e prazo confirmados; previsão de T sustentada por mecanismo e observações.
- **Média:** impacto sustentado, mas alcance ou previsão parcialmente inferidos; premissas explícitas que não alteram drasticamente a decisão.
- **Baixa:** relato sem validação, requisitos conflitantes ou lacunas capazes de mudar notas/ação.

Nota pontual pode ser uma estimativa provisória. Se lacunas podem mudar a ordenação, prefira intervalos; o script não mede confiança nem torna evidência verdadeira. Nunca multiplique o produto por confiança para reduzir uma ocorrência potencialmente crítica.

## Ordenação

Compare ocorrências no mesmo contexto/régua e momento. Primeiro destaque exceções de resposta; depois apresente o ranking matemático dos casos com notas pontuais. Preserve casos provisórios à parte. A separação visual não significa que os provisórios sejam menos prioritários: um cenário incerto pode demandar investigação imediata.

Se o mínimo de A é maior que o máximo de B, A tem produto maior sob as faixas consideradas. Se as faixas se sobrepõem, não há ordenação robusta somente pelo produto. O script mantém provisórios na ordem de entrada para evitar uma fila falsamente exata.

## Empates

Mostre o empate. A calculadora usa ranking de competição: 80,80,60 geram posições 1,1,3; a ordem de entrada entre iguais serve apenas à apresentação. Uma política de desempate local pode usar janela mais próxima, magnitude do dano, requisitos obrigatórios ou dependências. Registre a política e os dados utilizados, sem alterar notas para forçar uma ordem.

Sem política, proponha decisão por menor margem segura de resposta, depois maior dano sustentado; se faltam elementos, mantenha a decisão pendente. Esforço pode ajudar a planejar execução após a triagem, mas não altera G, U, T nem deve atrasar contenção crítica. Dependências podem exigir resolver primeiro um item habilitador sem mudar seu escore original.

## Exceção de resposta

Uma ocorrência G5/U5/T1 tem escore 25. Isso não justifica deixá-la atrás de um problema de escore 27 enquanto há dano extremo ativo. Aplique a política local de incidentes; preserve o cálculo e registre o motivo da precedência operacional. O [Google SRE Incident Management Guide](https://sre.google/resources/practices-and-processes/incident-management-guide/) orienta resposta preparada, coordenada e voltada a reduzir impacto. A GUT apoia essa resposta e não deve atrasá-la.

No script, `override` registra motivo e fonte da exceção, sem presumir SEV/P0 e sem alterar produto. Sem política vigente, a fonte pode ser uma recomendação provisória explicitamente identificada com evidência e premissa. Isso registra uma recomendação, não execução, notificação ou aprovação externa.

## Revisão temporal

Defina próximo momento/gatilho proporcional à janela: prazo se aproximando, fila crescendo, rollout, novas evidências, validade do contorno, restauração ou mudança de requisito. Recalcule quando alcance, margem ou tendência mudarem. Não aumente U automaticamente só porque o ticket envelheceu.

Após mitigação validada, preserve a avaliação inicial e crie uma residual, identificando contenção, momento e limitações. A queda de urgência não apaga a falha original nem prova que a correção definitiva terminou.
