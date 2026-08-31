#!/usr/bin/env bats
#
# Covers enforce-git-allowlist.sh — the opt-in PreToolUse guard that denies any
# Bash-invoked git subcommand with no rule for it in this session's git-allowlist.json, plus any
# Write/Edit/NotebookEdit/Bash call that touches that config file itself.
#
# git-allowlist.json is keyed by subcommand name, each value the rule enforced for it (requireFlag,
# requireAnyFlag, forbidLongFlags, forbidShortFlags, forbidTokenPrefix, verbRule — see the script's
# own header comment) — a genuine allowlist, not a name-only flag in front of hardcoded rules: the
# rule itself is data, so this suite constructs a rule object per test instead of a flat list of
# enabled names.
#
# git-allowlist.json's location is derived from the script's own directory ($0's dirname), not
# from CLAUDE_PROJECT_DIR — see the header of enforce-git-allowlist.sh. To keep this suite
# isolated from the real repo's real git-allowlist.json (which lives beside the real script),
# every test runs against a symlink to the real script placed inside a fake hook directory under a
# fake project, mirroring the real .claude/hooks/enforce-git-allowlist/ layout and the same
# isolation technique enforce-path-allowlist.bats already uses. $0's dirname then resolves
# inside the fake project, exactly as it would in production, without ever touching the real
# git-allowlist.json.
#
# Most fixtures carry no "cwd" field — the script defaults a missing cwd to "." for the
# Bash-vs-git-allowlist.json token scan, and none of the plain git command tokens below ever
# resolve to the fake git-allowlist.json path, so this default never produces a false positive.
# Tests that specifically target git-allowlist.json protection build their payload inline instead
# of via a static fixture, since they need the real fake path baked in.

bats_require_minimum_version 1.5.0

setup() {
    REAL_SCRIPT="$BATS_TEST_DIRNAME/../enforce-git-allowlist.sh"
    FIXTURES="$BATS_TEST_DIRNAME/fixtures"

    FAKE_HOME="$BATS_TEST_TMPDIR/home"
    PROJECT_DIR="$BATS_TEST_TMPDIR/project"
    mkdir -p "$PROJECT_DIR/.claude"

    FAKE_HOOK_DIR="$PROJECT_DIR/.claude/hooks/enforce-git-allowlist"
    mkdir -p "$FAKE_HOOK_DIR"
    SCRIPT="$FAKE_HOOK_DIR/enforce-git-allowlist.sh"
    ln -s "$REAL_SCRIPT" "$SCRIPT"

    GIT_ALLOWLIST_FILE="$FAKE_HOOK_DIR/git-allowlist.json"

    export HOME="$FAKE_HOME"
    export CLAUDE_PROJECT_DIR="$PROJECT_DIR"
}

payload() {
    cat "$FIXTURES/$1"
}

deny_json() {
    jq -e '.hookSpecificOutput.permissionDecision == "deny"' <<<"$1" >/dev/null
}

# Writes the given JSON object literal (one rule per subcommand key) to the fake
# git-allowlist.json.
enable_rules() {
    printf '%s' "$1" > "$GIT_ALLOWLIST_FILE"
}

# Rule constants shared across tests, matching exactly what this hook enforced before the rules
# moved from hardcoded per-subcommand code into git-allowlist.json itself.
COMMIT_RULE='"commit": {"forbidLongFlags": ["--amend", "--no-verify"], "forbidShortFlags": ["n"]}'
PUSH_RULE='"push": {"forbidLongFlags": ["--force", "--force-with-lease", "--force-if-includes", "--delete", "--mirror", "--prune"], "forbidShortFlags": ["f", "d"], "forbidTokenPrefix": ":"}'
BRANCH_RULE='"branch": {"forbidLongFlags": ["--delete", "--move"], "forbidShortFlags": ["d", "D", "m", "M"]}'
SWITCH_RULE='"switch": {"forbidLongFlags": ["--force", "--force-create", "--discard-changes"], "forbidShortFlags": ["f", "C"]}'
RESTORE_RULE='"restore": {"requireFlag": "--staged"}'
STASH_RULE='"stash": {"verbRule": {"bareAllowed": true, "allowedVerbs": ["push", "pop", "list", "show", "apply"], "flagImpliesAllowed": true}}'
REMOTE_RULE='"remote": {"verbRule": {"bareAllowed": true, "allowedVerbs": ["-v", "--verbose", "show"], "flagImpliesAllowed": false}}'
CONFIG_RULE='"config": {"requireAnyFlag": ["--get", "--get-all", "--list", "-l"]}'
FETCH_RULE='"fetch": {"forbidLongFlags": ["--force", "--prune"], "forbidShortFlags": ["f", "p"]}'
PULL_RULE='"pull": {"forbidLongFlags": ["--force", "--rebase"], "forbidShortFlags": ["f", "r"]}'
RM_RULE='"rm": {"requireFlag": "--cached"}'

