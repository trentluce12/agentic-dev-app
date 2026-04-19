import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type AgentValidationIssue,
  agentFrontmatterSchema,
  agentNameSchema,
  diagnosticsToCodeMirror,
  parseAgentFile,
  serializeAgentFile,
  validateTierConsistency,
} from './agent.ts';
import { FrontmatterParseError } from './frontmatter.ts';

const thisDir = dirname(fileURLToPath(import.meta.url));
const fixtureAgentsDir = join(
  thisDir,
  '..',
  '..',
  '..',
  'tests',
  'fixtures',
  'project-basic',
  '.claude',
  'agents',
);

function readFixture(name: string): string {
  return readFileSync(join(fixtureAgentsDir, name), 'utf8');
}

describe('parseAgentFile', () => {
  it('parseAgentFile returns zero issues on valid fixture', () => {
    const raw = readFixture('valid-lead.md');
    const result = parseAgentFile(raw);
    expect(result.issues).toEqual([]);
    expect(result.frontmatter.name).toBe('valid-lead');
  });

  it('parseAgentFile throws FrontmatterParseError on missing closing fence', () => {
    const synthetic = '---\nname: foo\n';
    expect(() => parseAgentFile(synthetic)).toThrow(FrontmatterParseError);
  });

  it('parseAgentFile returns error issues when Zod validation fails (missing description)', () => {
    const synthetic = '---\nname: some-agent\n---\n# body\n';
    const result = parseAgentFile(synthetic);
    expect(result.issues.length).toBeGreaterThan(0);
    const first = result.issues[0];
    expect(first).toBeDefined();
    if (first === undefined) throw new Error('unreachable');
    expect(first.level).toBe('error');
    expect(first.path).toContain('description');
  });

  it('parseAgentFile preserves passthrough keys custom-note and custom-array', () => {
    const raw = readFixture('passthrough-note.md');
    const result = parseAgentFile(raw);
    expect(result.issues).toEqual([]);
    // Passthrough keys sit outside the declared AgentFrontmatter shape — read
    // them through a Record view rather than casting to a synthetic type.
    const fm: Record<string, unknown> = result.frontmatter;
    expect(fm['custom-note']).toBe('hello');
    expect(fm['custom-array']).toEqual([1, 2]);
  });
});

describe('validateTierConsistency', () => {
  it('validateTierConsistency warns on lead-missing-agent-tool', () => {
    const fm = agentFrontmatterSchema.parse({
      name: 'lm',
      description: 'd',
      'x-tier': 'lead',
      tools: ['Read'],
    });
    const issues = validateTierConsistency(fm);
    expect(issues).toHaveLength(1);
    const first = issues[0];
    if (first === undefined) throw new Error('unreachable');
    expect(first.code).toBe('tier.lead-missing-agent-tool');
    expect(first.level).toBe('warning');
  });

  it('validateTierConsistency warns on implementer-has-agent-tool', () => {
    const fm = agentFrontmatterSchema.parse({
      name: 'iw',
      description: 'd',
      'x-tier': 'implementer',
      tools: ['Agent', 'Read'],
    });
    const issues = validateTierConsistency(fm);
    expect(issues).toHaveLength(1);
    const first = issues[0];
    if (first === undefined) throw new Error('unreachable');
    expect(first.code).toBe('tier.implementer-has-agent-tool');
    expect(first.level).toBe('warning');
  });

  it('validateTierConsistency does not warn for orchestrator tier with or without Agent tool', () => {
    const fmWith = agentFrontmatterSchema.parse({
      name: 'o1',
      description: 'd',
      'x-tier': 'orchestrator',
      tools: ['Agent'],
    });
    expect(validateTierConsistency(fmWith)).toEqual([]);

    const fmWithout = agentFrontmatterSchema.parse({
      name: 'o2',
      description: 'd',
      'x-tier': 'orchestrator',
      tools: ['Read'],
    });
    expect(validateTierConsistency(fmWithout)).toEqual([]);
  });

  it('validateTierConsistency does not warn when x-tier key is absent', () => {
    const fm = agentFrontmatterSchema.parse({
      name: 'nt',
      description: 'd',
      tools: ['Read'],
    });
    expect(validateTierConsistency(fm)).toEqual([]);
  });
});

