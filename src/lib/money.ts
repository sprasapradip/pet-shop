/** All money is stored as integer paisa (1 rupee = 100 paisa). */

export const toPaisa = (rupees: number | string): number => {
  const n = typeof rupees === 'string' ? Number(rupees.replace(/,/g, '')) : rupees;
  if (!Number.isFinite(n)) throw new Error(`Invalid amount: ${rupees}`);
  return Math.round(n * 100);
};

export const toRupees = (paisa: number): number => paisa / 100;

/** Formats paisa with Nepali digit grouping: Rs 1,23,456 (paisa shown only when non zero). */
export function formatNpr(paisa: number | null | undefined): string {
  if (paisa === null || paisa === undefined) return '';
  const negative = paisa < 0;
  const abs = Math.abs(paisa);
  const rupees = Math.floor(abs / 100);
  const fraction = abs % 100;
  const digits = String(rupees);
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
  return `${negative ? '-' : ''}Rs ${grouped}${fraction ? `.${String(fraction).padStart(2, '0')}` : ''}`;
}

/** eSewa expects rupee strings like "1500" or "1500.50". */
export const rupeeString = (paisa: number): string => {
  const r = paisa / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
};
