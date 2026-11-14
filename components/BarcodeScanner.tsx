"use client";

import { useEffect, useRef, useState } from "react";
import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from "@zxing/browser";
import { DecodeHintType, BarcodeFormat } from "@zxing/library";

type Props = {
  open: boolean;
  onClose: () => void;
  onDetected: (barcode: string) => void | Promise<void>;
  statusMessage?: string | null;
};

export function BarcodeScanner({
  open,
  onClose,
  onDetected,
  statusMessage,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastCodeRef = useRef<string>("");
  const lastAtRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    lastCodeRef.current = "";

    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
    ]);
    const reader = new BrowserMultiFormatReader(hints);

    const boot = window.setTimeout(() => {
      if (cancelled) return;
      setError(null);
      setStarting(true);
      void (async () => {
        try {
          if (!videoRef.current) return;
          const controls = await reader.decodeFromConstraints(
            {
              audio: false,
              video: {
                facingMode: { ideal: "environment" },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
            },
            videoRef.current,
            (result, _err, ctrl) => {
              controlsRef.current = ctrl;
              if (!result || cancelled) return;
              const text = result.getText().trim();
              if (!text) return;
              const now = Date.now();
              // Debounce duplicate reads of the same code.
              if (
                text === lastCodeRef.current &&
                now - lastAtRef.current < 2500
              ) {
                return;
              }
              lastCodeRef.current = text;
              lastAtRef.current = now;
              void onDetected(text);
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
            "Kamera nicht verfügbar. Bitte Berechtigung erlauben und HTTPS nutzen.",
          );
        }
      })();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(boot);
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [open, onDetected]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90 text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Barcode scannen"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="text-sm font-medium">Barcode scannen</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-white/15 px-3 py-2 text-sm"
        >
          Schließen
        </button>
      </div>

      <div className="relative mx-auto w-full max-w-lg flex-1 px-4 pb-6">
        <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-black">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            muted
            playsInline
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-40 w-[70%] rounded-xl border-2 border-white/70" />
          </div>
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
        ) : (
          <p className="mt-3 text-center text-sm text-white/80">
            {statusMessage ?? "Barcode in den Rahmen halten"}
          </p>
        )}
      </div>
    </div>
  );
}
