"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from "@zxing/browser";
import { DecodeHintType, BarcodeFormat } from "@zxing/library";
import {
  playScanFeedback,
  unlockScanAudio,
  type FeedbackKind,
} from "@/lib/scan-feedback";

export type ScanFeedback = {
  kind: "pending" | "success" | "warn" | "error";
  title: string;
  detail?: string;
} | null;

type Props = {
  open: boolean;
  onClose: () => void;
  onDetected: (barcode: string) => void | Promise<void>;
  feedback?: ScanFeedback;
};

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
};

type BarcodeDetectorCtor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorLike;

function getBarcodeDetector(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  const ctor = (
    window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }
  ).BarcodeDetector;
  return ctor ?? null;
}

const PRODUCT_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
];

const BANNER: Record<
  NonNullable<ScanFeedback>["kind"],
  { bg: string; border: string; flash: string }
> = {
  pending: {
    bg: "bg-sky/90",
    border: "border-sky",
    flash: "bg-sky/40",
  },
  success: {
    bg: "bg-emerald-600/95",
    border: "border-emerald-400",
    flash: "bg-emerald-400/50",
  },
  warn: {
    bg: "bg-amber-600/95",
    border: "border-amber-300",
    flash: "bg-amber-400/45",
  },
  error: {
    bg: "bg-red-700/95",
    border: "border-red-400",
    flash: "bg-red-500/45",
  },
};

