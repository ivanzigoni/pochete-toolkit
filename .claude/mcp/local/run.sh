#!/usr/bin/env bash
#
# Entry point registered in .mcp.json (and spawned by bin/call-tool.mjs when a skill invokes a
# tool directly). Installs this server's own node_modules on first run, then execs the MCP server
# over stdio.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! -x "$SCRIPT_DIR/node_modules/.bin/tsx" ]]; then
    ( cd "$SCRIPT_DIR" && npm install --no-audit --no-fund ) >&2
fi

exec "$SCRIPT_DIR/node_modules/.bin/tsx" "$SCRIPT_DIR/src/index.ts"
