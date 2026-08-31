#!/usr/bin/env bats
#
# Covers enforce-path-allowlist.sh's own logic — the opt-in filesystem-scope guard replacing
# CLAUDE.md's purely textual stay-in-root guidance (.claude/conventions/pctk__agent-stay-in-root.md) with a
# real PreToolUse deny.
#
# This hook's allowed roots are user- and session-specific (HOME, CLAUDE_PROJECT_DIR,
# CLAUDE_CODE_SESSION_ID), so tests never touch the
# real HOME or the real project. Each test gets a fake HOME/PROJECT_DIR under $BATS_TEST_TMPDIR,
# and a fake scratchpad under a session-id-scoped subdirectory of /tmp (still real /tmp, since the
# hook's scratchpad formula is hardcoded to /tmp — cleaned up in teardown). Fixtures store
# @PROJECT@, @MEMORY@, @SCRATCH@, and @FS_SCOPE@ placeholders instead of hardcoded paths; the
# payload() helper substitutes them for the per-test fake paths before feeding a fixture to the
# script.
#
# path-allowlist.json's location is derived from the script's own directory ($0's dirname), not
# from CLAUDE_PROJECT_DIR — see the header of enforce-path-allowlist.sh. To keep this suite
# isolated from the real repo's real path-allowlist.json (which lives beside the real script),
# every test runs against a symlink to the real script placed inside a fake hook directory under
# the fake project, mirroring the real .claude/hooks/enforce-path-allowlist/ layout. $0's dirname
# then resolves inside the fake project, exactly as it would in production, without ever touching
# the real path-allowlist.json.

bats_require_minimum_version 1.5.0

setup() {
    REAL_SCRIPT="$BATS_TEST_DIRNAME/../enforce-path-allowlist.sh"
    FIXTURES="$BATS_TEST_DIRNAME/fixtures"

    FAKE_HOME="$BATS_TEST_TMPDIR/home"
    PROJECT_DIR="$BATS_TEST_TMPDIR/project"
    mkdir -p "$PROJECT_DIR/.claude"

    PROJECT_SLUG="$(printf '%s' "$PROJECT_DIR" | tr '/' '-')"

    MEMORY_DIR="$FAKE_HOME/.claude/projects/$PROJECT_SLUG/memory"
    mkdir -p "$MEMORY_DIR"

    SESSION_ID="bats-$BATS_TEST_NUMBER-$BATS_SUITE_TEST_NUMBER-$$"
    SCRATCH_DIR="/tmp/claude-$(id -u)/$PROJECT_SLUG/$SESSION_ID/scratchpad"
    mkdir -p "$SCRATCH_DIR"

    FAKE_HOOK_DIR="$PROJECT_DIR/.claude/hooks/enforce-path-allowlist"
    mkdir -p "$FAKE_HOOK_DIR"
    SCRIPT="$FAKE_HOOK_DIR/enforce-path-allowlist.sh"
    ln -s "$REAL_SCRIPT" "$SCRIPT"

    FS_SCOPE_FILE="$FAKE_HOOK_DIR/path-allowlist.json"

    export HOME="$FAKE_HOME"
    export CLAUDE_PROJECT_DIR="$PROJECT_DIR"
    export CLAUDE_CODE_SESSION_ID="$SESSION_ID"
}

teardown() {
    rm -rf "/tmp/claude-$(id -u)/$PROJECT_SLUG"
}

# Substitutes the @PROJECT@/@MEMORY@/@SCRATCH@/@FS_SCOPE@ placeholders in a fixture and prints the
# result to stdout, for redirecting into the script's stdin.
payload() {
    sed -e "s|@PROJECT@|$PROJECT_DIR|g" \
        -e "s|@MEMORY@|$MEMORY_DIR|g" \
        -e "s|@SCRATCH@|$SCRATCH_DIR|g" \
        -e "s|@FS_SCOPE@|$FS_SCOPE_FILE|g" \
        "$FIXTURES/$1"
}

deny_json() {
    jq -e '.hookSpecificOutput.permissionDecision == "deny"' <<<"$1" >/dev/null
}

# --- allows within the implicit project root --------------------------------------------------

