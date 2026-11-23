"use client";
import { useEffect } from "react";

export function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production" && !location.search.includes("sw=1")) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    // ask the browser to keep our storage (installed iOS apps honour this)
    navigator.storage?.persist?.().catch(() => {});
  }, []);
  return null;
}
