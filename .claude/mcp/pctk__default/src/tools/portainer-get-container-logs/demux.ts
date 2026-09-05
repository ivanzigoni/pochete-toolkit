/**
 * Docker's container-logs endpoint (Engine API `GET /containers/{id}/logs`, no TTY allocated on
 * this workspace's containers — confirmed live) multiplexes stdout/stderr into one byte stream:
 * each frame is an 8-byte header (1 byte stream type, 3 reserved zero bytes, 4-byte big-endian
 * payload length) followed by that many payload bytes, repeated to the end of the response.
 *
 * This must run on the raw response bytes (a Buffer from `response.arrayBuffer()`), never on a
 * UTF-8-decoded string (`response.text()`): a length field with a high byte value does not
 * round-trip through UTF-8 decoding, so decoding to text first corrupts the very offsets needed
 * to find frame boundaries — confirmed live (the length byte showed up as U+FFFD, the UTF-8
 * replacement character, in a `response.text()`-decoded sample of this exact endpoint).
 */

const FRAME_HEADER_LENGTH = 8;

const STREAM_NAMES = {
  0: 'stdin',
  1: 'stdout',
  2: 'stderr',
} as const;

type StreamName = (typeof STREAM_NAMES)[keyof typeof STREAM_NAMES] | 'unknown';

export interface DemuxedLogFrame {
  readonly stream: StreamName;
  readonly text: string;
}

export class LogDemuxError extends Error {}

export function demuxDockerLogStream(raw: Buffer): DemuxedLogFrame[] {
  const frames: DemuxedLogFrame[] = [];
  let offset = 0;

  while (offset < raw.length) {
    if (offset + FRAME_HEADER_LENGTH > raw.length) {
      throw new LogDemuxError(
        `truncated frame header at byte offset ${offset}: ${raw.length - offset} byte(s) ` +
          `remaining, need ${FRAME_HEADER_LENGTH}`,
      );
    }

    const streamByte = raw.readUInt8(offset);
    const payloadLength = raw.readUInt32BE(offset + 4);
    const payloadStart = offset + FRAME_HEADER_LENGTH;
    const payloadEnd = payloadStart + payloadLength;

    if (payloadEnd > raw.length) {
      throw new LogDemuxError(
        `frame at byte offset ${offset} declares payload length ${payloadLength}, but only ` +
          `${raw.length - payloadStart} byte(s) remain`,
      );
    }

    frames.push({
      stream: STREAM_NAMES[streamByte as keyof typeof STREAM_NAMES] ?? 'unknown',
      text: raw.toString('utf-8', payloadStart, payloadEnd),
    });
    offset = payloadEnd;
  }

  return frames;
}

// eslint-disable-next-line no-control-regex -- matching literal ANSI escape (0x1b) bytes on purpose
const ANSI_ESCAPE_PATTERN = /\x1b\[[0-9;]*m/g;

export function stripAnsiCodes(text: string): string {
  return text.replace(ANSI_ESCAPE_PATTERN, '');
}
