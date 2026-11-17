import { scheduleListChangeNotification } from "./notify";

/** Fire-and-forget debounce schedule after a successful list mutation. */
export function queueListChangeNotification(
  groupId: string,
  list: { id: string; name: string },
): void {
  void scheduleListChangeNotification(groupId, list.id, list.name).catch(
    (err) => {
      console.error("[notify] schedule failed:", err);
    },
  );
}
