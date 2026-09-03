#!/usr/bin/env bash
#
# PreToolUse guard for Write, Edit, NotebookEdit, and Bash: mechanically forces every Railway CLI
# operation through the `railway-safe-cli` MCP tool instead of a direct `railway` invocation.
#
# Two independent protections, both unconditional (no config, no toggle):
#
#   1. Denies any Bash command containing a token that names the `railway` CLI binary — bare
#      ("railway ..."), via npx/npm exec ("npx @railway/cli ...", "npx railway ...", the npm
#      package name is "@railway/cli" but the binary itself is invoked as "railway" or the raw
#      package name), or through an absolute/relative path ending in "/railway" (e.g.
#      "/usr/local/bin/railway", "./bin/railway"). The only sanctioned way to run a Railway CLI
#      command is the railway-safe-cli MCP tool, which injects the token and the fixed
#      project/environment/service server-side (never as a caller-supplied argument) and enforces
#      its own per-subcommand allowlist in TypeScript — see this repo's
#      .claude/mcp/local/src/tools/railway-safe-cli/command-allowlist.json. That allowlist decides
#      *which* subcommands are safe; this hook only decides *whether the binary may be reached at
#      all outside the tool* — deliberately simpler than enforce-git-allowlist.sh's six-rule engine,
#      because there is no direct-Bash form of `railway` this session ever allows, unlike `git`.
#
#   2. Protects that same command-allowlist.json (which lives inside the tool's own directory, not
#      beside this hook) from Write/Edit/NotebookEdit, and from any Bash token that resolves to it
#      — same coarse, intent-agnostic posture enforce-git-allowlist.sh already applies to its own
#      git-allowlist.json: regardless of read vs. write intent, a match is denied. `Read` is
#      intentionally left unguarded (the file holds no secret, only subcommand names and rules).
#      Only a human editing the file directly can grant a new subcommand.
#
# command-allowlist.json's path is derived from this script's own directory (two levels up, then
# across into ../../mcp/local/src/tools/railway-safe-cli/), the same "self-contained wherever this
# directory is copied" reasoning enforce-git-allowlist.sh uses for git-allowlist.json — no
# dependency on $CLAUDE_PROJECT_DIR being set.
#
# Parsing approach and known blind spots (same posture as every other Bash-scanning guard in this
# catalog — enforce-git-allowlist, enforce-path-allowlist, enforce-safe-credentials — a best-effort
# text scan, not a shell parser):
#   - The command is whitespace-tokenized (globbing disabled) with the same punctuation-stripping
#     as those guards. Quoting is not respected: a literal "railway status" appearing inside a
#     quoted commit message, or the bare word "railway" anywhere in a comment or string, is
#     indistinguishable from a real invocation and will be denied. This fails toward over-blocking,
#     the accepted direction in this catalog — "wherever safety and convenience pull in different
#     directions, safety wins" (pctk__safe-bash.md).
#   - A `railway` token glued to an adjacent operator with no whitespace (e.g. "railway&&status")
#     is not detected, same documented limitation as path-allowlist's bash-glued-token-limitation
#     fixture.
#   - A symlink or shell alias pointing at the real railway binary under a different name entirely
#     escapes the name-based match. This is a guard of convention with real teeth, not a process
#     sandbox — the same accepted tradeoff already made for `git` and every other binary this
#     catalog's hooks reason about by name.
#
# Missing `jq`/`realpath` fails OPEN, same as every other broad-matcher guard in this catalog — the
# matcher covers every Bash/Write/Edit/NotebookEdit call of the session, so failing closed here
# would block far more than Railway CLI usage.
#
# Usage (normal, from Claude Code): enforce-railway-cli-scope.sh < hook-payload.json
# Usage (manual dry run):           enforce-railway-cli-scope.sh [-v|--verbose] [payload-file]
set -euo pipefail
IFS=$'\n\t'
unset CDPATH

