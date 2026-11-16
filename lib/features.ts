/** Runtime feature flags from process.env (Docker/.env without rebuild). */

export function departmentsEnabled(): boolean {
  const v = process.env.ENABLE_DEPARTMENTS?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Soft-delete grace period before an item is actually removed (ms). */
export function itemDeleteDelayMs(): number {
  const raw = process.env.ITEM_DELETE_DELAY_SECONDS?.trim();
  if (!raw) return 3000;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n < 0) return 3000;
  return Math.round(n * 1000);
}
