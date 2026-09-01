// Jira Cloud's v3 issue API requires the `description` field in Atlassian Document Format (ADF),
// a structured document tree — a plain string is rejected. This builds the minimal ADF document
// for a caller-supplied plain-text description: one paragraph, with each input line joined by an
// explicit `hardBreak` node rather than a literal "\n" in a text node (ADF text nodes don't
// render embedded newlines). Mirrors jira-add-comment/adf.ts.
export interface AdfDocument {
  readonly type: 'doc';
  readonly version: 1;
  readonly content: readonly AdfParagraph[];
}

interface AdfParagraph {
  readonly type: 'paragraph';
  readonly content: readonly (AdfText | AdfHardBreak)[];
}

interface AdfText {
  readonly type: 'text';
  readonly text: string;
}

interface AdfHardBreak {
  readonly type: 'hardBreak';
}

export function toAdfDocument(text: string): AdfDocument {
  const lines = text.split('\n');
  const content: (AdfText | AdfHardBreak)[] = [];
  lines.forEach((line, index) => {
    if (line.length > 0) content.push({ type: 'text', text: line });
    if (index < lines.length - 1) content.push({ type: 'hardBreak' });
  });

  return { type: 'doc', version: 1, content: [{ type: 'paragraph', content }] };
}
