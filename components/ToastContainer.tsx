"use client";

import { useEffect, useState } from "react";
import { Toast, ToastType } from "./Toast";

export type ToastMessage = {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
};

// Global toast state management
let toastCallbacks: {
  add: (toast: ToastMessage) => void;
  remove: (id: string) => void;
} | null = null;

export function createToastManager() {
  return {
    success: (message: string, duration = 5000) => {
      const id = Math.random().toString(36).substr(2, 9);
      toastCallbacks?.add({ id, message, type: "success", duration });
      return id;
    },
    error: (message: string, duration = 5000) => {
      const id = Math.random().toString(36).substr(2, 9);
      toastCallbacks?.add({ id, message, type: "error", duration });
      return id;
    },
    info: (message: string, duration = 5000) => {
      const id = Math.random().toString(36).substr(2, 9);
      toastCallbacks?.add({ id, message, type: "info", duration });
      return id;
    },
    warning: (message: string, duration = 5000) => {
      const id = Math.random().toString(36).substr(2, 9);
      toastCallbacks?.add({ id, message, type: "warning", duration });
      return id;
    },
  };
}

export const showToast = createToastManager();

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    toastCallbacks = {
      add: (toast: ToastMessage) => {
        setToasts((prev) => [...prev, toast]);
      },
      remove: (id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      },
    };
  }, []);

  return (
    <>
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          onClose={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
        />
      ))}
    </>
  );
}
