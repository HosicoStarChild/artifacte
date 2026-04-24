import { useMemo } from "react";
import { useWalletCapabilities } from "@/hooks/useWalletCapabilities";
import { AuctionProgram } from "@/lib/auction-program";

export function useAuctionProgram() {
  const { connection, anchorWallet } = useWalletCapabilities();

  const program = useMemo(() => {
    if (!anchorWallet) return null;
    return new AuctionProgram(connection, anchorWallet);
  }, [anchorWallet, connection]);

  return program;
}
