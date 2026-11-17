import { sendNotification, setVapidDetails } from "web-push";
import {
  listPushSubscriptions,
  removePushSubscription,
  type PushSubscriptionRecord,
} from "./push-subscriptions";

export type ListChangePushPayload = {
  title: string;
  body: string;
  url: string;
  listId: string;
  groupId: string;
};

export function isPushConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY?.trim() &&
      process.env.VAPID_PRIVATE_KEY?.trim(),
  );
}

export function getVapidPublicKey(): string | null {
  const key = process.env.VAPID_PUBLIC_KEY?.trim();
  return key || null;
}

function vapidSubject(): string {
  return (
    process.env.VAPID_SUBJECT?.trim() || "mailto:yasl@localhost"
  );
}

function ensureVapid(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return false;
  setVapidDetails(vapidSubject(), publicKey, privateKey);
  return true;
}

export async function sendListChangePush(
  groupId: string,
  payload: ListChangePushPayload,
): Promise<{ sent: number; removed: number }> {
  if (!ensureVapid()) {
    return { sent: 0, removed: 0 };
  }

  const subs = await listPushSubscriptions(groupId);
  if (subs.length === 0) return { sent: 0, removed: 0 };

  const body = JSON.stringify(payload);
  let sent = 0;
  let removed = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await sendNotification(toWebPushSubscription(sub), body, {
          TTL: 60 * 60,
          urgency: "normal",
          topic: `list-${payload.listId}`.slice(0, 32),
        });
        sent += 1;
      } catch (err) {
        const status =
          err && typeof err === "object" && "statusCode" in err
            ? Number((err as { statusCode: unknown }).statusCode)
            : NaN;
        if (status === 404 || status === 410) {
          await removePushSubscription(groupId, sub.endpoint);
          removed += 1;
          return;
        }
        console.error(`[push] send failed for ${groupId}:`, err);
      }
    }),
  );

  return { sent, removed };
}

function toWebPushSubscription(sub: PushSubscriptionRecord) {
  return {
    endpoint: sub.endpoint,
    keys: {
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    },
  };
}
