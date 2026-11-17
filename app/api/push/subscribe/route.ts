import { NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { findGroupById } from "@/lib/groups-config";
import { isPushConfigured } from "@/lib/push";
import {
  isValidPushSubscriptionBody,
  removePushSubscription,
  upsertPushSubscription,
} from "@/lib/push-subscriptions";
import { readJsonBody } from "@/lib/request-guard";

export const POST = withAuth(async function POST(request, ctx) {
  const group = findGroupById(ctx.groupId);
  if (!group?.notifications.enabled || !isPushConfigured()) {
    return NextResponse.json(
      { ok: false, error: "notifications_disabled" },
      { status: 403 },
    );
  }

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  if (!isValidPushSubscriptionBody(parsed.body)) {
    return NextResponse.json(
      { ok: false, error: "invalid_subscription" },
      { status: 400 },
    );
  }

  const ua = request.headers.get("user-agent") ?? undefined;
  await upsertPushSubscription(ctx.groupId, {
    endpoint: parsed.body.endpoint,
    keys: parsed.body.keys,
    userAgent: ua,
  });
  return NextResponse.json({ ok: true });
});

export const DELETE = withAuth(async function DELETE(request, ctx) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body as { endpoint?: unknown } | null;
  const endpoint =
    typeof body?.endpoint === "string" ? body.endpoint.trim() : "";
  if (!endpoint) {
    return NextResponse.json(
      { ok: false, error: "endpoint_required" },
      { status: 400 },
    );
  }
  await removePushSubscription(ctx.groupId, endpoint);
  return NextResponse.json({ ok: true });
});
