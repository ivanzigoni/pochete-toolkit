#!/usr/bin/env bash
#
# PreToolUse guard for Read, Write, Edit, NotebookEdit, Grep, AND Bash: mechanically blocks
# reading OR writing files likely to hold real credentials — .env-family files, anything under an
# AWS/Azure/gcloud credentials directory, a GCP service-account key JSON file, and private
# certificate/key files (.pfx/.p12/.pem/.key/.jks/.keystore). .env.example and .env.sample are
# explicitly allowed. Invoked by Claude Code with a
# JSON payload on stdin (no CLI flags — nothing here is meant for a human to type) and responds on
# stdout with either nothing (allow) or a hook-output object with permissionDecision: "deny".
#
# Read/Write/Edit check the single structured tool_input.file_path. NotebookEdit and Grep carry
# their target under different field names per the Claude Code hooks docs — NotebookEdit under
# tool_input.path, Grep under tool_input.paths (an array) — rather than file_path; each is checked
# with the same classify_path used everywhere else, just extracted from its own field. Glob is
# deliberately left unmatched: its hook payload carries only "pattern", no path field, so there is
# nothing to check.
#
# The Bash-tool path has no structured field at all — a shell command is free text — so it's
# tokenized on whitespace (with globbing disabled during that split, so a `*` in the scanned
# command never expands against this process's own cwd) and each token is run through the same
# classify_path used for the structured tools. This is a best-effort mechanical scan, not a shell
# parser: quoting, variable expansion, and command substitution inside the command string are not
# resolved, so a credential path built up via `$HOME/.aws/credentials` or hidden behind a variable
# can still slip through undetected. It catches the common, unremarkable case (`cat .env`, `head
# ~/.aws/credentials`) that would otherwise bypass this guard entirely just by using Bash instead
# of a structured tool. It also de-globs each token's flag value (`--include=*.env*` -> `.env`)
# and re-classifies the result, catching a search command aimed at a credential-family file via
# wildcard instead of an exact name (see check_bash_command). check_bash_command additionally
# recognizes grep-family commands that recurse into a directory (grep/egrep/fgrep with an explicit
# -r/-R/--recursive flag, or rg/ag/ack which recurse by default) and, for each directory argument
# they're given, walks that directory looking for a credential-family file before allowing the
# command through -- see is_recursive_grep_command/scan_dir_for_credential_file. `find <dir> -exec
# cat {} \;` and `git grep` reach the same nested content through a shape this heuristic doesn't
# recognize (see the BYPASS tests for both).
set -euo pipefail
IFS=$'\n\t'
unset CDPATH

SCRIPT_NAME=$(basename -- "$0")
readonly SCRIPT_NAME
readonly DEPENDENCIES=(jq)
# Shell punctuation/quote characters stripped from each whitespace-split token before it's
# classified, so a path glued to an adjacent operator (`.env;`, `'.env'`, `.env)`) still matches
# on its basename rather than failing the exact-match .env-family check by one stray character.
readonly STRIP_CHARS="\"';&|()<>"

# .env-family basenames — case-sensitive, matching this check's original (pre-rename) behavior.
readonly ENV_BASENAME_RE='^\.env(\..+)?$'
# Anything under a named cloud-CLI credentials directory. Checked against the lowercased full
# path (not just basename), since AWS/Azure/gcloud credential files have ordinary names
# (credentials, config, azureProfile.json, ...) that are only identifiable by their directory.
readonly AWS_PATH_RE='(^|/)\.aws(/|$)'
readonly AZURE_PATH_RE='(^|/)\.azure(/|$)'
readonly GCLOUD_PATH_RE='(^|/)\.config/gcloud(/|$)'
# A likely GCP service-account key file — these get downloaded with this naming convention and
# often end up dropped somewhere in a repo, not only under .config/gcloud.
readonly GCP_SERVICE_ACCOUNT_RE='service[_-]?account.*\.json$'
# Private certificate/key container extensions.
readonly CERT_EXT_RE='\.(pfx|p12|pem|key|jks|keystore)$'

# grep-family commands that recurse into a directory by default, no flag needed.
readonly RECURSIVE_ALWAYS_CMD_RE='^(rg|ripgrep|ag|ack|ack-grep)$'
# grep-family commands that only recurse with an explicit -r/-R/--recursive flag.
readonly RECURSIVE_FLAGGED_CMD_RE='^(grep|egrep|fgrep)$'
# Matches a bundled short flag containing r/R (-r, -rn, -nr, -rlI, ...) or the long form
# (--recursive). A leading double-dash never matches the short-bundle half of this alternation,
# since its second character is `-`, not one of `[a-zA-Z]`.
readonly RECURSIVE_FLAG_RE='^-[a-zA-Z]*[rR][a-zA-Z]*$|^--recursive$'

log_error() { printf '%s: %s\n' "$SCRIPT_NAME" "$*" >&2; }