# --- denied by default: nothing is enabled until a human writes git-allowlist.json --------------

@test "denies git status when git-allowlist.json does not exist" {
    run bash -c "$SCRIPT" <<<"$(payload status.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
    [[ "$output" == *"not enabled"* ]]
}

@test "denies git commit when git-allowlist.json is an empty object" {
    enable_rules '{}'
    run bash -c "$SCRIPT" <<<"$(payload commit-normal.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "a malformed git-allowlist.json falls back to nothing enabled, not to allow-everything" {
    printf '{not valid json' > "$GIT_ALLOWLIST_FILE"
    run bash -c "$SCRIPT" <<<"$(payload status.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "a subcommand absent from git-allowlist.json stays denied (reset never had a rule written for it)" {
    enable_rules '{"status": {}}'
    run bash -c "$SCRIPT" <<<"$(payload reset-hard.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
    [[ "$output" == *"reset"* ]]
}

# --- generic engine: a rule works for a name this script has never seen, purely from data -------

@test "a subcommand this script has no built-in knowledge of works from a requireFlag rule alone" {
    enable_rules '{"frobnicate": {"requireFlag": "--safe-flag"}}'
    run bash -c "$SCRIPT" <<<"$(payload fabricated-subcommand-flag.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "the same fabricated subcommand is denied when its required flag is missing" {
    enable_rules '{"frobnicate": {"requireFlag": "--safe-flag"}}'
    run bash -c "$SCRIPT" <<<"$(payload fabricated-subcommand-no-flag.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "an empty rule ({}) for a fabricated subcommand is unrestricted once enabled" {
    enable_rules '{"frobnicate": {}}'
    run bash -c "$SCRIPT" <<<"$(payload fabricated-subcommand-no-flag.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "a deliberately written rule for a historically-hardcoded-denied subcommand (reset) is honored" {
    enable_rules '{"reset": {"forbidLongFlags": ["--hard"]}}'
    run bash -c "$SCRIPT" <<<"$(payload reset-hard.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
    [[ "$output" == *"--hard"* ]]
}

# --- rm: the case that motivated this redesign ---------------------------------------------------

@test "allows git rm --cached once enabled" {
    enable_rules "{$RM_RULE}"
    run bash -c "$SCRIPT" <<<"$(payload rm-cached.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "denies git rm without --cached even once enabled" {
    enable_rules "{$RM_RULE}"
    run bash -c "$SCRIPT" <<<"$(payload rm-no-cached.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
    [[ "$output" == *"--cached"* ]]
}

# --- allowed once enabled: read-only and unrestricted subcommands -------------------------------

