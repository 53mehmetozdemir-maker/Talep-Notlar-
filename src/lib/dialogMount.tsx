import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { registerDialog } from './dialog';
import type { ToastKind } from './dialog';
import './dialog.css';

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

function DialogHost() {
  const [message, setMessage] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const nextId = useRef(1);

  const answer = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setMessage(null);
  }, []);

  useEffect(() => {
    registerDialog({
      confirm: (m) =>
        new Promise<boolean>((resolve) => {
          resolver.current?.(false);
          resolver.current = resolve;
          setMessage(m);
        }),
      toast: (m, kind = 'info') => {
        const id = nextId.current++;
        setToasts((t) => [...t, { id, message: m, kind }]);
        window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
      },
    });
    return () => registerDialog(null);
  }, []);

  useEffect(() => {
    if (message === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') answer(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [message, answer]);

  return (
    <>
      {message !== null && (
        <div className="dlg-overlay" onClick={() => answer(false)}>
          <div
            className="dlg-box"
            role="alertdialog"
            aria-modal="true"
            aria-describedby="dlg-msg"
            onClick={(e) => e.stopPropagation()}
          >
            <h4>Onay</h4>
            <p id="dlg-msg">{message}</p>
            <div className="dlg-actions">
              <button type="button" autoFocus className="dlg-btn dlg-cancel" onClick={() => answer(false)}>
                Vazgeç
              </button>
              <button type="button" className="dlg-btn dlg-danger" onClick={() => answer(true)}>
                Sil
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.message}
          </div>
        ))}
      </div>
    </>
  );
}

if (!document.getElementById('dialog-root')) {
  const el = document.createElement('div');
  el.id = 'dialog-root';
  document.body.appendChild(el);
  createRoot(el).render(<DialogHost />);
}