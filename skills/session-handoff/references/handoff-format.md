# Conteúdo suficiente para continuar

Dimensione ao trabalho. O documento é um ponto de retomada, não transcrição da conversa. O template abaixo é uma estrutura orientadora: omita campos inaplicáveis e escreva lacunas reais em vez de preenchê-los com suposições.

```markdown
# Handoff — <tema>

Atualizado em: <instante e fuso>
Projeto/diretório: <raiz do projeto>
Arquivo: <path real deste handoff>
Última observação: <momento/ambiente; diferente da data de redação quando necessário>

## Estado para retomada
Objetivo e ponto exato onde paramos; concluído versus pendente.
Primeira ação concreta; critério ainda necessário para concluir.

## Decisões e escopo
Escolhas do operador, motivo e limites, inclusive adiamentos/revogações.
Autorizações já concedidas e ações que dependem de autorização adicional.
Problemas independentes que ficam fora deste assunto.

## Trabalho e estado observado
Mudanças/artefatos relevantes e responsáveis quando aplicável.
Se houver Git: branch, HEAD, remoto conferido ou desconhecido e diff a preservar.
Se houver ambiente externo: revisão ativa observada, horário e forma de acesso sem segredos.
Separar proposta, implementação, commit, push, deploy e aceitação operacional.

## Validação e evidências
Comandos/checks ou método usados, resultados, ambiente, timestamps e paths.
Falhas, hipóteses abertas e limites. Identificar dados simulados e observações reais.
Não sobrescrever auditorias; apontar snapshots distintos com seus momentos.

## Próximos passos
Ordem e dependências, com a próxima ação executável e seus limites.
O que revalidar, blockers reais e informações/acesso necessários.
Ações já feitas que não devem ser repetidas.

## Preservação e referências
Trabalho alheio, alterações staged/untracked, contratos e dados a preservar.
Paths úteis; efeitos de helpers que precisam ser relidos antes de executar.
```

## Aprendizados a aplicar

- **Um status por afirmação:** código salvo não é commit; commit não é push; push não é revisão ativa. Teste unitário, UAT simulada e execução real sustentam conclusões diferentes. Dizer quais checks passaram, onde e o que não cobriram.
- **Observação com relógio:** uma janela curta sem falha não prova resolução sustentada. Se a redação usa um snapshot anterior, explicitar essa data; não afirmar que houve revalidação remota ao apenas atualizar o documento.
- **Diagnóstico não é cura:** instrumentação implantada pode estar concluída enquanto a causa do incidente continua aberta. Campos null/desconhecidos não identificam uma causa. Dar à próxima sessão o gatilho e a evidência necessários para avançar.
- **Um snapshot não substitui outro:** crescimento de contagens pode ser processamento normal entre observações. Preservar estados anteriores e posteriores com timestamps, sem misturar amostras ou reescrever evidência bruta.
- **Acesso sem segredo:** registrar wrapper/runbook/localização segura; nunca copiar token, senha, Authorization, URLs com credenciais, prompts privados ou mídia pessoal. Logs devem apontar evidência sanitizada; não dump de objetos sensíveis.
- **Repetição tem efeitos:** helper de “probe” pode consumir fila, inferência ou sobrescrever auditoria. Listar o efeito conhecido e o que precisa ser inspecionado; não transformar comandos antigos em uma sequência automática de retomada.
- **Comunicação é um estado próprio:** quando aplicável, registrar destinatário, resultado da API, outbox/operação e conclusão comunicada, sem importar contexto privado de pessoas para o handoff. Aceitação não comprova entrega/leitura. Não repetir envio ambíguo nem mensagem já aceita.
- **Histórico consolidado:** ao atualizar, substituir instruções obsoletas e deixar a evolução anterior identificada como histórica. Evitar “implementar a instrumentação” na lista de pendências quando ela já está implantada. Não apagar decisões e limites ainda válidos.

Exemplo: “Instrumentação ativa na revisão X, confirmada às 17:07. Quatro cenários simulados passaram; zero falhas reais na janela de 126 s. Causa ainda desconhecida. Próximo passo: revalidar o servidor e procurar evento real sanitizado.” Isso permite retomar a investigação sem refazer o deploy nem anunciar correção causal inexistente.
