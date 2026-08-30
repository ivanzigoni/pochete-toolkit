// Fake replacement for the `undici` package's `fetch` export, swapped in for the e2e suite by
// fake-driver-loader.mjs. Mimics only the surface src/tools/safe-curl/http.ts,
// src/tools/bitbucket-open-pr/http.ts, and src/tools/portainer-get-container-logs/docker-client.ts
// actually call (`fetch(url, { method, headers, body })` -> `{ status, statusText, headers.forEach,
// text(), json(), arrayBuffer() }`) against a handful of canned endpoints/paths — no real network
// call is made. Echoing back the method, the Cookie header it actually received (plus a
// lowercased map of every header, for profiles injecting under a different name, e.g. X-API-Key),
// and the body is what lets the e2e suite assert that the authProfile's credential really made it
// onto the outgoing request. The set-cookie endpoint returns a response carrying a Set-Cookie
// header, letting the e2e suite assert that redactSensitiveHeaders actually strips it before the
// tool's result is inlined or written to disk. The Bitbucket pullrequests endpoint below returns
// 401 if no "Basic " Authorization header is present at all (proving the header actually reached
// the request — its exact value is a unit concern, covered by request.test.ts), then branches on
// repoSlug to simulate a success/failure response without a real Bitbucket account. The Portainer
// endpoints gate on a fixed X-API-Key value the same way, and the logs endpoint returns a real
// Docker-framed byte body (via arrayBuffer(), never valid UTF-8 text) so the e2e suite exercises
// the same raw-byte demuxing path production traffic does.

const ECHO_URL = 'https://example.test/echo';
const SET_COOKIE_URL = 'https://example.test/set-cookie';
const BITBUCKET_API_ROOT = 'https://api.bitbucket.org/2.0/repositories/';
const DEEPSEEK_CHAT_COMPLETIONS_URL = 'https://api.deepseek.com/chat/completions';

export const DEEPSEEK_FAKE_API_KEY = 'fake-deepseek-key';

export const PORTAINER_FAKE_API_KEY = 'fake-portainer-token';
export const PORTAINER_FAKE_CONTAINER_ID =
  'f59ef0407494b49caae6d2c9ca969cfa4d3db8cebe8f78a8db227cd956eba618';
export const PORTAINER_PRD_FAKE_CONTAINER_ID =
  'a11cebe8f78a8db227cd956eba618f59ef0407494b49caae6d2c9ca969cfa4d';

function portainerApiRoot(host, endpointId) {
  return `https://${host}/api/endpoints/${endpointId}/docker/v1.41`;
}

// Fixture-only registry — genericized on purpose, never the real infra this fixture used to
// mirror literally. The portainer e2e suite (test/e2e/portainer-get-container-logs.test.ts)
// injects a matching environments.json (same host/endpointId/stackNamespace, via
// CEM_PORTAINER_ENVIRONMENTS_FILE) into the spawned server process, so the two stay in sync
// without either one reading real, gitignored infra.
export const PORTAINER_HML_HOST = 'portainer-hml.example.internal';
export const PORTAINER_PRD_HOST = 'portainer.example.internal';
export const PORTAINER_ENDPOINT_ID = 1;
export const PORTAINER_HML_STACK_NAMESPACE = 'example-stack-hml';
export const PORTAINER_PRD_STACK_NAMESPACE = 'example-stack-prd';

