#!/usr/bin/env bash
#
# PreToolUse guard: mechanically denies any filesystem-touching tool call (Read, Write, Edit,
# NotebookEdit, Glob, Grep, Bash) whose target resolves outside a small set of allowed roots —
# replacing the purely textual guidance in CLAUDE.md (.claude/conventions/pctk__agent-stay-in-root.md) with a
# real deny. Opt-in
# model, not opt-out: nothing outside the allowed roots is visible unless a human explicitly adds
# it.
#
# Allowed roots, computed fresh on every call:
#   1. $CLAUDE_PROJECT_DIR itself — always allowed, no config needed.
#   2. This project's auto-memory directory (~/.claude/projects/<slug>/memory/), using the same
#      project-slug convention Claude Code itself uses (project dir with "/" -> "-").
#   3. This session's scratchpad (/tmp/claude-<uid>/<slug>/<session-id>/scratchpad). This path is
#      NOT a documented public contract — it is a formula reverse-engineered from one observed
#      session (uid via `id -u`, slug per #2, session id via $CLAUDE_CODE_SESSION_ID). If the
#      harness ever changes this scheme, the formula stops matching and this guard starts denying
#      legitimate scratchpad writes — a functional regression (too strict), never a security one
#      (never too loose), which is the accepted failure direction for this whole guard.
#   4. Every entry in path-allowlist.json's "paths" array (a JSON file with one array of literal
#      absolute paths, no globs — each entry grants both read and write, this guard does not
#      distinguish the two). Missing, unreadable, or malformed path-allowlist.json is treated as an
#      empty list, never as "allow everything" — the safe direction on config failure.
#
# path-allowlist.json lives beside this script (same directory as enforce-path-allowlist.sh), not at a
# path relative to $CLAUDE_PROJECT_DIR — its location is derived from $0's own directory, so the
# hook is self-contained: it carries its own config wherever this directory goes, with no
# dependency on where the project root happens to be. It is itself protected: Write/Edit/
# NotebookEdit targeting it, and any Bash token that names it (relative or resolved-absolute
# form), are denied unconditionally, regardless of the read/write intent of the Bash command — the
# same coarse, tool-can't-tell-intent-apart posture enforce-safe-credentials already
# takes for credential files via Bash. Only a human editing the file directly (or the Read tool,
# which is intentionally left unguarded for it — it holds no secret, only a list of paths) can
# change this session's scope.
#
# All paths are resolved with `realpath -m` (canonicalizes . and .., resolves symlinks, does not
# require the target to exist) before comparison, so a symlink inside an allowed root pointing
# outside it does not escape the check.
#
# The Bash path has no structured target field, so it is handled via (a) the payload's own `cwd`
# field — which the Claude Code hooks documentation confirms is updated across calls to reflect a
# persisted `cd`, i.e. the harness tracks it so this stateless hook doesn't have to — as the base
# for resolving every token, and (b) tokenizing the command best-effort (same whitespace-split,
# `set -f`, punctuation-strip approach as enforce-safe-credentials).
#
# EVERY token is resolved against $cwd and checked, not only ones that already look absolute or
# that follow cd/pushd — an earlier version only checked those two shapes, and a live test in
# another session (`ls -la ~/Documents`) found it sailed straight through: "~/Documents" starts
# with neither "/" nor a preceding cd, so the narrower check never looked at it, even though the
# real shell would expand it to an escape. The same narrower check also missed a relative
# traversal with no cd (`cat ../../../etc/passwd`) and path-allowlist.json referenced by a
# differently spelled relative path (e.g.
# `cat ./.claude/hooks/enforce-path-allowlist/path-allowlist.json`).
# Resolving every token closes all three at once and costs nothing in false positives — a
# non-path token (a flag, a search term, an in-tree filename) always resolves to somewhere under
# $cwd, which is already an allowed root.
# A leading "~" or "~/" is expanded to $HOME first, matching what the real shell would do before
# actually running the command this scanner only reads as inert text; "~username/..." (a
# different user's home) is deliberately denied as unresolvable rather than guessed at, since this
# hook cannot safely look that up. Beyond tilde, this remains a mechanical scan, not a shell
# parser: quoting, `$VAR`-style variable expansion, and command substitution inside the command
# string are not resolved, matching the blind spot already documented for the sibling
# Bash-scanning guards in this catalog.
#
# Any path this guard cannot resolve (an individual `realpath -m` failure, not a missing
# dependency) is denied, not silently skipped — per this project's directive that the tradeoff
# always leans toward security, "cannot verify" is treated the same as "outside scope".
#
# Missing `jq`/`realpath`/`id` is the one case that fails OPEN, not closed, same as every other
# broad-matcher guard in this catalog (enforce-safe-credentials): this hook's
# matcher covers nearly every filesystem operation of the session, so failing closed here would
# lock up the whole session over a missing binary, not just the specific risky call.
#
# Usage (normal, from Claude Code): enforce-path-allowlist.sh < hook-payload.json
# Usage (manual dry run):           enforce-path-allowlist.sh [payload-file]
set -euo pipefail
IFS=$'\n\t'
unset CDPATH

