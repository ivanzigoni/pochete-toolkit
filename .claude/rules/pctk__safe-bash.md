---
paths:
  - "**/*.{sh,bash}"
---

# Bash seguro

Bash is easy to write unsafely and hard to write safely — most of its footguns are silent: a
script that "works" on every test run can still delete the wrong directory, execute injected
code from a filename, or corrupt a file it was only supposed to read, the one time the input
looks slightly different from what you tried. This convention exists to make those failure modes
impossible by default. **Wherever safety and convenience pull in different directions, safety
wins**, even at the cost of a slower script, an extra check, or a less elegant one-liner.

Treat every script this convention touches as production code: it runs unattended, against inputs
you don't fully control, on machines you may not be watching. Optimize for the failure you don't
expect, not the happy path you tested.

## Non-negotiables (apply to every script)

1. **Strict mode, on purpose, with its blind spots known.**
   ```bash
   #!/usr/bin/env bash
   set -euo pipefail
   IFS=$'\n\t'
   ```
   `-e` exits on unhandled failure, `-u` turns a typo'd variable reference into a hard failure
   instead of silently expanding to empty (the classic `rm -rf "${PERFIX}/bin"` incident class),
   `-o pipefail` fails a pipeline if any stage fails, not just the last. This is **not** a
   substitute for explicit error handling:
   - `-e` does not fire inside a function used as a condition (`if my_func; then`,
     `my_func && next`, or as a non-last pipeline stage) — check explicitly inside the function
     regardless (`cd "$dir" || return 1`).
   - `pipefail` produces false failures with early-exiting consumers: `cmd | grep -q pattern`
     can report failure via `SIGPIPE` even though `grep` found its match. Only rely on it when
     every non-final stage consumes all its input.
   - A bare `((expr))` evaluating to `0` is treated as command failure and kills the script —
     `((count++))` from zero aborts under `-e`. Use `(( count += 1 ))` or `count=$((count + 1))`.
   - Commands expected to fail need an explicit escape hatch: `cmd || true`.
   - Register cleanup traps immediately after strict-mode setup, so a failure during setup still
     triggers cleanup.

2. **Quote every expansion — `"$var"`, `"$(cmd)"`, `"${arr[@]}"`, `"$@"` — no exceptions.** An
   unquoted expansion undergoes word-splitting and glob expansion, which is how a filename
   becomes an argument injection and a space in a variable becomes two arguments. Nearly every
   bash CVE-class bug traces back to a missing quote.

3. **Never build a command or arithmetic expression from untrusted input.** Avoid `eval`
   entirely unless the value evaluated is fully programmer-controlled — never derived from a
   filename, argument, env var, or network response. This includes arithmetic contexts:
   `$(( ))`, `((...))`, array subscripts, and `let` all re-evaluate their argument as an
   expression, so `arr[$user_input]` can execute arbitrary commands if `$user_input` isn't
   validated as digits-only first. Build variable argument lists as arrays, never
   string-interpolation:
   ```bash
   cmd=(rsync -az --delete); [[ "$dry_run" == true ]] && cmd+=(--dry-run); cmd+=("$src" "$dst")
   "${cmd[@]}"
   ```

4. **Clean up with `mktemp` + `trap ... EXIT`, registered immediately after creation** — before
   any code that could fail and skip a later cleanup line:
   ```bash
   scratch=$(mktemp -d) || exit 1
   trap 'rm -rf -- "$scratch"' EXIT
   ```
   Single-quote the trap body so it captures the path at *registration* time. Never hand-roll a
   temp name like `/tmp/myapp-$$` — predictable paths are a symlink-attack/race vector in shared
   `/tmp`.

5. **Never read-and-write the same file in one pipeline** (`cmd < file > file` truncates before
   the pipeline runs — guaranteed data loss, not an edge case). Write to a temp file in the same
   filesystem, then `mv` — a rename within one filesystem is atomic, so no reader ever sees a
   partially written file:
   ```bash
   sed 's/foo/bar/g' "$file" > "$file.tmp" && mv -- "$file.tmp" "$file"
   ```
   Add `sync` before the `mv` when the script must survive a crash/power-loss mid-write, not just
   a concurrent reader.

