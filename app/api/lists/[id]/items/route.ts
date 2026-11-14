import { NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { readJsonBody } from "@/lib/request-guard";
import { addItemToList, StoreError } from "@/lib/store";

export const POST = withAuth(async function POST(request, ctx, routeCtx) {
  const params = await routeCtx!.params;
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body as { name?: unknown; id?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name : undefined;
  const id = typeof body?.id === "string" ? body.id : undefined;
  try {
    const result = await addItemToList(ctx.groupId, params.id, { name, id });
    return NextResponse.json(
      { ok: true, list: result.list, item: result.item },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof StoreError) {
      return NextResponse.json({ ok: false, error: err.code }, { status: err.status });
    }
    throw err;
  }
});