// "hml" mirrors a Portainer endpoint running two parallel stacks with the identical service set,
// to exercise resolve-container.ts's stackNamespace disambiguation for real; "prd" mirrors the
// single-stack case.
const PORTAINER_ENVIRONMENTS = [
  {
    root: portainerApiRoot(PORTAINER_HML_HOST, PORTAINER_ENDPOINT_ID),
    containers: [
      {
        Id: PORTAINER_FAKE_CONTAINER_ID,
        Labels: { 'com.docker.swarm.service.name': `${PORTAINER_HML_STACK_NAMESPACE}_cem-billing-service` },
      },
      {
        Id: 'release-stack-container-id',
        Labels: { 'com.docker.swarm.service.name': 'example-stack-release_cem-billing-service' },
      },
    ],
    validContainerId: PORTAINER_FAKE_CONTAINER_ID,
    logFrames: [
      [1, 'log line one\n'],
      [2, 'log line two\n'],
    ],
  },
  {
    root: portainerApiRoot(PORTAINER_PRD_HOST, PORTAINER_ENDPOINT_ID),
    containers: [
      {
        Id: PORTAINER_PRD_FAKE_CONTAINER_ID,
        Labels: { 'com.docker.swarm.service.name': `${PORTAINER_PRD_STACK_NAMESPACE}_cem-billing-service` },
      },
    ],
    validContainerId: PORTAINER_PRD_FAKE_CONTAINER_ID,
    logFrames: [[1, 'prd log line one\n']],
  },
];

function findPortainerEnvironment(url) {
  return PORTAINER_ENVIRONMENTS.find((env) => url.startsWith(env.root));
}

function toBuffer(body) {
  return Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf-8');
}

function fakeResponse(status, statusText, headersObj, body) {
  const buffer = toBuffer(body);
  return {
    status,
    statusText,
    headers: {
      forEach(callback) {
        for (const [key, value] of Object.entries(headersObj)) {
          callback(value, key);
        }
      },
    },
    async text() {
      return buffer.toString('utf-8');
    },
    async json() {
      return JSON.parse(buffer.toString('utf-8'));
    },
    async arrayBuffer() {
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    },
  };
}

