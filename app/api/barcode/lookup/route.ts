import { NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { findArchiveByBarcode } from "@/lib/store";
import { lookupOpenFoodFacts } from "@/lib/open-food-facts";

export const GET = withAuth(async function GET(request, ctx) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim() ?? "";
  if (!code) {
    return NextResponse.json(
      { ok: false, error: "code_required" },
      { status: 400 },
    );
  }

  const archived = await findArchiveByBarcode(ctx.groupId, code);
  if (archived) {
    return NextResponse.json({
      ok: true,
      source: "archive",
      barcode: archived.barcode,
      item: archived,
    });
  }

  const off = await lookupOpenFoodFacts(code);
  if (off.ok) {
    return NextResponse.json({
      ok: true,
      source: "openfoodfacts",
      barcode: off.barcode,
      name: off.name,
    });
  }

  return NextResponse.json({
    ok: false,
    source: "unknown",
    barcode: code.replace(/\D/g, ""),
    error: off.reason,
  });
});
