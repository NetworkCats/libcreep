import { globSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('internal architecture', () => {
  it('does not contain the upstream presentation renderers', () => {
    const source = globSync('src/internal/**/*.ts')
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');

    expect(source).not.toMatch(/\b(?:export\s+)?function\s+\w+HTML\s*\(/);
    expect(source).not.toContain('HTMLNote');
    expect(source).not.toContain('modal-container');
  });

  it('keeps literal HTML tags confined to measurement probes', () => {
    const tagPattern =
      /<\/?(?:canvas|div|iframe|style|svg|text)(?:\s[^<>]*?)?\/?>/;
    const filesWithTags = globSync('src/**/*.ts')
      .filter((file) => tagPattern.test(readFileSync(file, 'utf8')))
      .sort();

    expect(filesWithTags).toEqual([
      'src/internal/cssmedia/index.ts',
      'src/internal/domrect/index.ts',
      'src/internal/fonts/index.ts',
      'src/internal/lies/index.ts',
      'src/internal/svg/index.ts',
    ]);
  });

  it('does not retain the upstream presentation-page snapshot', () => {
    expect(globSync('test/upstream/**/*')).toEqual([]);
  });
});
