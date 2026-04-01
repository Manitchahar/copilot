import { useCallback, useEffect, useRef, useState } from "react";

export function useSmartScroll(deps) {
  const containerRef = useRef(null);
  const sentinelRef = useRef(null);
  const isNearBottom = useRef(true);
  const [showPill, setShowPill] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const container = containerRef.current;
    if (!sentinel || !container) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        isNearBottom.current = entry.isIntersecting;
        if (entry.isIntersecting) setShowPill(false);
      },
      { root: container, threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (isNearBottom.current && containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: "smooth",
      });
    } else if (!isNearBottom.current) {
      setShowPill(true);
    }
  }, deps);

  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: "smooth",
      });
      setShowPill(false);
    }
  }, []);

  return { containerRef, sentinelRef, showPill, scrollToBottom };
}