describe('diagnosticsToCodeMirror', () => {
  it('diagnosticsToCodeMirror resolves single-key path to the matching line', () => {
    const raw = 'name: x\ndescription: ""';
    const issues: AgentValidationIssue[] = [
      { level: 'error', code: 'custom.too_small', message: 'must not be empty', path: 'description' },
    ];
    const diags = diagnosticsToCodeMirror(issues, raw);
    expect(diags).toHaveLength(1);
    const first = diags[0];
    if (first === undefined) throw new Error('unreachable');
    expect(first.line).toBe(2);
  });

  it('diagnosticsToCodeMirror resolves skills.2 to third list item line', () => {
    const raw = 'name: x\ndescription: y\nskills:\n  - a\n  - b\n  - c';
    const issues: AgentValidationIssue[] = [
      { level: 'error', code: 'custom', message: 'bad', path: 'skills.2' },
    ];
    const diags = diagnosticsToCodeMirror(issues, raw);
    const first = diags[0];
    if (first === undefined) throw new Error('unreachable');
    expect(first.line).toBe(6);
  });

  it('diagnosticsToCodeMirror returns line 1 for empty path', () => {
    const raw = 'name: x\ndescription: y';
    const issues: AgentValidationIssue[] = [
      { level: 'error', code: 'custom', message: 'bad', path: '' },
    ];
    const diags = diagnosticsToCodeMirror(issues, raw);
    const first = diags[0];
    if (first === undefined) throw new Error('unreachable');
    expect(first.line).toBe(1);
  });

  it('diagnosticsToCodeMirror maps error level to severity error and warning level to severity warning', () => {
    const raw = 'name: x\ndescription: y\ntools:\n  - Read';
    const issues: AgentValidationIssue[] = [
      { level: 'error', code: 'e', message: 'err', path: 'name' },
      { level: 'warning', code: 'tier.lead-missing-agent-tool', message: 'warn', path: 'tools' },
    ];
    const diags = diagnosticsToCodeMirror(issues, raw);
    expect(diags).toHaveLength(2);
    const [d0, d1] = diags;
    if (d0 === undefined || d1 === undefined) throw new Error('unreachable');
    expect(d0.severity).toBe('error');
    expect(d1.severity).toBe('warning');
  });
});