@test "allows git status once enabled" {
    enable_rules '{"status": {}}'
    run bash -c "$SCRIPT" <<<"$(payload status.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows a plain git commit once enabled" {
    enable_rules "{$COMMIT_RULE}"
    run bash -c "$SCRIPT" <<<"$(payload commit-normal.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows a non-force git push once enabled" {
    enable_rules "{$PUSH_RULE}"
    run bash -c "$SCRIPT" <<<"$(payload push-normal.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows switching branches with git switch once enabled" {
    enable_rules "{$SWITCH_RULE}"
    run bash -c "$SCRIPT" <<<"$(payload switch-normal.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows listing/creating with git branch once enabled" {
    enable_rules "{$BRANCH_RULE}"
    run bash -c "$SCRIPT" <<<"$(payload branch-list.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows git restore --staged once enabled" {
    enable_rules "{$RESTORE_RULE}"
    run bash -c "$SCRIPT" <<<"$(payload restore-staged.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows git rev-list once enabled" {
    enable_rules '{"rev-list": {}}'
    run bash -c "$SCRIPT" <<<"$(payload rev-list-normal.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows git stash push once enabled" {
    enable_rules "{$STASH_RULE}"
    run bash -c "$SCRIPT" <<<"$(payload stash-push.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows git remote -v once enabled" {
    enable_rules "{$REMOTE_RULE}"
    run bash -c "$SCRIPT" <<<"$(payload remote-verbose.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows git config --get once enabled" {
    enable_rules "{$CONFIG_RULE}"
    run bash -c "$SCRIPT" <<<"$(payload config-get.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows plain git pull once enabled" {
    enable_rules "{$PULL_RULE}"
    run bash -c "$SCRIPT" <<<"$(payload pull-normal.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows an unrelated non-git Bash command with no git-allowlist.json at all" {
    run bash -c "$SCRIPT" <<<"$(payload non-git-command.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows rm outside any git context with no git-allowlist.json at all (guard only inspects git invocations)" {
    run bash -c "$SCRIPT" <<<"$(payload unrelated-rm.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows a chain of two allowlisted git invocations once both are enabled" {
    enable_rules "{\"add\": {}, $COMMIT_RULE}"
    run bash -c "$SCRIPT" <<<"$(payload chained-both-safe.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows git clone once enabled" {
    enable_rules '{"clone": {}}'
    run bash -c "$SCRIPT" <<<"$(payload clone-normal.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows git merge once enabled" {
    enable_rules '{"merge": {}}'
    run bash -c "$SCRIPT" <<<"$(payload merge-normal.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows git cherry-pick once enabled" {
    enable_rules '{"cherry-pick": {}}'
    run bash -c "$SCRIPT" <<<"$(payload cherry-pick-normal.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows git worktree add once enabled (unrestricted, including -b and a custom path)" {
    enable_rules '{"worktree": {}}'
    run bash -c "$SCRIPT" <<<"$(payload worktree-add.json)"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

# --- denied: subcommands with no rule written, regardless of what else is enabled ---------------

@test "denies git reset --hard even with everything else enabled" {
    enable_rules "{\"status\": {}, \"diff\": {}, \"log\": {}, \"add\": {}, $COMMIT_RULE, $PUSH_RULE}"
    run bash -c "$SCRIPT" <<<"$(payload reset-hard.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
    [[ "$output" == *"reset"* ]]
}

@test "denies git checkout entirely (path-vs-branch ambiguity, no rule shape can gate it safely)" {
    enable_rules "{\"status\": {}, \"diff\": {}, \"log\": {}, \"add\": {}, $COMMIT_RULE, $PUSH_RULE}"
    run bash -c "$SCRIPT" <<<"$(payload checkout-path.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "denies git rebase" {
    enable_rules "{\"status\": {}, \"diff\": {}, \"log\": {}, \"add\": {}, $COMMIT_RULE, $PUSH_RULE}"
    run bash -c "$SCRIPT" <<<"$(payload rebase-unlisted.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "denies git clean" {
    enable_rules "{\"status\": {}, \"diff\": {}, \"log\": {}, \"add\": {}, $COMMIT_RULE, $PUSH_RULE}"
    run bash -c "$SCRIPT" <<<"$(payload clean-unlisted.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

# --- denied: allowlisted subcommand, forbidden flag ----------------------------------------------

@test "denies git commit --amend even once commit is enabled" {
    enable_rules "{$COMMIT_RULE}"
    run bash -c "$SCRIPT" <<<"$(payload commit-amend.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
    [[ "$output" == *"amend"* ]]
}

@test "denies git commit -n (short for --no-verify) even once commit is enabled" {
    enable_rules "{$COMMIT_RULE}"
    run bash -c "$SCRIPT" <<<"$(payload commit-no-verify.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "denies git push --force even once push is enabled" {
    enable_rules "{$PUSH_RULE}"
    run bash -c "$SCRIPT" <<<"$(payload push-force-long.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
    [[ "$output" == *"force"* ]]
}

@test "denies git push -f even once push is enabled" {
    enable_rules "{$PUSH_RULE}"
    run bash -c "$SCRIPT" <<<"$(payload push-force-short.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "denies git push with a delete refspec even once push is enabled" {
    enable_rules "{$PUSH_RULE}"
    run bash -c "$SCRIPT" <<<"$(payload push-delete-refspec.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
    [[ "$output" == *":feature-x"* ]]
}

@test "denies git switch --force even once switch is enabled" {
    enable_rules "{$SWITCH_RULE}"
    run bash -c "$SCRIPT" <<<"$(payload switch-force.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "denies git branch -D even once branch is enabled" {
    enable_rules "{$BRANCH_RULE}"
    run bash -c "$SCRIPT" <<<"$(payload branch-delete-force.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "denies git restore without --staged even once restore is enabled" {
    enable_rules "{$RESTORE_RULE}"
    run bash -c "$SCRIPT" <<<"$(payload restore-no-staged.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
    [[ "$output" == *"--staged"* ]]
}

@test "denies git stash drop even once stash is enabled" {
    enable_rules "{$STASH_RULE}"
    run bash -c "$SCRIPT" <<<"$(payload stash-drop.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "denies git remote add even once remote is enabled" {
    enable_rules "{$REMOTE_RULE}"
    run bash -c "$SCRIPT" <<<"$(payload remote-add.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "denies git config in set form even once config is enabled (no read flag present)" {
    enable_rules "{$CONFIG_RULE}"
    run bash -c "$SCRIPT" <<<"$(payload config-set.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "denies git fetch --prune even once fetch is enabled" {
    enable_rules "{$FETCH_RULE}"
    run bash -c "$SCRIPT" <<<"$(payload fetch-prune.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "denies git pull --rebase even once pull is enabled" {
    enable_rules "{$PULL_RULE}"
    run bash -c "$SCRIPT" <<<"$(payload pull-rebase.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

# --- denied: destructive invocation buried in a chain of otherwise-safe commands ----------------

@test "denies a chain ending in git push --force after a safe git status, even with both enabled" {
    enable_rules "{\"status\": {}, $PUSH_RULE}"
    run bash -c "$SCRIPT" <<<"$(payload chained-safe-then-force.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
    [[ "$output" == *"force"* ]]
}

@test "denies a chain of two safe git calls followed by git branch -D, even with status/add/branch enabled" {
    enable_rules "{\"status\": {}, \"add\": {}, $BRANCH_RULE}"
    run bash -c "$SCRIPT" <<<"$(payload chained-safe-safe-destructive.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "denies a chain where the first call is git status and status is not enabled" {
    enable_rules "{\"add\": {}, $BRANCH_RULE}"
    run bash -c "$SCRIPT" <<<"$(payload chained-safe-safe-destructive.json)"
    [ "$status" -eq 0 ]
    deny_json "$output"
    [[ "$output" == *"status"* ]]
}

# --- protects git-allowlist.json itself from the agent -------------------------------------------

@test "denies Write to git-allowlist.json" {
    local payload_json
    payload_json=$(jq -n --arg fp "$GIT_ALLOWLIST_FILE" '{tool_name:"Write",tool_input:{file_path:$fp}}')
    run bash -c "$SCRIPT" <<<"$payload_json"
    [ "$status" -eq 0 ]
    deny_json "$output"
    [[ "$output" == *"git-allowlist.json"* ]]
}

@test "denies Edit to git-allowlist.json" {
    local payload_json
    payload_json=$(jq -n --arg fp "$GIT_ALLOWLIST_FILE" '{tool_name:"Edit",tool_input:{file_path:$fp}}')
    run bash -c "$SCRIPT" <<<"$payload_json"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "denies NotebookEdit to git-allowlist.json" {
    local payload_json
    payload_json=$(jq -n --arg fp "$GIT_ALLOWLIST_FILE" '{tool_name:"NotebookEdit",tool_input:{notebook_path:$fp}}')
    run bash -c "$SCRIPT" <<<"$payload_json"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "allows Read of git-allowlist.json (not covered by this guard's matcher)" {
    enable_rules '{"status": {}}'
    local payload_json
    payload_json=$(jq -n --arg fp "$GIT_ALLOWLIST_FILE" '{tool_name:"Read",tool_input:{file_path:$fp}}')
    run bash -c "$SCRIPT" <<<"$payload_json"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "denies referencing git-allowlist.json via Bash with a relative path, even for a plain cat" {
    local payload_json
    payload_json=$(jq -n --arg cwd "$FAKE_HOOK_DIR" '{tool_name:"Bash",tool_input:{command:"cat git-allowlist.json"},cwd:$cwd}')
    run bash -c "$SCRIPT" <<<"$payload_json"
    [ "$status" -eq 0 ]
    deny_json "$output"
    [[ "$output" == *"git-allowlist.json"* ]]
}

@test "denies referencing git-allowlist.json via Bash with its resolved absolute path" {
    local payload_json
    payload_json=$(jq -n --arg cmd "rm -f $GIT_ALLOWLIST_FILE" '{tool_name:"Bash",tool_input:{command:$cmd}}')
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
    # A PATH with everything the script needs (bash itself for the shebang, tr, basename, cat,
    # realpath) except jq — not an empty PATH, which would also break the shebang lookup itself
    # and fail the test for the wrong reason.
    local fake_path="$BATS_TEST_TMPDIR/no-jq-path"
    mkdir -p "$fake_path"
    local bin
    for bin in bash tr basename cat realpath; do
        ln -sf "$(command -v "$bin")" "$fake_path/$bin"
    done

    # stdout must carry no deny JSON; the "missing jq" notice on stderr is expected and is fine
    # to appear in bats' combined $output.
    run env PATH="$fake_path" bash -c "$SCRIPT" <<<"$(payload push-force-long.json)"
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

    run env PATH="$fake_path" bash -c "$SCRIPT" <<<"$(payload push-force-long.json)"
    [ "$status" -eq 0 ]
    [[ "$output" != *"permissionDecision"* ]]
}
