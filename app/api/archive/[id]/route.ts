import { NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { readJsonBody } from "@/lib/request-guard";
import {
  isDepartmentId,
  setArchiveDepartment,
  StoreError,
} from "@/lib/store";

/** Body: `{ department: DepartmentId }` — user override for aisle. */
export const PATCH = withAuth(async function PATCH(request, ctx, routeCtx) {
  const params = await routeCtx!.params;
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body as { department?: unknown } | null;
  if (!isDepartmentId(body?.department)) {
    return NextResponse.json(
      { ok: false, error: "invalid_department" },
      { status: 400 },
    );
  }
  try {
    const item = await setArchiveDepartment(
      ctx.groupId,
      params.id,
      body.department,
    );
    return NextResponse.json({ ok: true, item });
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
