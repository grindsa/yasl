import { NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { readJsonBody } from "@/lib/request-guard";
import {
  removeItemFromList,
  updateListItem,
  StoreError,
} from "@/lib/store";
import { queueListChangeNotification } from "@/lib/notify-hook";

export const DELETE = withAuth(async function DELETE(_request, ctx, routeCtx) {
  const params = await routeCtx!.params;
  try {
    const list = await removeItemFromList(
      ctx.groupId,
      params.id,
      params.itemId,
    );
    queueListChangeNotification(ctx.groupId, list);
    return NextResponse.json({ ok: true, list });
  } catch (err) {
    if (err instanceof StoreError) {
      return NextResponse.json({ ok: false, error: err.code }, { status: err.status });
    }
    throw err;
  }
});

/** Body: `{ name?: string, note?: string }` — empty note clears it. */
export const PATCH = withAuth(async function PATCH(request, ctx, routeCtx) {
  const params = await routeCtx!.params;
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body as { name?: unknown; note?: unknown } | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { ok: false, error: "invalid_body" },
      { status: 400 },
    );
  }

  const input: { name?: unknown; note?: unknown } = {};
  if (Object.prototype.hasOwnProperty.call(body, "name")) {
    input.name = body.name;
  }
  if (Object.prototype.hasOwnProperty.call(body, "note")) {
    input.note = body.note;
  }
  if (!("name" in input) && !("note" in input)) {
    return NextResponse.json(
      { ok: false, error: "nothing_to_update" },
      { status: 400 },
    );
  }

  try {
    const list = await updateListItem(
      ctx.groupId,
      params.id,
      params.itemId,
      input,
    );
    queueListChangeNotification(ctx.groupId, list);
    return NextResponse.json({ ok: true, list });
  } catch (err) {
    if (err instanceof StoreError) {
      return NextResponse.json(
        { ok: false, error: err.code },
        { status: err.status },
      );
    }
    throw err;
  }
});
