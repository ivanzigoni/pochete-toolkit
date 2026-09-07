---
name: pctk__authoring__create-block
description: "Creates a new domain block under `domain/<nome>.mdx`, wrapped in `<Block>`: no props, just body (required, the shared fragment's content). Triggers on an explicit human instruction to create a new block in `domain/` (e.g. \"cria um block em domain/ com X\", \"quero um trecho reutilizável pra Y\") — never on ambient mention of blocks. Out of scope: creating a `<Skill>` or `<Rule>` domain artifact, and editing a block that already exists in `domain/`."
---

Pipeline geral de `domain/` (raízes suportadas, destino gerado, `pochete build`, referência de
componentes em `CHEATSHEET.md`, e a restrição de leitura de `domain/`): ver
`pctk__agent-domain-dir.md`. Esta skill cobre só a forma específica de uma raiz `<Block>`.

Um `<Block>` é a forma mais simples das três raízes: nenhuma prop, só corpo. Não tem alcance
(`paths`, exclusivo de `<Rule>` — ver `pctk__authoring__create-rule`) nem estrutura de
context/input/output (exclusiva de `<Skill>` — ver `pctk__authoring__create-skill`).

| Parte | Obrigatória | Componente | Efeito |
|---|---|---|---|
| corpo | sim | `children` de `<Block>` — markdown livre | o conteúdo do fragmento em si |

Um block não é consumido diretamente — ele existe para ser referenciado por outro `.mdx` via
`<Include skill="nome-sem-extensao" />` (resolvido antes da renderização, substituído pelo
conteúdo bruto do arquivo referenciado; ver `CHEATSHEET.md`, seção "Composição"). Ao criar um
block, considere se o propósito é exatamente esse: um trecho repetido entre vários
`Skill`/`Rule`/`Block`, extraído para um lugar só.

## Procedure

1. **Resolve o propósito.** O conteúdo do fragmento vem da instrução do humano. Se não estiver
   claro, pergunte — nunca invente o conteúdo.

2. **Proponha o nome do arquivo**, kebab-case, nomeando o conteúdo real do fragmento — mesmo
   padrão de especificidade de `pctk__agent-git.md` (bloco 1, "Assunto descritivo"), nunca um
   rótulo genérico. O nome do arquivo é o que vira `user__<nome>` no destino gerado e também o
   valor usado em `<Include skill="<nome>" />` por quem for referenciá-lo.

3. **Monte `domain/<nome>.mdx`:** embrulhe o conteúdo em `<Block>...</Block>`, sem props. Corpo
   livre — markdown puro, ou os componentes nativos que fizerem sentido para o fragmento (ver
   `CHEATSHEET.md`). Formatação de JSX já é coberta pela rule `pctk__agent-formatacao-jsx-mdx.md`,
   carregada automaticamente para `domain/*.mdx` — não repita essas regras aqui.

4. **Escreva o arquivo** com Write.

5. **Avise o desenvolvedor** que o block ainda não existe como arquivo gerado até rodar
   `pochete build` — esta skill não roda o build automaticamente.

6. **Relate**: caminho do `.mdx` escrito e o caminho de destino esperado após o build
   (`.claude/blocks/user__<nome>.md`).

## Out of scope

- Criar um artefato `<Skill>` (ver `pctk__authoring__create-skill`) ou `<Rule>` (ver
  `pctk__authoring__create-rule`) em `domain/`.
- Editar um block que já existe em `domain/` — use Edit direto no `.mdx`, fora desta skill.
