/** Client-only audio/haptic feedback for barcode scans. */

export type FeedbackKind = "detect" | "success" | "warn" | "error";

let sharedCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  if (!sharedCtx || sharedCtx.state === "closed") {
    sharedCtx = new AC();
  }
  return sharedCtx;
}

/** Unlock audio on iOS after a user gesture (opening the scanner). */
export async function unlockScanAudio(): Promise<void> {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      /* ignore */
    }
  }
}

function beep(
  ctx: AudioContext,
  opts: {
    frequency: number;
    duration: number;
    type?: OscillatorType;
    gain?: number;
    when?: number;
  },
): void {
  const when = opts.when ?? ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = opts.type ?? "sine";
  osc.frequency.value = opts.frequency;
  const peak = opts.gain ?? 0.18;
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(peak, when + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + opts.duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(when);
  osc.stop(when + opts.duration + 0.02);
}

export function playScanFeedback(kind: FeedbackKind): void {
  const ctx = getCtx();
  if (ctx) {
    if (ctx.state === "suspended") void ctx.resume();
    const t = ctx.currentTime;
    switch (kind) {
      case "detect":
        beep(ctx, { frequency: 880, duration: 0.07, when: t });
        break;
      case "success":
        beep(ctx, { frequency: 660, duration: 0.08, when: t });
        beep(ctx, { frequency: 990, duration: 0.12, gain: 0.2, when: t + 0.09 });
        break;
      case "warn":
        beep(ctx, { frequency: 420, duration: 0.12, type: "triangle", when: t });
        beep(ctx, {
          frequency: 360,
          duration: 0.14,
          type: "triangle",
          when: t + 0.12,
        });
        break;
      case "error":
        beep(ctx, { frequency: 220, duration: 0.22, type: "square", gain: 0.12 });
        break;
    }
  }

  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      switch (kind) {
        case "detect":
          navigator.vibrate(30);
          break;
        case "success":
          navigator.vibrate([40, 40, 60]);
          break;
        case "warn":
          navigator.vibrate([80, 50, 80]);
          break;
        case "error":
          navigator.vibrate([120, 60, 120]);
          break;
      }
    } catch {
      /* ignore */
    }
  }
}
