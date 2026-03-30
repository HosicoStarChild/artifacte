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
  const [digitalNfts, setDigitalNfts] = useState<Array<{ id: string; name: string; image: string; collection: string; floorPrice: number; tcg?: string }>>([]);
  const [artifacteRwaValue, setArtifacteRwaValue] = useState(0);
  const [artifacteRwaCount, setArtifacteRwaCount] = useState(0);
  
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
    "BuAYoZPVwQw4AfeEpHTx6iGPbQtB27W7tJUjgyLzgiko", // Quekz (old collection)
    "2hwTMM3uWRvNny8YxSEKQkHZ8NHB5BRv7f35ccMWg1ay", // Quekz (WNS authority)
    "CywHUY59AFi7nmGf9kVfNgd39TD9rnkyx6GfWsn5iNnE", // Hot Heads (authority)
    "6XxjKYFbcndh2gDcsUrmZgVEsoDxXMnfsaGY6fpTJzNr", // DeGods
    "DSwfRF1jhhu6HpSuzaig1G19kzP73PfLZBPLofkw6fLD", // Degen Ape Academy
    "GMoemLuVAksjvGph8dmujuqijWsodt7nJsvwoMph3uzj", // Sensei
    "7LxjzYdvXXDMxEmjS3aBC26ut4FMtDUae44nkHBPNVWP", // Dead King Society
    "3saAedkM9o5g1u5DCqsuMZuC4GRqPB4TuMkvSsSVvGQ3", // Okay Bears
    "7cHTjqr2S8uUCrG3TVFvFix3vcLjhPiwrtRsAeJtESRj", // Drifella 2
    "ArqtvxDZ1nfWgnGiHYCFTLj4FSVuyf7tmkAetQ9SScyQ", // Drifella III
    "8vE4uASPp9WbS9Ls2qzJ9fpUBpR3UrTG3hBZXdAJQ9mz", // Monkey Baby Business
    "54ZnA77u7j6niHEyyD9ZZ6QAkqjCqKY4k6iPT82wxgJ8", // CHADS
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
          fetch("/api/helius-das", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
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
            // Build digital NFTs list with floor prices
            let totalDigitalValue = 0;
            const digitalItems: typeof digitalNfts = [];
            const artifacteItems: { asset: any; priceSource: string; priceSourceId: string; tcg: string; isPhygital?: boolean; isCC?: boolean }[] = [];
            
            nftData.result.items.forEach((asset: HeliumAsset) => {
              // Match by collection grouping (standard) or authority (WNS/Token-2022)
              const grouping = asset.grouping?.find((g: any) => g.group_key === "collection");
              let matchedAddress = grouping?.group_value;
              if (!matchedAddress || !WHITELISTED_COLLECTIONS.has(matchedAddress)) {
                // Check authorities for WNS NFTs
                const auth = (asset as any).authorities?.find((a: any) => WHITELISTED_COLLECTIONS.has(a.address));
                matchedAddress = auth?.address;
              }
              // Check for Artifacte-minted NFTs (admin wallet as creator/authority)
              // Skip the collection NFT itself
              if (asset.id === "jzkJTGAuDcWthM91S1ch7wPcfMUQB5CdYH6hA25K4CS") return;
              // Detect source: Artifacte-minted, CC, Phygitals
              const CC_COLLECTION = "CCryptWBYktukHDQ2vHGtVcmtjXxYzvw8XNVY64YN2Yf";
              const PHYGITALS_COLLECTION = "BSG6DyEihFFtfvxtL9mKYsvTwiZXB1rq5gARMTJC2xAM";
              const isCCCard = asset.grouping?.some((g: any) => g.group_key === "collection" && g.group_value === CC_COLLECTION);
              const isPhygital = asset.grouping?.some((g: any) => g.group_key === "collection" && g.group_value === PHYGITALS_COLLECTION);
              const isArtifacteMinted = (
                (asset as any).authorities?.some((a: any) => a.address === "DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX") ||
                (asset as any).creators?.some((c: any) => c.address === "DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX")
              );
              
              // CC cards first (even if also has Artifacte authority — CC vault takes priority)
              if (isCCCard) {
                const attrs = (asset.content?.metadata as any)?.attributes || [];
                const getAttr = (name: string) => attrs.find((a: any) => a.trait_type?.toLowerCase() === name.toLowerCase())?.value;
                artifacteItems.push({ asset, priceSource: getAttr("Price Source") || '', priceSourceId: getAttr("Price Source ID") || '', tcg: getAttr("TCG") || getAttr("Category") || "Other", isPhygital: false, isCC: true });
                return;
              }
              // Phygitals
              if (isPhygital) {
                const attrs = (asset.content?.metadata as any)?.attributes || [];
                const getAttr = (name: string) => attrs.find((a: any) => a.trait_type?.toLowerCase() === name.toLowerCase())?.value;
                const priceSource = getAttr("Price Source") || (getAttr("TCGPlayer ID") ? "TCGplayer" : undefined);
                const priceSourceId = getAttr("Price Source ID") || getAttr("TCGPlayer ID") || getAttr("TCGplayer Product ID");
                artifacteItems.push({ asset, priceSource, priceSourceId, tcg: getAttr("TCG") || "Other", isPhygital: true });
                return;
              }
              // Artifacte-minted (not CC, not Phygitals)
              if (isArtifacteMinted) {
                const attrs = (asset.content?.metadata as any)?.attributes || [];
                const getAttr = (name: string) => attrs.find((a: any) => a.trait_type?.toLowerCase() === name.toLowerCase())?.value;
                const priceSource = getAttr("Price Source") || (getAttr("TCGPlayer ID") ? "TCGplayer" : undefined);
                const priceSourceId = getAttr("Price Source ID") || getAttr("TCGPlayer ID") || getAttr("TCGplayer Product ID");
                const tcgName = getAttr("TCG") || "Other";
                artifacteItems.push({ asset, priceSource, priceSourceId, tcg: tcgName, isPhygital: false });
                return;
              }
              if (matchedAddress && WHITELISTED_COLLECTIONS.has(matchedAddress)) {
                const fp = localFloorPrices[matchedAddress];
                const floor = fp?.floor || 0;
                totalDigitalValue += floor;
                digitalItems.push({
                  id: asset.id,
                  name: asset.content?.metadata?.name || "Unknown",
                  image: (() => {
                    let u = asset.content?.links?.image || "";
                    // Route IPFS/nftstorage through our proxy (gateways are dead)
                    if (u.includes("nftstorage.link/") || u.includes("/ipfs/") || u.startsWith("ipfs://")) {
                      if (u.startsWith("ipfs://")) u = u.replace("ipfs://", "https://nftstorage.link/ipfs/");
                      return `/api/img-proxy?url=${encodeURIComponent(u)}`;
                    }
                    // Prefer Helius CDN URI for non-IPFS
                    const cdnUri = ((asset.content as any)?.files?.[0] as any)?.cdn_uri;
                    if (cdnUri) return cdnUri;
                    if (u.includes("arweave.net/")) return `/api/img-proxy?url=${encodeURIComponent(u)}`;
                    return u;
                  })(),
                  collection: fp?.name || matchedAddress?.slice(0, 8) || "Unknown",
                  floorPrice: floor,
                });
              }
            });

            // Fetch prices for Artifacte-minted NFTs (batch TCGPlayer lookups)
            let totalArtifacteValue = 0;
            for (const item of artifacteItems) {
              let price = 0;
              if (item.priceSource === "TCGplayer" && item.priceSourceId) {
                try {
                  const tcgRes = await fetch(`/api/tcgplayer-price?id=${item.priceSourceId}`);
                  if (tcgRes.ok) {
                    const tcgData = await tcgRes.json();
                    price = tcgData.marketPrice || tcgData.listedMedianPrice || 0;
                  }
                } catch {}
              }
              // Fallback: try oracle search by mint address
              if (price === 0 && item.asset.id) {
                try {
                  const oracleRes = await fetch(`/api/oracle?endpoint=search&q=${encodeURIComponent(item.asset.id)}`);
                  if (oracleRes.ok) {
                    const oracleData = await oracleRes.json();
                    const match = oracleData.results?.[0];
                    if (match?.marketPrice) price = match.marketPrice;
                    else if (match?.price) price = match.price;
                  }
                } catch {}
              }
              totalArtifacteValue += price;
              digitalItems.push({
                id: item.asset.id,
                name: item.asset.content?.metadata?.name || item.asset.name || "Unknown",
                image: item.asset.content?.links?.image || item.asset.image || "",
                collection: item.isCC ? "Collectors Crypt" : item.isPhygital ? "Phygitals" : "Artifacte",
                floorPrice: price,
                tcg: item.tcg,
              });
            }

            if (!cancelled) {
              // Separate Artifacte RWAs from digital collectibles
              const realDigital = digitalItems.filter(d => d.collection !== "Artifacte" && d.collection !== "Phygitals" && d.collection !== "Collectors Crypt");
              const artifacteCards = digitalItems.filter(d => d.collection === "Artifacte");
              const phygitalCards = digitalItems.filter(d => d.collection === "Phygitals");
              setDigitalCollectiblesValue(totalDigitalValue);
              setDigitalNfts(digitalItems); // Keep all for display
              setArtifacteRwaValue(totalArtifacteValue);
              const ccDasCards = digitalItems.filter(d => d.collection === "Collectors Crypt");
              setArtifacteRwaCount(artifacteCards.length + phygitalCards.length + ccDasCards.length);
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

  // Safe defaults for rendering when portfolioData is null but digitalNfts exist
  const pd = portfolioData || {
    totalListedValue: 0, totalInsuredValue: 0, totalCards: 0,
    listedCards: 0, unlistedCards: 0, cards: [] as any[],
    categoriesByValue: {} as Record<string, number>, gradeDistribution: {} as Record<string, number>, marketCategoriesByValue: {} as Record<string, number>,
  };

  const maxCategoryValue = Math.max(...Object.values(pd.categoriesByValue || {}), 1);

  return (
    <div className="pt-24 min-h-screen bg-dark-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        {/* Header */}
        <a href="/" className="text-gold-400 hover:text-gold-300 text-sm mb-4 inline-block">← Back to Home</a>
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
        ) : !portfolioData?.cards?.length && !digitalNfts.length ? (
          <div className="text-center py-24">
            <p className="text-gray-400 text-sm">
              No assets found in your portfolio
            </p>
          </div>
        ) : (
          <>
            {/* Portfolio Summary Header */}
            <div className="mb-12">
              <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16 mb-8">
                <div className="text-center">
                  <p className="text-gray-500 text-xs font-semibold tracking-widest uppercase mb-1">
                    RWA Market Value
                  </p>
                  <h2 className="font-serif text-5xl text-gold-400 font-bold mb-2">
                    {formatFullPrice((pd.totalListedValue || 0) + artifacteRwaValue)}
                  </h2>
                  <p className="text-gray-600 text-xs">
                    Powered by Artifacte Oracle
                  </p>
                </div>
                {digitalCollectiblesValue > 0 && (
                  <>
                    <div className="hidden md:block w-px h-16 bg-white/10" />
                    <div className="text-center">
                      <p className="text-gray-500 text-xs font-semibold tracking-widest uppercase mb-1">
                        Digital Collectibles
                      </p>
                      <h2 className="font-serif text-5xl text-blue-400 font-bold mb-2">
                        {formatSolPrice(digitalCollectiblesValue)}
                      </h2>
                      <p className="text-gray-600 text-xs">
                        Floor price via Magic Eden
                      </p>
                    </div>
                  </>
                )}
                <div className="hidden md:block w-px h-16 bg-white/10" />
                <div className="text-center">
                  <p className="text-gray-500 text-xs font-semibold tracking-widest uppercase mb-1">
                    Insured Value
                  </p>
                  <h2 className="font-serif text-4xl text-white/60 font-bold mb-2">
                    {formatFullPrice(pd.totalInsuredValue)}
                  </h2>
                  <p className="text-gray-600 text-xs">
                    CC insured across {pd.totalCards} cards
                  </p>
                </div>
              </div>

              {/* 3 Stat Cards */}
              {/* Platform Breakdown */}
              <div className="grid grid-cols-3 gap-4 mb-12">
                {/* RWAs */}
                <div className="bg-dark-800 rounded-xl border border-white/5 p-5">
                  <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-widest mb-2">RWAs</p>
                  <p className="font-serif text-2xl text-gold-400 font-bold">{pd.totalCards + artifacteRwaCount}</p>
                  <p className="text-gray-600 text-xs mt-1">Artifacte · CC · Phygitals</p>
                </div>

                {/* Digital Collectibles */}
                <div className="bg-dark-800 rounded-xl border border-white/5 p-5">
                  <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-widest mb-2">Digital Collectibles</p>
                  <p className="font-serif text-2xl text-blue-400 font-bold">{digitalNfts.filter(d => d.collection !== "Artifacte" && d.collection !== "Phygitals" && d.collection !== "Collectors Crypt").length}</p>
                  <p className="text-gray-600 text-xs mt-1">In wallet</p>
                </div>

                {/* Total Portfolio */}
                <div className="bg-dark-800 rounded-xl border border-white/5 p-5">
                  <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-widest mb-2">Total Portfolio</p>
                  <p className="font-serif text-2xl text-white font-bold">{pd.totalCards + artifacteRwaCount + digitalNfts.filter(d => d.collection !== "Artifacte" && d.collection !== "Phygitals" && d.collection !== "Collectors Crypt").length}</p>
                  <p className="text-gray-600 text-xs mt-1">RWAs + Digital Collectibles</p>
                </div>
              </div>

              {/* Portfolio Value by Category (Oracle) */}
              {(() => {
                const catValues: Record<string, number> = {};
                // Artifacte RWA
                const artifacteTotal = digitalNfts.filter(d => d.collection === "Artifacte").reduce((sum, d) => sum + d.floorPrice, 0);
                if (artifacteTotal > 0) catValues["Artifacte RWA"] = artifacteTotal;
                // Collectors Crypt RWA
                const ccApiTotal = portfolioData ? Object.values(portfolioData.marketCategoriesByValue || {}).reduce((a: number, b: number) => a + b, 0) : 0;
                const ccDasTotal = digitalNfts.filter(d => d.collection === "Collectors Crypt").reduce((sum, d) => sum + d.floorPrice, 0);
                const ccTotal = ccApiTotal + ccDasTotal;
                if (ccTotal > 0) catValues["Collectors Crypt RWA"] = ccTotal;
                else if (filteredCards.length > 0) {
                  const insuredTotal = filteredCards.reduce((sum, c) => sum + (c.insuredValueNum || 0), 0);
                  if (insuredTotal > 0) catValues["Collectors Crypt RWA"] = insuredTotal;
                }
                // Phygitals RWA
                const phygTotal = digitalNfts.filter(d => d.collection === "Phygitals").reduce((sum, d) => sum + d.floorPrice, 0);
                if (phygTotal > 0) catValues["Phygitals RWA"] = phygTotal;
                // Digital Collectibles
                if (digitalCollectiblesValue > 0) catValues["Digital Collectibles"] = digitalCollectiblesValue;
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
                              <p className={`text-xs font-semibold ${category === "Digital Collectibles" ? "text-blue-400" : category === "Phygitals RWA" ? "text-violet-400" : "text-gold-400"}`}>
                                {category === "Digital Collectibles" ? formatSolPrice(value) : formatCurrency(value)}
                              </p>
                            </div>
                            <div className="w-full bg-dark-900 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full transition-all duration-500 ${
                                  category === "Digital Collectibles"
                                    ? "bg-gradient-to-r from-blue-400 to-blue-600"
                                    : category === "Phygitals RWA"
                                    ? "bg-gradient-to-r from-violet-400 to-violet-600"
                                    : category === "Collectors Crypt RWA"
                                    ? "bg-gradient-to-r from-violet-400 to-purple-600"
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
              {Object.keys(pd.gradeDistribution).length > 0 && (
                <div className="bg-dark-800 rounded-xl border border-white/5 p-6 mb-12">
                  <h3 className="font-serif text-lg text-white mb-4">
                    Grade Distribution
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    {Object.entries(pd.gradeDistribution)
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

            {/* 1. Artifacte RWA */}
            {digitalNfts.filter(d => d.collection === "Artifacte").length > 0 && (
              <div className="mb-12">
                <h2 className="font-serif text-2xl text-white mb-6">Artifacte RWA</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                  {digitalNfts.filter(d => d.collection === "Artifacte").map((nft) => (
                    <div key={nft.id} onClick={() => window.location.href = `/auctions/cards/${nft.id}`} className="bg-dark-800 rounded-xl border border-white/5 overflow-hidden card-hover group cursor-pointer">
                      <div className="aspect-square overflow-hidden bg-dark-900 relative">
                        <span className="absolute top-2 right-2 z-10 bg-gold-500/90 text-dark-900 text-[10px] font-bold px-2 py-0.5 rounded-full">ARTIFACTE</span>
                        {nft.image ? <img src={nft.image} alt={nft.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition duration-500" /> : <div className="w-full h-full flex items-center justify-center text-4xl bg-dark-800">🎴</div>}
                      </div>
                      <div className="p-4">
                        <h3 className="text-white font-medium text-sm truncate">{nft.name}</h3>
                        <div className="mt-3">
                          <p className="text-gray-500 text-[9px] font-semibold uppercase tracking-widest mb-1">Market Price</p>
                          <p className="text-gold-400 font-serif text-lg font-bold">${nft.floorPrice.toFixed(2)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 2. Collectors Crypt RWA */}
            {(() => {
              const ccFromDas = digitalNfts.filter(d => d.collection === "Collectors Crypt");
              const ccIds = new Set(filteredCards.map(c => c.nftAddress));
              const extraCC = ccFromDas.filter(d => !ccIds.has(d.id));
              return (filteredCards.length > 0 || extraCC.length > 0) ? (
              <div className="mb-12">
                <h2 className="font-serif text-2xl text-white mb-6">Collectors Crypt RWA</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                  {filteredCards.map((card) => (
                    <div key={card.nftAddress} onClick={() => window.location.href = `/auctions/cards/${card.nftAddress}`} className="bg-dark-800 rounded-xl border border-white/5 overflow-hidden card-hover group cursor-pointer">
                      <div className="aspect-square overflow-hidden bg-dark-900 relative">
                        <span className="absolute top-2 right-2 z-10 bg-violet-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">COLLECTOR CRYPT</span>
                        {card.frontImage ? <img src={card.frontImage} alt={card.itemName} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition duration-500" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} /> : <div className="w-full h-full flex items-center justify-center text-4xl bg-dark-800">🎴</div>}
                      </div>
                      <div className="p-4">
                        <h3 className="text-white font-medium text-sm truncate">{card.itemName}</h3>
                        {card.grade && (
                          <div className="mt-2 flex items-center gap-2">
                            <span className={`${getGradeBgColor(card.gradingCompany)} text-white rounded-full px-2 py-0.5 text-xs font-semibold`}>{card.gradingCompany} {card.grade}</span>
                          </div>
                        )}
                        <div className="mt-3">
                          {(card as any).oracleValue ? (
                            <>
                              <p className="text-gray-500 text-[9px] font-semibold uppercase tracking-widest mb-1">Market Value</p>
                              <p className="text-gold-400 font-serif text-lg font-bold">{formatCurrency((card as any).oracleValue)}</p>
                              <p className="text-gray-600 text-[9px] mt-0.5">Insured: {formatCurrency(card.insuredValueNum)}</p>
                            </>
                          ) : (
                            <>
                              <p className="text-gray-500 text-[9px] font-semibold uppercase tracking-widest mb-1">Insured Value</p>
                              <p className="text-gold-400 font-serif text-lg font-bold">{formatCurrency(card.insuredValueNum)}</p>
                            </>
                          )}
                        </div>
                        <p className="text-gray-500 text-[10px] mt-3">{card.listing ? <span className="text-green-400">Listed @ {formatCurrency(card.listing.price)}</span> : <span>Unlisted</span>}</p>
                        <p className="text-gray-600 text-[10px] mt-1 font-mono">{card.category}{card.vault && ` • ${card.vault}`}</p>
                      </div>
                    </div>
                  ))}
                  {/* Extra CC cards found via DAS but not in CC API */}
                  {extraCC.map((nft) => (
                    <div key={nft.id} onClick={() => window.location.href = `/auctions/cards/${nft.id}`} className="bg-dark-800 rounded-xl border border-white/5 overflow-hidden card-hover group cursor-pointer">
                      <div className="aspect-square overflow-hidden bg-dark-900 relative">
                        <span className="absolute top-2 right-2 z-10 bg-violet-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">COLLECTOR CRYPT</span>
                        {nft.image ? <img src={nft.image.includes("arweave.net/") ? `/api/img-proxy?url=${encodeURIComponent(nft.image)}` : nft.image} alt={nft.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition duration-500" /> : <div className="w-full h-full flex items-center justify-center text-4xl bg-dark-800">🎴</div>}
                      </div>
                      <div className="p-4">
                        <h3 className="text-white font-medium text-sm truncate">{nft.name}</h3>
                        <div className="mt-3">
                          <p className="text-gray-500 text-[9px] font-semibold uppercase tracking-widest mb-1">Market Price</p>
                          <p className="text-gold-400 font-serif text-lg font-bold">${nft.floorPrice.toFixed(2)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              ) : null;
            })()}

            {/* 3. Phygitals RWA */}
            {digitalNfts.filter(d => d.collection === "Phygitals").length > 0 && (
              <div className="mb-12">
                <h2 className="font-serif text-2xl text-white mb-6">Phygitals RWA</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                  {digitalNfts.filter(d => d.collection === "Phygitals").map((nft) => (
                    <div key={nft.id} onClick={() => window.location.href = `/auctions/cards/${nft.id}`} className="bg-dark-800 rounded-xl border border-white/5 overflow-hidden card-hover group cursor-pointer">
                      <div className="aspect-square overflow-hidden bg-dark-900 relative">
                        <span className="absolute top-2 right-2 z-10 bg-violet-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">PHYGITALS</span>
                        {nft.image ? (
                          <img src={(() => {
                            let u = nft.image;
                            if (u.includes("arweave.net/") || u.includes("gateway.irys.xyz")) return `/api/img-proxy?url=${encodeURIComponent(u)}`;
                            return u;
                          })()} alt={nft.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                        ) : <div className="w-full h-full flex items-center justify-center text-4xl bg-dark-800">🎴</div>}
                      </div>
                      <div className="p-4">
                        <h3 className="text-white font-medium text-sm truncate">{nft.name}</h3>
                        {(nft as any).tcg && (nft as any).tcg !== "Other" && <p className="text-gray-500 text-[10px] mt-1">{(nft as any).tcg}</p>}
                        <div className="mt-3">
                          <p className="text-gray-500 text-[9px] font-semibold uppercase tracking-widest mb-1">Market Price</p>
                          <p className="text-gold-400 font-serif text-lg font-bold">${nft.floorPrice.toFixed(2)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4. Digital Collectibles */}
            {digitalNfts.filter(d => d.collection !== "Artifacte" && d.collection !== "Phygitals" && d.collection !== "Collectors Crypt").length > 0 && filter !== "listed" && (
              <div className="mb-12">
                <h2 className="font-serif text-2xl text-white mb-6">Digital Collectibles</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {digitalNfts.filter(d => d.collection !== "Artifacte" && d.collection !== "Phygitals" && d.collection !== "Collectors Crypt").map((nft) => (
                    <div key={nft.id} className="bg-dark-800 rounded-xl border border-white/5 overflow-hidden hover:border-blue-500/30 transition group">
                      <div className="aspect-square overflow-hidden bg-dark-700">
                        {nft.image ? (
                          <img src={(() => {
                            let u = nft.image;
                            if (u.includes("nftstorage.link/") || u.includes("/ipfs/") || u.startsWith("ipfs://")) {
                              if (u.startsWith("ipfs://")) u = u.replace("ipfs://", "https://nftstorage.link/ipfs/");
                              return `/api/img-proxy?url=${encodeURIComponent(u)}`;
                            }
                            if (u.includes("arweave.net/")) return `/api/img-proxy?url=${encodeURIComponent(u)}`;
                            return u;
                          })()} alt={nft.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                        ) : <div className="w-full h-full flex items-center justify-center text-4xl bg-dark-800">🖼️</div>}
                      </div>
                      <div className="p-4">
                        <h3 className="text-white font-medium text-sm truncate">{nft.name}</h3>
                        <p className="text-gray-500 text-[10px] mt-1">{nft.collection}</p>
                        <div className="mt-3">
                          <p className="text-gray-500 text-[9px] font-semibold uppercase tracking-widest mb-1">Floor Price</p>
                          <p className="text-blue-400 font-serif text-lg font-bold">◎ {nft.floorPrice.toFixed(2)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* End of portfolio */}
          </>
        )}
      </div>
    </div>
  );
}
