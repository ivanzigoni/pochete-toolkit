#!/usr/bin/env node
// @ts-check
//
// Generic MCP stdio client: spawns this server's own run.sh as a short-lived child process,
// does the initialize/tools-call handshake over newline-delimited JSON-RPC, prints the tool's
// result to stdout (or its error to stderr with exit code 1), then kills the child. Only needed
// by a caller that can't reach this server's tools directly through its own live MCP connection
// (e.g. a plain shell script run outside of one) — most skills here are pure pointers that just
// tell the agent to call the tool by name (see ../../skills/pctk__util__safe-query.skill/).
//
// Usage: <json-arguments> piped on stdin | node call-tool.mjs <tool-name>
//
// Arguments travel over stdin rather than argv on purpose — argv is visible to any local user via
// `ps`/`/proc/<pid>/cmdline`, and a tool argument (e.g. a SQL query with literal values) can be
// exactly the kind of thing that shouldn't be.

import { spawn } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const RUN_SH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'run.sh');
const INITIALIZE_ID = 1;
const TOOLS_CALL_ID = 2;

/**
 * @param {string} method
 * @param {Record<string, unknown>} [params]
 * @param {number} [id]
 * @returns {string}
 */
function toJsonRpcLine(method, params, id) {
  /** @type {Record<string, unknown>} */
  const message = { jsonrpc: '2.0', method };
  if (params !== undefined) message.params = params;
  if (id !== undefined) message.id = id;
  return `${JSON.stringify(message)}\n`;
}

/**
 * Runs `toolName` with `toolArguments` against a freshly spawned instance of the MCP server and
 * resolves with its text result. Rejects if the server never responds, exits early, or the tool
 * call itself reports an error.
 *
 * @param {string} toolName
 * @param {Record<string, unknown>} toolArguments
 * @returns {Promise<string>}
 */
function callTool(toolName, toolArguments) {
  return new Promise((resolve, reject) => {
    const child = spawn(RUN_SH, [], { stdio: ['pipe', 'pipe', 'inherit'] });

    child.on('error', (err) => {
      reject(new Error(`failed to start MCP server (${RUN_SH}): ${err.message}`));
    });

    child.on('exit', (code) => {
      reject(new Error(`MCP server exited before responding (code ${String(code)})`));
    });

    const rl = readline.createInterface({ input: child.stdout });
    rl.on('line', (line) => {
      /** @type {unknown} */
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return; // Not a JSON-RPC line (shouldn't happen on stdout); ignore rather than crash.
      }
      if (
        typeof message !== 'object' ||
        message === null ||
        !('id' in message) ||
        message.id !== TOOLS_CALL_ID ||
        !('result' in message || 'error' in message)
      ) {
        return;
      }

      rl.close();
      child.removeAllListeners('exit');
      child.kill();

      // A malformed tool call (e.g. an argument failing the tool's own inputSchema, like a
      // regex-constrained field) is rejected by the SDK as a JSON-RPC protocol error, not as a
      // CallToolResult with isError — distinct from a tool-reported failure below.
      if ('error' in message) {
        const { error } = /** @type {{ error: { message: string } }} */ (message);
        reject(new Error(error.message));
        return;
      }

      const { result } =
        /** @type {{ result: { isError?: boolean, content?: { type: string, text: string }[] } }} */ (
          message
        );
      const text = result.content?.[0]?.text ?? '';
      if (result.isError) {
        reject(new Error(text));
      } else {
        resolve(text);
      }
    });

    child.stdin.write(
      toJsonRpcLine(
        'initialize',
        {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'call-tool.mjs', version: '1.0.0' },
        },
        INITIALIZE_ID,
      ),
    );
    child.stdin.write(toJsonRpcLine('notifications/initialized'));
    child.stdin.write(
      toJsonRpcLine('tools/call', { name: toolName, arguments: toolArguments }, TOOLS_CALL_ID),
    );
  });
}

/**
 * @param {NodeJS.ReadStream} stream
 * @returns {Promise<string>}
 */
function readAll(stream) {
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
  });
}

async function main() {
  const [toolName] = process.argv.slice(2);
  if (!toolName) {
    process.stderr.write('usage: <json-arguments> | call-tool.mjs <tool-name>\n');
    process.exitCode = 1;
    return;
  }

  /** @type {Record<string, unknown>} */
  let toolArguments;
  try {
    toolArguments = JSON.parse(await readAll(process.stdin));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`call-tool: invalid JSON arguments on stdin: ${message}\n`);
    process.exitCode = 1;
    return;
  }

  try {
    const text = await callTool(toolName, toolArguments);
    process.stdout.write(`${text}\n`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`call-tool: ${message}\n`);
    process.exitCode = 1;
  }
}

main();
