---
paths: ["domain/**/*.mdx"]
---

# Formatação de JSX em `domain/*.mdx`

- Cada nível de aninhamento de componente ganha 2 espaços a mais que o pai; tag de abertura e de
  fechamento ficam na mesma coluna.
- Texto (markdown puro) dentro de um componente é inline: acompanha a indentação dos irmãos JSX
  daquele nível, nunca flush à margem esquerda.
- Componente sem atributos ou que caiba em uma linha até 100 colunas fica em uma linha só; com
  múltiplos atributos ou linha longa, quebra um atributo por linha, com o `>` de fechamento
  sozinho na coluna do pai.
- Linha em branco entre irmãos de nível bloco (`Step`, `Procedure`); nunca dentro de listas
  markdown (`Ul`/`Li`/`Constraints`).
- Atributo JSX sempre em aspas duplas.
- Componente sem filhos é self-closing (`<Hr />`), nunca com par de tags vazio.
