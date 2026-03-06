"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import { useState, useEffect, useCallback } from "react";
import { getAssetsByOwner, readNFTMetadata } from "@/lib/metadata-reader";
import { showToast } from "@/components/ToastContainer";
import { Transaction, PublicKey, TransactionInstruction } from "@solana/web3.js";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

const HELIUS_RPC = "https://mainnet.helius-rpc.com/?api-key=345726df-3822-42c1-86e0-1a13dc6c7a04";
// Metaplex Core program
const MPL_CORE_PROGRAM = new PublicKey("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d");

interface BurnableNFT {
  id: string;
  name: string;
  image: string;
  interface: string;
  selected: boolean;
  burning: boolean;
  burnt: boolean;
}

export default function BurnPage() {
  const { publicKey, connected, signTransaction } = useWallet();
  const [assets, setAssets] = useState<BurnableNFT[]>([]);
  const [loading, setLoading] = useState(false);
  const [burning, setBurning] = useState(false);

  const fetchNFTs = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    try {
      // Fetch ALL assets (no spam filter) so user can burn spam too
      const response = await fetch(HELIUS_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "burn-fetch",
          method: "getAssetsByOwner",
          params: {
            ownerAddress: publicKey.toBase58(),
            page: 1,
            limit: 1000,
            displayOptions: { showFungible: false, showNativeBalance: false },
          },
        }),
      });
      const data = await response.json();
      const items = data.result?.items || [];
      
      const nfts: BurnableNFT[] = items
        .filter((item: any) => {
          if (item.burnt === true) return false;
          if (item.interface === "FungibleToken" || item.interface === "FungibleAsset") return false;
          if (!item.content?.metadata?.name) return false;
          return true;
        })
        .map((item: any) => ({
          id: item.id,
          name: item.content?.metadata?.name || "Unknown",
          image: item.content?.links?.image || item.content?.files?.[0]?.uri || "",
          interface: item.interface || "Unknown",
          selected: false,
          burning: false,
          burnt: false,
        }));
      
      setAssets(nfts);
    } catch (err: any) {
      showToast.error("Failed to fetch NFTs: " + err.message);
    }
    setLoading(false);
  }, [publicKey]);

  useEffect(() => {
    if (connected && publicKey) fetchNFTs();
  }, [connected, publicKey, fetchNFTs]);

  function toggleSelect(id: string) {
    setAssets(prev => prev.map(a => a.id === id ? { ...a, selected: !a.selected } : a));
  }

  function selectAll() {
    setAssets(prev => prev.map(a => ({ ...a, selected: true })));
  }

  function deselectAll() {
    setAssets(prev => prev.map(a => ({ ...a, selected: false })));
  }

  async function burnSelected() {
    if (!publicKey || !signTransaction) return;
    const selected = assets.filter(a => a.selected && !a.burnt);
    if (selected.length === 0) {
      showToast.error("No NFTs selected");
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to burn ${selected.length} NFT(s)? This is PERMANENT and cannot be undone.`
    );
    if (!confirmed) return;

    setBurning(true);
    let burnedCount = 0;

    for (const nft of selected) {
      setAssets(prev => prev.map(a => a.id === nft.id ? { ...a, burning: true } : a));
      
      try {
        const assetPubkey = new PublicKey(nft.id);
        
        // Metaplex Core burn instruction
        // Discriminator for burnV1: [116, 169, 10, 197, 210, 34, 228, 105]
        const discriminator = Buffer.from([116, 169, 10, 197, 210, 34, 228, 105]);
        // CompressionProof: None (0 byte)
        const burnData = Buffer.concat([discriminator, Buffer.from([0])]);
        
        const ix = new TransactionInstruction({
          programId: MPL_CORE_PROGRAM,
          keys: [
            { pubkey: assetPubkey, isSigner: false, isWritable: true },  // asset
            { pubkey: publicKey, isSigner: true, isWritable: true },     // payer / authority
            { pubkey: PublicKey.default, isSigner: false, isWritable: false }, // collection (none)
          ],
          data: burnData,
        });

        // Get recent blockhash
        const bhRes = await fetch(HELIUS_RPC, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0", id: 1,
            method: "getLatestBlockhash",
            params: [{ commitment: "finalized" }],
          }),
        });
        const bhData = await bhRes.json();
        const blockhash = bhData.result.value.blockhash;

        const tx = new Transaction();
        tx.add(ix);
        tx.recentBlockhash = blockhash;
        tx.feePayer = publicKey;

        const signed = await signTransaction(tx);
        const serialized = signed.serialize();

        // Send transaction
        const sendRes = await fetch(HELIUS_RPC, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0", id: 1,
            method: "sendTransaction",
            params: [serialized.toString("base64"), { encoding: "base64", skipPreflight: true }],
          }),
        });
        const sendData = await sendRes.json();
        
        if (sendData.error) {
          throw new Error(sendData.error.message || "Transaction failed");
        }

        setAssets(prev => prev.map(a => a.id === nft.id ? { ...a, burning: false, burnt: true, selected: false } : a));
        burnedCount++;
        showToast.success(`Burned: ${nft.name}`);
        
        // Small delay between burns
        await new Promise(r => setTimeout(r, 500));
      } catch (err: any) {
        console.error(`Failed to burn ${nft.name}:`, err);
        setAssets(prev => prev.map(a => a.id === nft.id ? { ...a, burning: false } : a));
        
        if (err.message?.includes("User rejected")) {
          showToast.error("Transaction rejected — stopping burns");
          break;
        }
        showToast.error(`Failed to burn ${nft.name}: ${err.message}`);
      }
    }

    setBurning(false);
    if (burnedCount > 0) {
      showToast.success(`✅ Burned ${burnedCount} NFT(s)`);
    }
  }

  const selectedCount = assets.filter(a => a.selected && !a.burnt).length;
  const activeAssets = assets.filter(a => !a.burnt);

  return (
    <main className="min-h-screen bg-dark-900 pt-32 pb-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="font-serif text-4xl font-bold text-white mb-2">Burn NFTs</h1>
          <p className="text-gray-400">Permanently burn unwanted NFTs from your wallet. This cannot be undone.</p>
        </div>

        {!connected ? (
          <div className="bg-dark-800 border border-white/10 rounded-xl p-12 text-center">
            <p className="text-gray-400 mb-6">Connect your wallet to view and burn NFTs</p>
            <WalletMultiButton className="!bg-gold-500 hover:!bg-gold-600 !rounded-lg !h-12 !text-sm !font-semibold" />
          </div>
        ) : loading ? (
          <div className="text-center py-20">
            <div className="w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-400">Loading NFTs...</p>
          </div>
        ) : (
          <>
            {/* Controls */}
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
              <div className="flex gap-3">
                <button onClick={selectAll} className="text-sm text-gold-500 hover:text-gold-400">Select All</button>
                <button onClick={deselectAll} className="text-sm text-gray-400 hover:text-white">Deselect All</button>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-400">{selectedCount} selected of {activeAssets.length}</span>
                <button
                  onClick={burnSelected}
                  disabled={selectedCount === 0 || burning}
                  className="px-6 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold text-sm transition-all"
                >
                  {burning ? "Burning..." : `🔥 Burn ${selectedCount > 0 ? selectedCount : ""} NFT${selectedCount !== 1 ? "s" : ""}`}
                </button>
              </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {assets.map((nft) => (
                <button
                  key={nft.id}
                  onClick={() => !nft.burning && !nft.burnt && toggleSelect(nft.id)}
                  disabled={nft.burning || nft.burnt}
                  className={`relative bg-dark-800 border rounded-xl overflow-hidden text-left transition-all ${
                    nft.burnt
                      ? "border-gray-700 opacity-30"
                      : nft.selected
                      ? "border-red-500 ring-2 ring-red-500/30"
                      : "border-white/10 hover:border-white/20"
                  }`}
                >
                  {/* Selection indicator */}
                  {nft.selected && !nft.burnt && (
                    <div className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
                      <span className="text-white text-xs">✓</span>
                    </div>
                  )}
                  
                  {/* Burning overlay */}
                  {nft.burning && (
                    <div className="absolute inset-0 z-10 bg-black/60 flex items-center justify-center">
                      <div className="w-6 h-6 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}

                  {/* Burnt overlay */}
                  {nft.burnt && (
                    <div className="absolute inset-0 z-10 bg-black/60 flex items-center justify-center">
                      <span className="text-2xl">🔥</span>
                    </div>
                  )}

                  <div className="aspect-square bg-dark-700 overflow-hidden">
                    {nft.image ? (
                      <img src={nft.image} alt={nft.name} className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-600 text-2xl">🖼️</div>
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="text-white text-xs font-medium truncate">{nft.name}</h3>
                    <p className="text-gray-500 text-[10px] mt-1">{nft.interface}</p>
                  </div>
                </button>
              ))}
            </div>

            {activeAssets.length === 0 && (
              <div className="text-center py-20">
                <p className="text-gray-400">No NFTs found in this wallet</p>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
