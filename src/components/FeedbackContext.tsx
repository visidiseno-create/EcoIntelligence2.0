import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface FeedbackContextValue {
  showToast: (message: string, type?: ToastType) => void;
  confirmAction: (options: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export const FeedbackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);
  const confirmResolverRef = useRef<((value: boolean) => void) | null>(null);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info') => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts(prev => [...prev.slice(-3), { id, message, type }]);
      setTimeout(() => {
        dismissToast(id);
      }, 4200);
    },
    [dismissToast]
  );

  const confirmAction = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>(resolve => {
      confirmResolverRef.current = resolve;
      setConfirmState(options);
    });
  }, []);

  const handleConfirmChoice = (accepted: boolean) => {
    if (confirmResolverRef.current) {
      confirmResolverRef.current(accepted);
      confirmResolverRef.current = null;
    }
    setConfirmState(null);
  };

  const getToastStyle = (type: ToastType) => {
    switch (type) {
      case 'success':
        return {
          bg: 'bg-emerald-950 text-white border-emerald-700',
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
        };
      case 'error':
        return {
          bg: 'bg-red-950 text-white border-red-700',
          icon: <XCircle className="w-4 h-4 text-red-400 shrink-0" />
        };
      case 'warning':
        return {
          bg: 'bg-amber-950 text-white border-amber-700',
          icon: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
        };
      default:
        return {
          bg: 'bg-slate-900 text-white border-slate-700',
          icon: <Info className="w-4 h-4 text-sky-400 shrink-0" />
        };
    }
  };

  return (
    <FeedbackContext.Provider value={{ showToast, confirmAction }}>
      {children}

      {/* Toast Stack */}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0"
      >
        {toasts.map(toast => {
          const style = getToastStyle(toast.type);
          return (
            <div
              key={toast.id}
              role="status"
              className={`pointer-events-auto flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg border shadow-lg text-xs font-medium transition-all ${style.bg}`}
            >
              <div className="mt-0.5">{style.icon}</div>
              <p className="flex-1 leading-snug">{toast.message}</p>
              <button
                type="button"
                aria-label="Cerrar notificación"
                onClick={() => dismissToast(toast.id)}
                className="text-white/70 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Confirmation Modal */}
      {confirmState && (
        <div
          className="fixed inset-0 z-[70] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => handleConfirmChoice(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            className="bg-white rounded-xl border border-slate-200 max-w-md w-full shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2.5">
              <div
                className={`p-2 rounded-lg ${
                  confirmState.danger ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                }`}
              >
                <AlertTriangle className="w-4 h-4" />
              </div>
              <h3 id="confirm-dialog-title" className="text-sm font-bold text-slate-900">
                {confirmState.title}
              </h3>
            </div>
            <div className="px-5 py-4">
              <p className="text-xs text-slate-600 leading-relaxed">{confirmState.message}</p>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => handleConfirmChoice(false)}
                className="px-3.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                {confirmState.cancelLabel || 'Cancelar'}
              </button>
              <button
                type="button"
                onClick={() => handleConfirmChoice(true)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white cursor-pointer ${
                  confirmState.danger
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-emerald-700 hover:bg-emerald-800'
                }`}
              >
                {confirmState.confirmLabel || 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
};

export function useFeedback(): FeedbackContextValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) {
    throw new Error('useFeedback must be used within a FeedbackProvider');
  }
  return ctx;
}
