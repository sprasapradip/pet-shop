import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from '../../src/lib/csv.js';
import { booleanQuery } from '../../src/modules/products/product.service.js';
import { ageFrom } from '../../src/lib/dates.js';
import { safeNext } from '../../src/modules/auth/auth.schema.js';

describe('csv', () => {
  it('round trips quotes, commas and newlines', () => {
    const rows = [{ a: 'plain', b: 'with, comma', c: 'with "quotes"\nand newline' }];
    expect(parseCsv(toCsv(rows, ['a', 'b', 'c']))).toEqual(rows);
  });

  it('neutralises spreadsheet formulas on export', () => {
    expect(toCsv([{ a: '=HYPERLINK("x")' }], ['a'])).toContain(`'=HYPERLINK`);
  });
});

describe('search query', () => {
  it('builds a safe boolean full text query', () => {
    expect(booleanQuery('dog food')).toBe('+dog* +food*');
    expect(booleanQuery('royal-canin "maxi" +-*')).toBe('+royal* +canin* +maxi*');
    expect(booleanQuery('a')).toBe('');
  });
});

describe('helpers', () => {
  it('describes pet age', () => {
    const now = new Date('2026-10-05T00:00:00Z');
    expect(ageFrom('2026-08-01', now)).toBe('2 months');
    expect(ageFrom('2025-06-01', now)).toBe('1 year 4 months');
    expect(ageFrom('2026-09-20', now)).toBe('2 weeks');
  });

  it('only allows same-site redirects after login', () => {
    expect(safeNext('/account/orders')).toBe('/account/orders');
    expect(safeNext('//evil.com')).toBeUndefined();
    expect(safeNext('https://evil.com')).toBeUndefined();
    expect(safeNext('/\\evil.com')).toBeUndefined();
  });
});
