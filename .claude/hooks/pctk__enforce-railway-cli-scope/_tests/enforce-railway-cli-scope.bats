#!/usr/bin/env bats
#
# Covers enforce-railway-cli-scope.sh — the unconditional PreToolUse guard that denies any direct
# Bash invocation of the railway CLI binary (bare, via npx/npm exec, or by path), plus any
# Write/Edit/NotebookEdit/Bash call that touches the railway-safe-cli tool's own
# command-allowlist.json.
#
# Unlike enforce-git-allowlist.sh, there is no per-subcommand rule engine here: direct Bash access
# to the railway binary is never allowed, full stop — the only sanctioned path is the
# railway-safe-cli MCP tool. This suite therefore has no "enable_rules" step for the CLI-bypass
# checks; only the command-allowlist.json protection tests need to know the file's resolved path.
#
# command-allowlist.json's location is derived from the script's own directory (two levels up,
# then into mcp/pctk__default/src/tools/railway-safe-cli/), not from CLAUDE_PROJECT_DIR — see the
# header of enforce-railway-cli-scope.sh. Every test runs against a symlink to the real script
# placed inside a fake hook directory under a fake project, with the same
# mcp/pctk__default/src/tools/railway-safe-cli/ tree recreated alongside it, mirroring the
# isolation technique enforce-git-allowlist.bats already uses.

bats_require_minimum_version 1.5.0

setup() {
    REAL_SCRIPT="$BATS_TEST_DIRNAME/../enforce-railway-cli-scope.sh"
    FIXTURES="$BATS_TEST_DIRNAME/fixtures"

    PROJECT_DIR="$BATS_TEST_TMPDIR/project"
    mkdir -p "$PROJECT_DIR/.claude"

    FAKE_HOOK_DIR="$PROJECT_DIR/.claude/hooks/pctk__enforce-railway-cli-scope"
    mkdir -p "$FAKE_HOOK_DIR"
    SCRIPT="$FAKE_HOOK_DIR/enforce-railway-cli-scope.sh"
    ln -s "$REAL_SCRIPT" "$SCRIPT"

    FAKE_TOOL_DIR="$PROJECT_DIR/.claude/mcp/pctk__default/src/tools/railway-safe-cli"
    mkdir -p "$FAKE_TOOL_DIR"
    RAILWAY_ALLOWLIST_FILE="$FAKE_TOOL_DIR/command-allowlist.json"

    export CLAUDE_PROJECT_DIR="$PROJECT_DIR"
}

payload() {
    cat "$FIXTURES/$1"
}

deny_json() {
    jq -e '.hookSpecificOutput.permissionDecision == "deny"' <<<"$1" >/dev/null
}

# --- blocks any direct railway CLI invocation, unconditionally, with no config at all -----------

@test "denies a bare railway invocation" {
    run bash -c "$SCRIPT" <<<"$(payload railway-status.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
    [[ "$output" == *"railway-safe-cli"* ]]
}

