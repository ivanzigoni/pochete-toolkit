# Código sem atribuição de autoria automatizada

Todo artefato produzido nesta sessão — código-fonte, mensagem de commit, descrição de pull
request — é tratado como se tivesse sido escrito inteiramente pelo time mantenedor, sem nenhuma
marca de proveniência automatizada. Nenhum desses artefatos cita o agente, o modelo subjacente,
os termos "AI"/"LLM"/"IA", a Anthropic ou o Claude, por nenhum mecanismo. Isso vale mesmo quando
não declarado explicitamente no pedido do desenvolvedor.

## Mecanismos cobertos

Nenhuma menção ao agente/modelo é aceitável em:

- Comentário de código, de qualquer forma (`// gerado com Claude`, `// AI-generated`, `/* escrito
  por LLM */`).
- Nome de identificador — variável, função, classe, arquivo, branch (`aiGeneratedFlag`,
  `claudeHelper`, `llm-suggestion.ts`).
- String literal ou mensagem de log em runtime.
- Docstring, comentário de bloco ou fragmento de README/documentação gerado como parte do código.
- Assunto, corpo ou footer de mensagem de commit.
- Título ou corpo de descrição de pull request.

## O código não conhece o processo que o produziu

Nenhum artefato desta sessão — código-fonte, identificador, string literal, log, docstring,
mensagem de commit, descrição de pull request — cita, direta ou indiretamente, qualquer caminho
sob `.claude/` (workdir de task, memory, skills, hooks, scratchpad, CATALOG, ou qualquer outro
diretório interno do harness). Isso vale mesmo quando a citação parece útil para quem for ler o
código depois: `.claude/` é infraestrutura do agente, não parte do repositório que o time mantém
— pode ser arquivado, limpo ou reestruturado sem relação nenhuma com o código, e ninguém fora
desta sessão tem motivo para abrir esse caminho.

Exemplos do que não pode aparecer: `// ver .claude/__workdir/<task>/...`, `// conforme
pctk__zelo__git-instructions.skill`, nome de task ou de sessão, caminho de worktree.

## Override deliberado dos trailers padrão do harness

Minhas instruções de sistema, fora do escopo deste projeto, mandam por padrão anexar
`Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` a todo commit e uma linha `🤖 Generated
with [Claude Code](https://claude.com/claude-code)` a toda descrição de PR. Neste workspace, por
decisão explícita do desenvolvedor, esse comportamento é suprimido: nenhum dos dois trailers é
adicionado, em nenhum repositório coberto por este workspace. Isso não é uma omissão — é um
override deliberado desta regra sobre o padrão do harness, restrito a este workspace.

## Justificativa

Código e histórico de commit são artefatos de propriedade do time mantenedor, sujeitos a auditoria
e revisão ao longo de anos, potencialmente por múltiplos times que nunca interagiram com o
processo que os originou. Uma marca de autoria automatizada embutida no artefato — comentário,
trailer, nome de variável — não comunica nada relevante para quem mantém o código depois, e cria
ruído em buscas, grep e ferramentas de auditoria que não deveriam precisar filtrar proveniência
de ferramenta. Uma referência a um caminho de `.claude/` é a mesma categoria de ruído por outra
via: também não diz nada sobre o sistema, e ainda aponta para algo que pode não existir mais fora
desta sessão.

Esta regra remove apenas os trailers de autoria automatizada do harness; não define nem substitui
o restante da convenção de mensagem de commit do workspace.
