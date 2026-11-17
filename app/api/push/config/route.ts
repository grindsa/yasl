import { NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { findGroupById } from "@/lib/groups-config";
import { getVapidPublicKey, isPushConfigured } from "@/lib/push";

export const GET = withAuth(async function GET(_request, ctx) {
  const group = findGroupById(ctx.groupId);
  const enabled = Boolean(
    group?.notifications.enabled && isPushConfigured(),
  );
  return NextResponse.json({
    enabled,
    vapidPublicKey: enabled ? getVapidPublicKey() : null,
    debounceSeconds: group?.notifications.debounceSeconds ?? null,
  });
});
