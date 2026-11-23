"use client";
import { Camera, Images } from "lucide-react";

/**
 * Two explicit entry points: `capture` forces the camera on iOS (no library), so the library button omits it.
 * `multiple` lets the gallery hand over several photos at once (e.g. fridge door + shelves + drawer).
 */
export function PhotoPick({ onFiles, busy, busyLabel = "Pracuji…", cameraLabel = "Vyfotit", libraryLabel = "Vybrat z galerie", multiple = false, size = "full" }: { onFiles: (files: File[]) => void; busy?: boolean; busyLabel?: string; cameraLabel?: string; libraryLabel?: string; multiple?: boolean; size?: "full" | "sm" }) {
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = ""; // allow picking the same photo again
    if (files.length) onFiles(files);
  };
  const cls = size === "sm" ? "btn btn-soft btn-sm" : "btn btn-primary";
  if (busy) return <button className={`${cls} ${size === "full" ? "btn-full" : ""}`} disabled>{busyLabel}</button>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: size === "full" ? "1fr 1fr" : "auto auto", gap: 8 }}>
      <label className={cls}>
        <Camera size={size === "sm" ? 16 : 18} /> {cameraLabel}
        <input type="file" accept="image/*" capture="environment" hidden onChange={pick} />
      </label>
      <label className={size === "sm" ? cls : "btn btn-soft"}>
        <Images size={size === "sm" ? 16 : 18} /> {libraryLabel}
        <input type="file" accept="image/*" multiple={multiple} hidden onChange={pick} />
      </label>
    </div>
  );
}
