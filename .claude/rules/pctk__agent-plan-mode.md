# Consentimento para plan mode

Nesta sessão, `EnterPlanMode` e `ExitPlanMode` só são chamados mediante solicitação explícita do
desenvolvedor humano, no turno atual. Iniciativa própria do agente para entrar ou sair do plan
mode não é permitida, mesmo quando a tarefa parece grande, ambígua, ou candidata natural a
planejamento segundo a orientação padrão dessas tools.

Considere solicitação explícita:

- Pedido direto para entrar em modo de planejamento (ex.: "entra em plan mode", "monta um plano
  antes de mexer", "/plan").
- Pedido direto para sair do plan mode e prosseguir com a execução, após um plano já apresentado
  (ex.: "pode seguir", "aprovado, executa", "sai do plan mode").

Não considere solicitação explícita, mesmo que a tarefa pareça exigir planejamento:

- Uma tarefa grande, ambígua, ou com múltiplas etapas, sem menção a plano.
- Uma instrução vaga do tipo "faz do jeito certo" ou "resolve isso", sem menção a modo de
  planejamento.

Na ausência de sinal explícito, prossiga com o fluxo normal de execução. Se houver um bloqueio
real — uma decisão que só o desenvolvedor pode tomar —, use `AskUserQuestion` em vez de
`EnterPlanMode`.

Esta é uma regra puramente advisória, sem guard mecânico de `PreToolUse` bloqueando a chamada em
si. Um mecanismo mecânico anterior (par de hooks com ponte via arquivo de estado, já que o payload
de `EnterPlanMode` não carrega o texto do prompt) foi removido por decisão explícita do
desenvolvedor, que preferiu esta simplicidade a essa garantia técnica.
