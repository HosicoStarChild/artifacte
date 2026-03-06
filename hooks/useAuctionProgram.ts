import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMemo } from "react";
import { AuctionProgram } from "@/lib/auction-program";

export function useAuctionProgram() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const program = useMemo(() => {
    if (!wallet.publicKey) return null;
    return new AuctionProgram(connection, wallet as any);
  }, [connection, wallet]);

  return program;
}
