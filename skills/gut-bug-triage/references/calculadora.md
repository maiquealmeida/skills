# Calculadora Node.js

Requer Node.js 18+; usa apenas bibliotecas nativas, sem instalação, rede, subprocessos ou escrita de arquivos. O script calcula notas fornecidas pelo agente e valida a estrutura. Não descobre objetivos/requisitos, verifica evidências nem avalia confiança.

## Execução

Resolva o caminho da skill instalada; não presuma que o diretório de trabalho é o da skill:

```sh
node <diretorio-da-skill>/scripts/gut.mjs <entrada.json>
node <diretorio-da-skill>/scripts/gut.mjs - < <entrada.json>
node <diretorio-da-skill>/scripts/gut.mjs --help
```

JSON sai em stdout; erros em stderr e código 1. Para salvar, use redirecionamento apenas no destino autorizado para o relatório. A entrada inteira é validada antes de produzir resultado; um item inválido não gera fila parcial.

## Contrato de entrada

Um arquivo corresponde a **um projeto, uma versão da régua e um momento de avaliação**. Use arquivos separados para contextos diferentes. Todos os campos abaixo são obrigatórios, exceto `override`:

```json
{
  "context": {
    "project": "ERP exemplo",
    "rubricVersion": "gut-erp-v1-proposta",
    "assessedAt": "2026-10-08T10:00:00-04:00"
  },
  "issues": [
    {
      "id": "BUG-42",
      "title": "Fila de emissão fiscal cresce",
      "g": 4,
      "u": 4,
      "t": { "min": 3, "max": 4 },
      "justification": {
        "g": "Jornada fiscal essencial bloqueada, sem contorno; alcance ainda limitado não sustenta G5.",
        "u": "Janela de despacho termina hoje; há margem de organização, portanto U4 e não U5.",
        "t": "Entrada excede saída; falta confirmar capacidade para distinguir T3 de T4."
      },
      "evidence": [
        "docs/requisitos.md, RF-12 (exemplo sintético)",
        "Observação sintética: 120 entradas/min e 100 saídas/min por 30 min"
      ]
    }
  ]
}
```

`g`, `u`, `t` aceitam inteiro 1–5, objeto `{ "min": 2, "max": 4 }` ou `null` para desconhecido. Intervalos exigem extremos inteiros e `min < max`; para extremos iguais, use inteiro. Campos ausentes, desconhecidos, notas em texto, frações, 0, 6 e IDs duplicados são rejeitados. Justificativas e referências de evidência precisam ser textos não vazios; relatos podem ser evidência desde que identificados como não verificados. Não substitua avaliação por textos genéricos apenas para passar no validador.

`assessedAt` usa ISO 8601 com segundos e fuso (`Z` ou offset). O agente deve fornecer data real válida; a validação de timestamp é sintática e de parse, não um auditor de calendário. IDs são únicos considerando espaços externos, mas são preservados na saída. Não inclua dados sensíveis no arquivo quando bastar uma referência.

Para exceção de resposta, acrescente no item:

```json
"override": {
  "reason": "Dano extremo ativo exige resposta antes do ranking da fila.",
  "source": "docs/incidentes.md, seção de perda de dados; ou recomendação provisória identificada"
}
```

## Saída

- `context`, `formula` e `tiePolicy`: metadados da avaliação.
- `escalations`: itens com exceção explícita, preservando ordem de entrada; não é ranking entre emergências.
- `ranked`: itens sem exceção e com notas pontuais, por produto decrescente. Produtos iguais compartilham `rank`, no formato 1,1,3.
- `provisional`: itens sem exceção com intervalo/desconhecido, na ordem original, sem posição definitiva.
- Cada item preserva justificativas/evidências e recebe `status`, `score` e `scoreRange`. `score` é `null` quando provisório. No exemplo, `scoreRange` é `{ "min": 48, "max": 64 }`.

Nenhum grupo é uma prioridade P0/P1. Itens provisórios não são automaticamente menos importantes; sua decisão depende da evidência e da janela. `override` não altera o produto nem dispara ação externa. Qualquer desempate de negócio ocorre no parecer, fora desta calculadora, com a política explicitada.

## Verificação

```sh
node --test <diretorio-da-skill>/scripts/tests/gut.test.mjs
```

Os testes verificam os 125 vetores pontuais possíveis, monotonicidade, intervalos, empates, exceções, entradas inválidas e o contrato CLI. Eles verificam a aritmética; não provam qualidade do julgamento do agente.
