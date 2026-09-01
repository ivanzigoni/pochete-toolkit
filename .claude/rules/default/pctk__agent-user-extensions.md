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
| Rule (escopada por tipo de arquivo) | `.claude/rules/scoped/user__<nome-descritivo>.md`, com seu próprio `paths:` no frontmatter |
| Convention (sempre carregada) | `.claude/rules/default/user__<nome-descritivo>.md`, sem `paths:` no frontmatter |

Para skills, `<categoria>` é livre — o domínio de negócio do workspace do usuário, não um valor
fixo pela pochete-toolkit. Em todos os casos, `<nome-especifico>`/`<nome-descritivo>` segue o
mesmo padrão de especificidade de `.claude/rules/default/pctk__agent-git.md` (bloco 2): nomeia o
artefato de verdade, não um rótulo genérico.

Ao criar uma skill, rule ou convention de domínio a pedido do desenvolvedor, aplicar o prefixo
`user__` por padrão, sem perguntar — a menos que o próprio pedido deixe explícito que o artefato
deve fazer parte do framework pochete-toolkit em si (prefixo `pctk__` para skill ou rule, prefixo
`pctk__agent-` para convention), decisão que cabe a quem mantém o framework, não a um uso comum da
toolkit.

## Skills e rules escopadas: descoberta automática, nenhum passo extra

Skills e rules escopadas são descobertas diretamente pelo harness a partir do próprio arquivo:
skills por diretório (`.claude/skills/*.skill/SKILL.md`), rules por `paths:` no frontmatter
batendo com o arquivo lido ou editado na sessão — hoje reunidas em `.claude/rules/scoped/`.
Nenhuma das duas passa por `CLAUDE.md` — basta criar o arquivo no lugar certo, com o prefixo
certo, para que ele passe a valer.

## Conventions: a mesma descoberta nativa, só sem `paths:`

Uma convention sempre-ativa não é um mecanismo à parte — é uma rule igual às de
`.claude/rules/scoped/`, só que sem o campo `paths:` no frontmatter (ou sem frontmatter nenhum).
O Claude Code carrega incondicionalmente toda rule sem `paths:`, em toda sessão, o mesmo jeito que
já carrega skills e rules escopadas. Essas conventions vivem em `.claude/rules/default/` — tanto as
do framework (`pctk__agent-*.md`) quanto as pessoais (`user__*.md`). Criar uma convention pessoal
é só criar o arquivo ali; não existe índice, lista ou linha de import para manter.

## Material de referência: fora de `.claude/rules/` inteiramente

Uma convention nem sempre deve carregar em toda sessão (ex.: uma regra de tom de voz institucional
que só se aplica ao escrever texto client-facing, não a toda tarefa de engenharia). Como qualquer
arquivo dentro de `.claude/rules/default/` carrega sempre e qualquer arquivo em
`.claude/rules/scoped/` precisa de um `paths:` que faça sentido como glob de arquivo — o que nem
sempre existe para esse tipo de regra —, esse caso vive fora de `.claude/rules/` inteiramente, em
`.claude/reference/`. Um arquivo ali só entra em contexto quando outra skill, rule ou instrução
explícita apontar para ele.

Mesma separação `default`/`user` das seções acima, aplicada a este diretório:

| Tipo | Path |
|---|---|
| Referência do framework | `.claude/reference/default/pctk__<nome-descritivo>.md`, versionada e mantida pela pochete-toolkit |
| Referência pessoal | `.claude/reference/user/<nome-descritivo>.md`, específica do workspace de quem usa a toolkit |

## Por que fica fora do controle de versão

Toda skill sob `.claude/skills/user__*/`, toda rule sob `.claude/rules/scoped/user__*.md` e toda
convention sob `.claude/rules/default/user__*.md` é ignorada por `.gitignore` (ver raiz do
repositório) — o mesmo tratamento dado ao dicionário de domínio (`.claude/rules/user/`) e ao
material de referência pessoal (`.claude/reference/user/`). A pochete-toolkit distribui só o
workspace do agente compartilhado entre times; conhecimento de domínio de um workspace específico
não deve entrar no histórico do framework. Como o ignore é automático pelo prefixo (ou, no caso do
dicionário e da referência pessoal, pela pasta inteira), não é preciso lembrar de adicionar o
arquivo ao `.gitignore` manualmente nem perguntar ao desenvolvedor se ele deve ser versionado. Cada
uma dessas duas pastas mantém um `.gitkeep` rastreado (com exceção pontual no `.gitignore`) só para
garantir que a pasta exista após um clone novo.
