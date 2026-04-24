import { useMemo } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import type { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";

type WalletTransaction = Transaction | VersionedTransaction;

export type AnchorWalletLike = {
  publicKey: PublicKey;
  signTransaction: <T extends WalletTransaction>(transaction: T) => Promise<T>;
  signAllTransactions: <T extends WalletTransaction>(transactions: T[]) => Promise<T[]>;
};

export function useWalletCapabilities() {
  const wallet = useWallet();
  const { connection } = useConnection();

  const anchorWallet = useMemo<AnchorWalletLike | null>(() => {
    if (!wallet.publicKey || !wallet.signTransaction || !wallet.signAllTransactions) {
      return null;
    }

    return {
      publicKey: wallet.publicKey,
      signTransaction: wallet.signTransaction,
      signAllTransactions: wallet.signAllTransactions,
    };
  }, [wallet.publicKey, wallet.signAllTransactions, wallet.signTransaction]);

  return {
    ...wallet,
    connection,
    walletName: wallet.wallet?.adapter?.name ?? null,
    anchorWallet,
  };
}