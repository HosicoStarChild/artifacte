"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

interface PortfolioCard {
  itemName: string;
  grade: string;
  gradeNum: number;
  gradingCompany: string;
  insuredValue: string;
  insuredValueNum: number;
  nftAddress: string;
  frontImage: string;
  category: string;
  vault: string;
  year: number;
  set: string;
  listing: {
    price: number;
    currency: string;
    marketplace: string;
  } | null;
  altAssetId?: string;
  altResearchUrl?: string;
}

interface PortfolioData {
  ok: boolean;
  wallet: string;
  timestamp: number;
  totalCards: number;
  totalInsuredValue: number;
  cards: PortfolioCard[];
  categoriesByValue: Record<string, number>;
  gradeDistribution: Record<string, number>;
  listedCards: number;
  unlistedCards: number;
  totalListedValue: number;
  marketCategoriesByValue?: Record<string, number>;
  error?: string;
}

interface HeliumAsset {
  id: string;
  content?: {
    metadata?: {
      name: string;
    };
    links?: {
      image?: string;
    };
  };
  grouping?: Array<{
    group_key: string;
    group_value: string;
  }>;
}

type FilterType = "all" | "listed" | "unlisted";

const getGradeBgColor = (company: string): string => {
  switch (company?.toUpperCase()) {
    case "PSA":
      return "bg-amber-500";
    case "CGC":
      return "bg-blue-500";
    case "BGS":
      return "bg-green-500";
    default:
      return "bg-gray-600";
  }
};

const formatCurrency = (num: number): string => {
  if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
  if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
  return `$${num.toLocaleString()}`;
};

