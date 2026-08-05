import { useEffect, type RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Keeps keyboard focus inside an open dialog and puts it back where it came
 * from on close.
 *
 * A dialog that lets Tab wander onto the page behind it is unusable with a
 * screen reader: the reader announces content the user cannot see, with no way
 * back. Returning focus to the element that opened the dialog is the other half
 * — without it, closing the panel drops the keyboard user at the top of the
 * document.
 *
 * @param ref       the dialog element
 * @param active    whether the dialog is open
 * @param onEscape  called on Escape. Bound at DOCUMENT level, so it fires from
 *                  inside a textarea where a React onKeyDown on the container
 *                  would not.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onEscape?: () => void,
): void {
  useEffect(() => {
    if (!active) return;

    const container = ref.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Focus the first control rather than the container itself, so a screen
    // reader announces something actionable.
    const focusFirst = () => {
      const first = container.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? container).focus();
    };
    // A frame later: on open the panel may still be animating in, and focusing
    // a zero-size element is silently ignored by some browsers.
    const raf = requestAnimationFrame(focusFirst);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onEscape) {
        event.stopPropagation();
        onEscape();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeEl = document.activeElement;

      // Wrap in both directions. Also catches the case where focus has escaped
      // the container entirely (a click on the page behind), pulling it back.
      if (event.shiftKey && (activeEl === first || !container.contains(activeEl))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeEl === last || !container.contains(activeEl))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown, true);
      // Only restore focus if it is still somewhere inside the dialog. If the
      // user has already clicked elsewhere, yanking focus back would be the
      // rude version of helpful.
      if (container.contains(document.activeElement)) {
        previouslyFocused?.focus?.();
      }
    };
  }, [ref, active, onEscape]);
}
