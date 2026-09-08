---
name: pctk__authoring__create-skill
description: "Creates a new domain skill under `domain/<nome>/SKILL.mdx`, shaped like a function: frontmatter (signature) + `<Context>` (required, purpose) + `<InputFormat>` (optional, parameters) + body (required, the logic) + `<OutputFormat>` (optional, return shape). Triggers on an explicit human instruction to create a new skill in `domain/` (e.g. \"cria uma skill em domain/ que faça X\", \"quero uma skill nova pra Y\") — never on ambient mention of skills. Out of scope: creating a `<Rule>` or `<Block>` domain artifact, and editing a skill that already exists in `domain/`."
---

Pipeline geral de `domain/` (raízes suportadas, destino gerado, `pochete build`, referência de
componentes em `CHEATSHEET.md`, e a restrição de leitura de `domain/`): ver
`pctk__agent-domain-dir.md`. Esta skill cobre só a forma específica de uma raiz `<Skill>`.

Uma skill em `domain/<nome>/SKILL.mdx` é moldada como uma função. Cada parte abaixo é uma seção do corpo de
`<Skill>`, mapeada para um componente nativo já existente — nunca escreva prosa livre para uma
parte que já tem componente:

| Parte da função | Seção | Obrigatória | Componente |
|---|---|---|---|
| assinatura | name + description | sim | frontmatter `<Skill name="..." description="...">` |
| docstring / propósito | context | sim | `<Context>` |
| parâmetros | input | não | `<InputFormat>` |
| corpo / lógica | corpo | sim | sem wrapper — `<Procedure>`/`<Step>`/fluxo de controle, ou markdown livre |
| valor de retorno | output | não | `<OutputFormat>` |

## Procedure

1. **Resolve o propósito.** Vem da instrução do humano. Se a instrução não descrever o que a
   skill deve fazer, pergunte — nunca invente um propósito.

2. **Proponha o nome da skill**, kebab-case, nomeando a ação real da skill (mesmo padrão de
   especificidade de `pctk__agent-git.md`, bloco 1 — nunca um rótulo genérico). Esse nome é o da
   pasta `domain/<nome>/` e o que vira `user__<nome>` no destino gerado — nunca o nome de um
   arquivo solto.

3. **Monte `domain/<nome>/SKILL.mdx`** (o arquivo precisa se chamar exatamente `SKILL.mdx`,
   dentro da pasta `domain/<nome>/` — isso vale sempre, com ou sem script auxiliar; `pochete
   build` rejeita tanto um `<Skill>` fora de `SKILL.mdx` quanto um `SKILL.mdx` que não usa
   `<Skill>`):
   - Embrulhe tudo em `<Skill name="<nome>" description="...">`. `description` segue o mesmo
     papel de uma descrição de skill nativa: quando ela deve disparar.
   - `<Context>` **obrigatório**, logo no início: o propósito da skill, como um docstring.
   - `<InputFormat>` **só se a skill espera algo estruturado** alem da instrução em prosa do
     humano (ex.: um formato de argumento específico). Omita quando a skill não recebe nada além
     de conversa livre — não crie uma seção vazia só para preencher a tabela.
   - Corpo **obrigatório**: a lógica em si, com `<Procedure>`/`<Step>` para uma sequência de
     passos, ou os componentes de fluxo de controle (`<Loop>`, `<Condition>`, etc.) quando fizer
     sentido — ver `CHEATSHEET.md`. Sem wrapper próprio; é tudo que não é Context/Input/Output.
   - `<OutputFormat>` **só se o retorno tiver um formato específico** que vale fixar (um schema,
     um formato textual exato). Omita quando o resultado é só a resposta natural da conversa.
   - Formatação de JSX (indentação, quebra de linha, aspas) já é coberta pela rule
     `pctk__agent-formatacao-jsx-mdx.md`, carregada automaticamente para `domain/*.mdx` — não
     repita essas regras aqui.

4. **Escreva o arquivo** com Write.

5. **Se a skill precisar de um script auxiliar em runtime** (bash/js/python), coloque os arquivos
   ao lado de `SKILL.mdx`, na mesma pasta `domain/<nome>/` (ex.: `domain/<nome>/scripts/...`).
   `pochete build` copia tudo que estiver ali — exceto `SKILL.mdx` e outro `.mdx`/`.tsx` — para
   `.claude/skills/user__<nome>/` junto do `SKILL.md`; ver a seção "Scripts e assets empacotados
   junto de uma skill" em `CHEATSHEET.md` para o comportamento exato (limpeza no rebuild,
   exclusões).

6. **Avise o desenvolvedor** que o arquivo ainda não existe como skill até rodar `pochete build`
   — esta skill não roda o build automaticamente.

7. **Relate**: caminho do `SKILL.mdx` escrito, o caminho de destino esperado após o build
   (`.claude/skills/user__<nome>/SKILL.md`) e, se aplicável, os arquivos empacotados ao lado dele.

## Out of scope

- Criar um artefato `<Rule>` ou `<Block>` em `domain/` — formas mais simples, sem a estrutura
  context/input/corpo/output; ver `CHEATSHEET.md`.
- Editar uma skill que já existe em `domain/` — use Edit direto no `.mdx`, fora desta skill.
