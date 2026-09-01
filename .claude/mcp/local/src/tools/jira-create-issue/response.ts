import type { CreateIssueResult, HttpResponse } from './types.js';

export class JiraApiError extends Error {}

function extractErrorMessagesList(parsed: object): string[] {
  if (!('errorMessages' in parsed)) return [];
  const { errorMessages } = parsed as { errorMessages: unknown };
  if (!Array.isArray(errorMessages)) return [];
  return errorMessages.filter((m): m is string => typeof m === 'string');
}

function extractFieldErrors(parsed: object): string[] {
  if (!('errors' in parsed)) return [];
  const { errors } = parsed as { errors: unknown };
  if (typeof errors !== 'object' || errors === null) return [];
  return Object.entries(errors)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([field, message]) => `${field}: ${message}`);
}

function extractJiraErrorMessage(parsed: unknown): string | undefined {
  if (typeof parsed !== 'object' || parsed === null) return undefined;

  const messages = [...extractErrorMessagesList(parsed), ...extractFieldErrors(parsed)];
  return messages.length > 0 ? messages.join('; ') : undefined;
}

interface JiraCreatedIssuePayload {
  readonly id: string;
  readonly key: string;
  readonly self: string;
}

export function parseCreateIssueResponse(response: HttpResponse): CreateIssueResult {
  if (response.status < 200 || response.status >= 300) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(response.body);
    } catch {
      parsed = undefined;
    }
    const message = extractJiraErrorMessage(parsed) ?? response.statusText;
    throw new JiraApiError(
      `Jira rejected the issue creation (status ${response.status}): ${message}`,
    );
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

  const issue = parsed as JiraCreatedIssuePayload;
  return { id: issue.id, key: issue.key, self: issue.self };
}
