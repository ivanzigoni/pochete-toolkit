# Adotando este harness em outro repositório

Este documento é para o agente Claude Code rodando em **outro** repositório, não para uma sessão
deste. Ele orienta como adotar, naquele repositório, as convenções, regras e hooks mantidos aqui —
sem depender de nenhum contexto desta conversa. Este repositório (`pochete-toolkit`, remote
`git@github.com:ivanzigoni/pochete-toolkit.git`) é o workspace de configuração do Claude Code:
convenções sempre carregadas via `CLAUDE.md`, regras de linguagem escopadas por caminho, hooks de
enforcement e skills de workflow. Ele não distribui código de aplicação — cada repo de aplicação
mantém o seu próprio.

## Escopo desta adoção

Cobre `.claude/conventions/`, `.claude/rules/`, `.claude/hooks/` e `.claude/skills/pctk__workflow__*`.
**Não cobre** `.claude/mcp/local/` (o servidor MCP deste workspace) — é um pacote Node com build e
`.env` próprios; adotar isso em outro repo é decidir se instalar/rodar um serviço, não só copiar
config, e fica fora deste documento.

## Pré-requisito

Acesso SSH ao repositório `pochete-toolkit` (privado) com a mesma chave já usada para os demais
repositórios deste workspace.

## Passo 1 — adicionar como submodule

Na raiz do repositório de destino:

```
git submodule add git@github.com:ivanzigoni/pochete-toolkit.git .claude-harness
```

Submodule em vez de copiar arquivos: o repositório de destino fixa uma versão por commit, e `git
submodule update --remote` traz atualizações de forma deliberada, sem duplicar conteúdo nem
divergir silenciosamente do harness.

## Passo 2 — `CLAUDE.md` do repositório de destino

Criar `CLAUDE.md` na raiz (se ainda não existir) e importar as convenções universais deste harness,
por tópico, no mesmo padrão usado aqui:

```markdown
## Comunicação

@.claude-harness/.claude/conventions/agent-tone-of-voice.md

## Autoria e escopo

@.claude-harness/.claude/conventions/agent-anonymity.md
@.claude-harness/.claude/conventions/agent-stay-in-root.md
@.claude-harness/.claude/conventions/agent-plan-mode.md

## Padrão de código

@.claude-harness/.claude/conventions/agent-enterprise.md

## Git

@.claude-harness/.claude/conventions/agent-git.md
```

Duas ressalvas:

- `agent-git.md` bloco 1 (conventional commits) pressupõe Husky + commitlint já instalados
  *naquele* repositório — este import não instala nada, só documenta a convenção sobre um hook que
  precisa existir por conta própria.
- `.claude-harness/.claude/conventions/brand-tone-of-voice.md` (tom de voz institucional/client-
  -facing) fica de fora deste import padrão — é grande e de escopo condicional (só texto
  client-facing), não algo para carregar em toda sessão. Referencie-o sob demanda quando o trabalho
  for desse tipo, em vez de importar.

Se o repositório de destino já tem um `CLAUDE.md` próprio, adicionar essas seções às existentes, não
substituir o arquivo.

## Passo 3 — hooks

Dois casos diferentes, porque `enforce-path-allowlist` e `enforce-git-allowlist`
carregam sua própria config (`path-allowlist.json`, `git-allowlist.json`) na mesma pasta do próprio
script — compartilhar esses hooks via submodule faria todos os repositórios dividirem a mesma
allowlist, o que não é o objetivo.

**Hooks sem estado próprio** (`enforce-safe-credentials`): referenciar direto de
dentro do submodule, em `.claude/settings.json` do repositório de destino:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Read|Write|Edit|NotebookEdit|Grep|Bash",
        "hooks": [
          { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude-harness/.claude/hooks/enforce-safe-credentials/enforce-safe-credentials.sh" }
        ]
      }
    ]
  }
}
```

**`enforce-path-allowlist` e `enforce-git-allowlist`**: copiar o diretório inteiro de
cada hook para dentro de `.claude/hooks/` do repositório de destino (não referenciar via
submodule), para que esse repositório tenha seu próprio `path-allowlist.json` e seu próprio
`git-allowlist.json` — cada um editável só por um humano, nunca pelo agente, mesma regra de
`agent-stay-in-root.md`:

```
cp -r .claude-harness/.claude/hooks/enforce-path-allowlist .claude/hooks/
cp -r .claude-harness/.claude/hooks/enforce-git-allowlist .claude/hooks/
```

E então referenciar as cópias locais (não o submodule) em `settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Read|Write|Edit|NotebookEdit|Glob|Grep|Bash",
        "hooks": [
          { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/enforce-path-allowlist/enforce-path-allowlist.sh" }
        ]
      },
      {
        "matcher": "Write|Edit|NotebookEdit|Bash",
        "hooks": [
          { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/enforce-git-allowlist/enforce-git-allowlist.sh" }
        ]
      }
    ]
  }
}
```

## Passo 4 — skills de workflow

Claude Code só carrega skills da própria pasta `.claude/skills/` do projeto — copiar, não
referenciar:

```
cp -r .claude-harness/.claude/skills/pctk__workflow__create-workdir.skill .claude/skills/
cp -r .claude-harness/.claude/skills/pctk__workflow__diagnostico.skill .claude/skills/
```

## Passo 5 — regras de linguagem (`.claude/rules/`)

Mesma lógica de cópia — são carregadas por `paths:` no frontmatter, escopo do projeto local:

```
mkdir -p .claude/rules
cp .claude-harness/.claude/rules/*.md .claude/rules/
```

## Checklist final

- `CLAUDE.md` do repositório de destino carrega sem erro de import (nenhum `@caminho` quebrado).
- `.claude/hooks/enforce-path-allowlist/path-allowlist.json` e
  `.claude/hooks/enforce-git-allowlist/git-allowlist.json` existem localmente (podem
  começar vazios/mínimos) e não são os do submodule.
- Os hooks aparecem registrados ao iniciar uma sessão Claude Code nesse repositório.
- `.claude-harness/` está commitado como submodule (`git submodule status` mostra o commit fixado).
