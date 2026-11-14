import { NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { removeItemFromList, StoreError } from "@/lib/store";

export const DELETE = withAuth(async function DELETE(_request, ctx, routeCtx) {
  const params = await routeCtx!.params;
  try {
    const list = await removeItemFromList(
      ctx.groupId,
      params.id,
      params.itemId,
    );
    return NextResponse.json({ ok: true, list });
  } catch (err) {
    if (err instanceof StoreError) {
      return NextResponse.json({ ok: false, error: err.code }, { status: err.status });
    }
    throw err;
  }
});