SCRIPT_NAME=$(basename -- "$0")
readonly SCRIPT_NAME
# Unresolved yet (no realpath call before check_dependencies runs) — just the raw directory
# component of $0, used later to derive RAILWAY_ALLOWLIST_FILE relative to this script's own
# location, so the hook carries its own target wherever this directory goes. Pure parameter
# expansion, not the external `dirname`, so this stays available even on a stripped-down PATH.
case "$0" in
    */*) SCRIPT_DIR_RAW="${0%/*}" ;;
    *) SCRIPT_DIR_RAW="." ;;
esac
readonly SCRIPT_DIR_RAW
readonly DEPENDENCIES=(jq realpath)
readonly STRIP_CHARS="\"';&|()<>"
# Relative to this script's own directory: .claude/hooks/enforce-railway-cli-scope/ -> up two
# levels to .claude/ -> across into mcp/local/src/tools/railway-safe-cli/command-allowlist.json.
readonly ALLOWLIST_RELATIVE_PATH="../../mcp/local/src/tools/railway-safe-cli/command-allowlist.json"

VERBOSE=0
INPUT_FILE=""
declare -a TOKENS=()
RAILWAY_ALLOWLIST_FILE=""
RAILWAY_ALLOWLIST_DISPLAY=""

log_error() { printf '%s: %s\n' "$SCRIPT_NAME" "$*" >&2; }
log_verbose() { (( VERBOSE )) && printf '%s: %s\n' "$SCRIPT_NAME" "$*" >&2; return 0; }

usage() {
    cat <<EOF
Usage: $SCRIPT_NAME [-v|--verbose] [payload-file]

Reads a Claude Code PreToolUse hook payload (JSON) from stdin, or from payload-file if given.
Denies any Bash invocation of the railway CLI binary outside the railway-safe-cli MCP tool, and
any Write/Edit/NotebookEdit/Bash call that touches that tool's own command-allowlist.json.
EOF
}

parse_args() {
    while (( $# > 0 )); do
        case "$1" in
            -v|--verbose) VERBOSE=1 ;;
            -h|--help) usage; exit 0 ;;
            --) shift; break ;;
            -*)
                log_error "unknown option: $1"
                usage >&2
                exit 2
                ;;
            *) INPUT_FILE="$1" ;;
        esac
        shift
    done
}

check_dependencies() {
    local missing=() cmd
    for cmd in "${DEPENDENCIES[@]}"; do
        command -v "$cmd" >/dev/null 2>&1 || missing+=("$cmd")
    done
    if (( ${#missing[@]} > 0 )); then
        log_error "missing required tool(s): ${missing[*]} — enforce-railway-cli-scope is disabled this call"
        exit 0
    fi
}

deny() {
    jq -n --arg reason "$1" \
        '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
    exit 0
}

deny_cli_bypass() {
    deny "Blocked by enforce-railway-cli-scope: direct invocation of the railway CLI is not allowed in this session. Use the railway-safe-cli MCP tool instead — it injects the token and project/environment server-side and enforces its own subcommand allowlist."
}

deny_config_edit() {
    deny "Blocked by enforce-railway-cli-scope: $RAILWAY_ALLOWLIST_DISPLAY defines which railway subcommands this session may run without a human and cannot be edited by the agent, via any tool — only a human editing the file directly."
}

read_input() {
    if [[ -n "$INPUT_FILE" ]]; then
        cat -- "$INPUT_FILE" 2>/dev/null
    else
        cat
    fi
}

strip_tok() {
    tr -d "$STRIP_CHARS" <<<"$1"
}

resolve() {
    realpath -m -- "$1" 2>/dev/null
}

resolve_relative_to() {
    local path="$1" base="$2"
    [[ "$path" != /* ]] && path="$base/$path"
    resolve "$path"
}

tokenize() {
    local command="$1"
    local IFS=$' \t\n'
    set -f
    # shellcheck disable=SC2206
    TOKENS=( $command )
    set +f
}

resolve_railway_allowlist_file() {
    local script_dir
    script_dir=$(resolve "$SCRIPT_DIR_RAW") || script_dir=""
    if [[ -z "$script_dir" ]]; then
        log_error "could not resolve this script's own directory ($SCRIPT_DIR_RAW) — disabling this call"
        exit 0
    fi
    RAILWAY_ALLOWLIST_FILE=$(resolve "$script_dir/$ALLOWLIST_RELATIVE_PATH") || RAILWAY_ALLOWLIST_FILE=""
    if [[ -z "$RAILWAY_ALLOWLIST_FILE" ]]; then
        log_error "could not resolve command-allowlist.json's path — disabling this call"
        exit 0
    fi
    RAILWAY_ALLOWLIST_DISPLAY="$RAILWAY_ALLOWLIST_FILE"
}

# True if $1 (already stripped) names the railway CLI binary — bare, the npm package name (as
# passed to npx/npm exec), or a path ending in "/railway".
is_railway_invocation_token() {
    local tok="$1"
    case "$tok" in
        railway|@railway/cli) return 0 ;;
        */railway) return 0 ;;
        *) return 1 ;;
    esac
}

