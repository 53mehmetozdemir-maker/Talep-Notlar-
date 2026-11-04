import { useEffect } from 'react';
import type { ReactNode } from 'react';

interface Props {
  onClose: () => void;
  variant: 'desc' | 'file' | 'edit';
  children: ReactNode;
}

export function Modal({ onClose, variant, children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className={`modal-overlay modal-overlay-${variant}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {children}
    </div>
  );
}