check_dependencies() {
    local missing=() cmd
    for cmd in "${DEPENDENCIES[@]}"; do
        command -v "$cmd" >/dev/null 2>&1 || missing+=("$cmd")
    done
    if (( ${#missing[@]} > 0 )); then
        # Fail OPEN, not closed: without jq this hook can't parse tool_input at all, so "deny"
        # here would block every Read call this session, not just risky ones — more disruptive
        # than the leak this hook guards against. Warn loudly (stderr surfaces in hook debug
        # output) and let the read proceed.
        log_error "missing required tool(s): ${missing[*]} — enforce-safe-credentials is disabled this call"
        exit 0
    fi
}

deny() {
    jq -n --arg reason "$1" \
        '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
    exit 0
}

# Prints a human-readable reason if $1 (full path) / $2 (basename) looks like a credential file,
# or nothing if it's fine to read. Always exits 0 regardless of match — the caller distinguishes
# "blocked" from "allowed" by whether anything was printed, not by exit status, since ending on a
# false `[[ ]]` test here would otherwise trip `set -e` on the ordinary allow path.
classify_path() {
    local path="$1" base="$2"
    local path_lc="${path,,}" base_lc="${base,,}"

    if [[ "$base" =~ $ENV_BASENAME_RE && "$base" != ".env.example" && "$base" != ".env.sample" ]]; then
        printf 'a .env-family file (%s) that may contain secrets' "$base"
        return 0
    fi
    if [[ "$path_lc" =~ $AWS_PATH_RE ]]; then
        printf 'an AWS credentials/config path (under a .aws directory): %s' "$path"
        return 0
    fi
    if [[ "$path_lc" =~ $AZURE_PATH_RE ]]; then
        printf 'an Azure credentials/config path (under a .azure directory): %s' "$path"
        return 0
    fi
    if [[ "$path_lc" =~ $GCLOUD_PATH_RE ]]; then
        printf 'a gcloud credentials/config path (under .config/gcloud): %s' "$path"
        return 0
    fi
    if [[ "$base_lc" =~ $GCP_SERVICE_ACCOUNT_RE ]]; then
        printf 'a likely GCP service-account key file (%s)' "$base"
        return 0
    fi
    if [[ "$base_lc" =~ $CERT_EXT_RE ]]; then
        printf 'a private certificate/key file (%s)' "$base"
        return 0
    fi

    return 0
}

# True if this Bash command's token list invokes a grep-family command in a shape that recurses
# into a directory: rg/ag/ack (recursive by default) anywhere in the tokens, or grep/egrep/fgrep
# together with a -r/-R/--recursive-shaped flag anywhere in the tokens. Deliberately checks every
# token, not just tokens[0], so `sudo grep -r ...` or `time grep -r ...` still match -- resolving
# the real argv[0] would need actual shell parsing, out of scope for this best-effort scanner.
# That looseness runs both ways: a command that merely mentions "grep -r" as prose (inside an
# unrelated echo, say) can false-positive here. Consistent with the rest of this file, an
# over-block is the accepted failure mode over an under-block.
is_recursive_grep_command() {
    local -n _tokens="$1"
    local tok base
    local has_always_recursive_cmd=0 has_flagged_cmd=0 has_recursive_flag=0

    for tok in "${_tokens[@]}"; do
        base=$(basename -- "$tok")
        [[ "$base" =~ $RECURSIVE_ALWAYS_CMD_RE ]] && has_always_recursive_cmd=1
        [[ "$base" =~ $RECURSIVE_FLAGGED_CMD_RE ]] && has_flagged_cmd=1
        [[ "$tok" =~ $RECURSIVE_FLAG_RE ]] && has_recursive_flag=1
    done

    (( has_always_recursive_cmd == 1 )) && return 0
    (( has_flagged_cmd == 1 && has_recursive_flag == 1 )) && return 0
    return 1
}

# Walks a directory tree for the first file classify_path considers a credential file, and prints
# its reason (or nothing, on a clean tree) -- an existence check, not an enumeration, so it stops
# at the first hit instead of walking a large tree (node_modules, say) to completion. Reuses
# classify_path itself rather than a second copy of its patterns, so the .env.example/.env.sample
# exemption and every other rule stay in exactly one place. Symlinks are not followed (`find`'s
# default `-type f` matches the link's own type, not what it points at) -- that's the same gap the
# BYPASS tests above already document for Read, not a new one introduced here.
scan_dir_for_credential_file() {
    local dir="$1" file base reason
    while IFS= read -r -d '' file; do
        base=$(basename -- "$file")
        reason=$(classify_path "$file" "$base")
        if [[ -n "$reason" ]]; then
            printf '%s' "$reason"
            return 0
        fi
    done < <(find "$dir" -type f -print0 2>/dev/null)
    return 0
}

# Scans a Bash command's arguments for a credential-looking path and denies on the first match.
# Tokenizes on whitespace with globbing disabled (`set -f`) so a `*`/`?`/`[...]` in the scanned
# command is treated as a literal character, never expanded against this process's real
# filesystem — the split itself must not have side effects on top of the command it's scanning.
# `local IFS` scopes the whitespace-inclusive splitter to this function only; the caller's
# `IFS=$'\n\t'` (set for the rest of the script, per the strict-mode header) is restored on return.
check_bash_command() {
    local command="$1"
    local IFS=$' \t\n'
    local -a tokens
    set -f
    # Word splitting is the point here (tokenizing free-text $command); globbing is off (set -f
    # above) so this can't expand against the real filesystem.
    # shellcheck disable=SC2206
    tokens=( $command )
    set +f

    local recursive_command=0
    is_recursive_grep_command tokens && recursive_command=1

    local tok stripped base reason value deglobbed glob_base glob_reason
    for tok in "${tokens[@]}"; do
        stripped=$(tr -d "$STRIP_CHARS" <<<"$tok")
        [[ -z "$stripped" ]] && continue
        base=$(basename -- "$stripped")
        reason=$(classify_path "$stripped" "$base")
        if [[ -n "$reason" ]]; then
            deny "Blocked by enforce-safe-credentials: $reason — cannot be read or written via Bash either (matched argument: $stripped)."
        fi

        if (( recursive_command == 1 )) && [[ -d "$stripped" ]]; then
            reason=$(scan_dir_for_credential_file "$stripped")
            if [[ -n "$reason" ]]; then
                deny "Blocked by enforce-safe-credentials: this command recurses into a directory containing $reason — a recursive search can echo its content into the match output even though no argument named it directly (matched directory: $stripped)."
            fi
        fi

        # A token can be safe as a literal path yet still be a glob pattern (a grep/find
        # --include/-name value) aimed at a credential-family file without ever spelling out the
        # exact basename — `--include=*.env*` never equals `.env`. Take the flag's value (after
        # the last `=`, if any), strip the glob wildcard characters (`*`, `?`), and re-classify:
        # if that reveals a credential-looking basename that wasn't visible before stripping, the
        # token was a glob aimed at that file family.
        value="$stripped"
        [[ "$stripped" == *=* ]] && value="${stripped#*=}"
        deglobbed="${value//[*?]/}"
        if [[ "$deglobbed" != "$value" && -n "$deglobbed" ]]; then
            glob_base=$(basename -- "$deglobbed")
            glob_reason=$(classify_path "$deglobbed" "$glob_base")
            if [[ -n "$glob_reason" ]]; then
                deny "Blocked by enforce-safe-credentials: this argument is a glob pattern matching $glob_reason — cannot target credential-family files via a wildcard either (matched argument: $stripped)."
            fi
        fi
    done
}

# Classifies a single path and denies (exits) if it looks like a credential file. A no-op on an
# empty path, so callers can pass an unchecked jq extraction straight through.
check_path_and_deny() {
    local path="$1" base reason
    [[ -z "$path" ]] && return 0

    base=$(basename -- "$path")
    reason=$(classify_path "$path" "$base")
    [[ -z "$reason" ]] && return 0

    deny "Blocked by enforce-safe-credentials: $reason — cannot be read or written."
}

main() {
    check_dependencies

    local input tool_name command

    input=$(cat)

    # A malformed/non-JSON payload must never crash the hook (set -e would otherwise kill the
    # whole call) — treat a parse failure the same as "nothing to check": allow. Fed via a
    # here-string, not a pipe, so there's no separate producer process whose exit status
    # `pipefail` could fold into this one.
    tool_name=$(jq -r '.tool_name // empty' <<<"$input" 2>/dev/null) || tool_name=""

    case "$tool_name" in
        Bash)
            command=$(jq -r '.tool_input.command // empty' <<<"$input" 2>/dev/null) || command=""
            [[ -z "$command" ]] && exit 0
            check_bash_command "$command"
            exit 0
            ;;
        NotebookEdit)
            # NotebookEdit carries its target under tool_input.path, not file_path — a different
            # field name than Read/Write/Edit, per the Claude Code hooks docs.
            local nb_path
            nb_path=$(jq -r '.tool_input.path // empty' <<<"$input" 2>/dev/null) || nb_path=""
            check_path_and_deny "$nb_path"
            exit 0
            ;;
        Grep)
            # Grep carries tool_input.paths as an array (plural), unlike every other tool here,
            # per the Claude Code hooks docs.
            local paths_list p
            paths_list=$(jq -r '.tool_input.paths // [] | .[]?' <<<"$input" 2>/dev/null) || paths_list=""
            if [[ -n "$paths_list" ]]; then
                while IFS= read -r p; do
                    check_path_and_deny "$p"
                done <<<"$paths_list"
            fi
            exit 0
            ;;
    esac

    # Read/Write/Edit, or tool_name absent — the latter kept so a payload without a tool_name
    # field still gets the file_path check. All three tools carry the same tool_input.file_path
    # shape, so no per-tool branching is needed here.
    #
    # Glob is deliberately NOT handled: its hook payload carries only "pattern", no path field per
    # the Claude Code hooks docs, so there is nothing here to extract or check.
    local path
    path=$(jq -r '.tool_input.file_path // empty' <<<"$input" 2>/dev/null) || path=""
    check_path_and_deny "$path"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main
fi
