import { test, expect, describe } from 'bun:test';
import { parseCsv, toCsv } from './csv';

describe('parseCsv', () => {
  test('parses a simple table', () => {
    expect(parseCsv('a,b,c\n1,2,3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  test('handles quoted fields with commas and escaped quotes', () => {
    expect(parseCsv('name,note\n"Doe, John","say ""hi"""\n')).toEqual([
      ['name', 'note'],
      ['Doe, John', 'say "hi"'],
    ]);
  });

  test('handles newlines inside quoted fields and CRLF', () => {
    expect(parseCsv('a,b\r\n"line1\nline2",x\r\n')).toEqual([
      ['a', 'b'],
      ['line1\nline2', 'x'],
    ]);
  });

  test('handles a file without a trailing newline', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('toCsv', () => {
  test('serializes and quotes only when needed', () => {
    const csv = toCsv([
      ['name', 'url', 'keywords'],
      ['Plain', 'http://x', 'a;b;c'],
      ['Has, comma', 'http://y', 'd'],
    ]);
    expect(csv).toBe('name,url,keywords\nPlain,http://x,a;b;c\n"Has, comma",http://y,d\n');
  });

  test('round-trips through parseCsv', () => {
    const rows = [
      ['name', 'url', 'keywords'],
      ['A "quoted" name', 'http://z', 'x;y'],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});
