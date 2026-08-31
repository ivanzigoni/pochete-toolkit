# Instruções permanentes

Orientações sempre carregadas nesta sessão, independente da tarefa. Organizadas por tópico em
`.claude/conventions/`; este arquivo só agrupa os imports. Convenções específicas de linguagem
vivem em `.claude/rules/`, escopadas por `paths:` no frontmatter, e não são importadas aqui —
carregam sozinhas quando um arquivo daquele tipo é lido ou editado.

## Comunicação

@.claude/conventions/agent-tone-of-voice.md

## Autoria e escopo

@.claude/conventions/agent-anonymity.md
@.claude/conventions/agent-better-comments.md
@.claude/conventions/agent-stay-in-root.md
@.claude/conventions/agent-plan-mode.md

## Padrão de código

@.claude/conventions/agent-enterprise.md

## Git

@.claude/conventions/agent-git.md

## Dicionário de domínio

Termos e jargão específicos deste workspace, mantidos manualmente pelo desenvolvedor em
`project/DICTIONARY.md` (gitignored, nunca escrito por inferência do agente). Ver
`project/DICTIONARY.example.md` para o formato — copiar para `project/DICTIONARY.md` antes de
popular.

@project/DICTIONARY.md
