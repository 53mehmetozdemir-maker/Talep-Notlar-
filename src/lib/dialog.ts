export type ToastKind = 'success' | 'error' | 'info';

interface Handlers {
  confirm: (message: string, confirmLabel?: string) => Promise<boolean>;
  toast: (message: string, kind?: ToastKind) => void;
}

let handlers: Handlers | null = null;

export function registerDialog(h: Handlers | null) {
  handlers = h;
}

/** Onay penceresi. Arayüz hazır değilse güvenli tarafta kalıp false döner. */
export function appConfirm(message: string, confirmLabel?: string): Promise<boolean> {
  return handlers ? handlers.confirm(message, confirmLabel) : Promise.resolve(false);
}

export function appToast(message: string, kind: ToastKind = 'info'): void {
  handlers?.toast(message, kind);
}

/** Eski alert() yerine: hata bildirimi olarak gösterir. */
export function appAlert(message: string): void {
  appToast(message, 'error');
}