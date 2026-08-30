#!/usr/bin/env bash
#
# PreToolUse guard: mechanically denies any `git` invocation in a Bash command whose subcommand
# has no rule for it in this session's git-allowlist.json. Opt-in model, not opt-out — same
# mechanism as enforce-path-allowlist: nothing is allowed unless a human explicitly turns
# it on via a config file this guard also protects from the agent.
#
# git-allowlist.json (same directory as this script, gitignored; git-allowlist.example.json is the
# committed empty template — same trio of files as enforce-path-allowlist/path-allowlist.json)
# holds one object, keyed by literal subcommand name, each value the *rule* for that subcommand —
# not just a name to flip on, the actual safety rule this script enforces for it. A key absent
# from the object means that subcommand is not enabled this session, full stop:
#   {
#     "status": {},
#     "commit": {"forbidLongFlags": ["--amend", "--no-verify"], "forbidShortFlags": ["n"]},
#     "restore": {"requireFlag": "--staged"},
#     "rm": {"requireFlag": "--cached"}
#   }
# Missing, unreadable, or malformed file → every lookup misses → nothing enabled, never "allow
# everything" — the safe direction on config failure, same as path-allowlist.json.
#
# This is a genuine allowlist, not a feature flag in front of hardcoded rules: the rule itself is
# data. This script is a generic engine that only knows how to interpret six rule shapes (below);
# it has no per-subcommand `case`, and adding a subcommand this session needs — `rm` included —
# is purely a JSON edit, never a code change, as long as the subcommand's danger fits one of these
# shapes. A key with an empty object (`{}`) is unrestricted once enabled, same as `status`/`add`/
# `worktree` always were.
#
# Rule shapes (a rule may combine more than one — "push" below uses three at once):
#   requireFlag: "<flag>"              — that exact token must appear somewhere in the segment.
#                                         (restore -> "--staged", rm -> "--cached")
#   requireAnyFlag: ["<flag>", ...]    — at least one of these exact tokens must appear.
#                                         (config -> ["--get", "--get-all", "--list", "-l"])
#   forbidLongFlags: ["<flag>", ...]   — none of these exact tokens may appear.
#   forbidShortFlags: ["<letter>", ...]— none of these letters may appear inside a combined
#                                         short-flag cluster (e.g. "-vf" trips "f"). Long/short
#                                         forbid lists are independent and commonly used together.
#                                         (commit -> forbidLongFlags ["--amend","--no-verify"],
#                                         forbidShortFlags ["n"])
#   forbidTokenPrefix: "<prefix>"      — no token in the segment may start with this literal
#                                         prefix. (push -> ":" catches a delete refspec like
#                                         "git push origin :branch")
#   verbRule: {bareAllowed, allowedVerbs, flagImpliesAllowed}
#                                       — checks only the token immediately after the subcommand:
#                                         no next token -> allowed iff bareAllowed; next token
#                                         starts with "-" -> allowed iff flagImpliesAllowed;
#                                         otherwise must exactly match one of allowedVerbs.
#                                         (stash -> bareAllowed+flagImpliesAllowed true, verbs
#                                         push/pop/list/show/apply; remote -> bareAllowed true,
#                                         flagImpliesAllowed false, verbs -v/--verbose/show)
#
# A subcommand this session has no key for at all (reset, rebase, checkout, clean, revert,
# filter-branch, submodule, gc, reflog, tag, update-ref, replace, notes, ...) stays denied, same as
# before. What changed: those names are no longer permanently unsupported by this script — if a
# human deliberately adds one with a rule that actually constrains its dangerous form (e.g.
# "reset": {"forbidLongFlags": ["--hard"]}), it is honored like any other rule. This script no
# longer curates *which subcommand names* may ever be enabled; git-allowlist.json alone does, the
# same trust model path-allowlist.json already has for paths. Some subcommands (checkout chief
# among them: "git checkout <path>" silently discards uncommitted changes with no distinguishing
# flag at all — the danger isn't flag-gated) cannot be made safe by any rule shape here; enabling
# them with an empty or insufficient rule is a real footgun this script does not catch, the same
# accepted tradeoff this hook already made for "worktree" (remove --force/move/prune ride
# unrestricted once worktree is enabled, by the workspace owner's explicit call). Writing a
# correct rule for a subcommand is the human's responsibility now, exactly as choosing which paths
# belong in path-allowlist.json already is.
#
# This guard also protects its own config file, mirroring how enforce-path-allowlist protects
# path-allowlist.json: a Write/Edit/NotebookEdit targeting git-allowlist.json, and any Bash token
# that names it (relative or resolved-absolute form), are denied unconditionally, regardless of
# read/write intent — the same coarse, tool-can't-tell-intent-apart posture as that sibling guard.
# Only a human editing the file directly (or the Read tool, intentionally left unguarded for it —
# it holds no secret, only subcommand names and flag lists) can change this session's git scope.
# This is why this hook's PreToolUse matcher must cover Write|Edit|NotebookEdit|Bash, not just Bash.
#
# Parsing approach and known blind spots (same posture as the sibling Bash-scanning guards —
# enforce-path-allowlist, enforce-safe-credentials — not a shell parser, a
# best-effort text scan):
#   - The command is whitespace-tokenized (globbing disabled) with the same punctuation-stripping
#     as those guards. Quoting is not respected: a literal "git push --force" appearing inside a
#     quoted commit message is indistinguishable from a real invocation and will be denied. This
#     fails toward over-blocking, the accepted direction in this catalog.
#   - A `git` token glued to an adjacent operator with no whitespace (e.g. "git&&status") is not
#     detected, same documented limitation as path-allowlist's bash-glued-token-limitation fixture.
#   - Only the exact token immediately after "git" is read as the subcommand — a global option
#     before it (`git -C other/repo status`, `git -c user.name=x commit`) is not recognized and
#     therefore denied (no rule is found for a token like "-C"), not specifically parsed.
#   - Short-flag detection matches any single-dash token containing the target letter anywhere in
#     a combined cluster (e.g. "-vf" trips the "-f" check), to catch combined short flags without
#     a full option parser. This can over-block (a letter that coincidentally collides) but never
#     under-blocks on that account.
#   - The Bash scan protecting git-allowlist.json resolves every token against `cwd` (with a
#     leading "~"/"~/" expanded to $HOME first) and compares it to the config file's own resolved
#     path — deliberately narrower than path-allowlist.sh's general-purpose path scanner: it only
#     ever denies when a token actually *is* this one specific file, so an unresolvable token (a
#     stray "~otheruser/...", an unresolvable relative path) is simply not a match, not a deny. The
#     broader "is this token pointing somewhere it shouldn't" question is path-allowlist.sh's job,
#     running as a separate PreToolUse hook on the same Bash call.
#   - This is v1 scope, matching the workspace owner's explicit "lean toward simplicity" call: the
#     six rule shapes above cover every rule this hook enforced before this redesign, but nothing
#     more exotic (e.g. a rule keyed on a flag's *value* rather than its presence, like catching
#     `merge -X ours` specifically).
#
# Missing `jq`/`realpath` fails OPEN, same as every other broad-matcher guard in this catalog — the
# matcher covers every Bash/Write/Edit/NotebookEdit call of the session, so failing closed here
# would block far more than git.
#
# Usage (normal, from Claude Code): enforce-git-allowlist.sh < hook-payload.json
# Usage (manual dry run):           enforce-git-allowlist.sh [-v|--verbose] [payload-file]
set -euo pipefail
IFS=$'\n\t'
unset CDPATH

