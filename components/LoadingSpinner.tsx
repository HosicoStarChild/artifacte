"use client";

export interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  message?: string;
  fullscreen?: boolean;
}

export function LoadingSpinner({ size = "md", message, fullscreen = false }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "w-6 h-6 border-2",
    md: "w-10 h-10 border-3",
    lg: "w-12 h-12 border-4",
  };

  const spinner = (
    <div className={`flex items-center justify-center flex-col gap-3`}>
      <div className={`${sizeClasses[size]} border-gray-700 border-t-gold-500 rounded-full animate-spin`} />
      {message && <p className="text-gray-400 text-sm">{message}</p>}
    </div>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 bg-dark-900/80 backdrop-blur-xs flex items-center justify-center z-50">
        {spinner}
      </div>
    );
  }

  return spinner;
}