@test "allows Read inside the project root" {
    printf 'content' > "$PROJECT_DIR/CLAUDE.md"
    run bash -c "$SCRIPT" <<<"$(payload read-inside-root.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows Bash cd within the project root" {
    run bash -c "$SCRIPT" <<<"$(payload bash-cd-inside.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows an unrelated Bash command with no absolute path or cd" {
    run bash -c "$SCRIPT" <<<"$(payload bash-unrelated.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

# --- denies outside the project root, with a helpful reason -----------------------------------

@test "denies Read outside the project root" {
    run bash -c "$SCRIPT" <<<"$(payload read-outside-root.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
    [[ "$output" == *"/etc/passwd"* ]]
    [[ "$output" == *"path-allowlist.json"* ]]
}

@test "denies a relative path resolved against cwd landing outside the project root" {
    run bash -c "$SCRIPT" <<<"$(payload read-outside-relative.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "denies Bash cd outside the project root" {
    run bash -c "$SCRIPT" <<<"$(payload bash-cd-outside.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
    [[ "$output" == *"/etc"* ]]
}

@test "denies a bare absolute path in Bash with no cd involved" {
    run bash -c "$SCRIPT" <<<"$(payload bash-absolute-outside.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
    [[ "$output" == *"/etc/hosts"* ]]
}

# --- regression: every Bash token is resolved, not only ones that already look absolute --------
# (found by testing this guard live in another session: "ls -la ~/Documents" sailed through
# unblocked, because the tokenizer only checked tokens starting with "/" or following cd/pushd)

@test "denies a leading tilde path in Bash with no cd involved (the reported bypass)" {
    run bash -c "$SCRIPT" <<<"$(payload bash-tilde-home.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
    [[ "$output" == *"Documents"* ]]
}

@test "denies cd ~ (bare tilde) outside the project root" {
    run bash -c "$SCRIPT" <<<"$(payload bash-cd-tilde.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "denies ~username/... as unresolvable rather than silently allowing it" {
    run bash -c "$SCRIPT" <<<"$(payload bash-tilde-username.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
    [[ "$output" == *"could not resolve"* ]]
}

@test "denies a relative traversal outside the project root with no cd involved" {
    run bash -c "$SCRIPT" <<<"$(payload bash-relative-traversal-outside.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
    [[ "$output" == *"passwd"* ]]
}

@test "allows a relative traversal that lands back inside the project root" {
    run bash -c "$SCRIPT" <<<"$(payload bash-relative-traversal-inside.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "denies path-allowlist.json referenced via a differently-spelled relative path" {
    run bash -c "$SCRIPT" <<<"$(payload bash-path-allowlist-dotslash.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
    [[ "$output" == *"path-allowlist.json"* ]]
}

# --- protects path-allowlist.json itself from the agent -------------------------------------------

@test "denies Write to path-allowlist.json" {
    run bash -c "$SCRIPT" <<<"$(payload write-path-allowlist.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
    [[ "$output" == *"path-allowlist.json"* ]]
}

@test "denies Edit to path-allowlist.json" {
    run bash -c "$SCRIPT" <<<"$(payload edit-path-allowlist.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "allows Read of path-allowlist.json (not a secret, only Write/Edit are blocked)" {
    printf '{"paths":[]}' > "$FS_SCOPE_FILE"
    run bash -c "$SCRIPT" <<<"$(payload read-path-allowlist.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "denies referencing path-allowlist.json via Bash, even for a plain cat" {
    run bash -c "$SCRIPT" <<<"$(payload bash-cat-path-allowlist-relative.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
    [[ "$output" == *"path-allowlist.json"* ]]
}

# --- NotebookEdit -------------------------------------------------------------------------------
# Regression from a live pentest (2026-08-06): the real NotebookEdit tool_input field is
# "notebook_path", not "path". The script read ".tool_input.path" — a field that never exists in
# the real payload — so check_structured_path always received an empty raw_path and allowed every
# NotebookEdit call unconditionally, regardless of target. The fixtures below were previously
# written with the same wrong field name as the script, so this suite passed while the check was
# dead. Fixed in the script (now reads "notebook_path") and in these fixtures.

@test "denies NotebookEdit outside the project root" {
    run bash -c "$SCRIPT" <<<"$(payload notebookedit-outside.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "allows NotebookEdit inside the project root" {
    run bash -c "$SCRIPT" <<<"$(payload notebookedit-inside.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

# --- Glob (no documented path field in the hook payload) ----------------------------------------

@test "allows Glob with no path field (nothing to check)" {
    run bash -c "$SCRIPT" <<<"$(payload glob-no-path.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "denies Glob when a path field is present and resolves outside the project root" {
    run bash -c "$SCRIPT" <<<"$(payload glob-path-outside.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

# --- Grep (paths is an array) --------------------------------------------------------------------

@test "denies Grep when any entry in paths resolves outside the project root" {
    run bash -c "$SCRIPT" <<<"$(payload grep-paths-outside.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "allows Grep when every entry in paths is inside the project root" {
    run bash -c "$SCRIPT" <<<"$(payload grep-paths-inside.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

# --- implicit roots beyond the project itself ---------------------------------------------------

@test "allows Read inside this project's auto-memory directory" {
    printf 'x' > "$MEMORY_DIR/MEMORY.md"
    run bash -c "$SCRIPT" <<<"$(payload read-memory-dir.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows Write inside this session's scratchpad" {
    run bash -c "$SCRIPT" <<<"$(payload write-scratchpad.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

# --- path-allowlist.json extra paths ---------------------------------------------------------------

@test "denies a path outside root when path-allowlist.json is absent" {
    outside_dir="$BATS_TEST_TMPDIR/sibling"
    mkdir -p "$outside_dir"
    run bash -c "CLAUDE_PROJECT_DIR='$PROJECT_DIR' HOME='$HOME' CLAUDE_CODE_SESSION_ID='$CLAUDE_CODE_SESSION_ID' '$SCRIPT'" <<<"$(jq -n --arg cwd "$PROJECT_DIR" --arg fp "$outside_dir/note.txt" '{tool_name:"Read", cwd:$cwd, tool_input:{file_path:$fp}}')"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "allows a path outside root once it is listed in path-allowlist.json" {
    outside_dir="$BATS_TEST_TMPDIR/sibling"
    mkdir -p "$outside_dir"
    jq -n --arg p "$outside_dir" '{paths: [$p]}' > "$FS_SCOPE_FILE"
    run bash -c "CLAUDE_PROJECT_DIR='$PROJECT_DIR' HOME='$HOME' CLAUDE_CODE_SESSION_ID='$CLAUDE_CODE_SESSION_ID' '$SCRIPT'" <<<"$(jq -n --arg cwd "$PROJECT_DIR" --arg fp "$outside_dir/note.txt" '{tool_name:"Read", cwd:$cwd, tool_input:{file_path:$fp}}')"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "a malformed path-allowlist.json falls back to no extra paths, not to allow-everything" {
    outside_dir="$BATS_TEST_TMPDIR/sibling"
    mkdir -p "$outside_dir"
    printf '{not valid json' > "$FS_SCOPE_FILE"
    run bash -c "CLAUDE_PROJECT_DIR='$PROJECT_DIR' HOME='$HOME' CLAUDE_CODE_SESSION_ID='$CLAUDE_CODE_SESSION_ID' '$SCRIPT'" <<<"$(jq -n --arg cwd "$PROJECT_DIR" --arg fp "$outside_dir/note.txt" '{tool_name:"Read", cwd:$cwd, tool_input:{file_path:$fp}}')"
    [ "$status" -eq 0 ]
    deny_json "$output"

    # the project root itself must still work — malformed config degrades to "implicit roots
    # only", not to a broken guard.
    run bash -c "$SCRIPT" <<<"$(payload read-inside-root.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

# --- symlinks are resolved, not trusted at face value -------------------------------------------

@test "denies a symlink inside the project root that resolves outside it" {
    ln -s /etc "$PROJECT_DIR/escape-link"
    run bash -c "$SCRIPT" <<<"$(payload read-symlink-escape.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

# --- tools this guard doesn't apply to, and safety on missing/malformed input -------------------

@test "allows an unrelated tool (Agent)" {
    run bash -c "$SCRIPT" <<<"$(payload other-tool.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows when tool_input is absent" {
    run bash -c "$SCRIPT" <<<"$(payload missing-tool-input.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows when tool_name is absent" {
    run bash -c "$SCRIPT" <<<"$(payload missing-tool-name.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows (does not crash) when Bash tool_input.command is absent" {
    run bash -c "$SCRIPT" <<<"$(payload bash-missing-command.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows (does not crash) on malformed/truncated JSON" {
    run bash -c "$SCRIPT < '$FIXTURES/malformed.json'"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows (does not crash) on empty stdin" {
    run bash -c "$SCRIPT < '$FIXTURES/empty.json'"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows (does not crash, warns) when CLAUDE_PROJECT_DIR is unset" {
    run --separate-stderr bash -c "env -u CLAUDE_PROJECT_DIR HOME='$HOME' CLAUDE_CODE_SESSION_ID='$CLAUDE_CODE_SESSION_ID' '$SCRIPT'" <<<"$(payload read-outside-root.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
    [[ "$stderr" == *"CLAUDE_PROJECT_DIR not set"* ]]
}

# --- missing dependency: fails open, not closed -------------------------------------------------

@test "fails open with a stderr warning when jq is missing" {
    stripped_path_dir="$(mktemp -d)"
    for tool in bash env cat basename mktemp find rm realpath id tr sed; do
        link="$(command -v "$tool")"
        ln -s "$link" "$stripped_path_dir/$tool"
    done

    run --separate-stderr env PATH="$stripped_path_dir" HOME="$HOME" CLAUDE_PROJECT_DIR="$CLAUDE_PROJECT_DIR" CLAUDE_CODE_SESSION_ID="$CLAUDE_CODE_SESSION_ID" bash -c "$SCRIPT" <<<"$(payload read-outside-root.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
    [[ "$stderr" == *"missing required tool"* ]]
    [[ "$stderr" == *"jq"* ]]

    rm -r "$stripped_path_dir"
}

# --- known limitations of the Bash text scanner, confirmed by a live pentest (2026-08-06) --------
# This hook is a mechanical text scanner, not a shell parser — the header above already documents
# that quoting, $VAR expansion, and command substitution inside a Bash command string are not
# resolved. The two tests below are live-confirmed instances of that accepted blind spot, not
# regressions to fix: reproduced against the real script and the real shell, both let the literal
# outside-root path slip past the token scan while the shell itself resolved and used it for real.
# They exist so a future change to check_bash that alters this behavior does so consciously, not by
# accident. Decision on this session's pentest: document only, do not attempt to close these
# (closing them fully would require a real shell parser, which this hook deliberately isn't).

@test "KNOWN LIMITATION: an outside-root path glued inside a one-liner's inner literal is not caught" {
    # python3 -c "open('/etc/passwd').read()" — after whitespace-split and STRIP_CHARS strip the
    # quotes/parens, the token becomes "open/etc/passwd.read", which doesn't start with "/" and is
    # never recognized as an absolute path. The real interpreter still opens the real /etc/passwd.
    run bash -c "$SCRIPT" <<<"$(payload bash-glued-token-limitation.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "KNOWN LIMITATION: ANSI-C quoting (\$'...') hiding an escaped slash is not caught" {
    # cat \$'\x2fetc\x2fpasswd' — the token is scanned as literal text, never ANSI-C-decoded, so it
    # doesn't start with "/" and resolves harmlessly under cwd. The real bash decodes \x2f to "/"
    # before running cat, which then opens the real /etc/passwd.
    run bash -c "$SCRIPT" <<<"$(payload bash-ansi-c-quoting-limitation.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

# --- invocation context --------------------------------------------------------------------------

@test "runs correctly from an unrelated working directory" {
    run bash -c "cd /tmp && CLAUDE_PROJECT_DIR='$CLAUDE_PROJECT_DIR' HOME='$HOME' CLAUDE_CODE_SESSION_ID='$CLAUDE_CODE_SESSION_ID' '$SCRIPT'" <<<"$(payload read-outside-root.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
}
