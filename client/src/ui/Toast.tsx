import { useCallback, useEffect, useRef, useState } from 'react';

/** A single short-lived toast for big moments. */
export function useToast(ms = 2600) {
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);
  const timer = useRef(0);
  const show = useCallback(
    (text: string) => {
      clearTimeout(timer.current);
      setToast({ text, key: Date.now() });
      timer.current = window.setTimeout(() => setToast(null), ms);
    },
    [ms],
  );
  useEffect(() => () => clearTimeout(timer.current), []);
  return [toast, show] as const;
}

export function Toast({ toast }: { toast: { text: string; key: number } | null }) {
  if (!toast) return null;
  return (
    <div key={toast.key} className="toast" role="status">
      {toast.text}
    </div>
  );
}
