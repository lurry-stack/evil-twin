import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type Toast = { id: number; message: string; type: 'success' | 'error' | 'info' };
type ToastCtx = {
  toasts: Toast[];
  success: (m: string) => void;
  error: (m: string) => void;
  info: (m: string) => void;
  remove: (id: number) => void;
};

const Ctx = createContext<ToastCtx>({
  toasts: [],
  success: () => {},
  error: () => {},
  info: () => {},
  remove: () => {},
});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback((message: string, type: Toast['type']) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => remove(id), 3000);
  }, [remove]);

  const success = useCallback((m: string) => push(m, 'success'), [push]);
  const error = useCallback((m: string) => push(m, 'error'), [push]);
  const info = useCallback((m: string) => push(m, 'info'), [push]);

  return (
    <Ctx.Provider value={{ toasts, success, error, info, remove }}>
      {children}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-full max-w-sm px-4 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-xl px-4 py-3 text-sm font-medium shadow-lg animate-fade-in ${
              t.type === 'success'
                ? 'bg-green-600 text-white'
                : t.type === 'error'
                ? 'bg-red-600 text-white'
                : 'bg-gray-800 text-white'
            }`}
            onClick={() => remove(t.id)}
          >
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
