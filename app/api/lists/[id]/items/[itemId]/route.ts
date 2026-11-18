import { NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { readJsonBody } from "@/lib/request-guard";
import {
  removeItemFromList,
  updateListItemNote,
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

/** Body: `{ note: string }` — empty string clears the note. */
export const PATCH = withAuth(async function PATCH(request, ctx, routeCtx) {
  const params = await routeCtx!.params;
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body as { note?: unknown } | null;
  if (!body || !("note" in body) || typeof body.note !== "string") {
    return NextResponse.json(
      { ok: false, error: "note_required" },
      { status: 400 },
    );
  }

  try {
    const list = await updateListItemNote(
      ctx.groupId,
      params.id,
      params.itemId,
      body.note,
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
