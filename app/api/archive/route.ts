import { NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { searchArchive } from "@/lib/store";

export const GET = withAuth(async function GET(request, ctx) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const items = await searchArchive(ctx.groupId, q);
  return NextResponse.json({ ok: true, items });
});
