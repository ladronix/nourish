"use client";
import { createContext, useCallback, useContext, useRef, useState } from "react";

type Toast = { id: number; text: string; error?: boolean };
const Ctx = createContext<(text: string, error?: boolean) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [t, setT] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((text: string, error?: boolean) => {
    if (timer.current) clearTimeout(timer.current);
    setT({ id: Date.now(), text, error });
    timer.current = setTimeout(() => setT(null), error ? 5000 : 2800);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div aria-live="polite" role="status">
        {t && (
          <div className="toast" key={t.id} onClick={() => setT(null)}>
            <span className={`ok ${t.error ? "err" : ""}`}>{t.error ? "!" : "✓"}</span>
            <p>{t.text}</p>
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
