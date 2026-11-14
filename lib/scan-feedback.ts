/** Client-only audio/haptic feedback for barcode scans. */

export type FeedbackKind = "detect" | "success" | "warn" | "error";

let sharedCtx: AudioContext | null = null;
let unlocked = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  if (!sharedCtx || sharedCtx.state === "closed") {
    sharedCtx = new AC();
    unlocked = false;
  }
  return sharedCtx;
}

/**
 * Call from a user gesture (opening the scanner). Unlocks Web Audio on iOS
 * by resuming the context and playing a near-silent blip.
 */
export async function unlockScanAudio(): Promise<void> {
  const ctx = getCtx();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") await ctx.resume();
    // Silent kick so later beeps are allowed without another gesture.
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t = ctx.currentTime;
    osc.start(t);
    osc.stop(t + 0.01);
    unlocked = true;
  } catch {
    /* ignore */
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
  osc.type = opts.type ?? "square";
  osc.frequency.setValueAtTime(opts.frequency, when);
  const peak = opts.gain ?? 0.28;
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(peak, when + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + opts.duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(when);
  osc.stop(when + opts.duration + 0.03);
}

/** Classic POS-style piep when a barcode is read. */
export function playScanBeep(): void {
  playScanFeedback("detect");
}

export function playScanFeedback(kind: FeedbackKind): void {
  const ctx = getCtx();
  if (ctx) {
    if (ctx.state === "suspended") {
      void ctx.resume().then(() => {
        if (!unlocked) unlocked = true;
      });
    }
    const t = ctx.currentTime;
    switch (kind) {
      case "detect":
        // Kurzer, klarer Piepton (Kassenscanner-ähnlich)
        beep(ctx, {
          frequency: 2400,
          duration: 0.12,
          type: "square",
          gain: 0.32,
          when: t,
        });
        break;
      case "success":
        beep(ctx, {
          frequency: 1800,
          duration: 0.09,
          type: "square",
          gain: 0.28,
          when: t,
        });
        beep(ctx, {
          frequency: 2400,
          duration: 0.14,
          type: "square",
          gain: 0.3,
          when: t + 0.1,
        });
        break;
      case "warn":
        beep(ctx, {
          frequency: 900,
          duration: 0.1,
          type: "square",
          gain: 0.22,
          when: t,
        });
        beep(ctx, {
          frequency: 700,
          duration: 0.14,
          type: "square",
          gain: 0.22,
          when: t + 0.12,
        });
        break;
      case "error":
        beep(ctx, {
          frequency: 400,
          duration: 0.25,
          type: "square",
          gain: 0.2,
          when: t,
        });
        break;
    }
  }

  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      switch (kind) {
        case "detect":
          navigator.vibrate(40);
          break;
        case "success":
          navigator.vibrate([35, 40, 55]);
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
