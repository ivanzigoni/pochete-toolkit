# Instruções de git

Fonte única das instruções de git deste workspace — dois blocos: conventional commits e
conventional branches.

# Bloco 1 — Conventional commits

Todo repositório de aplicação deste workspace (e demais que adotarem o mesmo padrão) tem Husky +
commitlint instalados, com hook `commit-msg` bloqueando o commit que violar as regras sintáticas — tipo
válido, assunto não vazio, tamanho mínimo do header. Essas regras estão em `commitlint.config.js`
de cada repositório e não são repetidas aqui: para saber a lista exata de tipos aceitos ou o
limite de caracteres em vigor, leia o arquivo daquele repositório, não presuma a partir deste
texto.

Este bloco cobre exatamente o que esse hook não consegue verificar: a mensagem passa na sintaxe e
ainda assim comunica pouco. Aplica-se sempre que eu for o autor do commit (`git commit` via Bash)
em qualquer repositório deste workspace.

## Assunto descritivo

O hook barra assunto vazio e curto demais, mas não julga se o texto é específico. Nomear a
mudança real, não o tipo genérico dela: "corrige duplicidade de CPF na criação de associado"
comunica; "correção de bug", "ajustes", "updates" não comunicam nada que o `type` já não dissesse.
Se o assunto poderia ser copiado para qualquer outro commit do mesmo tipo sem perder sentido, ele
não é específico o bastante.

## Escopo como módulo de domínio

Escopo é opcional e livre no hook (sem enum fechado, por decisão deliberada de simplicidade).
Quando usado, o escopo é o nome do módulo/domínio de negócio afetado, nunca o nome de um arquivo
ou classe. Mantém o vocabulário consistente entre commits do mesmo domínio, mesmo sem enforcement
automático.

## Corpo carrega o porquê, não o o quê

Corpo é opcional. Só escrever quando o porquê da mudança não é óbvio a partir do assunto e do
diff — uma decisão de negócio, uma dependência externa, uma alternativa descartada. Nunca
parafrasear o diff no corpo: se o corpo apenas descreve o que o código já mostra, ele não deveria
existir.

## Um commit, uma mudança lógica

Antes de rodar `git commit`, revisar o que está staged: se o conjunto mistura mudanças não
relacionadas (um fix e um refactor sem relação entre si, ou mudanças em dois domínios distintos),
separar em commits distintos em vez de descrever as duas coisas em uma mensagem só. Isso não tem
enforcement mecânico possível — nenhuma ferramenta lê o diff e julga se ele forma uma unidade
lógica — então é responsabilidade de quem redige o commit, inclusive eu.

## Footers estruturados, quando aplicável

Mudança que quebra compatibilidade leva `BREAKING CHANGE:` no footer. Referência a issue/ticket
leva `Refs:` ou `Closes:`. Nenhum dos dois é obrigatório; quando existirem, usar esse formato em
vez de mencionar em prosa no corpo, para manter greppável.

# Bloco 2 — Conventional branches

Não existe hoje enforcement mecânico de nome de branch em nenhum repositório deste workspace — a
disciplina é só deste bloco. Formato: `<type>/<descricao-curta-kebab-case>`, onde `<type>` é o
mesmo enum de `type` já usado em conventional commits (bloco 1) — o `commitlint.config.js` daquele
repositório, nunca uma lista própria hardcoded aqui. Mesmo vocabulário entre commit e branch: uma
branch que só vai conter commits `fix:` usa `fix/`; uma que introduz funcionalidade nova usa
`feat/`. `<descricao-curta-kebab-case>` é a mudança real, com o mesmo padrão de especificidade do
assunto de commit (bloco 1, "Assunto descritivo") — não o tipo genérico dela.

Esta é a convenção padrão que o agente aplica sempre que precisa nomear uma branch, inclusive
dentro do fluxo de `pctk__workflow__create-workdir.skill`: propor o nome já formatado nesse padrão,
não perguntar em aberto. Só se afasta dele mediante confirmação explícita do humano, dada naquele
turno — a ausência de reação não conta como confirmação, mas uma vez que o humano pediu um nome
diferente, esse pedido prevalece para aquela branch.

Este bloco aplica-se só a trabalho de branch/worktree/PR feito como parte de uma tarefa rastreada
em `.claude/__workdir/<task>/`. Uma operação de git avulsa fora desse contexto não aciona este
bloco — o bloco 1 (conventional commits) continua valendo sempre, independente de tarefa
rastreada.