6. **Check every command that can fail, especially `cd`.** An unchecked `cd` that silently fails
   followed by a destructive command in the wrong directory is the textbook shell-script
   disaster: `cd /path || exit 1` (top level) or `cd /path || return 1` (inside a function, since
   `-e` doesn't propagate through a function used as a condition).

7. **Run ShellCheck before calling anything done, and wire it into CI.** It catches exactly the
   class of quoting/scoping/portability bug this convention is about — including the real-world
   unquoted-glob incident that deleted users' home directories (`rm -rf "$STEAMROOT/"*`,
   ShellCheck's SC2115). Treat its warnings as blocking for anything running in production or CI.
   `bash -n script.sh` only confirms the script parses — use it as a fast pre-check, never a
   substitute.

8. **Every value the script needs is settable as a positional arg or flag, not only via
   `read -rp`.** A script whose only input path is an interactive prompt can't run from CI,
   another script, or an agent driving it unattended. Interactive prompting may still be offered
   as a *fallback* when a param is omitted and stdin is a real TTY.

9. **Accept `-v`/`--verbose`, off by default, wired to real logging** — not just a bare `set -x`
   dump. Trace mode (`set -x`) prints commands with variables already expanded, so route it
   through a distinct fd (`BASH_XTRACEFD`) with a descriptive `PS4`
   (`+ HH:MM:SS file:line:function() `) rather than mixing it into plain stderr. This is subject
   to the Secrets rule below at every verbosity level, no exceptions — a traced command line is
   exactly as dangerous as a logged one.

## Injection surfaces beyond the obvious

- **Option/flag injection via leading `-`.** A filename or argument starting with `-` can be
  misread as a flag. Prefix glob expansions with `./` (`rm -v ./*`, not `rm -v *`) and insert
  `--` before the operand list where the tool supports it — neither defense alone is sufficient.
- **`sudo` argument injection.** `sudo -u user "$@"` without a `--` separator lets a caller's
  arguments be re-parsed by `sudo` itself, re-targeting the whole invocation to a different user.
  Always: `sudo -u produser -- "$@"`.
- **`sudo` and privilege timing.** The calling shell performs redirection and glob expansion
  *before* `sudo` elevates privilege — `sudo cmd > /root-only-file` fails because the
  *unprivileged* shell opens the output file, and `sudo ls /root-only/*` silently expands the
  glob as the calling user. Pipe into a privileged command instead
  (`mycmd | sudo tee /root-only-file`), or run the whole expansion inside the sudo'd shell
  (`sudo sh -c 'ls /root-only/*'`).
- **SUID/SGID on shell scripts: don't.** Bash cannot be made sufficiently secure for SUID/SGID
  execution even where a kernel technically allows the bit on a script. Use a narrowly-scoped
  `sudo` policy instead.
- **Environment as an injection vector.** Untrusted data reaching a script via environment
  variables is exploitable, not just via argv/stdin — this was Shellshock's mechanism
  (CVE-2014-6271). Treat inherited env vars from a lower-trust context (a webhook payload, a CI
  job from an external PR) the same as untrusted argv: validate before use, never `eval`/`source`
  anything derived from them.
- **`CDPATH` poisoning.** An inherited, exported `CDPATH` silently changes where a plain
  `cd relative/dir` resolves, and `cd` prints the resolved path to stdout when found via
  `CDPATH`, corrupting anything capturing that output. Defensively `unset CDPATH` at the top of
  security-sensitive scripts, or always use `./relative/dir`.

## Concurrency and cleanup at production scale

- **Single-instance enforcement uses `flock`**, not a hand-rolled PID-file check — PID files have
  an inherent check-then-write race and mishandle a stale PID reused after a crash:
  ```bash
  exec 9>"/var/lock/$(basename "$0").lock"
  flock -n 9 || { echo "already running" >&2; exit 1; }
  ```
- **Parallel writers to shared stdout/a shared file are not safe once a write exceeds the OS
  pipe/write buffer** (commonly ~8KB) — concurrent writes can interleave mid-line even though
  each `printf` call looks atomic alone. Serialize explicitly, or have each worker write its own
  file and concatenate afterward.
- Atomic replace (write-temp-then-`mv`, above) is the primary defense against concurrent readers
  seeing partial state — prefer it over ad hoc locking wherever an update can be expressed as
  "regenerate the whole thing, then swap it in."

## Secrets

Secrets must never be observable to another local user, never land in a log, and never survive
in shell history.

- **Never pass a secret as a CLI argument** — any local user can read another process's argv via
  `ps`/`/proc/<pid>/cmdline`. Use an environment variable set immediately before the call (and
  unset after), a file descriptor, or a tightly-permissioned file instead.
- **Never `set -x` while a secret is in scope.** Trace mode prints commands with variables
  already expanded. Scope tracing tightly around the block being debugged, never globally in a
  script that handles credentials.
- **Read secrets interactively with `read -s`** (suppresses terminal echo), not a plain `read`.
- **Prefer a secrets manager or injected environment over a literal value in the script or its
  config file**; if it must land in an env var for a subprocess, inject it as late as possible.
- **Redact before logging.** A generic "ran: $cmd" audit log must never include the literal
  invocation when a credential is embedded in it — log the operation, not the command line.

## Network calls

- **Always set a timeout** (`curl --max-time <n>`) — an unattended script with no timeout on a
  network call can hang forever on a stalled connection.
- **Fail on HTTP error codes explicitly** (`curl -fsSL`) — otherwise a 4xx/5xx error page gets
  treated as if it were the real payload.
- **Never disable TLS certificate verification** (`curl -k`/`--insecure`) in production — that
  defeats the point of using HTTPS at all.
- **Verify checksums/signatures for anything downloaded and then executed.** `curl ... | bash` is
  an anti-pattern precisely because there's no verification step between download and execution —
  download to a file, verify it, then run it.

## Containment and scope discipline

- **`rbash`/`bash -r`** (restricted shell) disables `cd`, changing `SHELL`/`PATH`/`ENV`, running
  any command containing `/`, output redirection, and `exec` — useful containment for a
  constrained interactive session, but the restrictions do not propagate to child scripts it
  invokes, so it is not a sandbox for arbitrary subprocesses.
- **Shebang choice is a security tradeoff, not a formatting preference.** `#!/usr/bin/env bash`
  finds whichever `bash` is first on `$PATH` (needed on systems shipping an ancient fixed-path
  `bash`); `#!/bin/bash` pins a fixed interpreter, which is the better choice when the deployment
  target specifically needs to resist a `$PATH`-substitution attack. Pick deliberately based on
  which risk matters more for where the script runs.
- **Know when to stop using bash.** Once a script's real logic passes roughly 100–150 lines,
  needs data structures beyond arrays, or needs real control flow (retries with backoff,
  structured error types, concurrent job orchestration beyond a simple `flock`), that's a signal
  to rewrite in a language with better tooling for it — not a reason to keep bolting more
  structure onto a bash script. Say so if you notice a script crossing that line, rather than
  continuing to build on it.
