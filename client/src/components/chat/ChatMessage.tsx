import type { ChatMessage as Message } from '@/store/chatStore';
import IrisMark from './IrisMark';
import ChatCards from './ChatCards';

interface ChatMessageProps {
  message: Message;
  disabled: boolean;
  onAction: (intent: string, params?: Record<string, unknown>) => void;
}

export default function ChatMessage({ message, disabled, onAction }: ChatMessageProps) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap wrap-break-word rounded-2xl rounded-br-sm bg-rose-500 px-3.5 py-2 text-sm text-white">
          {message.text}
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <IrisMark size={24} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        {message.text && (
          // Rendered as TEXT. No dangerouslySetInnerHTML, no markdown-to-HTML,
          // no auto-linking — so a reply cannot become markup, a link, or a
          // script no matter what the model or an injected instruction produced
          // (OWASP LLM05). `whitespace-pre-wrap` preserves line breaks without
          // parsing anything.
          <p className="max-w-[92%] whitespace-pre-wrap wrap-break-word rounded-2xl rounded-bl-sm border border-gold-200 bg-white px-3.5 py-2 text-sm">
            {message.text}
          </p>
        )}
        {message.cards && (
          <ChatCards cards={message.cards} disabled={disabled} onAction={onAction} />
        )}
      </div>
    </div>
  );
}