export function BarcodeScanner({
  open,
  onClose,
  onDetected,
  feedback,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const rafRef = useRef<number>(0);
  const lastCodeRef = useRef("");
  const lastAtRef = useRef(0);
  const onDetectedRef = useRef(onDetected);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [engine, setEngine] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [flashKind, setFlashKind] = useState<FeedbackKind | null>(null);
  const manualId = useId();
  const prevFeedbackKey = useRef<string>("");

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  // Visual flash + result tones (Piep beim Erkennen passiert schon in emit()).
  useEffect(() => {
    if (!feedback) return;
    const key = `${feedback.kind}:${feedback.title}:${feedback.detail ?? ""}`;
    if (key === prevFeedbackKey.current) return;
    prevFeedbackKey.current = key;
    // pending: nur Banner, Ton kam schon beim Scan
    if (feedback.kind === "pending") {
      const flashOn = window.setTimeout(() => setFlashKind("detect"), 0);
      const flashOff = window.setTimeout(() => setFlashKind(null), 280);
      return () => {
        window.clearTimeout(flashOn);
        window.clearTimeout(flashOff);
      };
    }
    const map: Record<"success" | "warn" | "error", FeedbackKind> = {
      success: "success",
      warn: "warn",
      error: "error",
    };
    const kind = map[feedback.kind];
    playScanFeedback(kind);
    const flashOn = window.setTimeout(() => setFlashKind(kind), 0);
    const flashOff = window.setTimeout(() => setFlashKind(null), 450);
    return () => {
      window.clearTimeout(flashOn);
      window.clearTimeout(flashOff);
    };
  }, [feedback]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    lastCodeRef.current = "";
    lastAtRef.current = 0;
    prevFeedbackKey.current = "";

    const emit = (raw: string) => {
      const text = raw.replace(/\s+/g, "").trim();
      if (!text) return;
      const digits = text.replace(/\D/g, "");
      const code = digits.length >= 8 ? digits : text;
      if (code.length < 6) return;
      const now = Date.now();
      if (code === lastCodeRef.current && now - lastAtRef.current < 2000) {
        return;
      }
      lastCodeRef.current = code;
      lastAtRef.current = now;
      // Sofortiger Piepton beim erfolgreichen Scannen.
      playScanFeedback("detect");
      setFlashKind("detect");
      window.setTimeout(() => setFlashKind(null), 280);
      void onDetectedRef.current(code);
    };

    const stopStream = () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      controlsRef.current?.stop();
      controlsRef.current = null;
      const stream = streamRef.current;
      if (stream) {
        for (const track of stream.getTracks()) track.stop();
        streamRef.current = null;
      }
      const video = videoRef.current;
      if (video) video.srcObject = null;
    };

    const boot = window.setTimeout(() => {
      if (cancelled) return;
      setError(null);
      setStarting(true);
      setManualOpen(false);
      void unlockScanAudio();

      void (async () => {
        const video = videoRef.current;
        if (!video) return;

        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
          });
          for (const track of stream.getVideoTracks()) {
            const caps = track.getCapabilities?.() as
              | { focusMode?: string[] }
              | undefined;
            if (caps?.focusMode?.includes("continuous")) {
              try {
                await track.applyConstraints({
                  // @ts-expect-error focusMode is not in all TS DOM libs
                  advanced: [{ focusMode: "continuous" }],
                });
              } catch {
                /* ignore */
              }
            }
          }
          if (cancelled) {
            for (const track of stream.getTracks()) track.stop();
            return;
          }
          streamRef.current = stream;
          video.srcObject = stream;
          video.setAttribute("playsinline", "true");
          video.muted = true;
          await video.play();
          await unlockScanAudio();

          await new Promise<void>((resolve) => {
            if (video.readyState >= 2) {
              resolve();
              return;
            }
            const onReady = () => {
              video.removeEventListener("loadeddata", onReady);
              resolve();
            };
            video.addEventListener("loadeddata", onReady);
          });

          if (cancelled) {
            stopStream();
            return;
          }

          const Detector = getBarcodeDetector();
          if (Detector) {
            setEngine("BarcodeDetector");
            const detector = new Detector({
              formats: [
                "ean_13",
                "ean_8",
                "upc_a",
                "upc_e",
                "code_128",
                "code_39",
              ],
            });

            let busy = false;
            const tick = async () => {
              if (cancelled) return;
              if (!busy && video.readyState >= 2) {
                busy = true;
                try {
                  const codes = await detector.detect(video);
                  if (codes.length > 0 && codes[0]?.rawValue) {
                    emit(codes[0].rawValue);
                  }
                } catch {
                  /* frame skipped */
                } finally {
                  busy = false;
                }
              }
              rafRef.current = requestAnimationFrame(() => {
                void tick();
              });
            };
            setStarting(false);
            rafRef.current = requestAnimationFrame(() => {
              void tick();
            });
            return;
          }

          setEngine("ZXing");
          const hints = new Map<DecodeHintType, unknown>();
          hints.set(DecodeHintType.POSSIBLE_FORMATS, PRODUCT_FORMATS);
          hints.set(DecodeHintType.TRY_HARDER, true);
          const reader = new BrowserMultiFormatReader(hints, {
            delayBetweenScanAttempts: 100,
            delayBetweenScanSuccess: 1500,
          });
          const controls = await reader.decodeFromStream(
            stream,
            video,
            (result) => {
              if (!result || cancelled) return;
              emit(result.getText());
            },
          );
          if (cancelled) {
            controls.stop();
            return;
          }
          controlsRef.current = controls;
          setStarting(false);
        } catch (err) {
          if (cancelled) return;
          console.error("[barcode]", err);
          setStarting(false);
          setError(
            "Kamera nicht verfügbar. Bitte Zugriff erlauben (HTTPS) oder Code manuell eingeben.",
          );
        }
      })();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(boot);
      stopStream();
    };
  }, [open]);

  if (!open) return null;

  const banner = feedback ? BANNER[feedback.kind] : null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Barcode scannen"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div>
          <p className="text-sm font-medium">Barcode scannen</p>
          {engine ? (
            <p className="text-xs text-white/50">{engine}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-white/15 px-3 py-2 text-sm"
        >
          Schließen
        </button>
      </div>

      <div className="relative mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-6">
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-black">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            muted
            playsInline
            autoPlay
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className={`h-28 w-[85%] max-w-sm rounded-lg border-2 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] transition-colors ${
                feedback?.kind === "success"
                  ? "border-emerald-300"
                  : feedback?.kind === "warn"
                    ? "border-amber-300"
                    : feedback?.kind === "error"
                      ? "border-red-400"
                      : "border-white/80"
              }`}
            />
          </div>

          {/* Full-frame flash on detect / result */}
          {flashKind ? (
            <div
              className={`pointer-events-none absolute inset-0 animate-pulse ${
                flashKind === "success"
                  ? BANNER.success.flash
                  : flashKind === "warn"
                    ? BANNER.warn.flash
                    : flashKind === "error"
                      ? BANNER.error.flash
                      : "bg-white/35"
              }`}
              aria-hidden
            />
          ) : null}

          {/* Large result banner over the camera */}
          {feedback ? (
            <div
              className={`absolute inset-x-3 bottom-3 rounded-2xl border px-4 py-4 text-center shadow-lg ${banner!.bg} ${banner!.border}`}
              role="status"
              aria-live="polite"
            >
              <p className="text-lg font-semibold leading-snug">
                {feedback.title}
              </p>
              {feedback.detail ? (
                <p className="mt-1 text-sm text-white/90">{feedback.detail}</p>
              ) : null}
            </div>
          ) : null}
        </div>

        {starting ? (
          <p className="mt-3 text-center text-sm text-white/80">
            Kamera startet…
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 text-center text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : !feedback ? (
          <p className="mt-3 text-center text-sm text-white/80">
            Barcode quer und nah in den hellen Rahmen halten
          </p>
        ) : null}

        {manualOpen ? (
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const code = manualCode.trim();
              if (!code) return;
              playScanFeedback("detect");
              void onDetectedRef.current(code);
              setManualCode("");
            }}
          >
            <label htmlFor={manualId} className="sr-only">
              Barcode manuell
            </label>
            <input
              id={manualId}
              inputMode="numeric"
              autoComplete="off"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="EAN / Barcode tippen"
              className="min-w-0 flex-1 rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-base text-white outline-none ring-sky focus:ring-2"
            />
            <button
              type="submit"
              className="rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-on-accent"
            >
              OK
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              void unlockScanAudio();
              setManualOpen(true);
            }}
            className="mt-4 text-center text-sm text-white/70 underline-offset-2 hover:underline"
          >
            Code manuell eingeben
          </button>
        )}
      </div>
    </div>
  );
}
