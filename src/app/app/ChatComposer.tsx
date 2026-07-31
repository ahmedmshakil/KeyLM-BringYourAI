'use client';

import { memo, useCallback, useState } from 'react';

type ChatComposerProps = {
  placeholder: string;
  disabled?: boolean;
  streaming: boolean;
  isDemoMode: boolean;
  demoExhausted?: boolean;
  demoRemainingLabel?: string;
  onSend: (content: string) => void;
  onStop?: () => void;
};

function ChatComposerComponent({
  placeholder,
  disabled = false,
  streaming,
  isDemoMode,
  demoExhausted = false,
  demoRemainingLabel,
  onSend,
  onStop
}: ChatComposerProps) {
  const [value, setValue] = useState('');

  const submit = useCallback(() => {
    const content = value.trim();
    if (!content || streaming || disabled) {
      return;
    }
    setValue('');
    onSend(content);
  }, [disabled, onSend, streaming, value]);

  return (
    <div className="chat-input">
      <textarea
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
      />
      <div className="send-actions">
        {isDemoMode ? (
          <>
            <button
              className="button"
              type="button"
              disabled={streaming || demoExhausted}
              onClick={submit}
            >
              {streaming ? 'Sending...' : demoExhausted ? 'Demo complete' : 'Send'}
            </button>
            {demoRemainingLabel ? <span className="tag">{demoRemainingLabel}</span> : null}
          </>
        ) : (
          <>
            {streaming ? (
              <button className="button secondary" type="button" onClick={onStop}>
                Stop
              </button>
            ) : (
              <button className="button" type="button" onClick={submit}>
                Send
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export const ChatComposer = memo(ChatComposerComponent);
