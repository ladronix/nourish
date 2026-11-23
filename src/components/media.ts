"use client";

/** Downscale a photo to ≤ maxSide px JPEG (keeps uploads small and fast on mobile data). */
export async function compressImage(file: File, maxSide = 1400, quality = 0.82): Promise<Blob> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k);
  const h = Math.round(bmp.height * k);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  return new Promise((res) => canvas.toBlob((b) => res(b ?? file), "image/jpeg", quality));
}

export async function postImage<T>(url: string, file: File, extra: Record<string, string> = {}): Promise<T> {
  // Fridge / receipt scans need readable labels → larger side; meal photos are fine at 1400 px.
  const blob = await compressImage(file, url.includes("inventory-scan") ? 1600 : 1400);
  const fd = new FormData();
  fd.append("image", new File([blob], "photo.jpg", { type: "image/jpeg" }));
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  const r = await fetch(url, { method: "POST", body: fd });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "Chyba");
  return j as T;
}

export function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
