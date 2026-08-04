import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Stagger delay in milliseconds */
  delay?: number;
}

/**
 * Fades + lifts its children into view once, when scrolled near.
 * Motion is CSS-driven (see `.reveal` in index.css) and is fully
 * disabled under `prefers-reduced-motion`.
 */
export default function Reveal({ children, className, delay = 0 }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // No observer support means no way to ever reveal — show the content
    // rather than leaving it at opacity 0 forever.
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            io.unobserve(entry.target);
          }
        });
      },
      // threshold MUST stay 0. A ratio threshold is unreachable for any target
      // taller than the viewport / threshold, and those exist here: Services
      // wraps a whole category (the 17-item Waxing block is ~3245px), which at
      // 150% browser zoom never reached 0.15 and stayed permanently invisible.
      // The -40px bottom margin already delays the trigger enough to read as
      // "scrolled into view".
      { threshold: 0, rootMargin: '0px 0px -40px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn('reveal', visible && 'is-visible', className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
