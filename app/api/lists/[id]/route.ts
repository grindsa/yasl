import { NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { readJsonBody } from "@/lib/request-guard";
import {
  deleteList,
  getList,
  renameList,
  StoreError,
} from "@/lib/store";

export const GET = withAuth(async function GET(request, ctx, routeCtx) {
  const params = await routeCtx!.params;
  const id = params.id;
  const list = await getList(ctx.groupId, id);
  if (!list) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const ifNoneMatch = request.headers.get("if-none-match");
  const etag = `"${list.revision}"`;
  if (ifNoneMatch === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag },
    });
  }

  return NextResponse.json(
    { ok: true, list },
    { headers: { ETag: etag } },
  );
});

export const PATCH = withAuth(async function PATCH(request, ctx, routeCtx) {
  const params = await routeCtx!.params;
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body as { name?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name : "";
  try {
    const list = await renameList(ctx.groupId, params.id, name);
    return NextResponse.json({ ok: true, list });
  } catch (err) {
    if (err instanceof StoreError) {
      return NextResponse.json({ ok: false, error: err.code }, { status: err.status });
    }
    throw err;
  }
});

export const DELETE = withAuth(async function DELETE(_request, ctx, routeCtx) {
  const params = await routeCtx!.params;
  try {
    await deleteList(ctx.groupId, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof StoreError) {
      return NextResponse.json({ ok: false, error: err.code }, { status: err.status });
    }
    throw err;
  }
});
