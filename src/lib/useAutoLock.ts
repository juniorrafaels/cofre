import { useEffect, useRef } from "react";

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "wheel", "touchstart"] as const;

export function useAutoLock(minutes: number, onTimeout: () => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!minutes || minutes <= 0) return;

    const reset = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(onTimeout, minutes * 60 * 1000);
    };

    reset();
    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, reset);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, reset);
    };
  }, [minutes, onTimeout]);
}
