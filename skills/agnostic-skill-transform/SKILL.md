---
name: agnostic-skill-transform
description: Move as skills do projeto de `.claude/skills/` para `.agents/skills/` (com references, scripts e assets) e deixa no lugar um adapter que aponta para a skill real. Só roda pelo comando `/agnostic-skill-transform`; sem argumentos, oferece "Todas" e a lista de skills que ainda não são adapters. Precisa de Node.js 18+.
argument-hint: "[--all | nome-da-skill ...]"
disable-model-invocation: true
---

# Skills para `.agents/skills/`

Rode tudo a partir da raiz do projeto. O script fica em `scripts/agnostic-skill-transform.mjs`, ao lado deste arquivo (`${CLAUDE_SKILL_DIR}/scripts/agnostic-skill-transform.mjs` no Claude Code).

## Fluxo

1. **Liste os candidatos:** `node <dir-da-skill>/scripts/agnostic-skill-transform.mjs list`. Devolve um array JSON com as skills de `.claude/skills/` que têm `SKILL.md` e ainda não são adapters (não são link para `.agents/skills/` nem citam `.agents/skills/` no `SKILL.md`). Array vazio: diga que não há nada a mover e pare.
2. **Escolha.**
   - Com argumentos: `--all` vale "Todas"; nomes valem só aquelas skills. Não pergunte.
   - Sem argumentos: mostre a opção **Todas** primeiro e, abaixo, cada skill candidata. Use a ferramenta de seleção múltipla do agente quando a lista couber nela (no Claude Code, `AskUserQuestion` aceita até 4 opções: "Todas" + 3 skills); senão, mostre uma lista numerada (`0. Todas`, `1. alpha`, ...) e peça os números. Espere a resposta.
3. **Mova:** `node <dir-da-skill>/scripts/agnostic-skill-transform.mjs migrate --all` ou `... migrate <nome> <nome>`. O script cria `.agents/skills/` se faltar, move a pasta inteira e escreve em `.claude/skills/<nome>/SKILL.md` um adapter com o frontmatter original e a instrução de ler `.agents/skills/<nome>/SKILL.md`.
4. **Relate** o JSON de saída: o que foi movido e o que foi pulado, com o motivo. Saída 2 = alguma skill foi pulada.

## Invariantes

- Nunca sobrescreva `.agents/skills/<nome>` existente: o script pula e você relata. Resolver o conflito é decisão do usuário.
- Skill em `.claude/skills/` que é link simbólico para outro lugar é pulada; não mova o alvo do link.
- Não edite o conteúdo das skills movidas. Caminhos relativos continuam válidos porque a pasta vai inteira.
- Não faça commit; o usuário decide.
