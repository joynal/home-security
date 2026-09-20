/**
 * useVisible — IntersectionObserver + tab-visibility gating.
 * Returns whether an element is on-screen AND the tab is focused.
 * Used to pause MJPEG streams for off-screen tiles (bandwidth).
 */
import { useEffect, useRef, useState, type RefObject } from 'react';

export default function useVisible<T extends HTMLElement = HTMLElement>(): [
  RefObject<T | null>,
  boolean,
] {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState<boolean>(true); // assume visible until proven otherwise

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let inViewport = true;
    let tabFocused = !document.hidden;

    const update = () => setVisible(inViewport && tabFocused);

    const observer = new IntersectionObserver(
      ([entry]) => {
        inViewport = entry.isIntersecting;
        update();
      },
      { threshold: 0.1 },
    );
    observer.observe(el);

    const onVisibility = () => {
      tabFocused = !document.hidden;
      update();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return [ref, visible];
}
