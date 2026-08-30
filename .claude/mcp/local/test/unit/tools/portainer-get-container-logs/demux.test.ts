import { describe, expect, it } from 'vitest';
import {
  demuxDockerLogStream,
  LogDemuxError,
  stripAnsiCodes,
} from '../../../../src/tools/portainer-get-container-logs/demux.js';

// Builds one Docker log frame: 1-byte stream type, 3 reserved zero bytes, 4-byte big-endian
// payload length, then the payload — the exact shape demuxDockerLogStream parses.
function buildFrame(streamByte: number, text: string): Buffer {
  const payload = Buffer.from(text, 'utf-8');
  const header = Buffer.alloc(8);
  header.writeUInt8(streamByte, 0);
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

describe('demuxDockerLogStream', () => {
  it('returns an empty array for an empty buffer', () => {
    expect(demuxDockerLogStream(Buffer.alloc(0))).toEqual([]);
  });

  it('decodes a single stdout frame', () => {
    const raw = buildFrame(1, 'hello world\n');
    expect(demuxDockerLogStream(raw)).toEqual([{ stream: 'stdout', text: 'hello world\n' }]);
  });

  it('decodes a single stderr frame', () => {
    const raw = buildFrame(2, 'boom\n');
    expect(demuxDockerLogStream(raw)).toEqual([{ stream: 'stderr', text: 'boom\n' }]);
  });

  it('decodes multiple concatenated frames in order', () => {
    const raw = Buffer.concat([buildFrame(1, 'line one\n'), buildFrame(2, 'line two\n')]);
    expect(demuxDockerLogStream(raw)).toEqual([
      { stream: 'stdout', text: 'line one\n' },
      { stream: 'stderr', text: 'line two\n' },
    ]);
  });

  it('labels an unrecognized stream byte as "unknown" instead of throwing', () => {
    const raw = buildFrame(9, 'mystery\n');
    expect(demuxDockerLogStream(raw)).toEqual([{ stream: 'unknown', text: 'mystery\n' }]);
  });

  it('throws LogDemuxError on a truncated frame header', () => {
    const raw = Buffer.from([1, 0, 0, 0]); // only 4 of 8 header bytes
    expect(() => demuxDockerLogStream(raw)).toThrow(LogDemuxError);
    expect(() => demuxDockerLogStream(raw)).toThrow(/truncated frame header/);
  });

  it('throws LogDemuxError when the declared payload length overruns the buffer', () => {
    const header = Buffer.alloc(8);
    header.writeUInt8(1, 0);
    header.writeUInt32BE(100, 4); // claims 100 bytes of payload that don't exist
    const raw = Buffer.concat([header, Buffer.from('short')]);
    expect(() => demuxDockerLogStream(raw)).toThrow(LogDemuxError);
    expect(() => demuxDockerLogStream(raw)).toThrow(/declares payload length 100/);
  });

  it('preserves multi-byte UTF-8 text within a frame', () => {
    const raw = buildFrame(1, 'café ☕\n');
    expect(demuxDockerLogStream(raw)).toEqual([{ stream: 'stdout', text: 'café ☕\n' }]);
  });
});

describe('stripAnsiCodes', () => {
  it('removes ANSI color escape sequences', () => {
    expect(stripAnsiCodes('[32mLOG[39m')).toBe('LOG');
  });

  it('leaves plain text untouched', () => {
    expect(stripAnsiCodes('plain text, no codes')).toBe('plain text, no codes');
  });

  it('removes multiple codes in the same string', () => {
    expect(stripAnsiCodes('[32m[Nest][39m [38;5;3mtag[39m')).toBe(
      '[Nest] tag',
    );
  });
});
