#!/usr/bin/env bats
#
# Covers enforce-safe-credentials.sh's own logic — JSON parsing off stdin, the .env pattern match,
# the .env.example/.env.sample allowlist, AWS/.aws, Azure/.azure, and gcloud/.config/gcloud path
# matching, GCP service-account key filename matching, private cert/key extension matching,
# missing-dependency fail-open, and malformed-input safety. Fixtures live under _tests/fixtures/
# rather than heredoc'd inline.
#
# Covers the Bash-tool path too: the same credential-path patterns, scanned out of
# tool_input.command (free text) instead of the Read tool's structured tool_input.file_path.
#
# Covers Write/Edit as well as Read: every pattern above is enforced on write, not just read.
#
# Tests prefixed "BYPASS:" document a gap that currently succeeds (the hook ALLOWS a call that
# reaches the same credential content a blocked call would) — they exist to make the gap visible
# and regression-detectable, not because the gap is expected to close on its own. Tests prefixed
# "CONTROL:" sit right next to a bypass to mark the exact boundary where the same technique, with
# one small difference (e.g. a space), IS caught.

bats_require_minimum_version 1.5.0

setup() {
    SCRIPT="$BATS_TEST_DIRNAME/../enforce-safe-credentials.sh"
    FIXTURES="$BATS_TEST_DIRNAME/fixtures"
}

deny_json() {
    jq -e '.hookSpecificOutput.permissionDecision == "deny"' <<<"$1" >/dev/null
}

# --- blocks .env-family files -------------------------------------------------------------------

@test "blocks .env" {
    run bash -c "$SCRIPT < '$FIXTURES/read-env.json'"
    [ "$status" -eq 0 ]
    deny_json "$output"
    [[ "$output" == *".env"* ]]
}

