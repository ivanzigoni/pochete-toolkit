# Extensões de domínio do usuário

A pochete-toolkit distribui suas próprias skills sob o prefixo `pctk__` (ex.:
`pctk__workflow__create-workdir`) e suas próprias rules e conventions sob o prefixo
`pctk__agent-` (ex.: `pctk__agent-git.md`, `pctk__agent-safe-bash.md`), além de um servidor MCP
próprio sob `.claude/mcp/pctk__default/`. Todas versionadas e mantidas pelo próprio framework. Quem usa a
pochete-toolkit em um workspace próprio também pode criar as quatro coisas com conteúdo específico
do domínio de negócio desse workspace — sem que isso faça parte do framework distribuído.

## Convenção de nome e path

Toda skill, rule, convention ou servidor MCP de domínio criado a pedido do desenvolvedor (não como
parte da manutenção do próprio framework pochete-toolkit) usa o prefixo `user__`:

| Tipo | Path |
|---|---|
| Skill | `.claude/skills/user__<categoria>__<nome-especifico>/SKILL.md` |
| Rule (escopada por tipo de arquivo) | `.claude/rules/user__<nome-descritivo>.md`, com seu próprio `paths:` no frontmatter |
| Convention (sempre carregada) | `.claude/rules/user__<nome-descritivo>.md`, sem `paths:` no frontmatter |
| Servidor MCP | `.claude/mcp/user__<nome-descritivo>/` |

Para skills, `<categoria>` é livre — o domínio de negócio do workspace do usuário, não um valor
fixo pela pochete-toolkit. Em todos os casos, `<nome-especifico>`/`<nome-descritivo>` segue o
mesmo padrão de especificidade de `.claude/rules/pctk__agent-git.md` (bloco 2): nomeia o
artefato de verdade, não um rótulo genérico.

Ao criar uma skill, rule, convention ou servidor MCP de domínio a pedido do desenvolvedor, aplicar
o prefixo `user__` por padrão, sem perguntar — a menos que o próprio pedido deixe explícito que o
artefato deve fazer parte do framework pochete-toolkit em si (prefixo `pctk__` para skill,
prefixo `pctk__agent-` para rule ou convention, prefixo `pctk__default` para o servidor MCP),
decisão que cabe a quem mantém o framework, não a um uso comum da toolkit.

## Skills e rules escopadas: descoberta automática, nenhum passo extra

Skills e rules escopadas são descobertas diretamente pelo harness a partir do próprio arquivo:
skills por diretório (`.claude/skills/*/SKILL.md` — o nome do diretório não precisa de sufixo
`.skill`, é o `SKILL.md` dentro que importa), rules por `paths:` no frontmatter batendo com o
arquivo lido ou editado na sessão — hoje lado a lado com as conventions, sem pasta própria: as do
framework e as pessoais compartilham `.claude/rules/`, distinguidas só pelo prefixo do nome
(`pctk__agent-` vs. `user__`). Nenhuma das duas passa por `CLAUDE.md` — basta criar o arquivo no
lugar certo, com o prefixo certo, para que ele passe a valer.

## Servidor MCP: path convencionado, registro manual

Diferente das três extensões acima, um servidor MCP sob `.claude/mcp/user__<nome>/` não é
descoberto automaticamente pelo harness — ele só passa a existir como tool depois de registrado.
Esse registro nunca vai para `.mcp.json`: esse arquivo é versionado e compartilhado, e um servidor
pessoal registrado ali vazaria para todo o time que usa este workspace. O registro correto usa o
scope local nativo do Claude Code, `claude mcp add --scope local <nome> <comando>`, que grava em
`~/.claude.json` — fora deste repositório, sem tocar em nenhum arquivo versionado.

## Conventions: a mesma descoberta nativa, só sem `paths:`

Uma convention sempre-ativa não é um mecanismo à parte — é uma rule igual às demais, só que sem o
campo `paths:` no frontmatter (ou sem frontmatter nenhum). O Claude Code carrega incondicionalmente
toda rule sem `paths:`, em toda sessão, o mesmo jeito que já carrega skills e rules escopadas.
Essas conventions vivem lado a lado com as rules escopadas, no mesmo diretório `.claude/rules/`:
as do framework nomeadas `pctk__agent-*.md`, as pessoais nomeadas `user__*.md`. Criar uma
convention pessoal é só criar o arquivo ali; não existe índice, lista ou linha de import para
manter.

## Block: fora de `.claude/rules/` inteiramente

Uma convention nem sempre deve carregar em toda sessão (ex.: uma regra de tom de voz institucional
que só se aplica ao escrever texto client-facing, não a toda tarefa de engenharia). Como toda rule
sob `.claude/rules/` carrega sempre quando não tem `paths:` no frontmatter, e precisa de um
`paths:` que faça sentido como glob de arquivo quando tem — o que nem sempre existe para esse tipo
de regra —, esse caso vive fora de `.claude/rules/` inteiramente, em `.claude/blocks/`.

Mesma distinção por prefixo das seções acima, aplicada a este diretório:

| Tipo | Path |
|---|---|
| Block do framework | `.claude/blocks/pctk__<nome-descritivo>.md`, versionado e mantido pela pochete-toolkit |
| Block pessoal | `.claude/blocks/user__<nome-descritivo>.md`, específico do workspace de quem usa a toolkit |

## Nenhuma leitura por iniciativa própria

Um arquivo sob `.claude/blocks/` — seja prefixo `pctk__` (framework) ou `user__` (pessoal) — só
entra em contexto quando outra skill, rule ou instrução explícita do desenvolvedor aponta para
ele, no turno atual. Por iniciativa própria, o agente nunca lê, varre ou lista o conteúdo de
`.claude/blocks/` buscando contexto adicional — nem para "ajudar", nem para preencher lacuna de
informação percebida. A regra vale igual pros dois prefixos: o `pctk__` do lado do framework não
abre exceção a essa restrição.

Isso é uma restrição de comportamento, não um limite mecânico — não há guard de `PreToolUse`
barrando a leitura em si. Dentro do escopo já permitido pela raiz do projeto, o agente se abstém
de explorar `.claude/blocks/` sem que uma skill, rule ou o próprio desenvolvedor, no turno
atual, aponte para um arquivo específico ali dentro.

## Por que fica fora do controle de versão

Toda skill sob `.claude/skills/user__*/`, todo servidor MCP sob `.claude/mcp/user__*/`, toda rule
ou convention pessoal em `.claude/rules/user__*.md` e todo block pessoal em
`.claude/blocks/user__*.md` são ignorados por `.gitignore`, todos pelo mesmo critério: prefixo do
nome — o mesmo tratamento dado ao dicionário de domínio. Note que o `.gitignore` cobre só o
código-fonte do servidor MCP: seu registro (`claude mcp add --scope local`) já fica fora deste
repositório por natureza, sem depender do `.gitignore` (ver seção acima). A pochete-toolkit
distribui só o workspace do agente compartilhado entre times; conhecimento de domínio de um
workspace específico não deve entrar no histórico do framework. Como o ignore é automático — por
prefixo em todos os casos —, não é preciso lembrar de adicionar o arquivo ao `.gitignore`
manualmente nem perguntar ao desenvolvedor se ele deve ser versionado. Nenhum dos dois diretórios
(`.claude/rules/`, `.claude/blocks/`) precisa de `.gitkeep`: como sempre têm conteúdo `pctk__`
versionado, nunca ficam vazios após um clone novo.
