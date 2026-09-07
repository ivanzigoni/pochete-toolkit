# `domain/` e o pipeline de `.mdx`

`domain/` é conteúdo específico do workspace de quem usa a pochete-toolkit — mesmo tratamento de
`project/`: pasta versionada só via `.gitkeep`, conteúdo real fora do controle de versão (ver
`.gitignore`). Nunca faz parte do framework distribuído.

Cada `.mdx` ali dentro é uma função declarativa. `pochete build`
(`project/pochete-cli/src/commands/build.ts` → `core/build-domain.ts`) lê `domain/`, compila cada
`.mdx` (React + `mdx-prompt`) e escreve o markdown resultante em `.claude/`. Todo `.mdx` precisa
estar embrulhado em exatamente uma raiz, que decide o destino gerado:

| Raiz | Destino gerado |
|---|---|
| `<Skill name description>` | `.claude/skills/user__<arquivo>/SKILL.md` |
| `<Rule paths?>` | `.claude/rules/user__<arquivo>.md` |
| `<Block>` | `.claude/blocks/user__<arquivo>.md` |

A referência completa dos componentes nativos disponíveis dentro de um `.mdx` (`Context`,
`Procedure`, `Step`, `OutputFormat`, `InputFormat`, componentes de fluxo de controle, `Include`
etc.) vive em `CHEATSHEET.md`, na raiz do workspace. Esse arquivo — nunca o código-fonte do CLI
sob `project/pochete-cli/src/engine/` — é a fonte a consultar para entender ou usar um componente.

## Nenhuma leitura sem ordem explícita

Ler, listar ou varrer `domain/` — Read, Glob, Grep, `ls`, `find`, ou qualquer outra forma — só
acontece quando o desenvolvedor ordena explicitamente, no turno atual, uma operação sobre esse
diretório (criar um arquivo, editar um arquivo nomeado, listar o que existe, etc.). Por iniciativa
própria, nunca explorar `domain/` buscando contexto adicional — nem para "entender o sistema", nem
para checar se um nome já está em uso, nem para preencher lacuna de informação percebida.

Isso é não-negociável: mesmo quando a exploração pareceria útil (evitar colisão de nome, seguir
convenções já usadas em outra skill do workspace), a leitura fica condicionada à ordem explícita do
desenvolvedor naquele turno — nunca à utilidade percebida pelo próprio agente. Uma ordem para
operar sobre um arquivo específico (ex.: "cria a skill X em domain/") autoriza só a operação
pedida sobre esse arquivo, não uma varredura do restante do diretório.

## Por que

Sem essa restrição, o agente tende a tentar entender `domain/*.mdx` explorando o próprio diretório
e, quando isso não basta, o código-fonte do CLI — repetidamente, a cada sessão. `domain/` é
conteúdo de negócio específico do workspace, não parte do framework: o agente não precisa dele
para saber como um `.mdx` funciona (isso está acima e em `CHEATSHEET.md`); precisa dele só quando
o desenvolvedor pede uma operação concreta sobre um arquivo específico.
