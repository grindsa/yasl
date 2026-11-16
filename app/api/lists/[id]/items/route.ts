import { NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { readJsonBody } from "@/lib/request-guard";
import {
  addItemToList,
  reorderListItems,
  sortListByDepartment,
  StoreError,
} from "@/lib/store";
import { departmentsEnabled } from "@/lib/features";
import { lookupOpenFoodFacts } from "@/lib/open-food-facts";

export const POST = withAuth(async function POST(request, ctx, routeCtx) {
  const params = await routeCtx!.params;
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body as {
    name?: unknown;
    id?: unknown;
    barcode?: unknown;
  } | null;
  const name = typeof body?.name === "string" ? body.name : undefined;
  const id = typeof body?.id === "string" ? body.id : undefined;
  const barcode = typeof body?.barcode === "string" ? body.barcode : undefined;

  try {
    // Barcode without name: try archive, then Open Food Facts, then ask client for a name.
    if (barcode && !id && !name?.trim()) {
      try {
        const result = await addItemToList(ctx.groupId, params.id, { barcode });
        return NextResponse.json(
          { ok: true, list: result.list, item: result.item, source: "archive" },
          { status: 201 },
        );
      } catch (err) {
        if (!(err instanceof StoreError) || err.code !== "barcode_unknown") {
          throw err;
        }
        const off = await lookupOpenFoodFacts(barcode);
        if (off.ok) {
          const result = await addItemToList(ctx.groupId, params.id, {
            barcode: off.barcode,
            name: off.name,
            offTags: off.categoriesTags,
          });
          return NextResponse.json(
            {
              ok: true,
              list: result.list,
              item: result.item,
              source: "openfoodfacts",
            },
            { status: 201 },
          );
        }
        return NextResponse.json(
          {
            ok: false,
            error: "needs_name",
            barcode: barcode.replace(/\D/g, ""),
            reason: off.reason,
          },
          { status: 404 },
        );
      }
    }

    const result = await addItemToList(ctx.groupId, params.id, {
      name,
      id,
      barcode,
    });
    return NextResponse.json(
      { ok: true, list: result.list, item: result.item, source: result.source },
      { status: 201 },
    );
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

/** Body: `{ order: string[] }` or `{ sortBy: "department" }`. */
export const PUT = withAuth(async function PUT(request, ctx, routeCtx) {
  const params = await routeCtx!.params;
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body as { order?: unknown; sortBy?: unknown } | null;

  try {
    if (body?.sortBy === "department") {
      if (!departmentsEnabled()) {
        return NextResponse.json(
          { ok: false, error: "departments_disabled" },
          { status: 403 },
        );
      }
      const list = await sortListByDepartment(ctx.groupId, params.id);
      return NextResponse.json({ ok: true, list });
    }

    const order = Array.isArray(body?.order)
      ? body.order.filter((id): id is string => typeof id === "string")
      : [];
    const list = await reorderListItems(ctx.groupId, params.id, order);
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
