"use client";

import { useEffect, useRef, useState } from "react";

export function ClientChart({
  children,
  fallbackClassName = "h-full w-full rounded-[24px] bg-white/5 animate-pulse",
}: {
  children: React.ReactNode;
  fallbackClassName?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setReady(width > 0 && height > 0);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="h-full w-full">
      {ready ? children : <div className={fallbackClassName} />}
    </div>
  );
}
