"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";

interface NFTAsset {
  id: string;
  content: {
    metadata: { name: string; symbol: string; description: string };
    links?: { image?: string };
    files?: { uri?: string }[];
    json_uri?: string;
  };
  grouping?: { group_key: string; group_value: string }[];
  ownership: { owner: string };
}

interface WhitelistStatus {
  walletOk: boolean;
  loading: boolean;
}

export default function ListNFTPage() {
  const { publicKey, connected } = useWallet();
  const [whitelistStatus, setWhitelistStatus] = useState<WhitelistStatus>({ walletOk: false, loading: true });
  const [nfts, setNfts] = useState<NFTAsset[]>([]);
  const [loadingNfts, setLoadingNfts] = useState(false);
  const [selectedNft, setSelectedNft] = useState<NFTAsset | null>(null);
  const [price, setPrice] = useState("");
  const [listingType, setListingType] = useState<"fixed" | "auction">("fixed");
  const [auctionDuration, setAuctionDuration] = useState("72");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [allowedCollections, setAllowedCollections] = useState<Record<string, string>>({});

  // Digital Art = collection gate only, no wallet whitelist needed
  useEffect(() => {
    if (!connected || !publicKey) {
      setWhitelistStatus({ walletOk: false, loading: false });
      return;
    }
    // For digital collectibles, anyone with an approved collection NFT can list
    setWhitelistStatus({ walletOk: true, loading: false });
    loadAllowedCollections();
    loadNFTs();
  }, [connected, publicKey]);

  async function loadAllowedCollections() {
    try {
      const res = await fetch("/api/admin/allowlist");
      const data = await res.json();
      const map: Record<string, string> = {};
      for (const c of data.collections || []) {
        if (c.collectionAddress) map[c.collectionAddress] = c.name;
        if (c.mintAuthority) map[c.mintAuthority] = c.name;
      }
      setAllowedCollections(map);
    } catch {}
  }

  async function loadNFTs() {
    if (!publicKey) return;
    setLoadingNfts(true);
    try {
      const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=345726df-3822-42c1-86e0-1a13dc6c7a04`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "list-nfts",
          method: "getAssetsByOwner",
          params: {
            ownerAddress: publicKey.toBase58(),
            page: 1,
            limit: 1000,
            displayOptions: { showFungible: false, showNativeBalance: false },
          },
        }),
      });
      const data = await res.json();
      const items: NFTAsset[] = (data.result?.items || []).filter((item: any) => {
        // Filter: not burnt, not compressed, not fungible
        if (item.burnt) return false;
        if (item.compression?.compressed) return false;
        if (item.interface === "FungibleToken" || item.interface === "FungibleAsset") return false;
        return true;
      });
      setNfts(items);
    } catch (err) {
      console.error("Failed to load NFTs:", err);
    } finally {
      setLoadingNfts(false);
    }
  }

  function getNftImage(nft: NFTAsset): string {
    return nft.content?.links?.image || nft.content?.files?.[0]?.uri || "/placeholder.png";
  }

  function getNftCollection(nft: NFTAsset): { address: string; name: string } | null {
    const group = nft.grouping?.find(g => g.group_key === "collection");
    if (!group) return null;
    const name = allowedCollections[group.group_value];
    return name ? { address: group.group_value, name } : null;
  }

  function getFilteredNfts(): NFTAsset[] {
    return nfts.filter(nft => {
      const collection = getNftCollection(nft);
      return collection !== null;
    });
  }

  async function handleSubmit() {
    if (!selectedNft || !price || !publicKey) return;
    setSubmitting(true);
    setError("");
    try {
      const collection = getNftCollection(selectedNft);
      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nftMint: selectedNft.id,
          nftName: selectedNft.content?.metadata?.name || "Unknown",
          nftImage: getNftImage(selectedNft),
          collectionName: collection?.name || "Unknown",
          collectionAddress: collection?.address || "",
          seller: publicKey.toBase58(),
          price: parseFloat(price),
          listingType,
          auctionDuration: listingType === "auction" ? parseInt(auctionDuration) : undefined,
          description,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit");
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!connected) {
    return (
      <main className="min-h-screen pt-32 pb-20">
        <div className="max-w-2xl mx-auto px-4">
          <div className="bg-dark-800 border border-white/10 rounded-xl p-12 text-center">
            <div className="text-5xl mb-4">🔗</div>
            <h2 className="font-serif text-2xl text-white mb-4">Connect Your Wallet</h2>
            <p className="text-gray-400">Connect your Solana wallet to list NFTs on Artifacte.</p>
          </div>
        </div>
      </main>
    );
  }

  if (whitelistStatus.loading) {
    return (
      <main className="min-h-screen pt-32 pb-20">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <div className="inline-block animate-spin mb-4">
            <div className="w-8 h-8 border-4 border-gray-700 border-t-gold-500 rounded-full" />
          </div>
          <p className="text-gray-400">Checking access...</p>
        </div>
      </main>
    );
  }

  // Wallet whitelist check removed for Digital Art — collection gate is sufficient

  if (submitted) {
    return (
      <main className="min-h-screen pt-32 pb-20">
        <div className="max-w-2xl mx-auto px-4">
          <div className="bg-dark-800 border border-white/10 rounded-xl p-12 text-center">
            <div className="text-5xl mb-4">✅</div>
            <h2 className="font-serif text-2xl text-white mb-2">Listing Submitted</h2>
            <p className="text-gray-400 mb-6">
              Your NFT listing is pending review. Once approved, it will go live on Artifacte and your NFT will be escrowed on-chain.
            </p>
            <button
              onClick={() => { setSubmitted(false); setSelectedNft(null); setPrice(""); setDescription(""); }}
              className="px-6 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm hover:bg-white/10 transition"
            >
              List Another NFT
            </button>
          </div>
        </div>
      </main>
    );
  }

  const eligibleNfts = getFilteredNfts();

  return (
    <main className="min-h-screen pt-32 pb-20">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-10">
          <p className="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-3">List NFT</p>
          <h1 className="font-serif text-4xl text-white mb-3">List Your Digital Collectible</h1>
          <p className="text-gray-400 text-base">
            Select an NFT from an approved collection and set your price. Listings are reviewed before going live.
          </p>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 mb-6 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Step 1: Select NFT */}
        {!selectedNft ? (
          <div>
            <h2 className="font-serif text-xl text-white mb-4">
              Select NFT
              <span className="text-gray-500 text-sm ml-3 font-sans">
                {loadingNfts ? "Loading..." : `${eligibleNfts.length} eligible from approved collections`}
              </span>
            </h2>

            {loadingNfts ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="bg-dark-800 border border-white/5 rounded-xl h-64 animate-pulse" />
                ))}
              </div>
            ) : eligibleNfts.length === 0 ? (
              <div className="bg-dark-800 border border-white/10 rounded-xl p-12 text-center">
                <div className="text-4xl mb-4">📭</div>
                <p className="text-gray-400 mb-2">No eligible NFTs found</p>
                <p className="text-gray-500 text-sm">
                  You need NFTs from an approved collection. Currently approved: {Object.values(allowedCollections).join(", ") || "None"}.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {eligibleNfts.map((nft) => {
                  const collection = getNftCollection(nft);
                  return (
                    <button
                      key={nft.id}
                      onClick={() => setSelectedNft(nft)}
                      className="bg-dark-800 border border-white/5 rounded-xl overflow-hidden text-left hover:border-gold-500/50 transition group"
                    >
                      <div className="aspect-square bg-dark-700 relative overflow-hidden">
                        <img
                          src={getNftImage(nft)}
                          alt={nft.content?.metadata?.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                          onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.png"; }}
                        />
                      </div>
                      <div className="p-3">
                        <p className="text-white text-sm font-semibold truncate">
                          {nft.content?.metadata?.name || "Unnamed"}
                        </p>
                        <p className="text-gray-500 text-xs mt-1 truncate">{collection?.name}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {nfts.length > eligibleNfts.length && (
              <p className="text-gray-600 text-xs mt-4 text-center">
                {nfts.length - eligibleNfts.length} NFTs hidden (not from approved collections)
              </p>
            )}
          </div>
        ) : (
          /* Step 2: Set price and details */
          <div className="max-w-2xl">
            <button
              onClick={() => setSelectedNft(null)}
              className="text-gray-400 text-sm hover:text-white mb-6 flex items-center gap-2 transition"
            >
              ← Back to NFT selection
            </button>

            <div className="bg-dark-800 border border-white/5 rounded-xl p-6">
              {/* Selected NFT preview */}
              <div className="flex gap-4 mb-6 pb-6 border-b border-white/5">
                <img
                  src={getNftImage(selectedNft)}
                  alt={selectedNft.content?.metadata?.name}
                  className="w-24 h-24 rounded-lg object-cover"
                />
                <div>
                  <h3 className="text-white font-semibold text-lg">
                    {selectedNft.content?.metadata?.name || "Unnamed"}
                  </h3>
                  <p className="text-gray-500 text-sm">{getNftCollection(selectedNft)?.name}</p>
                  <p className="text-gray-600 text-xs font-mono mt-1">{selectedNft.id}</p>
                </div>
              </div>

              {/* Listing type */}
              <div className="mb-5">
                <label className="block text-sm text-gray-400 mb-2 font-medium">Listing Type</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setListingType("fixed")}
                    className={`flex-1 py-3 rounded-lg border text-sm font-semibold transition ${
                      listingType === "fixed"
                        ? "border-gold-500 bg-gold-500/10 text-gold-400"
                        : "border-white/10 text-gray-400 hover:border-white/20"
                    }`}
                  >
                    Fixed Price
                  </button>
                  <button
                    onClick={() => setListingType("auction")}
                    className={`flex-1 py-3 rounded-lg border text-sm font-semibold transition ${
                      listingType === "auction"
                        ? "border-gold-500 bg-gold-500/10 text-gold-400"
                        : "border-white/10 text-gray-400 hover:border-white/20"
                    }`}
                  >
                    Auction
                  </button>
                </div>
              </div>

              {/* Price */}
              <div className="mb-5">
                <label className="block text-sm text-gray-400 mb-1.5 font-medium">
                  {listingType === "fixed" ? "Price" : "Starting Price"} (SOL)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-2.5 text-gray-500">◎</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    className="w-full bg-dark-700 border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Auction duration */}
              {listingType === "auction" && (
                <div className="mb-5">
                  <label className="block text-sm text-gray-400 mb-1.5 font-medium">Auction Duration</label>
                  <select
                    value={auctionDuration}
                    onChange={e => setAuctionDuration(e.target.value)}
                    className="w-full bg-dark-700 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition"
                  >
                    <option value="24">24 hours</option>
                    <option value="48">48 hours</option>
                    <option value="72">3 days</option>
                    <option value="168">7 days</option>
                    <option value="336">14 days</option>
                  </select>
                </div>
              )}

              {/* Fee info */}
              <div className="bg-dark-700 rounded-lg p-4 mb-6 border border-white/5">
                <p className="text-gray-400 text-xs font-medium mb-2">Fee Summary</p>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Platform fee</span>
                  <span className="text-white">2%</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-gray-500">Creator royalty</span>
                  <span className="text-white">2%</span>
                </div>
                <div className="flex justify-between text-sm mt-1 pt-1 border-t border-white/5">
                  <span className="text-gray-500">You receive</span>
                  <span className="text-gold-400 font-semibold">
                    {price ? `◎ ${(parseFloat(price) * 0.96).toFixed(2)}` : "—"}
                  </span>
                </div>
              </div>

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={!price || parseFloat(price) <= 0 || submitting}
                className={`w-full py-3 rounded-lg font-semibold text-sm transition ${
                  !price || parseFloat(price) <= 0 || submitting
                    ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                    : "bg-gold-500 hover:bg-gold-600 text-dark-900"
                }`}
              >
                {submitting ? "Submitting..." : "Submit for Review"}
              </button>
              <p className="text-gray-600 text-xs text-center mt-3">
                Your NFT stays in your wallet until the listing is approved and the escrow transaction is signed.
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
