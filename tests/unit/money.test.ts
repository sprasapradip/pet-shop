import { describe, expect, it } from 'vitest';
import { formatNpr, rupeeString, toPaisa } from '../../src/lib/money.js';

describe('money', () => {
  it('converts rupees to integer paisa without float errors', () => {
    expect(toPaisa(19.99)).toBe(1999);
    expect(toPaisa('1,250.50')).toBe(125050);
    expect(toPaisa(0.1 + 0.2)).toBe(30);
  });

  it('formats with Nepali digit grouping', () => {
    expect(formatNpr(0)).toBe('Rs 0');
    expect(formatNpr(99900)).toBe('Rs 999');
    expect(formatNpr(100000)).toBe('Rs 1,000');
    expect(formatNpr(12345600)).toBe('Rs 1,23,456');
    expect(formatNpr(1234567800)).toBe('Rs 1,23,45,678');
    expect(formatNpr(150050)).toBe('Rs 1,500.50');
    expect(formatNpr(-50000)).toBe('-Rs 500');
    expect(formatNpr(null)).toBe('');
  });

  it('produces eSewa amount strings', () => {
    expect(rupeeString(150000)).toBe('1500');
    expect(rupeeString(150050)).toBe('1500.50');
  });
});