// Docker's Engine API log-stream framing: 1-byte stream type, 3 reserved zero bytes, 4-byte
// big-endian payload length, then the payload — see src/tools/portainer-get-container-logs/demux.ts.
function buildDockerFrame(streamByte, text) {
  const payload = Buffer.from(text, 'utf-8');
  const header = Buffer.alloc(8);
  header.writeUInt8(streamByte, 0);
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

function hasValidPortainerApiKey(init) {
  const headers = init.headers ?? {};
  const apiKey = headers['X-API-Key'] ?? headers['x-api-key'] ?? null;
  return apiKey === PORTAINER_FAKE_API_KEY;
}

export async function fetch(url, init = {}) {
  if (url === ECHO_URL) {
    const headers = init.headers ?? {};
    const cookie = headers.Cookie ?? headers.cookie ?? null;
    const lowercasedHeaders = Object.fromEntries(
      Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
    );
    return fakeResponse(
      200,
      'OK',
      { 'content-type': 'application/json' },
      JSON.stringify({
        method: init.method ?? 'GET',
        cookie,
        headers: lowercasedHeaders,
        body: init.body ?? null,
      }),
    );
  }

  if (url === SET_COOKIE_URL) {
    return fakeResponse(
      200,
      'OK',
      {
        'content-type': 'application/json',
        'set-cookie': 'newsession=real-secret-value; Path=/; HttpOnly',
      },
      JSON.stringify({ ok: true }),
    );
  }

  if (typeof url === 'string' && url.startsWith(BITBUCKET_API_ROOT)) {
    const [workspace, repoSlug] = url
      .slice(BITBUCKET_API_ROOT.length)
      .replace(/\/pullrequests$/, '')
      .split('/')
      .map(decodeURIComponent);
    const headers = init.headers ?? {};
    const authorization = headers.Authorization ?? headers.authorization ?? null;
    const requestBody = init.body ? JSON.parse(init.body) : {};

    if (!authorization || !authorization.startsWith('Basic ')) {
      return fakeResponse(
        401,
        'Unauthorized',
        { 'content-type': 'application/json' },
        JSON.stringify({ type: 'error', error: { message: 'no valid Basic auth header' } }),
      );
    }

    if (repoSlug === 'error-repo') {
      return fakeResponse(
        400,
        'Bad Request',
        { 'content-type': 'application/json' },
        JSON.stringify({ type: 'error', error: { message: 'source branch not found' } }),
      );
    }

    if (repoSlug === 'upstream-down-repo') {
      return fakeResponse(502, 'Bad Gateway', { 'content-type': 'text/plain' }, 'upstream failure');
    }

    return fakeResponse(
      201,
      'Created',
      { 'content-type': 'application/json' },
      JSON.stringify({
        id: 42,
        title: requestBody.title ?? '',
        state: 'OPEN',
        links: {
          html: { href: `https://bitbucket.org/${workspace}/${repoSlug}/pull-requests/42` },
        },
        source: { branch: { name: requestBody.source?.branch?.name ?? '' } },
        destination: { branch: { name: requestBody.destination?.branch?.name ?? '' } },
      }),
    );
  }

  if (url === DEEPSEEK_CHAT_COMPLETIONS_URL) {
    const headers = init.headers ?? {};
    const authorization = headers.Authorization ?? headers.authorization ?? null;

    if (authorization !== `Bearer ${DEEPSEEK_FAKE_API_KEY}`) {
      return fakeResponse(
        401,
        'Unauthorized',
        { 'content-type': 'application/json' },
        JSON.stringify({ error: { message: 'invalid api key' } }),
      );
    }

    const requestBody = init.body ? JSON.parse(init.body) : {};
    const lastMessage = requestBody.messages?.[requestBody.messages.length - 1];
    const systemMessage = requestBody.messages?.find((message) => message.role === 'system');

    if (lastMessage?.content === 'trigger-empty-choices') {
      return fakeResponse(
        200,
        'OK',
        { 'content-type': 'application/json' },
        JSON.stringify({ id: 'fake-id', model: requestBody.model, choices: [], usage: {} }),
      );
    }

    // Debug suffixes below are appended only when the request actually carries a system message
    // or max_tokens/temperature — every call that doesn't set them (the pre-existing "echo: hello"
    // e2e cases) still gets back exactly `echo: <content>`, unchanged. This is what lets
    // delegate-reasoning.test.ts assert, black-box, that a scenario preset's systemPrompt/
    // maxTokens/temperature actually reached the upstream request body — without this server
    // needing to expose those fields through its own real response shape.
    const debugSuffixes = [
      systemMessage ? ` [system=${systemMessage.content}]` : '',
      requestBody.max_tokens !== undefined ? ` [maxTokens=${requestBody.max_tokens}]` : '',
      requestBody.temperature !== undefined ? ` [temperature=${requestBody.temperature}]` : '',
    ].join('');

    return fakeResponse(
      200,
      'OK',
      { 'content-type': 'application/json' },
      JSON.stringify({
        id: 'fake-id',
        model: requestBody.model,
        choices: [
          {
            message: {
              role: 'assistant',
              content: `echo: ${lastMessage?.content ?? ''}${debugSuffixes}`,
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    );
  }

  const portainerEnv = typeof url === 'string' ? findPortainerEnvironment(url) : undefined;
  if (portainerEnv) {
    if (!hasValidPortainerApiKey(init)) {
      return fakeResponse(
        403,
        'Forbidden',
        { 'content-type': 'application/json' },
        JSON.stringify({ message: 'invalid api key' }),
      );
    }

    if (url === `${portainerEnv.root}/containers/json`) {
      return fakeResponse(
        200,
        'OK',
        { 'content-type': 'application/json' },
        JSON.stringify(portainerEnv.containers),
      );
    }

    const logsMatch = new URL(url).pathname.match(/\/containers\/([^/]+)\/logs$/);
    if (logsMatch) {
      const [, containerId] = logsMatch;
      if (containerId !== portainerEnv.validContainerId) {
        return fakeResponse(
          404,
          'Not Found',
          { 'content-type': 'application/json' },
          JSON.stringify({ message: 'no such container' }),
        );
      }
      const body = Buffer.concat(
        portainerEnv.logFrames.map(([streamByte, text]) => buildDockerFrame(streamByte, text)),
      );
      return fakeResponse(200, 'OK', { 'content-type': 'application/vnd.docker.raw-stream' }, body);
    }
  }

  return fakeResponse(404, 'Not Found', { 'content-type': 'text/plain' }, 'not found');
}