SCRIPT_NAME=$(basename -- "$0")
readonly SCRIPT_NAME
# Unresolved yet (no realpath call before check_dependencies runs) — just the raw directory
# component of $0, used later to derive FS_SCOPE_FILE from this script's own location rather than
# from $CLAUDE_PROJECT_DIR, so the hook carries its config wherever this directory goes. Uses pure
# parameter expansion, not the external `dirname`, so this stays available even when check_
# dependencies would otherwise fail open on a stripped-down PATH (dirname was never added to
# DEPENDENCIES, and this line runs before check_dependencies is even called).
case "$0" in
    */*) SCRIPT_DIR_RAW="${0%/*}" ;;
    *) SCRIPT_DIR_RAW="." ;;
esac
readonly SCRIPT_DIR_RAW
readonly DEPENDENCIES=(jq realpath id)
# Shell punctuation/quote characters stripped from each whitespace-split Bash token before
# classification — same set enforce-safe-credentials uses, for the same reason (a
# path glued to an adjacent operator, e.g. `/etc/passwd;`, should still match on its own merit).
readonly STRIP_CHARS="\"';&|()<>"
readonly FS_SCOPE_BASENAME="path-allowlist.json"

INPUT_FILE=""
declare -a ALLOWED_ROOTS=()
PROJECT_ROOT=""
PROJECT_SLUG=""
FS_SCOPE_FILE=""
# Human-facing display path for deny messages: FS_SCOPE_FILE relative to PROJECT_ROOT when it
# falls under it (the normal case — this hook's directory always lives inside the project), or the
# raw absolute path otherwise. Set once both PROJECT_ROOT and FS_SCOPE_FILE are known.
FS_SCOPE_DISPLAY=""

log_error() { printf '%s: %s\n' "$SCRIPT_NAME" "$*" >&2; }

check_dependencies() {
    local missing=() cmd
    for cmd in "${DEPENDENCIES[@]}"; do
        command -v "$cmd" >/dev/null 2>&1 || missing+=("$cmd")
    done
    if (( ${#missing[@]} > 0 )); then
        # Fail OPEN — see header: matcher is broad, failing closed here would block every
        # filesystem operation of the session, not just an out-of-scope one.
        log_error "missing required tool(s): ${missing[*]} — enforce-path-allowlist is disabled this call"
        exit 0
    fi
}

deny() {
    jq -n --arg reason "$1" \
        '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
    exit 0
}

read_input() {
    if [[ -n "$INPUT_FILE" ]]; then
        cat -- "$INPUT_FILE" 2>/dev/null
    else
        cat
    fi
}

# realpath -m: canonicalizes without requiring existence. Prints nothing and returns non-zero on
# genuine failure (e.g. unresolvable input) — callers must treat that as "cannot verify", not
# "allow".
resolve() {
    realpath -m -- "$1" 2>/dev/null
}

# Resolves $1 against base $2 first if $1 isn't already absolute.
resolve_relative_to() {
    local path="$1" base="$2"
    [[ "$path" != /* ]] && path="$base/$path"
    resolve "$path"
}

is_within_allowed() {
    local target="$1" root
    for root in "${ALLOWED_ROOTS[@]}"; do
        [[ "$target" == "$root" || "$target" == "$root"/* ]] && return 0
    done
    return 1
}

deny_escape() {
    local raw="$1" resolved="$2"
    deny "Blocked by enforce-path-allowlist: '$raw' resolves to $resolved, outside the paths this session can see. A human can add it to $FS_SCOPE_DISPLAY — the agent cannot edit that file itself."
}

deny_unresolvable() {
    deny "Blocked by enforce-path-allowlist: could not resolve '$1' to verify it against the paths this session can see."
}

deny_fs_scope_edit() {
    deny "Blocked by enforce-path-allowlist: $FS_SCOPE_DISPLAY defines what this session can see beyond the project root and cannot be edited by the agent, via any tool — only a human editing it directly."
}

# Populates the global ALLOWED_ROOTS. Requires PROJECT_ROOT, PROJECT_SLUG, FS_SCOPE_FILE already
# set. Never fails the whole call on a partial problem (unreadable extra-paths entry, unset HOME,
# etc.) — each source of roots is independently best-effort, per the header's fail-safe-direction
# note on config failure.
build_allowed_roots() {
    ALLOWED_ROOTS=("$PROJECT_ROOT")

    if [[ -n "${HOME:-}" ]]; then
        local memory_dir
        memory_dir=$(resolve "$HOME/.claude/projects/$PROJECT_SLUG/memory") || memory_dir=""
        [[ -n "$memory_dir" ]] && ALLOWED_ROOTS+=("$memory_dir")
    fi

    if [[ -n "${CLAUDE_CODE_SESSION_ID:-}" ]]; then
        local uid scratchpad
        uid=$(id -u 2>/dev/null) || uid=""
        if [[ -n "$uid" ]]; then
            scratchpad=$(resolve "/tmp/claude-$uid/$PROJECT_SLUG/$CLAUDE_CODE_SESSION_ID/scratchpad") || scratchpad=""
            [[ -n "$scratchpad" ]] && ALLOWED_ROOTS+=("$scratchpad")
        fi
    fi

    if [[ -r "$FS_SCOPE_FILE" ]]; then
        local extra
        extra=$(jq -r '.paths // [] | .[]?' -- "$FS_SCOPE_FILE" 2>/dev/null) || extra=""
        if [[ -n "$extra" ]]; then
            local p resolved
            while IFS= read -r p; do
                [[ -z "$p" ]] && continue
                resolved=$(resolve "$p") || resolved=""
                [[ -n "$resolved" ]] && ALLOWED_ROOTS+=("$resolved")
            done <<<"$extra"
        fi
    fi
}

# Checks a single structured tool_input path (Read/Write/Edit's "file_path", NotebookEdit's
# "notebook_path", Glob's optional "path", a single Grep "paths" entry) against path-allowlist.json
# protection and the allowed roots. Denies and exits on any violation; returns normally (allow)
# otherwise.
check_structured_path() {
    local raw_path="$1" tool_name="$2" cwd="$3"
    [[ -z "$raw_path" ]] && return 0

    local resolved
    resolved=$(resolve_relative_to "$raw_path" "$cwd") || resolved=""
    [[ -z "$resolved" ]] && deny_unresolvable "$raw_path"

    if [[ "$resolved" == "$FS_SCOPE_FILE" ]]; then
        case "$tool_name" in
            Write|Edit|NotebookEdit) deny_fs_scope_edit ;;
        esac
        return 0
    fi

    is_within_allowed "$resolved" || deny_escape "$raw_path" "$resolved"
}

# Expands a literal leading "~" or "~/" in $1 to $HOME, the same way the real shell would before
# actually running the command this scanner only reads as inert text. Sets the globals
# EXPANDED_PATH (the result) and TILDE_UNRESOLVED (1 for "~username/...", a different user's home
# this hook cannot safely look up — the caller must treat that as unresolvable, not fall through
# unchecked) as direct side effects, NOT via a printed return value read through command
# substitution — command substitution forks a subshell, and a variable set inside it never
# reaches the caller, which silently defeated TILDE_UNRESOLVED entirely until caught by testing
# `cat ~root/.bashrc` (expected deny, got silent allow).
EXPANDED_PATH=""
TILDE_UNRESOLVED=0
expand_tilde() {
    local tok="$1"
    TILDE_UNRESOLVED=0

    # Substring comparisons against quoted literals — quoting already prevents any shell tilde
    # expansion here, so SC2088 (real for an unquoted/misused tilde in a command argument) does
    # not apply to the "~/" branch below. The directive covers the whole if/elif/else on purpose:
    # a disable comment is only valid in front of the complete compound command, not one branch.
    # shellcheck disable=SC2088
    if [[ "$tok" == "~" ]]; then
        EXPANDED_PATH="${HOME:-}"
    elif [[ "${tok:0:2}" == "~/" ]]; then
        EXPANDED_PATH="${HOME:-}${tok:1}"
    elif [[ "${tok:0:1}" == "~" ]]; then
        TILDE_UNRESOLVED=1
        EXPANDED_PATH="$tok"
    else
        EXPANDED_PATH="$tok"
    fi
}

# Best-effort scan of a free-text Bash command: tokenizes on whitespace (globbing disabled, so a
# `*`/`?` in the scanned command is never expanded against this process's real filesystem), then
# resolves EVERY token — not only ones that already look absolute or that follow cd/pushd — against
# $cwd (after expanding a leading "~"/"~/"), and checks the result against path-allowlist.json
# protection and the allowed roots. Resolving every token, not just obviously-path-shaped ones, is
# what catches a relative escape that never involves cd (`cat ../../../etc/passwd`) and a
# differently-spelled reference to path-allowlist.json (`cat ./.claude/path-allowlist.json`); it
# costs nothing in false positives, because a non-path token (a flag, a search term, a filename
# inside the current tree) always resolves to somewhere under $cwd, which is already an allowed root — only a
# token that actually walks outside it, via "..", "~", or an absolute path, can ever be denied
# here. Denies and exits on the first violation.
check_bash() {
    local command="$1" cwd="$2"
    local IFS=$' \t\n'
    local -a tokens
    set -f
    # shellcheck disable=SC2206
    tokens=( $command )
    set +f

    local i tok stripped prev expanded resolved
    for (( i = 0; i < ${#tokens[@]}; i++ )); do
        tok="${tokens[$i]}"
        stripped=$(tr -d "$STRIP_CHARS" <<<"$tok")
        [[ -z "$stripped" ]] && continue

        prev=""
        if (( i > 0 )); then
            prev=$(tr -d "$STRIP_CHARS" <<<"${tokens[$((i - 1))]}")
        fi

        expand_tilde "$stripped"
        expanded="$EXPANDED_PATH"
        if (( TILDE_UNRESOLVED )); then
            if [[ "$prev" == "cd" || "$prev" == "pushd" ]]; then
                deny_unresolvable "$prev $stripped"
            else
                deny_unresolvable "$stripped"
            fi
        fi

        resolved=$(resolve_relative_to "$expanded" "$cwd") || resolved=""
        if [[ -z "$resolved" ]]; then
            if [[ "$prev" == "cd" || "$prev" == "pushd" ]]; then
                deny_unresolvable "$prev $stripped"
            else
                deny_unresolvable "$stripped"
            fi
        fi

        if [[ "$resolved" == "$FS_SCOPE_FILE" ]]; then
            deny_fs_scope_edit
        fi

        if [[ "$prev" == "cd" || "$prev" == "pushd" ]]; then
            is_within_allowed "$resolved" || deny_escape "$prev $stripped" "$resolved"
        else
            is_within_allowed "$resolved" || deny_escape "$stripped" "$resolved"
        fi
    done
}

main() {
    if [[ $# -gt 0 ]]; then
        INPUT_FILE="$1"
    fi

    check_dependencies

    if [[ -z "${CLAUDE_PROJECT_DIR:-}" ]]; then
        log_error "CLAUDE_PROJECT_DIR not set — cannot determine allowed roots, disabling this call"
        exit 0
    fi

    PROJECT_ROOT=$(resolve "$CLAUDE_PROJECT_DIR") || PROJECT_ROOT=""
    if [[ -z "$PROJECT_ROOT" ]]; then
        log_error "could not resolve CLAUDE_PROJECT_DIR ($CLAUDE_PROJECT_DIR) — disabling this call"
        exit 0
    fi

    PROJECT_SLUG=$(printf '%s' "$CLAUDE_PROJECT_DIR" | tr '/' '-')

    local script_dir
    script_dir=$(resolve "$SCRIPT_DIR_RAW") || script_dir=""
    if [[ -z "$script_dir" ]]; then
        log_error "could not resolve this script's own directory ($SCRIPT_DIR_RAW) — disabling this call"
        exit 0
    fi
    FS_SCOPE_FILE="$script_dir/$FS_SCOPE_BASENAME"
    if [[ "$FS_SCOPE_FILE" == "$PROJECT_ROOT"/* ]]; then
        FS_SCOPE_DISPLAY="${FS_SCOPE_FILE#"$PROJECT_ROOT"/}"
    else
        FS_SCOPE_DISPLAY="$FS_SCOPE_FILE"
    fi

    local input
    input=$(read_input) || { log_error "could not read hook payload"; exit 0; }

    local tool_name
    tool_name=$(jq -r '.tool_name // empty' <<<"$input" 2>/dev/null) || tool_name=""
    [[ -z "$tool_name" ]] && exit 0

    # Only build the (mildly expensive: reads path-allowlist.json, resolves several paths) allowed-roots
    # set for tools this guard actually checks — everything else exits above, unaffected.
    case "$tool_name" in
        Read | Write | Edit | NotebookEdit | Glob | Grep | Bash) ;;
        *) exit 0 ;;
    esac

    local cwd
    cwd=$(jq -r '.cwd // empty' <<<"$input" 2>/dev/null) || cwd=""
    [[ -z "$cwd" ]] && cwd="$PROJECT_ROOT"

    build_allowed_roots

    case "$tool_name" in
        Read | Write | Edit)
            local file_path
            file_path=$(jq -r '.tool_input.file_path // empty' <<<"$input" 2>/dev/null) || file_path=""
            check_structured_path "$file_path" "$tool_name" "$cwd"
            ;;
        NotebookEdit)
            local nb_path
            nb_path=$(jq -r '.tool_input.notebook_path // empty' <<<"$input" 2>/dev/null) || nb_path=""
            check_structured_path "$nb_path" "$tool_name" "$cwd"
            ;;
        Glob)
            # tool_input.path is not part of Glob's documented hook-payload schema (only "pattern"
            # is) — if a session's payload does carry one anyway, it's still checked; if absent,
            # there is nothing to check and the call is allowed.
            local glob_path
            glob_path=$(jq -r '.tool_input.path // empty' <<<"$input" 2>/dev/null) || glob_path=""
            check_structured_path "$glob_path" "$tool_name" "$cwd"
            ;;
        Grep)
            local grep_paths p
            grep_paths=$(jq -r '.tool_input.paths // [] | .[]?' <<<"$input" 2>/dev/null) || grep_paths=""
            if [[ -n "$grep_paths" ]]; then
                while IFS= read -r p; do
                    [[ -z "$p" ]] && continue
                    check_structured_path "$p" "$tool_name" "$cwd"
                done <<<"$grep_paths"
            fi
            ;;
        Bash)
            local command
            command=$(jq -r '.tool_input.command // empty' <<<"$input" 2>/dev/null) || command=""
            [[ -z "$command" ]] && exit 0
            check_bash "$command" "$cwd"
            ;;
    esac
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
