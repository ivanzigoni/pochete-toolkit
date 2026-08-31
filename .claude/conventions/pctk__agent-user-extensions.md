# Extensões de domínio do usuário

A pochete-toolkit distribui suas próprias skills e rules sob o prefixo `pctk__` (ex.:
`pctk__workflow__diagnostico.skill`, `pctk__safe-bash.md`) e suas próprias conventions sob o
prefixo `pctk__agent-` (ex.: `pctk__agent-git.md`), todas versionadas e mantidas pelo próprio
framework. Quem usa a pochete-toolkit em um workspace próprio também pode criar as três coisas com
conteúdo específico do domínio de negócio desse workspace — sem que isso faça parte do framework
distribuído.

## Convenção de nome e path

Toda skill, rule ou convention de domínio criada a pedido do desenvolvedor (não como parte da
manutenção do próprio framework pochete-toolkit) usa o prefixo `user__`:

| Tipo | Path |
|---|---|
| Skill | `.claude/skills/user__<categoria>__<nome-especifico>.skill/SKILL.md` |
| Rule | `.claude/rules/user__<nome-descritivo>.md`, com seu próprio `paths:` no frontmatter |
| Convention | `.claude/conventions/user__<nome-descritivo>.md`, referenciada de dentro de `.claude/conventions/user__index.md` |

Para skills, `<categoria>` é livre — o domínio de negócio do workspace do usuário, não um valor
fixo pela pochete-toolkit. Em todos os casos, `<nome-especifico>`/`<nome-descritivo>` segue o
mesmo padrão de especificidade de `.claude/conventions/pctk__agent-git.md` (bloco 2): nomeia o artefato
de verdade, não um rótulo genérico.

Ao criar uma skill, rule ou convention de domínio a pedido do desenvolvedor, aplicar o prefixo
`user__` por padrão, sem perguntar — a menos que o próprio pedido deixe explícito que o artefato
deve fazer parte do framework pochete-toolkit em si (prefixo `pctk__` para skill ou rule, prefixo
`pctk__agent-` para convention), decisão que cabe a quem mantém o framework, não a um uso comum da
toolkit.

## Skills e rules: descoberta automática, nenhum passo extra

Skills e rules são descobertas diretamente pelo harness a partir do próprio arquivo: skills por
diretório (`.claude/skills/*.skill/SKILL.md`), rules por `paths:` no frontmatter batendo com o
arquivo lido ou editado na sessão. Nenhuma das duas passa por `CLAUDE.md` — basta criar o arquivo
no lugar certo, com o prefixo certo, para que ele passe a valer.

## Conventions: entrypoint fixo com import aninhado

Conventions não têm descoberta automática — só carregam via uma linha `@caminho` explícita dentro
do `CLAUDE.md`. Para não exigir que o desenvolvedor edite o `CLAUDE.md` compartilhado do framework
toda vez que quiser uma convention pessoal nova, o próprio `CLAUDE.md` já importa, de forma fixa e
permanente, `@.claude/conventions/user__index.md`.

Esse arquivo é gitignored e nasce ausente — uma linha de import apontando para um arquivo
inexistente é um no-op silencioso, não uma falha de carregamento (mesmo mecanismo usado pelo
dicionário de domínio: `@.claude/dictionary/index.md`, também gitignored e também ausente por
padrão até o desenvolvedor criar seu primeiro arquivo de vocabulário). Quando o desenvolvedor
quiser uma convention pessoal, ele copia
`.claude/conventions/user__index.example.md` para `user__index.md` e adiciona ali uma linha
`@.claude/conventions/user__<nome>.md` por convention — resolvida por import aninhado, dentro do
limite de profundidade do próprio Claude Code.

O agente nunca edita a linha fixa do `CLAUDE.md` para isso — ela já existe. O agente só cria ou
edita `user__index.md` e os arquivos `user__<nome>.md` que ele referencia.

## Por que fica fora do controle de versão

Toda skill sob `.claude/skills/user__*/`, toda rule sob `.claude/rules/user__*.md` e toda
convention sob `.claude/conventions/user__*.md` é ignorada por `.gitignore` (ver raiz do
repositório) — o mesmo tratamento dado ao dicionário de domínio (`.claude/dictionary/`). A
pochete-toolkit distribui só o workspace do agente compartilhado entre times; conhecimento de
domínio de um workspace específico
não deve entrar no histórico do framework. Como o ignore é automático pelo prefixo, não é preciso
lembrar de adicionar o arquivo ao `.gitignore` manualmente nem perguntar ao desenvolvedor se ele
deve ser versionado.
