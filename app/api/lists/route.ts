import { NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { readJsonBody } from "@/lib/request-guard";
import { createList, listSummaries, StoreError } from "@/lib/store";

export const GET = withAuth(async function GET(_request, ctx) {
  const lists = await listSummaries(ctx.groupId);
  return NextResponse.json({
    ok: true,
    groupId: ctx.groupId,
    groupName: ctx.groupName,
    lists,
  });
});

export const POST = withAuth(async function POST(request, ctx) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body as { name?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name : "";
  try {
    const list = await createList(ctx.groupId, name);
    return NextResponse.json({ ok: true, list }, { status: 201 });
  } catch (err) {
    if (err instanceof StoreError) {
      return NextResponse.json({ ok: false, error: err.code }, { status: err.status });
    }
    throw err;
  }
});