describe('serializeAgentFile round-trip (property-based)', () => {
  // YAML values that MUST NOT appear as passthrough string values because they
  // are interpreted as booleans / null by the YAML parser and would break
  // string-equality round-trip.
  const reservedYamlTokens = new Set([
    'true',
    'false',
    'yes',
    'no',
    'on',
    'off',
    'null',
    'y',
    'n',
  ]);

  // Name slug — matches agentNameSchema regex.
  const nameArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,14}$/);
  // Non-empty, alpha-only description that cannot collide with YAML scalar tokens.
  const descriptionArb = fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{0,20}[A-Za-z0-9]$/);
  const toolNameArb = fc.constantFrom('Read', 'Write', 'Grep', 'Glob', 'Bash', 'Edit');
  const toolsArb = fc.array(toolNameArb, { minLength: 1, maxLength: 3 });
  const tierArb = fc.constantFrom('orchestrator', 'lead', 'implementer');

  // Passthrough values: either a short alpha string or a small number array.
  // String form filters out YAML reserved tokens to avoid boolean/null coercion.
  const passthroughStringArb = fc
    .stringMatching(/^[a-zA-Z][a-zA-Z0-9]{1,9}$/)
    .filter((s) => !reservedYamlTokens.has(s.toLowerCase()));
  const passthroughArrayArb = fc.array(fc.integer({ min: 0, max: 9 }), {
    minLength: 1,
    maxLength: 4,
  });
  const passthroughValueArb = fc.oneof(passthroughStringArb, passthroughArrayArb);

  // Avoid clashing with any known frontmatter key so the passthrough bucket
  // stays truly "unknown". Only lowercase keys can be produced by the regex,
  // so camelCase known keys (maxTurns, permissionMode, ...) can't appear.
  const knownLowercaseKeys = new Set([
    'name',
    'tools',
    'model',
    'memory',
    'isolation',
    'effort',
    'color',
    'skills',
    'x-tier',
  ]);
  const passthroughKeyArb = fc
    .stringMatching(/^[a-z][a-z0-9-]{0,8}$/)
    .filter((k) => !knownLowercaseKeys.has(k));

  const passthroughRecordArb = fc
    .uniqueArray(fc.tuple(passthroughKeyArb, passthroughValueArb), {
      maxLength: 3,
      selector: (pair) => pair[0],
    })
    .map((pairs) => {
      const obj: Record<string, string | number[]> = {};
      for (const [k, v] of pairs) obj[k] = v;
      return obj;
    });

  // Build the frontmatter in SCHEMA ORDER for known fields, then append
  // passthrough keys. This matches the key ordering that
  // `agentFrontmatterSchema.parse()` emits on passthrough output, so the
  // round-trip assertion on `Object.keys` holds.
  const frontmatterArb = fc
    .record({
      name: nameArb,
      description: descriptionArb,
      tools: fc.option(toolsArb, { nil: undefined }),
      tier: fc.option(tierArb, { nil: undefined }),
      passthrough: passthroughRecordArb,
    })
    .map(({ name, description, tools, tier, passthrough }) => {
      const obj: Record<string, unknown> = { name, description };
      if (tools !== undefined) obj.tools = tools;
      if (tier !== undefined) obj['x-tier'] = tier;
      for (const k of Object.keys(passthrough)) {
        obj[k] = passthrough[k];
      }
      return obj;
    });

  it('serializeAgentFile round-trip preserves key order and passthrough keys', () => {
    fc.assert(
      fc.property(frontmatterArb, (input) => {
        // Validate the generated object through the Zod schema first — this
        // returns a typed AgentFrontmatter with passthrough keys preserved,
        // and avoids an `as T` cast on a synthesised value.
        const fm = agentFrontmatterSchema.parse(input);
        const serialized = serializeAgentFile(fm, 'body text');
        const parsed = parseAgentFile(serialized);
        // Tier-consistency warnings may appear (e.g., lead with no Agent tool)
        // but MUST NOT be fatal errors for well-formed inputs.
        expect(parsed.issues.every((i) => i.level === 'warning')).toBe(true);
        expect(parsed.frontmatter).toEqual(fm);
        expect(Object.keys(parsed.frontmatter)).toEqual(Object.keys(fm));
      }),
      { seed: 42, numRuns: 100 },
    );
  });
});

describe('agentNameSchema (property-based)', () => {
  it('agentNameSchema accepts valid slugs', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z0-9][a-z0-9-]{0,14}$/), (name) => {
        expect(agentNameSchema.safeParse(name).success).toBe(true);
      }),
      { seed: 42, numRuns: 100 },
    );
  });

  it('agentNameSchema rejects uppercase / leading-hyphen / special-char strings', () => {
    const invalidArb = fc.oneof(
      // Uppercase anywhere.
      fc.stringMatching(/^[A-Z][a-zA-Z0-9-]{0,10}$/),
      // Leading hyphen.
      fc.stringMatching(/^-[a-z0-9-]{0,10}$/),
      // Contains disallowed special character.
      fc.stringMatching(/^[a-z0-9][a-z0-9-]*[!@#$%^&*()_.][a-z0-9-]*$/),
      // Empty string.
      fc.constant(''),
      // Pure whitespace.
      fc.constant(' '),
    );
    fc.assert(
      fc.property(invalidArb, (bad) => {
        expect(agentNameSchema.safeParse(bad).success).toBe(false);
      }),
      { seed: 42, numRuns: 100 },
    );
  });
});
