---
name: pctk__authoring__create-rule
description: "Creates a new domain rule or convention under `domain/<nome>.mdx`, wrapped in `<Rule>`: `paths` (optional, frontmatter — scopes it to matching files; omitted, it loads every session as a convention) + body (required, the rule text itself). Triggers on an explicit human instruction to create a new rule or convention in `domain/` (e.g. \"cria uma rule em domain/ que exija X\", \"quero uma convention pra Y\") — never on ambient mention of rules. Out of scope: creating a `<Skill>` or `<Block>` domain artifact, and editing a rule that already exists in `domain/`."
---

Pipeline geral de `domain/` (raízes suportadas, destino gerado, `pochete build`, referência de
componentes em `CHEATSHEET.md`, e a restrição de leitura de `domain/`): ver
`pctk__agent-domain-dir.md`. Esta skill cobre só a forma específica de uma raiz `<Rule>`.

Uma `<Rule>` tem só duas partes:

| Parte | Obrigatória | Componente/prop | Efeito |
|---|---|---|---|
| alcance | não | prop `paths?: string[]` no `<Rule>` | presente → rule escopada, carregada só quando um arquivo tocado na sessão casa com um dos globs; ausente → convention, carregada sempre |
| corpo | sim | `children` de `<Rule>` — markdown livre, ou `<Constraints>`/`<Constraint>` para uma lista de restrições | o texto da regra em si |

Não existe seção de context/input/output aqui — isso é específico de `<Skill>` (ver
`pctk__authoring__create-skill`). Uma rule é só alcance + corpo.

## Procedure

1. **Resolve o propósito.** O que a rule deve impor ou ensinar vem da instrução do humano. Se não
   estiver claro, pergunte — nunca invente a regra.

2. **Decida o alcance.** Se a instrução já deixa claro (ex.: "toda resposta deve..." → sem
   `paths`, convention; "todo arquivo `.ts` deve..." → `paths` com o glob correspondente),
   proponha o alcance já resolvido em vez de perguntar. Só pergunte quando a instrução for
   ambígua entre os dois.

3. **Proponha o nome do arquivo**, kebab-case, nomeando a regra real — mesmo padrão de
   especificidade de `pctk__agent-git.md` (bloco 1, "Assunto descritivo"), nunca um rótulo
   genérico. O nome do arquivo é o que vira `user__<nome>` no destino gerado.

4. **Monte `domain/<nome>.mdx`:**
   - `<Rule paths={["glob", ...]}>` quando escopada, ou `<Rule>` sozinho quando convention.
   - Corpo com o texto da regra — markdown livre, ou `<Constraints>`/`<Constraint>` quando a regra
     for uma lista de restrições (ver `CHEATSHEET.md` para os demais componentes disponíveis).
   - Formatação de JSX já é coberta pela rule `pctk__agent-formatacao-jsx-mdx.md`, carregada
     automaticamente para `domain/*.mdx` — não repita essas regras aqui.

5. **Escreva o arquivo** com Write.

6. **Avise o desenvolvedor** que a regra ainda não está ativa até rodar `pochete build` — esta
   skill não roda o build automaticamente.

7. **Relate**: caminho do `.mdx` escrito e o caminho de destino esperado após o build
   (`.claude/rules/user__<nome>.md`).

## Out of scope

- Criar um artefato `<Skill>` (ver `pctk__authoring__create-skill`) ou `<Block>` em `domain/` —
  ver `CHEATSHEET.md`.
- Editar uma rule que já existe em `domain/` — use Edit direto no `.mdx`, fora desta skill.
