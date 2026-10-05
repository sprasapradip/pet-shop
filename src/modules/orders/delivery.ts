import type { DeliveryZone } from '../../config/constants.js';
import type { DeliverySettings } from '../settings/settings.service.js';

/**
 * Delivery fee in paisa.
 * - Inside Ring Road and rest of the valley: flat rate.
 * - Outside the valley: base rate plus a per kg rate for every kg above the first (rounded up).
 * - Free when the subtotal reaches `freeAbovePaisa` (inside the valley only; 0 disables).
 */
export function deliveryFee(zone: DeliveryZone, weightGrams: number, subtotalPaisa: number, cfg: DeliverySettings): number {
  if (zone !== 'OUTSIDE' && cfg.freeAbovePaisa > 0 && subtotalPaisa >= cfg.freeAbovePaisa) return 0;
  if (zone === 'RING_ROAD') return cfg.ringRoadPaisa;
  if (zone === 'VALLEY') return cfg.valleyPaisa;
  const extraKg = Math.max(0, Math.ceil(weightGrams / 1000) - 1);
  return cfg.outsideBasePaisa + extraKg * cfg.outsidePerKgPaisa;
}
