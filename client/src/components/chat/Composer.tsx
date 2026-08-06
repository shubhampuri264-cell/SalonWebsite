import { useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';

const MAX_LENGTH = 500;

interface ComposerProps {
  disabled: boolean;
  pending: boolean;
  onSend: (message: string) => void;
}

/**
 * The typed half of the widget.
 *
 * maxLength matches the server's cap exactly, so a long message is stopped at
 * the keystroke rather than bounced after a round trip.
 *
 * When free text is unavailable — Anthropic unreachable, the daily spend cap
 * reached, the kill switch off — the composer is REPLACED by an explanation
 * rather than left present-but-broken. The chips above it still work, so the
 * customer can still book, cancel and reschedule. That is the whole point of
 * keeping the menu.
 */
export default function Composer({ disabled, pending, onSend }: ComposerProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || pending || disabled) return;
    setValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    onSend(trimmed);
  };

  return (
    <div className="flex items-end gap-2">
      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        maxLength={MAX_LENGTH}
        disabled={disabled || pending}
        placeholder="Ask me anything…"
        aria-label="Message Iris"
        onChange={(e) => {
          setValue(e.target.value);
          // Grow with the content, up to a ceiling — a message box that eats
          // the transcript is worse than one that scrolls.
          const el = e.target;
          el.style.height = 'auto';
          el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
        }}
        onKeyDown={(e) => {
          // Enter sends, Shift+Enter breaks the line. The reverse is the
          // convention in email clients and the wrong one in a chat box.
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        className="max-h-24 min-h-[38px] flex-1 resize-none rounded-2xl border border-input bg-white px-3.5 py-2 text-sm outline-hidden focus:ring-2 focus:ring-rose-400 disabled:opacity-50"
      />
      <button
        type="button"
        onClick={submit}
        disabled={disabled || pending || !value.trim()}
        aria-label="Send message"
        className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-rose-500 text-white transition-colors hover:bg-rose-600 disabled:opacity-50"
      >
        <ArrowUp className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
