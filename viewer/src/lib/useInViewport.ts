import { useEffect, useRef, useState } from "react";

/**
 * 要素がビューポート（またはその近傍）に入ったことを検知するフック。
 * 一度trueになった後は監視をやめ、falseに戻らない
 * （スクロールで画面外に出た写真の再読み込みを避けるため）。
 */
export function useInViewport<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isVisible) {
      return;
    }
    const node = ref.current;
    if (!node) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsVisible(true);
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [isVisible]);

  return [ref, isVisible];
}
