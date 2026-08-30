---
name: pctk__workflow__create-workdir
description: "Creates a task folder under `.claude/__workdir/<task>/` (from the template embedded in this file's own \"Template do index.md\" section) together with a git worktree per repository the task touches, under `_worktrees/<task>/<repo>/`, and links the current conversation into the folder's `index.md` as `` - <título> (`<session_id>`) `` — the title read automatically from the session's own transcript, never typed by hand. Also covers two narrower cases: adding one more repository's worktree to a task folder that already exists, and linking only the current conversation to a task folder that already exists, with no worktree involved. Triggers on an explicit human instruction to start a new tracked task, to link a repository's worktree to one that already exists, or to link the current conversation to one that already exists (e.g. \"cria um workdir para X no cem-death-service\", \"abre uma tarefa pra Y\", \"vincula uma worktree do cem-billing-service nessa tarefa\", \"salva essa conversa no workdir boleto-conciliacao\") — never on ambient conversation that merely mentions a task or a repo in passing, and never inferring which task when the instruction doesn't name one."
---

Coordinates the full birth of a tracked task: the `.claude/__workdir/<task>/` folder, one git
worktree per repository named in the human's instruction, and a link from that folder back to the
current conversation. The human's instruction is what starts this — it names the task and, for
each repository involved, which one. Nothing here is inferred from ambient conversation: if the
instruction doesn't name a repository, this skill does not guess one from context.

**Path convention:** every worktree this skill creates lives at `_worktrees/<task>/<repo>/`,
sibling to `.claude/` at the workspace root — never anywhere else, never typed ad hoc.

**Branch naming:** this skill has no opinion of its own on git — it follows
`.claude/conventions/agent-git.md` (bloco 2, conventional branches) by default: propose the name already formatted as
`<type>/<descricao-curta-kebab-case>` for each repository named in the instruction, rather than
asking in the open. Never assume the branch name equals the task name. Only use a different name
when the human explicitly asks for one in that turn — silence is not confirmation, but an explicit
request overrides the proposed name for that branch.

**A note on environment:** `$CLAUDE_PROJECT_DIR` is only injected into hook scripts, not into this
agent's own Bash calls (verified directly in this session — empty when read from Bash). Every
command below assumes the working directory is already the workspace root (this session's stated
primary working directory) and uses `$PWD` computed at that point, before any `git -C`, which only
changes the *subprocess's* directory, never this shell's own `$PWD`.

## Procedure

1. **Resolve inputs.** Task name always comes from the human's instruction — never inferred, not
   even for the conversation-only-link case ("salva essa conversa no workdir <task>"). Repository
   is required only when the instruction creates a task or attaches a worktree; the
   conversation-only case names no repository, so step 3 has nothing to iterate and execution goes
   straight to step 4. For each repository named:
   - Confirm it exists: `test -d <repo>/.git`. If not, stop and report — do not guess a different
     repository name.
   - Ask the human for the branch name to use in that repository's worktree.

2. **Does the task folder already exist?** `test -d .claude/__workdir/<task>`.
   - **No**, and at least one repository was named — create it, with `index.md` copied from the
     "Template do index.md" section below, filling in the task name and today's date
     (`Início: DD-MM-AAAA`). Leave `Conversas` and `Worktrees` as their template placeholders for
     now — step 4 fills them.
   - **No**, and no repository was named (conversation-only link) — stop and report: this trigger
     never creates a task on its own; task creation requires naming at least one repository.
   - **Yes** — leave `index.md` as it is; this run is adding to an existing task, not starting one.

3. **For each named repository**, in order:
   - Compute the worktree path: `"$PWD/_worktrees/<task>/<repo>"`.
   - If that path already exists, skip it and report "já existe" for that repository — never
     overwrite or reuse a worktree silently.
   - Check whether the branch already exists locally:
     `git -C <repo> show-ref --verify --quiet refs/heads/<branch>`.
     - **Exists** (exit 0): attach to it —
       `git -C <repo> worktree add "$PWD/_worktrees/<task>/<repo>" <branch>`.
     - **Doesn't exist**: create it from `baseRef` (default `main`; ask if a different base is
       actually needed for that repository, don't ask by default). First `git -C <repo> fetch
       origin <baseRef>` — the local branch of the same name can be stale relative to origin, and
       branching from it silently carries that staleness into the new branch. Then create from
       `origin/<baseRef>`, not the local ref of the same name:
       `git -C <repo> worktree add -b <branch> "$PWD/_worktrees/<task>/<repo>" origin/<baseRef>`.
   - On any git failure: stop, report the git error verbatim, do not retry or attempt a fix on
     your own — the human decides what to do next, same as every other manually-triggered
     git operation in this workspace.
   - On success, append a line to `## Worktrees` in `.claude/__workdir/<task>/index.md`:
     `- <repo>: _worktrees/<task>/<repo>`. Replace the section's placeholder line
     (`- (nenhuma registrada ainda)`) on the first entry; append below existing lines afterward.
     Never touch a line for a different repository, never touch `Início`.

4. **Link the conversation.** Read `$CLAUDE_CODE_SESSION_ID` (verified available to this agent's
   Bash calls, unlike `$CLAUDE_PROJECT_DIR`). Read this session's own transcript at
   `~/.claude/projects/-home-ivan-Documents-repos-my-harness/<session_id>.jsonl` and take
   the last `custom-title` event's `customTitle`; if none exists, take the last `ai-title` event's
   `aiTitle`; if neither exists, use `(sem título)` — never skip the line for lack of a title.
   Under `## Conversas` in `index.md`, append `` - <título> (`<session_id>`) `` — replacing the
   placeholder on the first entry, same rule as `Worktrees`. If a line already contains this exact
   `session_id` (this skill ran more than once in the same conversation), do not add a duplicate.

5. **Report.** One line per repository: worktree path and whether the branch was created or
   attached. Never dump git's own command output unless something failed.

## Template do index.md

Fonte única deste template.

```markdown
# <task-name>

Início: DD-MM-AAAA

## Conversas
- (nenhuma registrada ainda)

## Worktrees
- (nenhuma registrada ainda)

📝 = nota/análise · 🧮 = query SQL · 📊 = dado estruturado (JSON/CSV) · 📂 = subdiretório · 📄 = texto genérico · 🔧 = script/config

| | Item | Descrição |
|---|---|---|
| 📝 | `arquivo.md` | ... |
```

## Out of scope

- Removing or cleaning up a worktree — not handled here, no companion skill exists for it yet.
- Choosing which repositories a task touches — always named by the human, never inferred.
