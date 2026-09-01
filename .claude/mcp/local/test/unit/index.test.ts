import { beforeAll, describe, expect, it, vi } from 'vitest';

const {
  mcpServerConstructorMock,
  connectMock,
  stdioTransportMock,
  registerSafeQueryMock,
  registerSafeCurlMock,
  registerBitbucketOpenPrMock,
  registerPortainerGetContainerLogsMock,
  registerDelegateReasoningMock,
  registerJiraGetIssueMock,
  registerJiraAddCommentMock,
  registerJiraSearchIssuesMock,
  registerJiraCreateIssueMock,
} = vi.hoisted(() => ({
  mcpServerConstructorMock: vi.fn(),
  connectMock: vi.fn().mockResolvedValue(undefined),
  stdioTransportMock: vi.fn(),
  registerSafeQueryMock: vi.fn(),
  registerSafeCurlMock: vi.fn(),
  registerBitbucketOpenPrMock: vi.fn(),
  registerPortainerGetContainerLogsMock: vi.fn(),
  registerDelegateReasoningMock: vi.fn(),
  registerJiraGetIssueMock: vi.fn(),
  registerJiraAddCommentMock: vi.fn(),
  registerJiraSearchIssuesMock: vi.fn(),
  registerJiraCreateIssueMock: vi.fn(),
}));

let constructedServer: unknown;

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {
    connect = connectMock;

    constructor(...args: unknown[]) {
      mcpServerConstructorMock(...args);
      constructedServer = this;
    }
  },
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: class {
    constructor(...args: unknown[]) {
      stdioTransportMock(...args);
    }
  },
}));

vi.mock('../../src/tools/safe-query/register.js', () => ({
  registerSafeQueryTool: registerSafeQueryMock,
}));
vi.mock('../../src/tools/safe-curl/register.js', () => ({
  registerSafeCurlTool: registerSafeCurlMock,
}));
vi.mock('../../src/tools/bitbucket-open-pr/register.js', () => ({
  registerBitbucketOpenPrTool: registerBitbucketOpenPrMock,
}));
vi.mock('../../src/tools/portainer-get-container-logs/register.js', () => ({
  registerPortainerGetContainerLogsTool: registerPortainerGetContainerLogsMock,
}));
vi.mock('../../src/tools/delegate-reasoning/register.js', () => ({
  registerDelegateReasoningTool: registerDelegateReasoningMock,
}));
vi.mock('../../src/tools/jira-get-issue/register.js', () => ({
  registerJiraGetIssueTool: registerJiraGetIssueMock,
}));
vi.mock('../../src/tools/jira-add-comment/register.js', () => ({
  registerJiraAddCommentTool: registerJiraAddCommentMock,
}));
vi.mock('../../src/tools/jira-search-issues/register.js', () => ({
  registerJiraSearchIssuesTool: registerJiraSearchIssuesMock,
}));
vi.mock('../../src/tools/jira-create-issue/register.js', () => ({
  registerJiraCreateIssueTool: registerJiraCreateIssueMock,
}));

// index.ts runs its bootstrap as top-level module side effects (including a top-level await on
// server.connect) — importing it once here is the whole test; there is no exported function to
// call repeatedly, so every `it` below asserts on the one resulting side effect it cares about.
beforeAll(async () => {
  await import('../../src/index.js');
});

describe('src/index.ts bootstrap', () => {
  it("constructs the McpServer with this server's name and version", () => {
    expect(mcpServerConstructorMock).toHaveBeenCalledWith({
      name: 'local',
      version: '1.0.0',
    });
  });

  it('registers all 9 tools against the same server instance', () => {
    expect(registerSafeQueryMock).toHaveBeenCalledTimes(1);
    expect(registerSafeCurlMock).toHaveBeenCalledTimes(1);
    expect(registerBitbucketOpenPrMock).toHaveBeenCalledTimes(1);
    expect(registerPortainerGetContainerLogsMock).toHaveBeenCalledTimes(1);
    expect(registerDelegateReasoningMock).toHaveBeenCalledTimes(1);
    expect(registerJiraGetIssueMock).toHaveBeenCalledTimes(1);
    expect(registerJiraAddCommentMock).toHaveBeenCalledTimes(1);
    expect(registerJiraSearchIssuesMock).toHaveBeenCalledTimes(1);
    expect(registerJiraCreateIssueMock).toHaveBeenCalledTimes(1);
    expect(registerSafeQueryMock).toHaveBeenCalledWith(constructedServer);
    expect(registerSafeCurlMock).toHaveBeenCalledWith(constructedServer);
    expect(registerBitbucketOpenPrMock).toHaveBeenCalledWith(constructedServer);
    expect(registerPortainerGetContainerLogsMock).toHaveBeenCalledWith(constructedServer);
    expect(registerDelegateReasoningMock).toHaveBeenCalledWith(constructedServer);
    expect(registerJiraGetIssueMock).toHaveBeenCalledWith(constructedServer);
    expect(registerJiraAddCommentMock).toHaveBeenCalledWith(constructedServer);
    expect(registerJiraSearchIssuesMock).toHaveBeenCalledWith(constructedServer);
    expect(registerJiraCreateIssueMock).toHaveBeenCalledWith(constructedServer);
  });

  it('connects the server over a stdio transport', () => {
    expect(stdioTransportMock).toHaveBeenCalledTimes(1);
    expect(connectMock).toHaveBeenCalledTimes(1);
  });
});
