import type { AddCommentResult, HttpResponse } from './types.js';

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

interface JiraCommentPayload {
  readonly id: string;
  readonly self: string;
  readonly author: { readonly displayName: string };
  readonly created: string;
}

export function parseAddCommentResponse(response: HttpResponse): AddCommentResult {
  if (response.status < 200 || response.status >= 300) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(response.body);
    } catch {
      parsed = undefined;
    }
    const message = extractJiraErrorMessage(parsed) ?? response.statusText;
    throw new JiraApiError(`Jira rejected the comment (status ${response.status}): ${message}`);
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

  const comment = parsed as JiraCommentPayload;
  return {
    id: comment.id,
    self: comment.self,
    authorDisplayName: comment.author.displayName,
    created: comment.created,
  };
}
