import { describe, expect, it } from 'vitest';
import { deliveryFee } from '../../src/modules/orders/delivery.js';

const cfg = { ringRoadPaisa: 10_000, valleyPaisa: 15_000, outsideBasePaisa: 25_000, outsidePerKgPaisa: 5_000, freeAbovePaisa: 500_000 };

describe('delivery fee', () => {
  it('charges flat rates inside the valley', () => {
    expect(deliveryFee('RING_ROAD', 20_000, 100_000, cfg)).toBe(10_000);
    expect(deliveryFee('VALLEY', 20_000, 100_000, cfg)).toBe(15_000);
  });

  it('is free inside the valley above the threshold', () => {
    expect(deliveryFee('RING_ROAD', 1000, 500_000, cfg)).toBe(0);
    expect(deliveryFee('VALLEY', 1000, 600_000, cfg)).toBe(0);
  });

  it('charges by weight outside the valley, never free', () => {
    expect(deliveryFee('OUTSIDE', 800, 100_000, cfg)).toBe(25_000);
    expect(deliveryFee('OUTSIDE', 1000, 100_000, cfg)).toBe(25_000);
    expect(deliveryFee('OUTSIDE', 1001, 100_000, cfg)).toBe(30_000);
    expect(deliveryFee('OUTSIDE', 10_000, 900_000, cfg)).toBe(25_000 + 9 * 5_000);
  });

  it('never makes delivery free when the threshold is 0', () => {
    expect(deliveryFee('RING_ROAD', 1000, 9_999_999, { ...cfg, freeAbovePaisa: 0 })).toBe(10_000);
  });
});
