import { useEffect, useState } from 'react';

/**
 * The "Iris is thinking" state.
 *
 * The reduced-motion handling here is the non-obvious part. index.css already
 * has a GLOBAL kill switch (`* { animation-duration: 0.001ms !important;
 * animation-iteration-count: 1 !important }`), so a per-component media query
 * would be dead code. But `iteration-count: 1` FREEZES an infinite bounce
 * mid-air: the dots would render permanently stopped at whatever offset the
 * first iteration ended on, which reads as a rendering bug rather than as
 * respect for a preference.
 *
 * So this checks the preference in JS and renders static text instead. That is
 * the only correct answer given the global rule.
 */
export default function TypingIndicator() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  if (reduced) {
    return (
      <p className="px-1 text-sm text-muted-foreground" role="status">
        Thinking…
      </p>
    );
  }

  return (
    <div className="flex items-center gap-1.5 px-1" role="status" aria-label="Iris is typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-rose-300"
          style={{ animationDelay: `${i * 140}ms` }}
        />
      ))}
    </div>
  );
}