@test "denies railway invoked via npx @railway/cli" {
    run bash -c "$SCRIPT" <<<"$(payload npx-railway-cli.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "denies railway invoked by an absolute path" {
    run bash -c "$SCRIPT" <<<"$(payload absolute-path-railway.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "denies a chained command where the second segment invokes railway" {
    local payload_json
    payload_json=$(jq -n '{tool_name:"Bash",tool_input:{command:"echo hi && railway status"}}')
    run bash -c "$SCRIPT" <<<"$payload_json"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "allows an unrelated Bash command with no mention of railway" {
    run bash -c "$SCRIPT" <<<"$(payload unrelated-command.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows a command whose path merely contains 'railway' as part of a longer name (railway-safe-cli)" {
    run bash -c "$SCRIPT" <<<"$(payload mentions-railway-in-unrelated-path.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

# --- protects command-allowlist.json itself from the agent ---------------------------------------

@test "denies Write to command-allowlist.json" {
    local payload_json
    payload_json=$(jq -n --arg fp "$RAILWAY_ALLOWLIST_FILE" '{tool_name:"Write",tool_input:{file_path:$fp}}')
    run bash -c "$SCRIPT" <<<"$payload_json"
    [ "$status" -eq 0 ]
    deny_json "$output"
    [[ "$output" == *"command-allowlist.json"* ]]
}

@test "denies Edit to command-allowlist.json" {
    local payload_json
    payload_json=$(jq -n --arg fp "$RAILWAY_ALLOWLIST_FILE" '{tool_name:"Edit",tool_input:{file_path:$fp}}')
    run bash -c "$SCRIPT" <<<"$payload_json"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "denies NotebookEdit to command-allowlist.json" {
    local payload_json
    payload_json=$(jq -n --arg fp "$RAILWAY_ALLOWLIST_FILE" '{tool_name:"NotebookEdit",tool_input:{notebook_path:$fp}}')
    run bash -c "$SCRIPT" <<<"$payload_json"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "allows Read of command-allowlist.json (not covered by this guard's matcher)" {
    local payload_json
    payload_json=$(jq -n --arg fp "$RAILWAY_ALLOWLIST_FILE" '{tool_name:"Read",tool_input:{file_path:$fp}}')
    run bash -c "$SCRIPT" <<<"$payload_json"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "denies referencing command-allowlist.json via Bash with a relative path, even for a plain cat" {
    local payload_json
    payload_json=$(jq -n --arg cwd "$FAKE_TOOL_DIR" '{tool_name:"Bash",tool_input:{command:"cat command-allowlist.json"},cwd:$cwd}')
    run bash -c "$SCRIPT" <<<"$payload_json"
    [ "$status" -eq 0 ]
    deny_json "$output"
    [[ "$output" == *"command-allowlist.json"* ]]
}

@test "denies referencing command-allowlist.json via Bash with its resolved absolute path" {
    local payload_json
    payload_json=$(jq -n --arg cmd "rm -f $RAILWAY_ALLOWLIST_FILE" '{tool_name:"Bash",tool_input:{command:$cmd}}')
    run bash -c "$SCRIPT" <<<"$payload_json"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

# --- tools this guard doesn't apply to, and safety on missing/malformed input --------------------

@test "ignores a Read call entirely" {
    run bash -c "$SCRIPT" <<<"$(payload non-bash-tool.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows when tool_name is missing" {
    run bash -c "$SCRIPT" <<<"$(payload missing-tool-name.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows on malformed JSON input (fails open)" {
    run bash -c "$SCRIPT" <<<"$(payload malformed.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows an empty command" {
    run bash -c "$SCRIPT" <<<"$(payload empty-command.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows when tool_input is missing" {
    run bash -c "$SCRIPT" <<<"$(payload missing-tool-input.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "fails open when jq is unavailable" {
    local fake_path="$BATS_TEST_TMPDIR/no-jq-path"
    mkdir -p "$fake_path"
    local bin
    for bin in bash tr basename cat realpath; do
        ln -sf "$(command -v "$bin")" "$fake_path/$bin"
    done

    run env PATH="$fake_path" bash -c "$SCRIPT" <<<"$(payload railway-status.json)"
    [ "$status" -eq 0 ]
    [[ "$output" != *"permissionDecision"* ]]
}

@test "fails open when realpath is unavailable" {
    local fake_path="$BATS_TEST_TMPDIR/no-realpath-path"
    mkdir -p "$fake_path"
    local bin
    for bin in bash tr basename cat jq; do
        ln -sf "$(command -v "$bin")" "$fake_path/$bin"
    done

    run env PATH="$fake_path" bash -c "$SCRIPT" <<<"$(payload railway-status.json)"
    [ "$status" -eq 0 ]
    [[ "$output" != *"permissionDecision"* ]]
}
