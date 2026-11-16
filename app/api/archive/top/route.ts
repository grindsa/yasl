import { NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { topArchive } from "@/lib/store";

export const GET = withAuth(async function GET(_request, ctx) {
  // Larger pool so the client can hide items already on the list and still show 5.
  const items = await topArchive(ctx.groupId, 40);
  return NextResponse.json({ ok: true, items });
});
