"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle, AlertCircle, Info, AlertTriangle, X } from "lucide-react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextType {
  addToast: (message: string, type: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast deve ser usado dentro de um ToastProvider");
  }
  return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback((message: string, type: ToastType, duration = 4000) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type, duration }]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

  const getIcon = (type: ToastType) => {
    switch (type) {
      case "success":
        return <CheckCircle className="h-5 w-5 text-emerald-450 flex-shrink-0" />;
      case "error":
        return <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />;
      case "warning":
        return <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />;
      case "info":
        return <Info className="h-5 w-5 text-blue-450 flex-shrink-0" />;
    }
  };

  const getTypeStyles = (type: ToastType) => {
    switch (type) {
      case "success":
        return "border-emerald-500/20 bg-zinc-950/90 shadow-emerald-950/20";
      case "error":
        return "border-red-500/20 bg-zinc-950/90 shadow-red-950/20";
      case "warning":
        return "border-amber-500/20 bg-zinc-950/90 shadow-amber-950/20";
      case "info":
        return "border-blue-500/20 bg-zinc-950/90 shadow-blue-950/20";
    }
  };

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      
      {/* Toast Portal/Container */}
      <div className="fixed bottom-5 right-5 z-55 flex flex-col gap-3 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border p-4 shadow-xl backdrop-blur-md transition-all duration-300 animate-in slide-in-from-right-5 fade-in ${getTypeStyles(
              toast.type
            )}`}
            role="alert"
          >
            {getIcon(toast.type)}
            <div className="flex-1 text-xs font-semibold text-zinc-200 pt-0.5 leading-relaxed">
              {toast.message}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-zinc-550 hover:text-zinc-350 transition-colors p-0.5 hover:bg-zinc-900 rounded-lg flex-shrink-0 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
