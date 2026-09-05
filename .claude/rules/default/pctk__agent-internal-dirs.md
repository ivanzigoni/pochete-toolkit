# Diretórios internos `__` do pctk

`.claude/` mantém quatro diretórios internos com nome prefixado por `__`, todos versionados
(rastreados via `.gitkeep`, conteúdo ignorado pelo `.gitignore` da pasta) e todos filhos diretos de
`.claude/` na raiz do projeto — nunca filhos de outro diretório:

| Diretório | Propósito |
|---|---|
| `.claude/__workdir/` | Tarefas rastreadas em andamento, uma pasta por task (ver `pctk__workflow__create-workdir.skill`). |
| `.claude/__stash/` | Arquivo dos workdirs já concluídos — o que sai de `__workdir/` quando uma task termina. |
| `.claude/__tmp/` | Scratch efêmero: arquivo intermediário descartável, sem valor depois que a tarefa atual da sessão termina. |
| `.claude/__assets/` | Assets ou documentos de referência não-descartáveis (PDFs, binários, docs de apoio) mantidos entre sessões. |

## Resolução de nome nu

Uma instrução do desenvolvedor que cita um desses nomes sem caminho completo — "salva isso no
`__tmp`", "joga no `__stash`", "isso vai pro `__assets`" — resolve sempre para
`$CLAUDE_PROJECT_DIR/.claude/<nome>/`, nunca para um diretório de mesmo nome criado em outro
lugar: raiz do repositório, `cwd` corrente no momento do pedido, dentro de `project/`, ou dentro de
uma worktree.

Se `.claude/<nome>/` não existir no caminho esperado, isso é sinal para parar e confirmar com o
desenvolvedor — nunca para criar um diretório de mesmo nome em outro lugar como se fosse
equivalente.

Essa resolução vale mesmo quando o desenvolvedor referencia o nome de forma coloquial, sem o
prefixo `__` — "salva num tmp", "coloca no temp", "isso é só um scratch" — desde que o contexto
seja este projeto. Nesses casos o alvo ainda é `.claude/__tmp/` (ou `__stash/`/`__assets/`,
conforme o caso), não o nome interpretado como palavra genérica.

## Override do scratchpad padrão do harness

Minhas instruções de sistema, fora do escopo deste projeto, orientam usar por padrão o diretório
de scratchpad da sessão para qualquer arquivo temporário, em vez de `/tmp` ou de diretórios
temporários do sistema. Neste workspace esse padrão é substituído: uma referência do
desenvolvedor a "tmp", "temp" ou variante coloquial equivalente, dita no contexto deste projeto,
significa `.claude/__tmp/`, nunca o scratchpad da sessão. O scratchpad só é usado quando nomeado
explicitamente como tal ("salva no scratchpad") ou para necessidade própria do harness sem
relação com pedido do desenvolvedor.

A diferença importa porque `.claude/__tmp/` é versionado e compartilhado entre sessões deste
projeto (conteúdo ignorado pelo `.gitignore`, mas a pasta persiste), enquanto o scratchpad é
isolado por sessão e descartado ao final dela — gravar no scratchpad quando o pedido era "tmp"
perde exatamente a persistência que o desenvolvedor esperava.

## Nenhum escaneamento por iniciativa própria

Read, Glob, Grep, `ls` ou qualquer outra forma de listar/ler conteúdo de `__workdir/`, `__stash/`,
`__tmp/` ou `__assets/` só acontece quando o desenvolvedor pede explicitamente, no turno atual,
para operar sobre um deles — apontando um caminho específico, colando conteúdo, ou pedindo para
abrir um arquivo determinado ali dentro. Por iniciativa própria, nunca varrer esses diretórios
buscando contexto adicional, nem para "ajudar", nem para preencher lacuna de informação percebida.

O objetivo é isolamento entre tasks: uma task em `__workdir/<task-a>/` não deve saber da
existência ou do conteúdo de `__workdir/<task-b>/`, de `__stash/`, ou de `__assets/`, a menos que o
desenvolvedor traga esse conteúdo explicitamente para a conversa atual. `__tmp/` segue a mesma
regra, ainda que seu conteúdo seja efêmero.

Isso é uma restrição de comportamento, não um limite mecânico — não há guard de `PreToolUse`
barrando a leitura em si (diferente do bloco de escopo em `pctk__agent-stay-in-root.md`, que
impede sair da raiz do projeto). Dentro do escopo já permitido pela raiz do projeto, o agente se
abstém de explorar esses quatro diretórios sem pedido explícito.
