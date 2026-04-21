"use client";

import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

export type ToastType = "success" | "error" | "info" | "warning";

function notify(type: ToastType, message: string, duration = 5000) {
  switch (type) {
    case "success":
      return toast.success(message, { duration });
    case "error":
      return toast.error(message, { duration });
    case "warning":
      return toast.warning(message, { duration });
    case "info":
    default:
      return toast.info(message, { duration });
  }
}

export function createToastManager() {
  return {
    success: (message: string, duration = 5000) =>
      notify("success", message, duration),
    error: (message: string, duration = 5000) =>
      notify("error", message, duration),
    info: (message: string, duration = 5000) =>
      notify("info", message, duration),
    warning: (message: string, duration = 5000) =>
      notify("warning", message, duration),
  };
}

export const showToast = createToastManager();

export function ToastContainer() {
  return <Toaster closeButton position="top-right" richColors />;
}
