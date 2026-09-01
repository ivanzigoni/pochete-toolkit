import type { GetIssueResult, HttpResponse } from './types.js';

export class JiraApiError extends Error {}

function extractJiraErrorMessage(parsed: unknown): string | undefined {
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  if ('errorMessages' in parsed) {
    const { errorMessages } = parsed as { errorMessages: unknown };
    if (Array.isArray(errorMessages) && errorMessages.length > 0) {
      return errorMessages.filter((m): m is string => typeof m === 'string').join('; ');
    }
  }
  if ('message' in parsed) {
    const { message } = parsed as { message: unknown };
    if (typeof message === 'string') return message;
  }
  return undefined;
}

interface JiraIssuePayload {
  readonly key: string;
  readonly id: string;
  readonly self: string;
  readonly fields: Record<string, unknown>;
}

export function parseGetIssueResponse(response: HttpResponse): GetIssueResult {
  if (response.status < 200 || response.status >= 300) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(response.body);
    } catch {
      parsed = undefined;
    }
    const message = extractJiraErrorMessage(parsed) ?? response.statusText;
    throw new JiraApiError(`Jira rejected the request (status ${response.status}): ${message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.body);
  } catch {
    throw new JiraApiError(
      `Jira returned a non-JSON response (status ${response.status} ${response.statusText}): ${response.body.slice(
        0,
        500,
      )}`,
    );
  }

  const issue = parsed as JiraIssuePayload;
  return { key: issue.key, id: issue.id, self: issue.self, fields: issue.fields };
}