@test "blocks .env.local (dotted suffix)" {
    run bash -c "$SCRIPT < '$FIXTURES/read-env-local.json'"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "blocks .env with trailing slash in path (basename strips it)" {
    run bash -c "$SCRIPT < '$FIXTURES/read-env-trailing-slash.json'"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "blocks .env inside a directory with spaces" {
    run bash -c "$SCRIPT < '$FIXTURES/read-env-spaces-dir.json'"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "blocks .env inside a directory with unicode/emoji names" {
    run bash -c "$SCRIPT < '$FIXTURES/read-env-unicode-dir.json'"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "deny reason names the exact basename for .env" {
    run bash -c "$SCRIPT < '$FIXTURES/read-env-local.json'"
    [[ "$output" == *".env.local"* ]]
}

@test "allows .env.example" {
    run bash -c "$SCRIPT < '$FIXTURES/read-env-example.json'"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows .env.sample" {
    run bash -c "$SCRIPT < '$FIXTURES/read-env-sample.json'"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows .environment (not a dotted-suffix match on .env)" {
    run bash -c "$SCRIPT < '$FIXTURES/read-dotenvironment.json'"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows myapp.env (.env is a suffix, not the whole basename)" {
    run bash -c "$SCRIPT < '$FIXTURES/read-myapp-env-suffix.json'"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows .ENV (match is case-sensitive, matching the original script's behavior)" {
    run bash -c "$SCRIPT < '$FIXTURES/read-env-uppercase.json'"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

# --- blocks AWS credentials/config -----------------------------------------------------------

@test "blocks ~/.aws/credentials" {
    run bash -c "$SCRIPT < '$FIXTURES/read-aws-credentials.json'"
    [ "$status" -eq 0 ]
    deny_json "$output"
    [[ "$output" == *"AWS"* ]]
}

@test "blocks ~/.aws/config" {
    run bash -c "$SCRIPT < '$FIXTURES/read-aws-config.json'"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "blocks a nested file under .aws (e.g. cli/cache token cache)" {
    run bash -c "$SCRIPT < '$FIXTURES/read-aws-nested-cache.json'"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "allows a directory that merely starts with 'aws' but isn't '.aws'" {
    run bash -c "$SCRIPT < '$FIXTURES/read-aws-lookalike-dir.json'"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows a file literally named credentials.txt outside .aws" {
    run bash -c "$SCRIPT < '$FIXTURES/read-credentials-outside-aws.json'"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

# --- blocks Azure credentials/config ---------------------------------------------------------

@test "blocks ~/.azure/azureProfile.json" {
    run bash -c "$SCRIPT < '$FIXTURES/read-azure-profile.json'"
    [ "$status" -eq 0 ]
    deny_json "$output"
    [[ "$output" == *"Azure"* ]]
}

@test "blocks ~/.azure/accessTokens.json" {
    run bash -c "$SCRIPT < '$FIXTURES/read-azure-tokens.json'"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

# --- blocks gcloud credentials/config ---------------------------------------------------------

@test "blocks ~/.config/gcloud/application_default_credentials.json" {
    run bash -c "$SCRIPT < '$FIXTURES/read-gcloud-adc.json'"
    [ "$status" -eq 0 ]
    deny_json "$output"
    [[ "$output" == *"gcloud"* ]]
}

@test "blocks a nested file under .config/gcloud (legacy_credentials)" {
    run bash -c "$SCRIPT < '$FIXTURES/read-gcloud-legacy-creds.json'"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

# --- blocks GCP service-account key files anywhere ---------------------------------------------

@test "blocks a *-service-account-key.json file outside gcloud's own directory" {
    run bash -c "$SCRIPT < '$FIXTURES/read-gcp-service-account-key.json'"
    [ "$status" -eq 0 ]
    deny_json "$output"
    [[ "$output" == *"service-account"* ]]
}

@test "blocks service_account.json (underscore variant)" {
    run bash -c "$SCRIPT < '$FIXTURES/read-gcp-service-underscore-account-key.json'"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

# --- blocks private certificate/key files -------------------------------------------------------

@test "blocks a .pfx file" {
    run bash -c "$SCRIPT < '$FIXTURES/read-cert-pfx.json'"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "blocks a .p12 file" {
    run bash -c "$SCRIPT < '$FIXTURES/read-cert-p12.json'"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "blocks a .pem file" {
    run bash -c "$SCRIPT < '$FIXTURES/read-cert-pem.json'"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "blocks a .key file" {
    run bash -c "$SCRIPT < '$FIXTURES/read-cert-key.json'"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "blocks a .jks file" {
    run bash -c "$SCRIPT < '$FIXTURES/read-cert-jks.json'"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "blocks a .keystore file" {
    run bash -c "$SCRIPT < '$FIXTURES/read-cert-keystore.json'"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "blocks a .PFX file (extension match is case-insensitive)" {
    run bash -c "$SCRIPT < '$FIXTURES/read-cert-pfx-uppercase.json'"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "allows a public .crt certificate (not in the private-key extension list)" {
    run bash -c "$SCRIPT < '$FIXTURES/read-public-cert.json'"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

# --- BYPASS: no symlink/hardlink resolution anywhere in classify_path ---------------------------
#
# classify_path only ever looks at the literal path string handed to it. It never calls realpath
# or resolves a link, so a credential file exposed under an unrelated name via a symlink or hard
# link is invisible to it — the Read tool itself still follows the link and returns the real
# content. These build real files under a throwaway tmpdir since the gap is about actual link
# resolution, not string matching, so a static fixture can't express it.

@test "BYPASS: Read via a symlink to a .env file is not detected (link's own basename is clean)" {
    tmpdir="$(mktemp -d)"
    printf 'SECRET=leaked\n' > "$tmpdir/.env"
    ln -s "$tmpdir/.env" "$tmpdir/notes.txt"
    payload=$(jq -n --arg fp "$tmpdir/notes.txt" '{tool_name:"Read", tool_input:{file_path:$fp}}')

    run bash -c "$SCRIPT <<< '$payload'"
    rm -rf "$tmpdir"

    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "BYPASS: Read via a hard link to a .env file is not detected (same gap, different link type)" {
    tmpdir="$(mktemp -d)"
    printf 'SECRET=leaked\n' > "$tmpdir/.env"
    ln "$tmpdir/.env" "$tmpdir/report.txt"
    payload=$(jq -n --arg fp "$tmpdir/report.txt" '{tool_name:"Read", tool_input:{file_path:$fp}}')

    run bash -c "$SCRIPT <<< '$payload'"
    rm -rf "$tmpdir"

    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "CONTROL: a .. path segment before .env is still blocked (basename normalizes it)" {
    run bash -c "$SCRIPT < '$FIXTURES/read-traversal-dotdot-env.json'"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

# --- correctly ignores unrelated files ------------------------------------------------------

@test "allows an unrelated file" {
    run bash -c "$SCRIPT < '$FIXTURES/read-normal-file.json'"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

# --- blocks Write/Edit as well as Read -----------------------------------------------------------

@test "blocks Write to a .env-family file" {
    run bash -c "$SCRIPT < '$FIXTURES/write-env.json'"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

# --- Bash tool: same credential-path patterns, scanned out of free-text command -----------------

@test "blocks 'cat .env' run via Bash" {
    run bash -c "$SCRIPT < '$FIXTURES/bash-cat-env.json'"
    [ "$status" -eq 0 ]
    deny_json "$output"
    [[ "$output" == *".env"* ]]
    [[ "$output" == *"Bash"* ]]
}

@test "blocks 'cat .env; echo done' — trailing semicolon doesn't hide the token" {
    run bash -c "$SCRIPT < '$FIXTURES/bash-cat-env-semicolon.json'"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "blocks 'cat ~/.aws/credentials' run via Bash" {
    run bash -c "$SCRIPT < '$FIXTURES/bash-cat-aws-credentials.json'"
    [ "$status" -eq 0 ]
    deny_json "$output"
    [[ "$output" == *"AWS"* ]]
}

@test "blocks a piped 'cat ./certs/server.pem | base64' run via Bash" {
    run bash -c "$SCRIPT < '$FIXTURES/bash-cat-cert-pem.json'"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "allows 'cat .env.example' run via Bash" {
    run bash -c "$SCRIPT < '$FIXTURES/bash-cat-env-example.json'"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows an unrelated Bash command" {
    run bash -c "$SCRIPT < '$FIXTURES/bash-cat-normal-file.json'"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows a Bash command with no credential-looking token" {
    run bash -c "$SCRIPT < '$FIXTURES/bash-grep-across-files.json'"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows (does not crash) when tool_input.command is absent for a Bash call" {
    run bash -c "$SCRIPT < '$FIXTURES/bash-missing-command.json'"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "does not glob-expand a wildcard in the scanned command against the hook's own cwd" {
    glob_tmpdir="$(mktemp -d)"
    touch "$glob_tmpdir/.env"

    # The scanned command is literally "cat .*" — if tokenizing ever re-enables globbing, this
    # expands against glob_tmpdir's real .env file and the hook would (wrongly) deny. Left
    # literal, ".*" doesn't match the exact-basename .env check, so the correct behavior is allow.
    run bash -c "cd '$glob_tmpdir' && '$SCRIPT' < '$FIXTURES/bash-cat-dotstar-glob.json'"
    rm -rf "$glob_tmpdir"

    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

# --- BYPASS: Bash tokenizer gaps beyond globbing — the script's own header comment admits
# quoting, variable expansion, and command substitution aren't resolved. Each test below is one
# concrete way an agent could exploit that, still reaching real credential content in an actual
# shell even though the token the hook sees never spells out a matching basename.

@test "BYPASS: splitting an .aws path across a variable assignment hides the telltale substring" {
    run bash -c "$SCRIPT < '$FIXTURES/bash-var-indirection.json'"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "BYPASS: base64-encoding the filename inside a command substitution hides it entirely" {
    run bash -c "$SCRIPT < '$FIXTURES/bash-base64-decode.json'"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "BYPASS: a backslash before the leading dot defeats the anchored .env regex" {
    run bash -c "$SCRIPT < '$FIXTURES/bash-backslash-escape-env.json'"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "BYPASS: a wildcard placed inside the basename (.?nv) survives de-globbing as .nv, not .env" {
    run bash -c "$SCRIPT < '$FIXTURES/bash-glob-wildcard-inside-env.json'"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "BYPASS: a file-descriptor redirect glued with no space (3<.env) strips to 3.env" {
    run bash -c "$SCRIPT < '$FIXTURES/bash-fd-redirect-glued-env.json'"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "BYPASS: cat<.env with no surrounding spaces strips to cat.env, not .env" {
    run bash -c "$SCRIPT < '$FIXTURES/bash-cat-glued-redirect-env.json'"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "BYPASS: an interpreter one-liner with no spaces around the literal ('.env' glued to open() and quotes) evades the anchor" {
    run bash -c "$SCRIPT < '$FIXTURES/bash-python-oneliner-compact-env.json'"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "CONTROL: the same interpreter one-liner IS caught once a space isolates '.env' as its own token" {
    run bash -c "$SCRIPT < '$FIXTURES/bash-python-oneliner-spaced-env.json'"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

# --- Bash tool: grep-family commands that recurse into a directory -----------------------------
#
# `grep -rn PATTERN some/dir` reads and can echo the content of every file under that directory,
# including a nested .env, without any single argument ever spelling out a credential-looking
# basename on its own — classify_path alone never sees one. These build real tmpdirs (the
# directory has to actually exist on disk for the `-d` check below to fire), same pattern as the
# symlink/hardlink BYPASS tests above.

@test "blocks 'grep -rn PATTERN <dir>' when the directory has a nested .env" {
    tmpdir="$(mktemp -d)"
    mkdir -p "$tmpdir/nested"
    printf 'DEEPSEEK_API_KEY=should-not-leak\n' > "$tmpdir/nested/.env"
    payload=$(jq -n --arg cmd "grep -rn DEEPSEEK_ $tmpdir" '{tool_name:"Bash", tool_input:{command:$cmd}}')

    run bash -c "$SCRIPT <<< '$payload'"
    rm -rf "$tmpdir"

    [ "$status" -eq 0 ]
    deny_json "$output"
    [[ "$output" == *".env"* ]]
}

@test "blocks 'rg PATTERN <dir>' (recursive by default, no -r needed) when the directory has a nested .env" {
    tmpdir="$(mktemp -d)"
    mkdir -p "$tmpdir/a/b"
    printf 'TOKEN=leaked\n' > "$tmpdir/a/b/.env"
    payload=$(jq -n --arg cmd "rg TOKEN $tmpdir" '{tool_name:"Bash", tool_input:{command:$cmd}}')

    run bash -c "$SCRIPT <<< '$payload'"
    rm -rf "$tmpdir"

    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "blocks a bundled short flag ('-rn', not bare '-r') as still meaning recursive" {
    tmpdir="$(mktemp -d)"
    printf 'SECRET=leaked\n' > "$tmpdir/.env"
    payload=$(jq -n --arg cmd "grep -rn foo $tmpdir" '{tool_name:"Bash", tool_input:{command:$cmd}}')

    run bash -c "$SCRIPT <<< '$payload'"
    rm -rf "$tmpdir"

    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "CONTROL: 'grep -rn PATTERN <dir>' is allowed when the directory has no credential-family file" {
    tmpdir="$(mktemp -d)"
    mkdir -p "$tmpdir/nested"
    printf 'just some text\n' > "$tmpdir/nested/notes.txt"
    payload=$(jq -n --arg cmd "grep -rn PATTERN $tmpdir" '{tool_name:"Bash", tool_input:{command:$cmd}}')

    run bash -c "$SCRIPT <<< '$payload'"
    rm -rf "$tmpdir"

    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "CONTROL: 'grep PATTERN <dir>' without a recursive flag is allowed even with a nested .env (grep itself would skip the directory)" {
    tmpdir="$(mktemp -d)"
    mkdir -p "$tmpdir/nested"
    printf 'SECRET=leaked\n' > "$tmpdir/nested/.env"
    payload=$(jq -n --arg cmd "grep PATTERN $tmpdir" '{tool_name:"Bash", tool_input:{command:$cmd}}')

    run bash -c "$SCRIPT <<< '$payload'"
    rm -rf "$tmpdir"

    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

# --- BYPASS: the recursive-grep directory scan is still a mechanical heuristic, not a shell
# parser or a process monitor — it only recognizes a fixed list of grep-family command names.

@test "BYPASS: 'find <dir> -exec cat {} ;' still reads a nested credential file unchecked (not a grep-family command)" {
    tmpdir="$(mktemp -d)"
    printf 'SECRET=leaked\n' > "$tmpdir/.env"
    payload=$(jq -n --arg cmd "find $tmpdir -type f -exec cat {} ;" '{tool_name:"Bash", tool_input:{command:$cmd}}')

    run bash -c "$SCRIPT <<< '$payload'"
    rm -rf "$tmpdir"

    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "BYPASS: 'git grep PATTERN <dir>' recurses by default (no -r flag) and is not recognized as an always-recursive command" {
    tmpdir="$(mktemp -d)"
    printf 'SECRET=leaked\n' > "$tmpdir/.env"
    payload=$(jq -n --arg cmd "git grep PATTERN $tmpdir" '{tool_name:"Bash", tool_input:{command:$cmd}}')

    run bash -c "$SCRIPT <<< '$payload'"
    rm -rf "$tmpdir"

    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

# --- NotebookEdit: tool_input.path, not file_path ------------------------------------------------

@test "blocks NotebookEdit targeting .env (tool_input.path, not file_path)" {
    run bash -c "$SCRIPT < '$FIXTURES/notebookedit-env.json'"
    [ "$status" -eq 0 ]
    deny_json "$output"
    [[ "$output" == *".env"* ]]
}

@test "allows NotebookEdit targeting an unrelated notebook" {
    run bash -c "$SCRIPT < '$FIXTURES/notebookedit-normal.json'"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

# --- Grep: tool_input.paths is an array (plural) --------------------------------------------------

@test "blocks Grep when one entry of tool_input.paths is a credential file" {
    run bash -c "$SCRIPT < '$FIXTURES/grep-paths-with-env.json'"
    [ "$status" -eq 0 ]
    deny_json "$output"
    [[ "$output" == *".env"* ]]
}

@test "allows Grep when every entry of tool_input.paths is unrelated" {
    run bash -c "$SCRIPT < '$FIXTURES/grep-paths-normal.json'"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

# BYPASS-adjacent: when tool_input.paths is absent, Grep's own default recursive content search
# runs unchecked — a pattern search across the whole repo could surface .env's actual secret
# content in the match output without any single path ever naming .env for this hook to classify.
@test "allows Grep when tool_input.paths is absent" {
    run bash -c "$SCRIPT < '$FIXTURES/grep-missing-paths.json'"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

# --- Glob is intentionally unmatched: no path field in its hook payload ---------------------------

@test "allows Glob (no path field in tool_input to check)" {
    run bash -c "$SCRIPT < '$FIXTURES/glob-pattern-only.json'"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

# --- missing/malformed input never crashes the hook ------------------------------------------

@test "allows when tool_input.file_path is absent" {
    run bash -c "$SCRIPT < '$FIXTURES/missing-file-path.json'"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows when tool_input itself is absent" {
    run bash -c "$SCRIPT < '$FIXTURES/missing-tool-input.json'"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "allows when file_path is JSON null" {
    run bash -c "$SCRIPT < '$FIXTURES/null-file-path.json'"
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

# --- missing dependency: fails open, not closed ----------------------------------------------

@test "fails open with a stderr warning when jq is missing" {
    stripped_path_dir="$(mktemp -d)"
    for tool in bash env cat basename mktemp find rm; do
        link="$(command -v "$tool")"
        ln -s "$link" "$stripped_path_dir/$tool"
    done

    run --separate-stderr env PATH="$stripped_path_dir" bash -c "$SCRIPT < '$FIXTURES/read-env.json'"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
    [[ "$stderr" == *"missing required tool"* ]]
    [[ "$stderr" == *"jq"* ]]

    rm -r "$stripped_path_dir"
}

# --- invocation context -----------------------------------------------------------------------

@test "runs correctly from an unrelated working directory" {
    run bash -c "cd /tmp && '$SCRIPT' < '$FIXTURES/read-env.json'"
    [ "$status" -eq 0 ]
    deny_json "$output"
}

@test "two concurrent invocations both behave correctly" {
    "$SCRIPT" < "$FIXTURES/read-env.json" > /tmp/enforce-safe-credentials-out-1.$$ &
    pid1=$!
    "$SCRIPT" < "$FIXTURES/read-normal-file.json" > /tmp/enforce-safe-credentials-out-2.$$ &
    pid2=$!
    wait "$pid1"
    wait "$pid2"

    out1=$(cat "/tmp/enforce-safe-credentials-out-1.$$")
    out2=$(cat "/tmp/enforce-safe-credentials-out-2.$$")
    rm -f "/tmp/enforce-safe-credentials-out-1.$$" "/tmp/enforce-safe-credentials-out-2.$$"

    deny_json "$out1"
    [ -z "$out2" ]
}
