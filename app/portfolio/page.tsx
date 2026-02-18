"use client";

import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

interface NFTItem {
  mint: string;
  name: string;
  image: string;
  description?: string;
}

const RPC = "https://api.mainnet-beta.solana.com";

export default function PortfolioPage() {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const [nfts, setNfts] = useState<NFTItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");

  useEffect(() => {
    if (!connected || !publicKey) { setNfts([]); return; }

    let cancelled = false;

    async function fetchNFTs() {
      setLoading(true);
      setError(null);
      setProgress("Finding NFTs in wallet...");
      
      try {
        const wallet = publicKey!.toBase58();
        const { PublicKey } = await import("@solana/web3.js");
        const METADATA_PROGRAM = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

        console.log("Fetching NFTs for wallet:", wallet);

        // Step 1: Get NFT mints
        const rpcRes = await fetch("/api/rpc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0", id: 1,
            method: "getTokenAccountsByOwner",
            params: [wallet, { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" }, { encoding: "jsonParsed" }]
          })
        });
        const rpcData = await rpcRes.json();
        if (!rpcData.result?.value) { setNfts([]); setLoading(false); return; }

        const nftMints: string[] = rpcData.result.value
          .filter((acc: any) => {
            const info = acc.account.data.parsed.info;
            return info.tokenAmount.decimals === 0 && info.tokenAmount.uiAmount === 1;
          })
          .map((acc: any) => acc.account.data.parsed.info.mint);

        if (nftMints.length === 0) { setNfts([]); setLoading(false); return; }

        setProgress(`Found ${nftMints.length} NFTs. Loading metadata...`);

        // Step 2: Derive all metadata PDAs
        const pdas = nftMints.map(mint => {
          const mintKey = new PublicKey(mint);
          const [pda] = PublicKey.findProgramAddressSync(
            [Buffer.from("metadata"), METADATA_PROGRAM.toBuffer(), mintKey.toBuffer()],
            METADATA_PROGRAM
          );
          return pda.toBase58();
        });

        // Step 3: Batch fetch metadata accounts using getMultipleAccounts (max 100 per call)
        const allAccounts: any[] = [];
        for (let i = 0; i < pdas.length; i += 100) {
          const batch = pdas.slice(i, i + 100);
          const res = await fetch("/api/rpc", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0", id: 1,
              method: "getMultipleAccounts",
              params: [batch, { encoding: "base64" }]
            })
          });
          const data = await res.json();
          if (data.result?.value) allAccounts.push(...data.result.value);
          else allAccounts.push(...new Array(batch.length).fill(null));
        }

        if (cancelled) return;

        // Step 4: Parse metadata + fetch images
        const items: NFTItem[] = [];
        
        for (let i = 0; i < nftMints.length; i++) {
          const mint = nftMints[i];
          const account = allAccounts[i];
          let name = mint.slice(0, 4) + "..." + mint.slice(-4);
          let image = "";

          if (account?.data?.[0]) {
            const parsed = parseMetaplexMetadata(account.data[0]);
            if (parsed) {
              name = parsed.name || name;
              // Try fetch image from URI
              if (parsed.uri) {
                try {
                  const uriRes = await fetch(parsed.uri, { signal: AbortSignal.timeout(3000) });
                  const json = await uriRes.json();
                  image = json.image || "";
                } catch {}
              }
            }
          }

          items.push({ mint, name, image });
          
          // Show progressive results every 5 items
          if (items.length % 5 === 0) {
            setNfts([...items]);
            setProgress(`Loaded ${items.length}/${nftMints.length}...`);
          }
        }

        if (!cancelled) {
          setNfts(items);
          setProgress("");
        }
      } catch (e: any) {
        console.error("Failed to fetch NFTs:", e);
        if (!cancelled) setError("Failed to load NFTs. Please try again.");
      }
      if (!cancelled) setLoading(false);
    }

    fetchNFTs();
    return () => { cancelled = true; };
  }, [connected, publicKey, connection]);

  return (
    <div className="pt-24 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <p className="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">Investor Profile</p>
        <h1 className="font-serif text-3xl text-white mb-2">My Portfolio</h1>
        <p className="text-gray-400 text-sm mb-8">
          {connected ? `${publicKey!.toBase58().slice(0, 4)}...${publicKey!.toBase58().slice(-4)} — NFTs & RWAs` : "Connect your wallet to view your assets"}
        </p>

        {!connected ? (
          <div className="flex flex-col items-center justify-center py-24 gap-6">
            <div className="w-20 h-20 rounded-2xl bg-navy-800 border border-white/10 flex items-center justify-center">
              <svg className="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
              </svg>
            </div>
            <p className="text-gray-400 text-sm">Connect your Solana wallet to view your NFTs and RWAs</p>
            <WalletMultiButton className="!bg-gold-500 hover:!bg-gold-600 !rounded-lg !h-10 !text-sm !font-medium" />
          </div>
        ) : loading && nfts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-400 text-sm">{progress || "Loading your assets..."}</p>
          </div>
        ) : error ? (
          <div className="text-center py-24">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        ) : nfts.length === 0 && !loading ? (
          <div className="text-center py-24">
            <p className="text-gray-400 text-sm">No NFTs found in this wallet</p>
          </div>
        ) : (
          <>
            <p className="text-gray-500 text-xs mb-6">
              {nfts.length} asset{nfts.length !== 1 ? "s" : ""} {loading ? `(${progress})` : "found"}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {nfts.map((nft) => (
                <div key={nft.mint} className="bg-navy-800 rounded-xl border border-white/5 overflow-hidden card-hover group">
                  <div className="aspect-square overflow-hidden bg-navy-900">
                    {nft.image ? (
                      <img src={nft.image} alt={nft.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl">🖼️</div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="text-white font-medium text-sm truncate">{nft.name}</h3>
                    <p className="text-gray-600 text-[10px] mt-2 font-mono">{nft.mint.slice(0, 6)}...{nft.mint.slice(-4)}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function parseMetaplexMetadata(base64Data: string): { name: string; symbol: string; uri: string } | null {
  try {
    const raw = atob(base64Data);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

    let offset = 1 + 32 + 32;

    const nameLen = bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
    offset += 4;
    const name = new TextDecoder().decode(bytes.slice(offset, offset + Math.min(nameLen, 32))).replace(/\0/g, '').trim();
    offset += nameLen;

    const symLen = bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
    offset += 4;
    const symbol = new TextDecoder().decode(bytes.slice(offset, offset + Math.min(symLen, 10))).replace(/\0/g, '').trim();
    offset += symLen;

    const uriLen = bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
    offset += 4;
    const uri = new TextDecoder().decode(bytes.slice(offset, offset + Math.min(uriLen, 200))).replace(/\0/g, '').trim();

    return { name, symbol, uri };
  } catch {
    return null;
  }
}
