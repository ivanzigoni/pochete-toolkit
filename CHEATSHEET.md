# Cheatsheet — componentes nativos do `domain/`

Referência rápida dos componentes disponíveis para quem escreve `.mdx` em `domain/`
(`project/pochete-cli/src/engine/components/`). Componentes customizados definidos em
`.tsx` dentro de `domain/` recebem os nativos via `import ... from 'pochete-cli/components'`.

## Unidades de construção

Todo `.mdx` precisa estar embrulhado em uma destas três para gerar saída em `.claude/` — sem
nenhuma delas, o arquivo é ignorado pelo build.

| Componente | Props | Destino gerado |
|---|---|---|
| `<Skill name="..." description="...">` | `name` (obrigatório), `description` (obrigatório) | Exige viver em `domain/<nome>/SKILL.mdx` (arquivo chamado exatamente `SKILL.mdx`, dentro de uma pasta) → `.claude/skills/user__<nome-da-pasta>/SKILL.md`, com frontmatter `name`/`description`. Ver seção "Scripts e assets" abaixo. |
| `<Rule paths={["**/*.ts"]}>` | `paths?: string[]` | `.claude/rules/user__<arquivo>.md`, com frontmatter `paths` (omitido se ausente) |
| `<Block>` | nenhuma | `.claude/blocks/user__<arquivo>.md`, sem frontmatter |

## Contexto e restrições

| Componente | Props | Renderiza como |
|---|---|---|
| `<Context>` | `children` | Blockquote (`> ...`) |
| `<Constraints constraints={["a", "b"]}>` | `constraints?: string[]`, mais `children` como itens extras | Lista `- item` |
| `<Constraint>` | `children` | Um item de lista (`- ...`) — use dentro de `<Constraints>` |

## Procedimento

| Componente | Props | Renderiza como |
|---|---|---|
| `<Procedure>` | `children` | Passthrough — só agrupa `<Step>`s |
| `<Step id="1" title="...">` | `id?: string`, `title?: string` | `**id. title**` seguido do conteúdo (label omitido se nem `id` nem `title` forem passados) |

## Fluxo de controle (pseudocódigo)

Todos com a mesma forma: `**Label:** conteúdo`. Puramente textual, sem execução real.

| Componente | Renderiza como |
|---|---|
| `<Loop>` | `**Loop:** conteúdo` |
| `<Condition>` | `**Condition:** conteúdo` |
| `<Action>` | `**Action:** conteúdo` |
| `<Fallback>` | `**Fallback:** conteúdo` |
| `<OnError>` | `**On Error:** conteúdo` |
| `<CallTool>` | `**Call Tool:** conteúdo` |

## Formato de entrada

| Componente | Props | Comportamento |
|---|---|---|
| `<InputFormat title="..." schema={...}>` | `title?: string`, `schema?: unknown` | Espelho exato de `<OutputFormat>` (mesma prop, mesmo render) — título em negrito (se houver) + `children` + bloco de código ` ```json ` com o schema serializado (se houver). `schema` objeto vira `JSON.stringify(schema, null, 2)`; qualquer outro tipo vira `String(schema)`. |

## Formato de saída

| Componente | Props | Comportamento |
|---|---|---|
| `<OutputFormat title="..." schema={...}>` | `title?: string`, `schema?: unknown` | Título em negrito (se houver) + `children` + bloco de código ` ```json ` com o schema serializado (se houver). `schema` objeto vira `JSON.stringify(schema, null, 2)`; qualquer outro tipo vira `String(schema)`. |

## Markdown (overrides usados automaticamente pelas tags nativas do MDX)

Não costumam ser usados diretamente por nome — são o que `# `, `**`, listas etc. já viram ao
compilar o `.mdx`. Documentados aqui porque também podem ser chamados explicitamente.

| Tag | Componente | Renderiza como |
|---|---|---|
| `#`…`######` | `H1`…`H6` | `# título` … `###### título` |
| `**texto**` | `Strong` | `**texto**` |
| `*texto*` | `Em` | `*texto*` |
| `~~texto~~` | `Del` | `~~texto~~` |
| `[texto](url)` | `A` | `[texto](url)` |
| `---` | `Hr` | `\n---\n` |
| `> texto` | `Blockquote` | `> texto` (cada linha prefixada) |
| `` `código` `` | `Code` (sem `className`) | `` `código` `` inline |
| bloco cercado | `Pre` + `Code className="language-x"` | ` ```x\ncódigo\n``` ` |
| parágrafo | `P` | texto seguido de linha em branco |
| `- item` / `1. item` | `Ul` / `Ol` / `Li` | lista com aninhamento automático por profundidade |

## Composição (não é componente React)

| Sintaxe | Comportamento |
|---|---|
| `<Include skill="caminho-sem-extensao" />` | Resolvido **antes** da renderização: substitui pelo conteúdo bruto do `.mdx` referenciado (relativo ao arquivo atual). Detecta ciclos. Útil para compartilhar um trecho entre vários `Skill`/`Rule`/`Block`. |

## Scripts e assets empacotados junto de uma skill (convenção de pasta, não componente)

Toda `<Skill>` vive em `domain/<nome>/SKILL.mdx` — uma pasta com esse nome, contendo um arquivo
chamado exatamente `SKILL.mdx`. Isso vale sempre, independente de a skill ter ou não um script
auxiliar: o nome da pasta é o que vira `user__<nome>` no destino, não mais o nome do arquivo.

Qualquer outro arquivo que fique **ao lado** de `SKILL.mdx`, na mesma pasta (script bash, `.js`,
`.py`, subpastas como `scripts/`) é copiado por `pochete build` para
`.claude/skills/user__<nome>/`, junto do `SKILL.md` gerado, preservando estrutura de subpastas e
o bit de execução de cada arquivo. Não precisa de sintaxe nova no `.mdx` nem de nenhuma pasta
extra — é o mesmo diretório onde `SKILL.mdx` já está.

Regras de exclusão dessa cópia:
- `SKILL.mdx` (a própria fonte) nunca é copiado como asset.
- Outro `.mdx`/`.tsx` que porventura esteja na mesma pasta não é asset — continua seguindo o
  pipeline normal de compilação (vira sua própria skill/rule/block, ou vira componente customizado
  global, conforme a extensão).
- Um arquivo chamado `SKILL.md` (sem `x`) na mesma pasta faz o build falhar, por colidir com o
  `SKILL.md` gerado a partir do `SKILL.mdx`.

Cada `pochete build` apaga `.claude/skills/user__<nome>/` inteira antes de regerar — um arquivo
removido de `domain/<nome>/` some do destino no rebuild seguinte, em vez de ficar órfão.

`<Rule>`/`<Block>` continuam no formato antigo (`domain/<nome>.mdx`, arquivo solto, sem pasta) —
não empacotam assets, porque o destino deles é um único arquivo. Uma pasta de mesmo nome ao lado
de um `<Rule>`/`<Block>` é só um aviso no console, nunca copiada.

`pochete build` também valida o nome do arquivo: um `.mdx` chamado `SKILL.mdx` que não usa
`<Skill>` como raiz, ou um `<Skill>` que não vive num arquivo chamado `SKILL.mdx`, faz o build
falhar com erro — o nome do arquivo e o componente usado precisam sempre bater.
