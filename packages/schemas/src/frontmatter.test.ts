import { describe, expect, it } from 'vitest';
import {
  FrontmatterParseError,
  parseFrontmatter,
  serializeFrontmatter,
} from './frontmatter.ts';

describe('parseFrontmatter / serializeFrontmatter', () => {
  it('parseFrontmatter then serializeFrontmatter is a fixed point on LF input', () => {
    const input = '---\nname: foo\ndescription: bar\n---\n# body\n';
    const first = parseFrontmatter<{ name: string; description: string }>(input);
    const serialized = serializeFrontmatter(first.frontmatter, first.body);
    const second = parseFrontmatter<{ name: string; description: string }>(serialized);
    expect(second.frontmatter).toEqual(first.frontmatter);
    expect(second.body).toEqual(first.body);
  });

  it('parseFrontmatter accepts CRLF input and body preserves content', () => {
    const crlfInput = '---\r\nname: foo\r\ndescription: bar\r\n---\r\n# body\r\nmore\r\n';
    const result = parseFrontmatter<{ name: string; description: string }>(crlfInput);
    expect(result.frontmatter.name).toBe('foo');
    expect(result.frontmatter.description).toBe('bar');
    // Body content should include the heading and the second line, regardless
    // of which newline separator is used internally. Compare content-equivalent
    // by normalizing CRLF -> LF.
    const normalizedBody = result.body.replace(/\r\n/g, '\n');
    expect(normalizedBody).toContain('# body');
    expect(normalizedBody).toContain('more');
  });

  it('parseFrontmatter strips leading BOM', () => {
    const bomInput = '\uFEFF---\nname: foo\ndescription: bar\n---\n# body\n';
    const result = parseFrontmatter<{ name: string; description: string }>(bomInput);
    expect(result.frontmatter.name).toBe('foo');
    // After a BOM-prefixed input is parsed, round-tripping MUST NOT emit a BOM.
    const serialized = serializeFrontmatter(result.frontmatter, result.body);
    expect(serialized.startsWith('\uFEFF')).toBe(false);
    expect(serialized.startsWith('---\n')).toBe(true);
  });

  it('parseFrontmatter throws FrontmatterParseError when opening fence missing', () => {
    const noOpen = 'name: foo\ndescription: bar\n---\n# body\n';
    expect(() => parseFrontmatter(noOpen)).toThrow(FrontmatterParseError);
  });

  it('parseFrontmatter throws FrontmatterParseError when closing fence missing', () => {
    const noClose = '---\nname: foo\ndescription: bar\n# body\n';
    expect(() => parseFrontmatter(noClose)).toThrow(FrontmatterParseError);
  });
});
