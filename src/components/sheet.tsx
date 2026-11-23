"use client";
import { useEffect } from "react";
import { createPortal } from "react-dom";

export function Sheet({ open, onClose, children, wide, label }: { open: boolean; onClose: () => void; children: React.ReactNode; wide?: boolean; label: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`sheet ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={label}>
        <button className="sheet-close" onClick={onClose} aria-label="Zavřít">
          ×
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}