SCRIPT_NAME=$(basename -- "$0")
readonly SCRIPT_NAME
# Unresolved yet (no realpath call before check_dependencies runs) — just the raw directory
# component of $0, used later to derive GIT_ALLOWLIST_FILE from this script's own location rather
# than from $CLAUDE_PROJECT_DIR, so the hook carries its config wherever this directory goes. Uses
# pure parameter expansion, not the external `dirname`, so this stays available even when
# check_dependencies would otherwise fail open on a stripped-down PATH.
case "$0" in
    */*) SCRIPT_DIR_RAW="${0%/*}" ;;
    *) SCRIPT_DIR_RAW="." ;;
esac
readonly SCRIPT_DIR_RAW
readonly DEPENDENCIES=(jq realpath)
readonly STRIP_CHARS="\"';&|()<>"
readonly GIT_ALLOWLIST_BASENAME="git-allowlist.json"

VERBOSE=0
INPUT_FILE=""
declare -a TOKENS=()
GIT_ALLOWLIST_FILE=""
# Human-facing display path for deny messages: GIT_ALLOWLIST_FILE relative to CLAUDE_PROJECT_DIR
# when it falls under it (the normal case), or the raw absolute path otherwise.
GIT_ALLOWLIST_DISPLAY=""

# Populated fresh per subcommand by load_rule_for — see that function's own doc comment.
RULE_FOUND=0
RULE_REQUIRE_FLAG=""
RULE_REQUIRE_ANY=""
RULE_FORBID_LONG=""
RULE_FORBID_SHORT=""
RULE_FORBID_PREFIX=""
RULE_VERB_ENABLED=0
RULE_VERB_BARE_ALLOWED=0
RULE_VERB_FLAG_IMPLIES_ALLOWED=0
RULE_VERB_ALLOWED=""

log_error() { printf '%s: %s\n' "$SCRIPT_NAME" "$*" >&2; }
log_verbose() { (( VERBOSE )) && printf '%s: %s\n' "$SCRIPT_NAME" "$*" >&2; return 0; }

usage() {
    cat <<EOF
Usage: $SCRIPT_NAME [-v|--verbose] [payload-file]

Reads a Claude Code PreToolUse hook payload (JSON) from stdin, or from payload-file if given.
Denies a Bash-invoked git subcommand with no rule for it in git-allowlist.json, or one enabled but
used in a way its rule forbids. Also denies any Write/Edit/NotebookEdit/Bash call that touches
git-allowlist.json itself. Verbose mode logs metadata only (matched subcommand, token count),
never the full scanned command text.
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
        # Fail OPEN — see header: matcher is broad, failing closed here would block every
        # shell/edit command of the session, not just an out-of-allowlist git one.
        log_error "missing required tool(s): ${missing[*]} — enforce-git-allowlist is disabled this call"
        exit 0
    fi
}

deny() {
    jq -n --arg reason "$1" \
        '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
    exit 0
}

deny_config_edit() {
    deny "Blocked by enforce-git-allowlist: $GIT_ALLOWLIST_DISPLAY defines the rule for each git subcommand this session may run without a human and cannot be edited by the agent, via any tool — only a human editing the file directly."
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

# realpath -m: canonicalizes without requiring existence. Prints nothing and returns non-zero on
# genuine failure — callers must treat that as "cannot verify this is the protected file", not
# "it is".
resolve() {
    realpath -m -- "$1" 2>/dev/null
}

# Resolves $1 against base $2 first if $1 isn't already absolute.
resolve_relative_to() {
    local path="$1" base="$2"
    [[ "$path" != /* ]] && path="$base/$path"
    resolve "$path"
}

# Whitespace-tokenizes $1 into the global TOKENS array. Globbing disabled so a `*`/`?` in the
# scanned command is never expanded against this process's real filesystem.
tokenize() {
    local command="$1"
    local IFS=$' \t\n'
    set -f
    # shellcheck disable=SC2206
    TOKENS=( $command )
    set +f
}

# GIT_ALLOWLIST_FILE lives beside this script's own directory (like path-allowlist.json does for
# its sibling hook), not at a path relative to $CLAUDE_PROJECT_DIR, so this hook stays
# self-contained wherever its directory is copied. GIT_ALLOWLIST_DISPLAY is the human-facing
# relative form used in deny messages when the file falls under $CLAUDE_PROJECT_DIR.
resolve_git_allowlist_file() {
    local script_dir
    script_dir=$(resolve "$SCRIPT_DIR_RAW") || script_dir=""
    if [[ -z "$script_dir" ]]; then
        log_error "could not resolve this script's own directory ($SCRIPT_DIR_RAW) — disabling this call"
        exit 0
    fi
    GIT_ALLOWLIST_FILE="$script_dir/$GIT_ALLOWLIST_BASENAME"

    GIT_ALLOWLIST_DISPLAY="$GIT_ALLOWLIST_FILE"
    if [[ -n "${CLAUDE_PROJECT_DIR:-}" ]]; then
        local project_root
        project_root=$(resolve "$CLAUDE_PROJECT_DIR") || project_root=""
        if [[ -n "$project_root" && "$GIT_ALLOWLIST_FILE" == "$project_root"/* ]]; then
            GIT_ALLOWLIST_DISPLAY="${GIT_ALLOWLIST_FILE#"$project_root"/}"
        fi
    fi
}

# Populates the global RULE_* variables from GIT_ALLOWLIST_FILE's rule for $1, resetting them
# first so a miss (no rule found) never leaks a previous subcommand's rule into this one — matters
# because a single chained Bash command scans more than one git segment in one process (see
# main()'s loop). Missing, unreadable, or malformed file, or a subcommand absent from the object,
# all leave RULE_FOUND=0 — the safe direction, never "allow everything" or "reuse the last rule".
load_rule_for() {
    local subcommand="$1"
    RULE_FOUND=0
    RULE_REQUIRE_FLAG=""
    RULE_REQUIRE_ANY=""
    RULE_FORBID_LONG=""
    RULE_FORBID_SHORT=""
    RULE_FORBID_PREFIX=""
    RULE_VERB_ENABLED=0
    RULE_VERB_BARE_ALLOWED=0
    RULE_VERB_FLAG_IMPLIES_ALLOWED=0
    RULE_VERB_ALLOWED=""

    [[ -r "$GIT_ALLOWLIST_FILE" ]] || return 0

    local rule_json
    rule_json=$(jq -c --arg sc "$subcommand" '.[$sc] // empty' -- "$GIT_ALLOWLIST_FILE" 2>/dev/null) || rule_json=""
    [[ -z "$rule_json" || "$rule_json" == "null" ]] && return 0
    RULE_FOUND=1

    RULE_REQUIRE_FLAG=$(jq -r '.requireFlag // empty' <<<"$rule_json" 2>/dev/null) || RULE_REQUIRE_FLAG=""
    RULE_REQUIRE_ANY=$(jq -r '.requireAnyFlag // [] | join(" ")' <<<"$rule_json" 2>/dev/null) || RULE_REQUIRE_ANY=""
    RULE_FORBID_LONG=$(jq -r '.forbidLongFlags // [] | join(" ")' <<<"$rule_json" 2>/dev/null) || RULE_FORBID_LONG=""
    RULE_FORBID_SHORT=$(jq -r '.forbidShortFlags // [] | join(" ")' <<<"$rule_json" 2>/dev/null) || RULE_FORBID_SHORT=""
    RULE_FORBID_PREFIX=$(jq -r '.forbidTokenPrefix // empty' <<<"$rule_json" 2>/dev/null) || RULE_FORBID_PREFIX=""

    if jq -e '.verbRule' <<<"$rule_json" >/dev/null 2>&1; then
        RULE_VERB_ENABLED=1
        local bare flag_implies
        bare=$(jq -r '.verbRule.bareAllowed // false' <<<"$rule_json" 2>/dev/null) || bare="false"
        [[ "$bare" == "true" ]] && RULE_VERB_BARE_ALLOWED=1
        flag_implies=$(jq -r '.verbRule.flagImpliesAllowed // false' <<<"$rule_json" 2>/dev/null) || flag_implies="false"
        [[ "$flag_implies" == "true" ]] && RULE_VERB_FLAG_IMPLIES_ALLOWED=1
        RULE_VERB_ALLOWED=$(jq -r '.verbRule.allowedVerbs // [] | join(" ")' <<<"$rule_json" 2>/dev/null) || RULE_VERB_ALLOWED=""
    fi
    return 0
}

# Checks a single structured tool_input path (Write/Edit's "file_path", NotebookEdit's
# "notebook_path") against git-allowlist.json protection. Denies and exits on a match; returns
# normally (allow, as far as this guard is concerned) otherwise — including when the path can't be
# resolved at all, since that's path-allowlist.sh's concern, not this guard's.
check_protected_file() {
    local raw_path="$1" cwd="$2"
    [[ -z "$raw_path" ]] && return 0
    local resolved
    resolved=$(resolve_relative_to "$raw_path" "$cwd") || return 0
    [[ "$resolved" == "$GIT_ALLOWLIST_FILE" ]] && deny_config_edit
    return 0
}

# Scans every token in the global TOKENS (already populated by tokenize()) for one that resolves
# to GIT_ALLOWLIST_FILE, regardless of whether it appears in a git invocation at all (e.g. a plain
# `cat`/`sed -i`/`echo >` targeting the file) — same coarse, intent-agnostic protection
# path-allowlist.sh applies to its own config file. A leading "~"/"~/" is expanded to $HOME first,
# matching what the real shell would do.
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
        [[ "$resolved" == "$GIT_ALLOWLIST_FILE" ]] && deny_config_edit
    done
    return 0
}

# True if $1 (already stripped) is a single-dash short-flag cluster containing letter $2 anywhere
# in it (e.g. "-vf" matches letter "f"). Deliberately coarse — see header's short-flag note.
token_has_short_flag() {
    local tok="$1" letter="$2"
    [[ "$tok" == --* ]] && return 1
    [[ "$tok" =~ ^-[a-zA-Z]*${letter}[a-zA-Z]*$ ]]
}

# Denies if any token in TOKENS[start..end) exactly matches one of the space-separated long flags
# in $4, or matches one of the space-separated short-flag letters in $5 via token_has_short_flag.
# $4/$5 are sourced from a rule's forbidLongFlags/forbidShortFlags (see git-allowlist.json).
scan_forbidden() {
    local start="$1" end="$2" subcommand="$3" long_flags="$4" short_letters="$5"
    # Local override: the script-wide IFS=$'\n\t' (no space) would stop "for lf in $long_flags"
    # from splitting a space-separated flag list into words at all.
    local IFS=$' \t\n'
    local k stripped lf sl
    for (( k = start; k < end; k++ )); do
        stripped=$(strip_tok "${TOKENS[$k]}")
        [[ -z "$stripped" ]] && continue
        for lf in $long_flags; do
            [[ "$stripped" == "$lf" ]] && \
                deny "Blocked by enforce-git-allowlist: 'git $subcommand' with '$stripped' is not in the list of git operations this session may run without a human. Ask a human to run this manually, or extend the allowlist deliberately if this should become routine."
        done
        for sl in $short_letters; do
            token_has_short_flag "$stripped" "$sl" && \
                deny "Blocked by enforce-git-allowlist: 'git $subcommand' with '$stripped' (matches short flag -$sl) is not in the list of git operations this session may run without a human."
        done
    done
    return 0
}

# Denies unless a token in TOKENS[start..end) exactly matches $4. $4 is sourced from a rule's
# requireFlag (see git-allowlist.json).
require_flag_present() {
    local start="$1" end="$2" subcommand="$3" required="$4"
    local k stripped
    for (( k = start; k < end; k++ )); do
        stripped=$(strip_tok "${TOKENS[$k]}")
        [[ "$stripped" == "$required" ]] && return 0
    done
    deny "Blocked by enforce-git-allowlist: 'git $subcommand' is only allowed with '$required' in this session — the flagless form can discard uncommitted work."
}

# Denies unless a token in TOKENS[start..end) exactly matches one of the space-separated flags in
# $4. $4 is sourced from a rule's requireAnyFlag (see git-allowlist.json).
require_any_flag() {
    local start="$1" end="$2" subcommand="$3" flags="$4"
    local IFS=$' \t\n'
    local k stripped f
    for (( k = start; k < end; k++ )); do
        stripped=$(strip_tok "${TOKENS[$k]}")
        for f in $flags; do
            [[ "$stripped" == "$f" ]] && return 0
        done
    done
    deny "Blocked by enforce-git-allowlist: 'git $subcommand' is only allowed in read form ($flags) in this session."
}

# Denies if any token in TOKENS[start..end) starts with the literal prefix $4 (e.g. ":" catches a
# push delete refspec like "git push origin :branch"). $4 is sourced from a rule's
# forbidTokenPrefix (see git-allowlist.json).
check_forbidden_prefix() {
    local start="$1" end="$2" subcommand="$3" prefix="$4"
    local k stripped
    for (( k = start; k < end; k++ )); do
        stripped=$(strip_tok "${TOKENS[$k]}")
        [[ "$stripped" == "$prefix"* ]] && \
            deny "Blocked by enforce-git-allowlist: 'git $subcommand' with a token starting with '$prefix' ('$stripped') is not in the list of git operations this session may run without a human."
    done
    return 0
}

# Checks the token immediately after the subcommand (TOKENS[sub_idx+1]) against a verb rule: no
# next token -> allowed iff $4 (bareAllowed); next token starting with "-" -> allowed iff $5
# (flagImpliesAllowed); otherwise must exactly match one of the space-separated allowedVerbs in
# $6. Sourced from a rule's verbRule (see git-allowlist.json) — the generic replacement for what
# used to be this hook's separate check_stash/check_remote.
check_verb_rule() {
    local sub_idx="$1" end="$2" subcommand="$3" bare_allowed="$4" flag_implies_allowed="$5" allowed_verbs="$6"
    local next_idx=$(( sub_idx + 1 ))
    if (( next_idx >= end )); then
        (( bare_allowed )) && return 0
        deny "Blocked by enforce-git-allowlist: 'git $subcommand' with no verb is not in the list of git operations this session may run without a human."
    fi

    local verb
    verb=$(strip_tok "${TOKENS[$next_idx]}")
    if [[ "$verb" == -* ]] && (( flag_implies_allowed )); then
        return 0
    fi

    local IFS=$' \t\n'
    local v
    for v in $allowed_verbs; do
        [[ "$verb" == "$v" ]] && return 0
    done
    deny "Blocked by enforce-git-allowlist: 'git $subcommand $verb' is not in the list of git operations this session may run without a human."
}

# Dispatches on the subcommand token at TOKENS[sub_idx] (immediately after "git"): loads its rule
# from git-allowlist.json (load_rule_for) and applies whichever of the six generic checks the rule
# actually specifies. Denies (and exits, via deny()) on any violation, including when no rule is
# found at all; returns normally when the segment is allowed.
check_git_segment() {
    local git_idx="$1" end="$2"
    local sub_idx=$(( git_idx + 1 ))
    if (( sub_idx >= end )); then
        deny "Blocked by enforce-git-allowlist: 'git' invoked with no recognized subcommand in this session's allowlist."
    fi

    local subcommand
    subcommand=$(strip_tok "${TOKENS[$sub_idx]}")
    log_verbose "checking subcommand: $subcommand"

    load_rule_for "$subcommand"
    if (( ! RULE_FOUND )); then
        deny "Blocked by enforce-git-allowlist: 'git $subcommand' is not enabled in this session's allowlist ($GIT_ALLOWLIST_DISPLAY). Ask a human to add \"$subcommand\" to it, with the right rule — the agent cannot edit that file itself."
    fi

    if [[ -n "$RULE_FORBID_LONG" || -n "$RULE_FORBID_SHORT" ]]; then
        scan_forbidden "$sub_idx" "$end" "$subcommand" "$RULE_FORBID_LONG" "$RULE_FORBID_SHORT"
    fi

    [[ -n "$RULE_REQUIRE_FLAG" ]] && require_flag_present "$sub_idx" "$end" "$subcommand" "$RULE_REQUIRE_FLAG"

    [[ -n "$RULE_REQUIRE_ANY" ]] && require_any_flag "$sub_idx" "$end" "$subcommand" "$RULE_REQUIRE_ANY"

    [[ -n "$RULE_FORBID_PREFIX" ]] && check_forbidden_prefix "$sub_idx" "$end" "$subcommand" "$RULE_FORBID_PREFIX"

    if (( RULE_VERB_ENABLED )); then
        check_verb_rule "$sub_idx" "$end" "$subcommand" "$RULE_VERB_BARE_ALLOWED" \
            "$RULE_VERB_FLAG_IMPLIES_ALLOWED" "$RULE_VERB_ALLOWED"
    fi

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

    resolve_git_allowlist_file

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

    local n=${#TOKENS[@]}
    log_verbose "scanning ${n} token(s)"

    local i stripped end j
    for (( i = 0; i < n; i++ )); do
        stripped=$(strip_tok "${TOKENS[$i]}")
        [[ "$stripped" != "git" ]] && continue

        end="$n"
        for (( j = i + 1; j < n; j++ )); do
            if [[ "$(strip_tok "${TOKENS[$j]}")" == "git" ]]; then
                end="$j"
                break
            fi
        done

        check_git_segment "$i" "$end"
        i=$(( end - 1 ))
    done

    log_verbose "no git invocation outside the allowlist found"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
