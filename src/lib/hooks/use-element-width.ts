"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Tracks an element's content width so SVG charts can draw at real pixel
 * size (keeping text legible on small screens) instead of scaling a viewBox.
 */
export function useElementWidth<T extends HTMLElement>(initialWidth: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(initialWidth);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}
