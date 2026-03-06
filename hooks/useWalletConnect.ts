import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useState, useCallback } from "react";
import { showToast } from "@/components/ToastContainer";

export type WalletError = 
  | "user_rejected"
  | "network_mismatch"
  | "insufficient_funds"
  | "unknown";

export interface WalletState {
  isConnecting: boolean;
  isConnected: boolean;
  error: WalletError | null;
  errorMessage: string;
}

export function useWalletConnect() {
  const wallet = useWallet();
  const { connection } = useConnection();
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<WalletError | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const handleWalletError = useCallback((err: any): WalletError => {
    const message = err?.message?.toLowerCase() || "";

    if (message.includes("user rejected") || message.includes("rejected")) {
      setError("user_rejected");
      setErrorMessage("Transaction rejected by user. Please try again.");
      showToast.error("Transaction rejected by user");
      return "user_rejected";
    }

    if (message.includes("insufficient") || message.includes("not enough")) {
      setError("insufficient_funds");
      setErrorMessage("Insufficient balance. Please check your wallet.");
      showToast.error("Insufficient balance in wallet");
      return "insufficient_funds";
    }

    if (message.includes("network") || message.includes("chain")) {
      setError("network_mismatch");
      setErrorMessage("Network mismatch. Please connect to Mainnet.");
      showToast.error("Network mismatch. Please switch to Mainnet");
      return "network_mismatch";
    }

    setError("unknown");
    setErrorMessage(err?.message || "An error occurred. Please try again.");
    showToast.error(err?.message || "Unknown error");
    return "unknown";
  }, []);

  const clearError = useCallback(() => {
    setError(null);
    setErrorMessage("");
  }, []);

  return {
    ...wallet,
    connection,
    isConnecting: isConnecting || wallet.connecting,
    isConnected: wallet.connected,
    error,
    errorMessage,
    handleWalletError,
    clearError,
    setIsConnecting,
  };
}
