import { describe, expect, it } from 'vitest';
import { isMobile, nepalPhone, normalizePhone } from '../../src/lib/phone.js';

describe('Nepali phone validation', () => {
  it.each(['9841234567', '+9779841234567', '+977-9841234567', '9761234567', '9612345678', '015234516', '01-5234516', '+977-1-5234516', '98 4123 4567'])(
    'accepts %s',
    (p) => expect(nepalPhone.safeParse(p).success).toBe(true),
  );

  it.each(['12345', '9941234567', '98412345', '+91 9841234567', 'abc', ''])('rejects %s', (p) =>
    expect(nepalPhone.safeParse(p).success).toBe(false),
  );

  it('normalizes to a canonical form', () => {
    expect(normalizePhone('+977-9841234567')).toBe('9841234567');
    expect(normalizePhone('+977-1-5234516')).toBe('015234516');
    expect(normalizePhone('01-5234516')).toBe('015234516');
    expect(nepalPhone.parse(' +977 984 123 4567 ')).toBe('9841234567');
  });

  it('detects mobiles', () => {
    expect(isMobile('9841234567')).toBe(true);
    expect(isMobile('015234516')).toBe(false);
  });
});
