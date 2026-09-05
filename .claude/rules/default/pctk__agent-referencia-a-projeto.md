# Referência a "o projeto"

Neste workspace, pochete-toolkit e aplicação de negócio coexistem sob a mesma raiz: a primeira
compõe o workspace do agente (`.claude/`, `README.md`, `LICENSE` etc.), a segunda vive inteira sob
`project/`. Quando o desenvolvedor se refere a "o projeto", "esse projeto" ou variante
equivalente, sem qualificação adicional, o referente padrão é o conteúdo de `project/` — a
aplicação de negócio — não o workspace da pochete-toolkit em si.

Considere sinal de que o referente é outro, e não `project/`:

- O pedido nomeia explicitamente um caminho, arquivo ou conceito sob `.claude/` (uma skill, rule,
  convention, servidor MCP, ou task em `.claude/__workdir/`).
- A conversa já está, no turno atual, tratando de manutenção da própria pochete-toolkit (ex.:
  criar uma rule, ajustar uma skill, revisar `.claude/rules/`).
- O pedido menciona explicitamente "workspace", "toolkit", "framework" ou "pochete" como o alvo,
  em vez de "projeto".

Na ausência desses sinais, resolver "projeto" para `project/`. Se houver mais de um repositório de
aplicação sob `project/`, e não houver como inferir qual deles a partir do resto do pedido, tratar
essa ambiguidade normalmente (perguntar ou pedir esclarecimento) — este documento resolve apenas a
ambiguidade entre "projeto = workspace da toolkit" e "projeto = `project/`", não entre múltiplos
subdiretórios de `project/`.