check_protected_file() {
    local raw_path="$1" cwd="$2"
    [[ -z "$raw_path" ]] && return 0
    local resolved
    resolved=$(resolve_relative_to "$raw_path" "$cwd") || return 0
    [[ "$resolved" == "$RAILWAY_ALLOWLIST_FILE" ]] && deny_config_edit
    return 0
}

check_bash_targets_allowlist_file() {
    local cwd="$1"
    local n=${#TOKENS[@]}
    local k stripped resolved
    for (( k = 0; k < n; k++ )); do
        stripped=$(strip_tok "${TOKENS[$k]}")
        [[ -z "$stripped" ]] && continue
        case "$stripped" in
            "~") stripped="${HOME:-}" ;;
            "~/"*) stripped="${HOME:-}${stripped:1}" ;;
        esac
        [[ -z "$stripped" ]] && continue
        resolved=$(resolve_relative_to "$stripped" "$cwd") || continue
        [[ "$resolved" == "$RAILWAY_ALLOWLIST_FILE" ]] && deny_config_edit
    done
    return 0
}

check_bash_for_railway_invocation() {
    local n=${#TOKENS[@]}
    local k stripped
    for (( k = 0; k < n; k++ )); do
        stripped=$(strip_tok "${TOKENS[$k]}")
        [[ -z "$stripped" ]] && continue
        is_railway_invocation_token "$stripped" && deny_cli_bypass
    done
    return 0
}

main() {
    parse_args "$@"
    check_dependencies

    local input
    input=$(read_input) || { log_error "could not read hook payload"; exit 0; }

    local tool_name
    tool_name=$(jq -r '.tool_name // empty' <<<"$input" 2>/dev/null) || tool_name=""
    case "$tool_name" in
        Bash|Write|Edit|NotebookEdit) ;;
        *)
            log_verbose "tool_name=$tool_name: not covered by this guard"
            exit 0
            ;;
    esac

    resolve_railway_allowlist_file

    local cwd
    cwd=$(jq -r '.cwd // empty' <<<"$input" 2>/dev/null) || cwd=""
    [[ -z "$cwd" ]] && cwd="."

    case "$tool_name" in
        Write|Edit)
            local file_path
            file_path=$(jq -r '.tool_input.file_path // empty' <<<"$input" 2>/dev/null) || file_path=""
            check_protected_file "$file_path" "$cwd"
            exit 0
            ;;
        NotebookEdit)
            local nb_path
            nb_path=$(jq -r '.tool_input.notebook_path // empty' <<<"$input" 2>/dev/null) || nb_path=""
            check_protected_file "$nb_path" "$cwd"
            exit 0
            ;;
    esac

    local command
    command=$(jq -r '.tool_input.command // empty' <<<"$input" 2>/dev/null) || command=""
    if [[ -z "$command" ]]; then
        log_verbose "no command in payload"
        exit 0
    fi

    tokenize "$command"
    check_bash_targets_allowlist_file "$cwd"
    check_bash_for_railway_invocation

    log_verbose "no railway CLI invocation or allowlist-file access found"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
