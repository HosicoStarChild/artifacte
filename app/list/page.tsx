"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import Link from "next/link";
import { getAssetsByOwner, readNFTMetadata, determineCurrency, calculateSellerFee, type NFTMetadata } from "@/lib/metadata-reader";
import { BAXUS_SELLER_FEE_ENABLED } from "@/lib/data";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

const CATEGORIES = [
  { value: "DIGITAL_ART", label: "Digital Art" },
  { value: "SPIRITS", label: "Spirits" },
  { value: "TCG_CARDS", label: "TCG Cards" },
  { value: "SPORTS_CARDS", label: "Sports Cards" },
  { value: "WATCHES", label: "Watches" },
];

const BAXUS_AUTHORITY = "BAXUz8YJsRtZVZuMaespnrDPMapvu83USD6PXh4GgHjg";

type Step = "connect" | "select-nft" | "set-price" | "review" | "success";

interface ListingData {
  nftMint: string;
  name: string;
  image: string;
  category: string;
  listingType: "FIXED_PRICE" | "AUCTION";
  price: number;
  auctionEndDays?: number;
  currency: "SOL" | "USDC" | "USD1";
  verifiedBy: string;
  sellerFee: number;
}

export default function ListPage() {
  const { publicKey, connected } = useWallet();
  const [step, setStep] = useState<Step>("connect");
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [selectedAsset, setSelectedAsset] = useState<NFTMetadata | null>(null);
  const [listing, setListing] = useState<ListingData>({
    nftMint: "",
    name: "",
    image: "",
    category: "DIGITAL_ART",
    listingType: "FIXED_PRICE",
    price: 0,
    currency: "SOL",
    verifiedBy: "",
    sellerFee: 0,
  });
  const [submitting, setSubmitting] = useState(false);
  const [customImageUrl, setCustomImageUrl] = useState("");
  const [showImageInput, setShowImageInput] = useState(false);

  // Fetch NFTs when wallet is connected
  useEffect(() => {
    if (connected && publicKey) {
      fetchNFTs();
      setStep("select-nft");
    } else {
      setStep("connect");
    }
  }, [connected, publicKey]);

  async function fetchNFTs() {
    setLoading(true);
    setError("");
    try {
      const nfts = await getAssetsByOwner(publicKey!.toBase58());
      setAssets(nfts);
      if (nfts.length === 0) {
        setError("No NFTs found in your wallet.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to fetch NFTs");
    } finally {
      setLoading(false);
    }
  }

  function selectNFT(asset: any) {
    const metadata = readNFTMetadata(asset);
    setSelectedAsset(metadata);
    
    const currency = determineCurrency(listing.category, metadata.verifiedBy);
    const sellerFee = calculateSellerFee(listing.price, metadata.verifiedBy, BAXUS_SELLER_FEE_ENABLED);
    
    setListing({
      nftMint: metadata.mint,
      name: metadata.name,
      image: metadata.image || "",
      category: listing.category,
      listingType: listing.listingType,
      price: listing.price,
      currency,
      verifiedBy: metadata.verifiedBy,
      sellerFee,
    });
    setStep("set-price");
  }

  function updateListingType(type: "FIXED_PRICE" | "AUCTION") {
    setListing({ ...listing, listingType: type });
  }

  function updatePrice(price: number) {
    const sellerFee = calculateSellerFee(price, listing.verifiedBy, BAXUS_SELLER_FEE_ENABLED);
    setListing({ ...listing, price, sellerFee });
  }

  function updateCategory(category: string) {
    const currency = determineCurrency(category, listing.verifiedBy);
    setListing({ ...listing, category, currency });
  }

  function proceedToReview() {
    if (!listing.price || listing.price <= 0) {
      setError("Please set a valid price");
      return;
    }
    if (listing.listingType === "AUCTION" && !listing.auctionEndDays) {
      setError("Please set auction end date");
      return;
    }
    setError("");
    setStep("review");
  }

  async function submitListing() {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: listing.name,
          category: listing.category,
          nftMint: listing.nftMint,
          image: customImageUrl || listing.image,
          listingType: listing.listingType,
          price: listing.price,
          currency: listing.currency,
          verifiedBy: listing.verifiedBy,
          sellerAddress: publicKey?.toBase58(),
          auctionEnd: listing.auctionEndDays
            ? new Date(Date.now() + listing.auctionEndDays * 24 * 60 * 60 * 1000).toISOString()
            : undefined,
          description: `${listing.verifiedBy}-verified ${listing.category} NFT. Mint: ${listing.nftMint}`,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create listing");
      }

      setStep("success");
    } catch (err: any) {
      setError(err.message || "Failed to submit listing");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-dark-900 pt-32 pb-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-12">
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-white mb-4">Create a Listing</h1>
          <p className="text-gray-400 text-lg">List your NFT on Artifacte marketplace</p>
        </div>

        {/* Step Indicator */}
        <div className="mb-12 flex justify-between items-center">
          {(["connect", "select-nft", "set-price", "review", "success"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
                  step === s ? "bg-gold-500 text-dark-900" : step > s ? "bg-gray-600 text-white" : "bg-dark-800 text-gray-500"
                }`}
              >
                {i + 1}
              </div>
              {i < 4 && <div className={`h-1 flex-1 mx-2 ${step > s ? "bg-gold-500" : "bg-dark-800"}`} />}
            </div>
          ))}
        </div>

        {/* Content */}
        {step === "connect" && (
          <div className="bg-dark-800 border border-white/10 rounded-xl p-8 md:p-12 text-center">
            <h2 className="font-serif text-2xl font-bold text-white mb-4">Connect Your Wallet</h2>
            <p className="text-gray-400 mb-8">
              To list an NFT, you'll need to connect your Solana wallet first.
            </p>
            <div className="flex justify-center">
              <WalletMultiButton className="!bg-gold-500 hover:!bg-gold-600 !rounded-lg !h-12 !text-sm !font-semibold !px-8" />
            </div>
          </div>
        )}

        {step === "select-nft" && (
          <div>
            <h2 className="font-serif text-2xl font-bold text-white mb-6">Select NFT to List</h2>
            
            {loading && (
              <div className="text-center py-12">
                <div className="inline-block animate-spin">
                  <div className="w-8 h-8 border-4 border-gray-700 border-t-gold-500 rounded-full" />
                </div>
                <p className="text-gray-400 mt-4">Loading your NFTs...</p>
              </div>
            )}

            {error && (
              <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 mb-6 text-red-400">
                {error}
              </div>
            )}

            {!loading && assets.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {assets.map((asset) => {
                  const metadata = readNFTMetadata(asset);
                  return (
                    <button
                      key={asset.id}
                      onClick={() => selectNFT(asset)}
                      className="bg-dark-800 border border-white/10 rounded-xl overflow-hidden hover:border-gold-500 transition-all card-hover text-left"
                    >
                      <div className="aspect-square bg-dark-700 overflow-hidden relative">
                        {metadata.image ? (
                          <img
                            src={metadata.image}
                            alt={metadata.name}
                            className="w-full h-full object-cover image-hover"
                            onError={(e) => {
                              e.currentTarget.src = "https://via.placeholder.com/400?text=No+Image";
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-500">
                            No image
                          </div>
                        )}
                      </div>
                      <div className="p-4">
                        <h3 className="font-semibold text-white truncate mb-1">{metadata.name}</h3>
                        <p className="text-xs text-gray-500 truncate mb-2">Mint: {asset.id.slice(0, 8)}...</p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-gold-500">{metadata.verifiedBy}</span>
                          <span className="text-xs text-gray-500">{metadata.symbol || "N/A"}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {!loading && assets.length === 0 && !error && (
              <div className="bg-dark-800 border border-white/10 rounded-xl p-12 text-center">
                <p className="text-gray-400 mb-4">No NFTs found in your wallet</p>
                <button
                  onClick={fetchNFTs}
                  className="text-gold-500 hover:text-gold-400 font-medium"
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        )}

        {step === "set-price" && selectedAsset && (
          <div className="max-w-2xl">
            <div className="bg-dark-800 border border-white/10 rounded-xl p-8 mb-8">
              <h2 className="font-serif text-2xl font-bold text-white mb-6">Set Listing Details</h2>

              {/* NFT Preview */}
              <div className="mb-8 pb-8 border-b border-white/10">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Selected NFT</h3>
                <div className="flex gap-6">
                  <div className="w-24 h-24 rounded-lg bg-dark-700 overflow-hidden flex-shrink-0">
                    {listing.image ? (
                      <img
                        src={listing.image}
                        alt={listing.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = "https://via.placeholder.com/100?text=No+Image";
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">
                        No image
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-white mb-1">{listing.name}</h4>
                    <p className="text-sm text-gray-500 mb-2">Verified by: {listing.verifiedBy}</p>
                    <p className="text-xs text-gray-600 break-all">Mint: {listing.nftMint}</p>
                  </div>
                </div>
              </div>

              {/* Category */}
              <div className="mb-8">
                <label className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 block">
                  Category
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      onClick={() => updateCategory(cat.value)}
                      className={`py-3 px-4 rounded-lg border transition-all font-medium text-sm ${
                        listing.category === cat.value
                          ? "bg-gold-500 text-dark-900 border-gold-500"
                          : "bg-dark-700 text-gray-300 border-white/10 hover:border-white/20"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Listing Type */}
              <div className="mb-8">
                <label className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 block">
                  Listing Type
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => updateListingType("FIXED_PRICE")}
                    className={`py-4 px-6 rounded-lg border transition-all text-left ${
                      listing.listingType === "FIXED_PRICE"
                        ? "bg-gold-500 text-dark-900 border-gold-500"
                        : "bg-dark-700 text-gray-300 border-white/10 hover:border-white/20"
                    }`}
                  >
                    <div className="font-semibold mb-1">Fixed Price</div>
                    <div className="text-xs opacity-75">Set a fixed selling price</div>
                  </button>
                  <button
                    onClick={() => updateListingType("AUCTION")}
                    className={`py-4 px-6 rounded-lg border transition-all text-left ${
                      listing.listingType === "AUCTION"
                        ? "bg-gold-500 text-dark-900 border-gold-500"
                        : "bg-dark-700 text-gray-300 border-white/10 hover:border-white/20"
                    }`}
                  >
                    <div className="font-semibold mb-1">Auction</div>
                    <div className="text-xs opacity-75">Let buyers bid on your NFT</div>
                  </button>
                </div>
              </div>

              {/* Price */}
              <div className="mb-8">
                <label className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 block">
                  Price ({listing.currency})
                </label>
                <input
                  type="number"
                  value={listing.price}
                  onChange={(e) => updatePrice(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full bg-dark-700 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:border-gold-500 outline-none transition-all"
                  step="0.01"
                  min="0"
                />
              </div>

              {/* Auction Duration */}
              {listing.listingType === "AUCTION" && (
                <div className="mb-8">
                  <label className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 block">
                    Auction Duration (days)
                  </label>
                  <input
                    type="number"
                    value={listing.auctionEndDays || ""}
                    onChange={(e) => setListing({ ...listing, auctionEndDays: parseInt(e.target.value) || undefined })}
                    placeholder="e.g. 7"
                    className="w-full bg-dark-700 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:border-gold-500 outline-none transition-all"
                    min="1"
                    max="90"
                  />
                </div>
              )}

              {/* Image Override */}
              {listing.image && (
                <div className="mb-8">
                  <button
                    onClick={() => setShowImageInput(!showImageInput)}
                    className="text-sm text-gold-500 hover:text-gold-400 font-medium"
                  >
                    {showImageInput ? "Hide image URL input" : "Use custom image URL?"}
                  </button>
                  {showImageInput && (
                    <input
                      type="url"
                      value={customImageUrl}
                      onChange={(e) => setCustomImageUrl(e.target.value)}
                      placeholder="https://example.com/image.jpg"
                      className="w-full mt-3 bg-dark-700 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:border-gold-500 outline-none transition-all text-sm"
                    />
                  )}
                </div>
              )}

              {/* Fee Notice */}
              {listing.verifiedBy === "BAXUS" && BAXUS_SELLER_FEE_ENABLED && listing.sellerFee > 0 && (
                <div className="mb-8 bg-amber-900/20 border border-amber-700 rounded-lg p-4">
                  <p className="text-sm text-amber-400">
                    <span className="font-semibold">BAXUS Seller Fee:</span> 10% of sale price (
                    {listing.currency} {listing.sellerFee.toFixed(2)})
                  </p>
                </div>
              )}

              {error && (
                <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 mb-8 text-red-400 text-sm">
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-4">
                <button
                  onClick={() => setStep("select-nft")}
                  className="flex-1 px-6 py-3 rounded-lg border border-white/10 text-white hover:bg-dark-700 transition-all font-semibold"
                >
                  Back
                </button>
                <button
                  onClick={proceedToReview}
                  className="flex-1 px-6 py-3 rounded-lg bg-gold-500 hover:bg-gold-600 text-dark-900 font-semibold transition-all"
                >
                  Review Listing
                </button>
              </div>
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="max-w-2xl">
            <div className="bg-dark-800 border border-white/10 rounded-xl p-8">
              <h2 className="font-serif text-2xl font-bold text-white mb-8">Review Your Listing</h2>

              {/* Preview Card */}
              <div className="bg-dark-700 rounded-lg p-6 mb-8">
                <div className="flex gap-6">
                  <div className="w-32 h-32 rounded-lg bg-dark-600 overflow-hidden flex-shrink-0">
                    {listing.image ? (
                      <img
                        src={customImageUrl || listing.image}
                        alt={listing.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = "https://via.placeholder.com/150?text=No+Image";
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-600">No image</div>
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-white text-lg mb-2">{listing.name}</h3>
                    <p className="text-gray-400 text-sm mb-4">{CATEGORIES.find(c => c.value === listing.category)?.label}</p>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Verified by:</span>
                        <span className="text-gold-500 font-semibold">{listing.verifiedBy}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Listing Type:</span>
                        <span className="text-white font-semibold">
                          {listing.listingType === "FIXED_PRICE" ? "Fixed Price" : "Auction"}
                        </span>
                      </div>
                      <div className="flex justify-between text-lg border-t border-white/10 pt-2 mt-2">
                        <span className="text-gray-400">Price:</span>
                        <span className="text-gold-500 font-bold">
                          {listing.currency} {listing.price.toFixed(2)}
                        </span>
                      </div>
                      {listing.sellerFee > 0 && (
                        <div className="flex justify-between text-sm text-amber-400">
                          <span>Seller Fee (10%):</span>
                          <span>{listing.currency} {listing.sellerFee.toFixed(2)}</span>
                        </div>
                      )}
                      {listing.auctionEndDays && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Duration:</span>
                          <span className="text-white">{listing.auctionEndDays} days</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {error && (
                <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 mb-8 text-red-400 text-sm">
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-4">
                <button
                  onClick={() => setStep("set-price")}
                  className="flex-1 px-6 py-3 rounded-lg border border-white/10 text-white hover:bg-dark-700 transition-all font-semibold"
                >
                  Back
                </button>
                <button
                  onClick={submitListing}
                  disabled={submitting}
                  className="flex-1 px-6 py-3 rounded-lg bg-gold-500 hover:bg-gold-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-dark-900 font-semibold transition-all"
                >
                  {submitting ? "Creating listing..." : "Create Listing"}
                </button>
              </div>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="bg-dark-800 border border-white/10 rounded-xl p-8 md:p-12 text-center max-w-2xl mx-auto">
            <div className="w-16 h-16 rounded-full bg-green-900/20 border border-green-700 flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="font-serif text-3xl font-bold text-white mb-4">Listing Created!</h2>
            <p className="text-gray-400 mb-8">
              Your NFT has been listed on Artifacte. You can view it on the marketplace or check your listings.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/auctions"
                className="flex-1 px-6 py-3 rounded-lg bg-gold-500 hover:bg-gold-600 text-dark-900 font-semibold transition-all text-center"
              >
                View Marketplace
              </Link>
              <Link
                href="/my-listings"
                className="flex-1 px-6 py-3 rounded-lg border border-white/10 text-white hover:bg-dark-700 transition-all font-semibold text-center"
              >
                My Listings
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