const formatFullPrice = (num: number): string => {
  return `$${num.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
};

const formatSolPrice = (num: number): string => {
  return `◎${num.toFixed(2)}`;
};

export default function PortfolioPage() {
  const { publicKey, connected } = useWallet();
  const [portfolioData, setPortfolioData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
  const [floorPrices, setFloorPrices] = useState<Record<string, { name: string; floor: number }>>({});
  const [digitalCollectiblesValue, setDigitalCollectiblesValue] = useState(0);
  
  // Whitelisted collection addresses for digital collectibles
  const WHITELISTED_COLLECTIONS = new Set([
    "J1S9H3QjnRtBbbuD4HjPV6RpRhwuk4zKbxsnCHuTgh9w", // Mad Lads
    "8Rt3Ayqth4DAiPnW9MDFi63TiQJHmohfTWLMQFHi4KZH", // SMB Gen3
    "SMBtHCCC6RYRutFEPb4gZqeBLUZbMNhRKaMKZZLHi7W", // SMB Gen2
    "BUjZjAS2vbbb65g7Z1Ca9ZRVYoJscURG5L3AkVvHP9ac", // Famous Fox Federation
    "6mszaj17KSfVqADrQj3o4W3zoLMTykgmV37W4QadCczK", // Claynosaurz
    "HJx4HRAT3RiFq7cy9fSrvP92usAmJ7bJgPccQTyroT2r", // Taiyo Robotics
    "1yPMtWU5aqcF72RdyRD5yipmcMRC8NGNK59NvYubLkZ", // Claynosaurz: Call of Saga
    "J6RJFQfLgBTcoAt3KoZFiTFW9AbufsztBNDgZ7Znrp1Q", // Galactic Gecko
    "CjL5WpAmf4cMEEGwZGTfTDKWok9a92ykq9aLZrEK2D5H", // little swag world
  ]);

  useEffect(() => {
    if (!connected || !publicKey) {
      setPortfolioData(null);
      setDigitalCollectiblesValue(0);
      return;
    }

    let cancelled = false;

    async function fetchPortfolio() {
      setLoading(true);
      setError(null);

      try {
        const wallet = publicKey!.toBase58();
        const [response, floorRes, nftRes] = await Promise.all([
          fetch(`/api/portfolio?wallet=${wallet}`),
          fetch('/api/floor-prices').catch(() => null),
          fetch("https://mainnet.helius-rpc.com/?api-key=345726df-3822-42c1-86e0-1a13dc6c7a04", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: "my-id",
              method: "getAssetsByOwner",
              params: {
                ownerAddress: wallet,
                page: 1,
                limit: 1000,
              },
            }),
          }).catch(() => null),
        ]);

        // Process floor prices
        let localFloorPrices: Record<string, { name: string; floor: number }> = {};
        if (floorRes?.ok) {
          const floorData = await floorRes.json();
          if (floorData.collections) {
            localFloorPrices = floorData.collections;
            setFloorPrices(localFloorPrices);
          }
        }

        // Process NFT data and calculate digital collectibles value
        if (nftRes?.ok) {
          const nftData = await nftRes.json();
          if (nftData.result?.items) {
            const collectionCounts: Record<string, number> = {};
            
            nftData.result.items.forEach((asset: HeliumAsset) => {
              const grouping = asset.grouping?.find(g => g.group_key === "collection");
              if (grouping && WHITELISTED_COLLECTIONS.has(grouping.group_value)) {
                collectionCounts[grouping.group_value] = (collectionCounts[grouping.group_value] || 0) + 1;
              }
            });

            // Calculate total digital collectibles value in SOL
            let totalDigitalValue = 0;
            Object.entries(collectionCounts).forEach(([collection, count]) => {
              const fp = localFloorPrices[collection];
              if (fp) {
                totalDigitalValue += count * fp.floor;
              }
            });

            if (!cancelled) {
              setDigitalCollectiblesValue(totalDigitalValue);
            }
          }
        }

        if (!response.ok) {
          throw new Error("Failed to fetch portfolio data");
        }

        const data: PortfolioData = await response.json();

        if (!cancelled) {
          if (data.ok) {
            setPortfolioData(data);
          } else {
            setError(data.error || "Failed to load portfolio");
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "Failed to fetch portfolio data");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchPortfolio();
    return () => {
      cancelled = true;
    };
  }, [connected, publicKey]);

  const filteredCards = portfolioData?.cards.filter((card) => {
    if (filter === "listed") return card.listing !== null;
    if (filter === "unlisted") return card.listing === null;
    return true;
  }) || [];

  const maxCategoryValue = portfolioData
    ? Math.max(...Object.values(portfolioData.categoriesByValue || {}), 1)
    : 1;

  return (
    <div className="pt-24 min-h-screen bg-dark-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        {/* Header */}
        <p className="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">
          Investor Profile
        </p>
        <h1 className="font-serif text-3xl text-white mb-2">My Portfolio</h1>
        <p className="text-gray-400 text-sm mb-8">
          {connected
            ? `${publicKey!.toBase58().slice(0, 4)}...${publicKey!.toBase58().slice(-4)} — RWAs & Digital Collectibles`
            : "Connect your wallet to view your assets"}
        </p>

        {!connected ? (
          <div className="flex flex-col items-center justify-center py-24 gap-6">
            <div className="w-20 h-20 rounded-2xl bg-dark-800 border border-white/10 flex items-center justify-center">
              <svg
                className="w-10 h-10 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3"
                />
              </svg>
            </div>
            <p className="text-gray-400 text-sm">
              Connect your Solana wallet to view your NFTs and collectibles
            </p>
            <WalletMultiButton className="!bg-gold-500 hover:!bg-gold-600 !rounded-lg !h-12 !text-sm !font-medium" />
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-400 text-sm">Loading your portfolio...</p>
          </div>
        ) : error ? (
          <div className="text-center py-24">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        ) : !portfolioData?.cards || portfolioData.cards.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-gray-400 text-sm">
              No cards found in your portfolio
            </p>
          </div>
        ) : (
          <>
            {/* Portfolio Summary Header */}
            <div className="mb-12">
              <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16 mb-8">
                <div className="text-center">
                  <p className="text-gray-500 text-xs font-semibold tracking-widest uppercase mb-1">
                    Market Value
                  </p>
                  <div className="mb-2">
                    <h2 className="font-serif text-5xl text-gold-400 font-bold">
                      {formatFullPrice(portfolioData.totalListedValue || 0)}
                    </h2>
                    {digitalCollectiblesValue > 0 && (
                      <p className="font-serif text-3xl text-blue-400 font-bold mt-2">
                        {formatSolPrice(digitalCollectiblesValue)}
                      </p>
                    )}
                  </div>
                  <p className="text-gray-600 text-xs">
                    {digitalCollectiblesValue > 0 
                      ? "RWA & Digital Collectibles"
                      : "Powered by Artifacte Oracle"}
                  </p>
                </div>
                <div className="hidden md:block w-px h-16 bg-white/10" />
                <div className="text-center">
                  <p className="text-gray-500 text-xs font-semibold tracking-widest uppercase mb-1">
                    Insured Value
                  </p>
                  <h2 className="font-serif text-4xl text-white/60 font-bold mb-2">
                    {formatFullPrice(portfolioData.totalInsuredValue)}
                  </h2>
                  <p className="text-gray-600 text-xs">
                    CC insured across {portfolioData.totalCards} cards
                  </p>
                </div>
              </div>

              {/* 3 Stat Cards */}
              {/* Platform Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                {/* On Artifacte */}
                <div className="bg-dark-800 rounded-xl border border-white/5 p-6">
                  <h3 className="font-serif text-lg text-white mb-4">
                    On Artifacte Marketplace
                  </h3>
                  <div className="flex items-end gap-4">
                    <div>
                      <p className="font-serif text-2xl text-gold-400 font-bold">
                        {portfolioData.listedCards}
                      </p>
                      <p className="text-gray-500 text-xs mt-1">Cards listed</p>
                    </div>
                  </div>
                </div>

                {/* Total Portfolio */}
                <div className="bg-dark-800 rounded-xl border border-white/5 p-6">
                  <h3 className="font-serif text-lg text-white mb-4">
                    Total Portfolio
                  </h3>
                  <div className="flex items-end gap-4">
                    <div>
                      <p className="font-serif text-2xl text-gold-400 font-bold">
                        {portfolioData.totalCards}
                      </p>
                      <p className="text-gray-500 text-xs mt-1">Total cards</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Portfolio Value by Category Chart */}
              {Object.keys(portfolioData.categoriesByValue).length > 0 && (
                <div className="bg-dark-800 rounded-xl border border-white/5 p-6 mb-12">
                  <h3 className="font-serif text-lg text-white mb-2">
                    Insured Value by Category
                  </h3>
                  <p className="text-gray-500 text-xs mb-4">
                    Based on Collector Crypt valuations
                  </p>
                  <div className="space-y-4">
                    {Object.entries(portfolioData.categoriesByValue)
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 10)
                      .map(([category, value]) => {
                        const percentage = (value / maxCategoryValue) * 100;
                        return (
                          <div key={category}>
                            <div className="flex justify-between items-center mb-2">
                              <p className="text-sm text-gray-300">
                                {category}
                              </p>
                              <p className="text-xs text-gold-400 font-semibold">
                                {formatCurrency(value)}
                              </p>
                            </div>
                            <div className="w-full bg-dark-900 rounded-full h-2">
                              <div
                                className="bg-gradient-to-r from-gold-400 to-gold-600 h-2 rounded-full transition-all duration-500"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Portfolio Value by Category (Oracle) */}
              {(() => {
                const catValues = { ...(portfolioData?.marketCategoriesByValue || {}) };
                if (digitalCollectiblesValue > 0) {
                  catValues["Digital Collectibles"] = digitalCollectiblesValue;
                }
                const maxVal = Math.max(...Object.values(catValues), 1);
                return Object.keys(catValues).length > 0 ? (
                  <div className="bg-dark-800 rounded-xl border border-white/5 p-6 mb-12">
                    <h3 className="font-serif text-lg text-white mb-2">
                      Portfolio Value by Category
                    </h3>
                    <p className="text-gray-500 text-xs mb-4">
                      {digitalCollectiblesValue > 0 
                        ? "RWA via Artifacte Oracle & Digital Collectibles Floor Prices"
                        : "Powered by the Artifacte Oracle"}
                    </p>
                    <div className="space-y-4">
                      {Object.entries(catValues)
                        .sort(([, a], [, b]) => b - a)
                        .map(([category, value]) => (
                          <div key={category}>
                            <div className="flex justify-between items-center mb-2">
                              <p className="text-sm text-gray-300">{category}</p>
                              <p className={`text-xs font-semibold ${category === "Digital Collectibles" ? "text-blue-400" : "text-gold-400"}`}>
                                {category === "Digital Collectibles" ? formatSolPrice(value) : formatCurrency(value)}
                              </p>
                            </div>
                            <div className="w-full bg-dark-900 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full transition-all duration-500 ${
                                  category === "Digital Collectibles"
                                    ? "bg-gradient-to-r from-blue-400 to-blue-600"
                                    : "bg-gradient-to-r from-gold-400 to-gold-600"
                                }`}
                                style={{ width: `${(value / maxVal) * 100}%` }}
                              />
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                ) : null;
              })()}

              {/* Grade Distribution */}
              {Object.keys(portfolioData.gradeDistribution).length > 0 && (
                <div className="bg-dark-800 rounded-xl border border-white/5 p-6 mb-12">
                  <h3 className="font-serif text-lg text-white mb-4">
                    Grade Distribution
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    {Object.entries(portfolioData.gradeDistribution)
                      .sort(([, a], [, b]) => b - a)
                      .map(([grade, count]) => {
                        const [company] = grade.split("-");
                        return (
                          <div
                            key={grade}
                            className={`${getGradeBgColor(company)} text-white px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-2`}
                          >
                            {grade.replace("-", " ")} <span className="opacity-70">×{count}</span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-2 mb-8 border-b border-white/5 pb-4">
              {(
                [
                  { value: "all" as FilterType, label: "All" },
                  { value: "listed" as FilterType, label: "Listed" },
                  { value: "unlisted" as FilterType, label: "Unlisted" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setFilter(tab.value)}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    filter === tab.value
                      ? "text-gold-400 border-b-2 border-gold-400"
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Card Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-12">
              {filteredCards.map((card) => (
                <div
                  key={card.nftAddress}
                  className="bg-dark-800 rounded-xl border border-white/5 overflow-hidden card-hover group"
                >
                  {/* Card Image */}
                  <div className="aspect-square overflow-hidden bg-dark-900">
                    {card.frontImage ? (
                      <img
                        src={card.frontImage}
                        alt={card.itemName}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display =
                            "none";
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl bg-dark-800">
                        🎴
                      </div>
                    )}
                  </div>

                  {/* Card Details */}
                  <div className="p-4">
                    <h3 className="text-white font-medium text-sm truncate">
                      {card.itemName}
                    </h3>

                    {/* Grade Badge */}
                    {card.grade && (
                      <div className="mt-2 flex items-center gap-2">
                        <span
                          className={`${getGradeBgColor(card.gradingCompany)} text-white rounded-full px-2 py-0.5 text-xs font-semibold`}
                        >
                          {card.gradingCompany} {card.grade}
                        </span>
                      </div>
                    )}

                    {/* Insured Value (Primary) */}
                    <div className="mt-3">
                      <p className="text-gray-500 text-[9px] font-semibold uppercase tracking-widest mb-1">
                        Insured Value
                      </p>
                      <p className="text-gold-400 font-serif text-lg font-bold">
                        {formatCurrency(card.insuredValueNum)}
                      </p>
                    </div>

                    {/* Listed Status */}
                    <p className="text-gray-500 text-[10px] mt-3">
                      {card.listing ? (
                        <span className="text-green-400">
                          Listed @ {formatCurrency(card.listing.price)}
                        </span>
                      ) : (
                        <span>Unlisted</span>
                      )}
                    </p>

                    {/* Category & Vault */}
                    <p className="text-gray-600 text-[10px] mt-1 font-mono">
                      {card.category}
                      {card.vault && ` • ${card.vault}`}
                    </p>

                    {/* Alt.xyz Research Link */}
                    {card.altResearchUrl && (
                      <a
                        href={card.altResearchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-semibold text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                        </svg>
                        View Market Data on Alt.xyz
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* End of portfolio */}
          </>
        )}
      </div>
    </div>
  );
}
