"use client";

import { useState, useEffect } from "react";
import { Connection, PublicKey } from "@solana/web3.js";

interface Bid {
  bidder: string;
  amount: number;
  timestamp: number;
}

interface BidHistoryProps {
  nftMint: string;
  connection: Connection;
}

function maskWallet(wallet: string): string {
  if (wallet.length < 8) return wallet;
  return wallet.slice(0, 3) + "..." + wallet.slice(-4);
}

export function BidHistory({ nftMint, connection }: BidHistoryProps) {
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBids = async () => {
      setLoading(true);
      try {
        // In production, this would fetch from an indexer like Helius or a custom backend
        // For now, we'll show a placeholder or attempt to fetch from transaction history
        // The actual implementation would depend on program logs/events
        
        // Placeholder: Fetch recent transactions and parse for BidPlaced events
        // This is simplified - in production you'd use an indexer
        const allBids: Bid[] = [];

        // Try to fetch from a Helius/Shyft indexer if available
        // For now, leave empty and show "No bids yet" message
        setBids(allBids);
      } catch (err) {
        console.error("Failed to fetch bid history:", err);
        setBids([]);
      } finally {
        setLoading(false);
      }
    };

    fetchBids();
  }, [nftMint, connection]);

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
          key={idx}
          className="bg-dark-800 border border-white/5 rounded-lg p-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gold-500 to-gold-600 flex items-center justify-center text-dark-900 font-bold text-sm">
              #{bids.length - idx}
            </div>
            <div>
              <p className="text-white font-mono text-sm">{maskWallet(bid.bidder)}</p>
              <p className="text-gray-500 text-xs">
                {new Date(bid.timestamp * 1000).toLocaleDateString()} {new Date(bid.timestamp * 1000).toLocaleTimeString()}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-gold-400 font-semibold">◎ {(bid.amount / 1e9).toFixed(4)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
