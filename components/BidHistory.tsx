"use client";

import { useState, useEffect } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import BN from "bn.js";

const AUCTION_PROGRAM_ID = new PublicKey("81s1tEx4MPdVvqS6X84Mok5K4N5fMbRLzcsT5eo2K8J3");

// BidPlaced event discriminator: sha256("event:BidPlaced")[..8]
const BID_PLACED_DISC = "8735b053c1456c3d";

interface Bid {
  bidder: string;
  amount: number;
  timestamp: number;
  signature: string;
}

interface BidHistoryProps {
  nftMint: string;
  connection: Connection;
}

function maskWallet(wallet: string): string {
  if (wallet.length < 8) return wallet;
  return wallet.slice(0, 3) + "..." + wallet.slice(-4);
}

function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function BidHistory({ nftMint, connection }: BidHistoryProps) {
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBids();
  }, [nftMint]);

  const fetchBids = async () => {
    setLoading(true);
    try {
      const nftMintPk = new PublicKey(nftMint);

      // Derive listing PDA
      const [listingPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("listing"), nftMintPk.toBuffer()],
        AUCTION_PROGRAM_ID
      );

      // Fetch transaction signatures for the listing PDA
      const signatures = await connection.getSignaturesForAddress(listingPda, {
        limit: 50,
      });

      if (signatures.length === 0) {
        setBids([]);
        return;
      }

      // Fetch parsed transactions
      const txs = await connection.getParsedTransactions(
        signatures.map((s) => s.signature),
        { maxSupportedTransactionVersion: 0 }
      );

      const parsedBids: Bid[] = [];

      for (let i = 0; i < txs.length; i++) {
        const tx = txs[i];
        if (!tx || tx.meta?.err) continue;

        // Look for BidPlaced events in program logs
        const logs = tx.meta?.logMessages || [];
        const hasBid = logs.some(
          (log) => log.includes("Instruction: PlaceBid") || log.includes("Program log: BidPlaced")
        );

        if (!hasBid) continue;

        // Parse event data from inner instructions or log data
        // Anchor emits events as base64 in "Program data:" log lines
        for (const log of logs) {
          if (!log.startsWith("Program data: ")) continue;

          try {
            const b64 = log.replace("Program data: ", "");
            const buf = Buffer.from(b64, "base64");

            // Check discriminator (first 8 bytes)
            const disc = buf.slice(0, 8).toString("hex");
            if (disc !== BID_PLACED_DISC) continue;

            // Parse BidPlaced: nft_mint (32) + bidder (32) + amount (u64) + timestamp (i64)
            const bidder = new PublicKey(buf.slice(40, 72)).toBase58();
            const amount = new BN(buf.slice(72, 80), "le").toNumber();
            const timestamp = new BN(buf.slice(80, 88), "le").toNumber();

            parsedBids.push({
              bidder,
              amount,
              timestamp,
              signature: signatures[i].signature,
            });
          } catch {
            // Skip unparseable data
          }
        }
      }

      // Sort newest first
      parsedBids.sort((a, b) => b.timestamp - a.timestamp);
      setBids(parsedBids);
    } catch (err) {
      console.error("Failed to fetch bid history:", err);
      setBids([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-12 bg-dark-700 border border-white/5 rounded-lg" />
        ))}
      </div>
    );
  }

  if (bids.length === 0) {
    return (
      <div className="bg-dark-800 border border-white/5 rounded-lg p-8 text-center">
        <p className="text-gray-400 text-sm">No bids yet. Be the first to bid!</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {bids.map((bid, idx) => (
        <div
          key={bid.signature + idx}
          className="bg-dark-800 border border-white/5 rounded-lg p-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-4">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                idx === 0
                  ? "bg-gradient-to-br from-gold-500 to-gold-600 text-dark-900"
                  : "bg-dark-700 text-gray-400"
              }`}
            >
              #{bids.length - idx}
            </div>
            <div>
              <p className="text-white font-mono text-sm">{maskWallet(bid.bidder)}</p>
              <p className="text-gray-500 text-xs">{timeAgo(bid.timestamp)}</p>
            </div>
          </div>
          <div className="text-right">
            <p className={`font-semibold ${idx === 0 ? "text-gold-400" : "text-gray-300"}`}>
              ◎ {(bid.amount / 1e9).toFixed(4)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
