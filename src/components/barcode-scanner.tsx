"use client";
import { useEffect, useRef, useState } from "react";
import { PhotoPick } from "./photo-pick";

/**
 * EAN scanner. Uses native BarcodeDetector when present, otherwise the zxing-wasm ponyfill
 * served from /barcode (iOS Safari has no BarcodeDetector). Falls back to a still photo
 * (<input capture>) which avoids iOS standalone camera-permission quirks.
 */
async function getDetector() {
  const formats = ["ean_13", "ean_8", "upc_a", "upc_e"];
  const g = globalThis as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (s: CanvasImageSource | Blob | ImageBitmap) => Promise<{ rawValue: string }[]> } };
  if (g.BarcodeDetector) return new g.BarcodeDetector({ formats });
  const mod = await import("barcode-detector/ponyfill");
  mod.prepareZXingModule({
    overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? `/barcode/${path}` : prefix + path) },
  });
  return new mod.BarcodeDetector({ formats: formats as never });
}

export function BarcodeScanner({ onCode }: { onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [manual, setManual] = useState("");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stop = false;
    let raf = 0;
    (async () => {
      try {
        const det = await getDetector();
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false });
        if (stop || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        setLive(true);
        const tick = async () => {
          if (stop || !video.current) return;
          try {
            const r = await det.detect(video.current);
            if (r[0]?.rawValue) {
              navigator.vibrate?.(40);
              onCode(r[0].rawValue);
              return;
            }
          } catch {
            /* frame not ready */
          }
          raf = window.setTimeout(tick, 220) as unknown as number;
        };
        tick();
      } catch (e) {
        setErr((e as Error).name === "NotAllowedError" ? "Kamera není povolená. Vyfoť kód nebo ho napiš." : "Živé skenování není dostupné. Vyfoť kód nebo ho napiš.");
      }
    })();
    return () => {
      stop = true;
      clearTimeout(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);

  async function fromPhoto(f: File) {
    try {
      const det = await getDetector();
      const bmp = await createImageBitmap(f);
      const r = await det.detect(bmp);
      if (r[0]?.rawValue) onCode(r[0].rawValue);
      else setErr("Na fotce jsem kód nenašel. Zkus to blíž a ostřeji.");
    } catch {
      setErr("Fotku se nepodařilo přečíst.");
    }
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className="scanner" style={{ display: err && !live ? "none" : undefined }}>
        <video ref={video} playsInline muted />
      </div>
      {err && <p className="note warn">{err}</p>}
      <div className="row" style={{ flexWrap: "wrap" }}>
        <PhotoPick size="sm" onFiles={(f) => fromPhoto(f[0])} cameraLabel="Vyfotit kód" libraryLabel="Z galerie" />
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (/^\d{8,14}$/.test(manual)) onCode(manual);
          }}
        >
          <input className="input" inputMode="numeric" placeholder="EAN ručně" value={manual} onChange={(e) => setManual(e.target.value.replace(/\D/g, ""))} style={{ width: 160, minHeight: 34 }} />
          <button className="btn btn-sm btn-dark" disabled={!/^\d{8,14}$/.test(manual)}>
            Hledat
          </button>
        </form>
      </div>
    </div>
  );
}

export type BarcodeProduct = { source: string; ingredientId: string | null; name: string; unit: "g" | "ml" | "ks"; qty?: number | null; image?: string | null; per100: { kcal: number; protein: number; carbs: number; fat: number; fiber: number } };

export async function lookupBarcode(code: string): Promise<BarcodeProduct> {
  const r = await fetch(`/api/barcode/${code}`);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "Produkt nenalezen.");
  return j;
}
