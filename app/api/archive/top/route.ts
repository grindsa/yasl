import { NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { topArchive } from "@/lib/store";

export const GET = withAuth(async function GET(_request, ctx) {
  const items = await topArchive(ctx.groupId, 5);
  return NextResponse.json({ ok: true, items });
});
