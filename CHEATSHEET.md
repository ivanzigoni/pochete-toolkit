# Cheatsheet — componentes nativos do `domain/`

Referência rápida dos componentes disponíveis para quem escreve `.mdx` em `domain/`
(`project/pochete-cli/src/engine/components/`). Componentes customizados definidos em
`.tsx` dentro de `domain/` recebem os nativos via `import ... from 'pochete-cli/components'`.

## Unidades de construção

Todo `.mdx` precisa estar embrulhado em uma destas três para gerar saída em `.claude/` — sem
nenhuma delas, o arquivo é ignorado pelo build.

| Componente | Props | Destino gerado |
|---|---|---|
| `<Skill name="..." description="...">` | `name` (obrigatório), `description` (obrigatório) | `.claude/skills/user__<arquivo>/SKILL.md`, com frontmatter `name`/`description` |
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
