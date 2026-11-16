/** Runtime feature flags from process.env (Docker/.env without rebuild). */

export function departmentsEnabled(): boolean {
  const v = process.env.ENABLE_DEPARTMENTS?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}
