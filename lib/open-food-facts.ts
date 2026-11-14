/**
 * Server-side product name lookup via Open Food Facts.
 * https://world.openfoodfacts.org/data
 */

const OFF_TIMEOUT_MS = 4_000;
const USER_AGENT =
  "YASL/0.1 (Yet Another Shopping List; https://ekz.mewes-im-netz.de)";

export type OffLookupResult =
  | { ok: true; name: string; barcode: string }
  | { ok: false; reason: "not_found" | "timeout" | "error" };

function normalizeBarcode(raw: string): string {
  return raw.replace(/\D/g, "");
}

function pickName(product: Record<string, unknown>): string | null {
  const candidates = [
    product.product_name_de,
    product.product_name,
    product.generic_name_de,
    product.generic_name,
    product.brands,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim().slice(0, 120);
  }
  return null;
}

export async function lookupOpenFoodFacts(
  barcodeRaw: string,
): Promise<OffLookupResult> {
  const barcode = normalizeBarcode(barcodeRaw);
  if (barcode.length < 8 || barcode.length > 18) {
    return { ok: false, reason: "not_found" };
  }

  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OFF_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      next: { revalidate: 0 },
    });
    if (!res.ok) return { ok: false, reason: "error" };
    const data = (await res.json()) as {
      status?: number;
      product?: Record<string, unknown>;
    };
    if (data.status !== 1 || !data.product) {
      return { ok: false, reason: "not_found" };
    }
    const name = pickName(data.product);
    if (!name) return { ok: false, reason: "not_found" };
    return { ok: true, name, barcode };
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      return { ok: false, reason: "timeout" };
    }
    return { ok: false, reason: "error" };
  } finally {
    clearTimeout(timer);
  }
}
