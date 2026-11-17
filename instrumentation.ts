export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { startNotifyScheduler } = await import("./lib/notify");
  startNotifyScheduler();
}
