"use client";

import { useState, useEffect } from "react";
import { Connection, PublicKey } from "@solana/web3.js";

const RAILWAY_URL = "https://artifacte-oracle-production.up.railway.app";

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
      // Try Railway first (fast, pre-indexed)
      const res = await fetch(`${RAILWAY_URL}/api/auction/bids?mint=${nftMint}`);
      if (res.ok) {
        const data = await res.json();
        if (data.bids && data.bids.length > 0) {
          setBids(data.bids);
          return;
        }
      }

      // Fallback: parse on-chain tx history directly
      await fetchBidsOnChain();
    } catch (err) {
      console.error("Failed to fetch bids from Railway, trying on-chain:", err);
      await fetchBidsOnChain();
    } finally {
      setLoading(false);
    }
  };

  const fetchBidsOnChain = async () => {
    try {
      const AUCTION_PROGRAM_ID = new PublicKey("81s1tEx4MPdVvqS6X84Mok5K4N5fMbRLzcsT5eo2K8J3");
      const BID_PLACED_DISC = "8735b053c1456c3d";
      const nftMintPk = new PublicKey(nftMint);

      const [listingPda] = PublicKey.findProgramAddressSync(
        [new TextEncoder().encode("listing"), nftMintPk.toBuffer()],
        AUCTION_PROGRAM_ID
      );

      const signatures = await connection.getSignaturesForAddress(listingPda, { limit: 50 });
      console.log("[BidHistory] signatures found:", signatures.length);
      if (signatures.length === 0) { setBids([]); return; }

      const txs = await connection.getParsedTransactions(
        signatures.map((s) => s.signature),
        { maxSupportedTransactionVersion: 0 }
      );
      console.log("[BidHistory] txs fetched:", txs.filter(Boolean).length);

      const parsed: Bid[] = [];
      for (let i = 0; i < txs.length; i++) {
        const tx = txs[i];
        if (!tx || tx.meta?.err) continue;

        const logs = tx.meta?.logMessages || [];
        const hasBid = logs.some((log) => log.includes("Instruction: PlaceBid"));
        if (!hasBid) continue;

        for (const log of logs) {
          if (!log.startsWith("Program data: ")) continue;
          try {
            // Use Uint8Array instead of Buffer for browser compatibility
            const raw = atob(log.replace("Program data: ", ""));
            const buf = new Uint8Array(raw.length);
            for (let j = 0; j < raw.length; j++) buf[j] = raw.charCodeAt(j);
            
            if (buf.length < 88) continue;
            
            // Check discriminator
            const disc = Array.from(buf.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('');
            if (disc !== BID_PLACED_DISC) continue;

            const bidder = new PublicKey(buf.slice(40, 72)).toBase58();
            // Read u64 as little-endian
            const view = new DataView(buf.buffer, buf.byteOffset);
            const amount = view.getUint32(72, true) + view.getUint32(76, true) * 0x100000000;
            const timestamp = view.getUint32(80, true) + view.getUint32(84, true) * 0x100000000;

            parsed.push({ bidder, amount, timestamp, signature: signatures[i].signature });
          } catch { /* skip */ }
        }
      }

      console.log("[BidHistory] parsed bids:", parsed.length);
      parsed.sort((a, b) => b.timestamp - a.timestamp);
      setBids(parsed);
    } catch (err) {
      console.error("[BidHistory] On-chain bid fetch failed:", err);
      setBids([]);
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
