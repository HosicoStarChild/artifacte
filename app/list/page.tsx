"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { getAssociatedTokenAddress, TOKEN_2022_PROGRAM_ID, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Transaction } from "@solana/web3.js";
import Link from "next/link";
import { AuctionProgram, ListingType, ItemCategory } from "@/lib/auction-program";
import { isOwnerWallet } from "@/lib/admin";
import { showToast } from "@/components/ToastContainer";

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

const CC_COLLECTION = "CCryptWBYktukHDQ2vHGtVcmtjXxYzvw8XNVY64YN2Yf";
const PHYG_COLLECTION = "BSG6DyEihFFtfvxtL9mKYsvTwiZXB1rq5gARMTJC2xAM";
const ARTIFACTE_AUTHORITY = "DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX";

export default function ListNFTPage() {
  const { publicKey, connected, wallet, sendTransaction, signTransaction } = useWallet();
  const { connection } = useConnection();
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
  const [royaltyBps, setRoyaltyBps] = useState<number>(0);
  const [loadingRoyalty, setLoadingRoyalty] = useState(false);

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
      const res = await fetch("/api/helius-das", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        // Filter: not burnt, not fungible
        if (item.burnt) return false;
        if (item.interface === "FungibleToken" || item.interface === "FungibleAsset") return false;
        // Allow compressed NFTs only if they're from the Phygitals collection
        if (item.compression?.compressed) {
          const g = item.grouping?.find((g: any) => g.group_key === "collection");
          return g?.group_value === PHYG_COLLECTION;
        }
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
    // Prefer Helius CDN URI — only if it's a real URL (not empty/broken)
    const cdnUri = (nft.content?.files?.[0] as any)?.cdn_uri;
    if (cdnUri && cdnUri.length > 40 && !cdnUri.endsWith('//')) return cdnUri;
    // Use links.image — the actual image URL for pNFTs
    // Avoid files[0].uri which can be metadata JSON or base64 data
    let url = nft.content?.links?.image || '';
    if (!url || url.startsWith('data:')) return `/api/nft-image?mint=${nft.id}`;
    if (url.startsWith('ipfs://')) url = url.replace('ipfs://', 'https://nftstorage.link/ipfs/');
    if (url.includes('arweave.net/') || url.includes('nftstorage.link/') || url.includes('/ipfs/') || url.includes('irys.xyz/')) {
      return `/api/img-proxy?url=${encodeURIComponent(url)}`;
    }
    return url;
  }

  function isRwaNft(nft: NFTAsset): boolean {
    const g = nft.grouping?.find((g: any) => g.group_key === "collection");
    const collectionAddr = g?.group_value;
    return collectionAddr === CC_COLLECTION || collectionAddr === PHYG_COLLECTION ||
      !!(nft as any).authorities?.some((a: any) => a.address === ARTIFACTE_AUTHORITY);
  }

  function isCoreNft(nft: NFTAsset | null): boolean {
    return !!nft && (nft as any).interface === 'MplCoreAsset';
  }

  function getNftCategory(nft: NFTAsset): ItemCategory {
    const g = nft.grouping?.find((g: any) => g.group_key === "collection");
    const collectionAddr = g?.group_value;
    const isRwa = collectionAddr === CC_COLLECTION || collectionAddr === PHYG_COLLECTION ||
      (nft as any).authorities?.some((a: any) => a.address === ARTIFACTE_AUTHORITY);
    if (!isRwa) return ItemCategory.DigitalArt;
    // Read attributes to determine sub-category
    const attrs: { trait_type: string; value: string }[] =
      (nft as any).content?.metadata?.attributes || [];
    const get = (key: string) => attrs.find(a => a.trait_type?.toLowerCase() === key.toLowerCase())?.value || "";
    const tcg = get("TCG") || get("Category") || get("Type");
    const sport = get("Sport");
    if (sport) return ItemCategory.SportsCards;
    if (tcg) return ItemCategory.TCGCards;
    // Default RWA cards to TCGCards
    return ItemCategory.TCGCards;
  }

  function getNftCollection(nft: NFTAsset): { address: string; name: string } | null {
    // Always allow Artifacte-minted NFTs (authority hardcoded, not from allowlist API)
    const authorities = (nft as any).authorities;
    if (authorities?.some((a: any) => a.address === ARTIFACTE_AUTHORITY)) {
      return { address: ARTIFACTE_AUTHORITY, name: 'The Artifacte Collection' };
    }
    // Standard: check collection grouping
    const group = nft.grouping?.find((g: any) => g.group_key === "collection");
    if (group) {
      // Always allow CC and Phygitals collections
      if (group.group_value === CC_COLLECTION) return { address: group.group_value, name: 'Collectors Crypt' };
      if (group.group_value === PHYG_COLLECTION) return { address: group.group_value, name: 'Phygitals' };
      const name = allowedCollections[group.group_value];
      if (name) return { address: group.group_value, name };
    }
    // WNS/Token-2022: check authorities (no collection grouping)
    if (authorities?.length) {
      for (const auth of authorities) {
        const name = allowedCollections[auth.address];
        if (name) return { address: auth.address, name };
      }
    }
    return null;
  }

  function getFilteredNfts(): NFTAsset[] {
    return nfts.filter(nft => {
      const collection = getNftCollection(nft);
      return collection !== null;
    });
  }

  async function handleSubmit() {
    if (!selectedNft || !price || !publicKey || !wallet) return;
    setSubmitting(true);
    setError("");
    try {
      const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
      const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
      // CC cards use a listing ID as .id — actual mint is in .nftAddress or .id itself
      const mintStr = (selectedNft as any).nftAddress || selectedNft.id;
      const nftMint = new PublicKey(mintStr);

      // RWA categories (TCG, Sports, Sealed, Merch) require USDC — Digital Art uses SOL
      const itemCategoryForMint = getNftCategory(selectedNft);
      const isRwaCategory = itemCategoryForMint !== ItemCategory.DigitalArt;
      const paymentMint = isRwaCategory ? USDC_MINT : SOL_MINT;
      // Price: SOL uses lamports (1e9), USDC uses micro-USDC (1e6)
      const priceInUnits = isRwaCategory
        ? Math.floor(parseFloat(price) * 1e6)
        : Math.floor(parseFloat(price) * 1e9);
      const durationSeconds = listingType === "auction" ? Math.round(parseFloat(auctionDuration) * 3600) : undefined;

      // Get user's NFT token account (detect Token-2022 vs standard SPL)
      const mintAccountInfo = await connection.getAccountInfo(nftMint);
      const isToken2022 = mintAccountInfo?.owner.equals(TOKEN_2022_PROGRAM_ID);
      const sellerNftAccount = await getAssociatedTokenAddress(
        nftMint, publicKey, false,
        isToken2022 ? TOKEN_2022_PROGRAM_ID : undefined
      );

      const auctionProgram = new AuctionProgram(connection, wallet.adapter, sendTransaction);

      // Check for stale listing PDA and close it first
      const AUCTION_PROGRAM_ID = new PublicKey("81s1tEx4MPdVvqS6X84Mok5K4N5fMbRLzcsT5eo2K8J3");
      const [listingPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("listing"), nftMint.toBuffer()],
        AUCTION_PROGRAM_ID
      );
      const existingListing = await connection.getAccountInfo(listingPda);
      if (existingListing) {
        console.log("Stale listing found, closing...");
        await auctionProgram.closeStaleListing(nftMint);
        // Wait for confirmation
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // If listing for USDC, ensure seller has a USDC ATA (create if missing)
      if (isRwaCategory) {
        const sellerUsdcAta = await getAssociatedTokenAddress(USDC_MINT, publicKey);
        const ataInfo = await connection.getAccountInfo(sellerUsdcAta);
        if (!ataInfo) {
          showToast.info("Creating USDC account...");
          const createAtaIx = createAssociatedTokenAccountInstruction(
            publicKey, sellerUsdcAta, publicKey, USDC_MINT, TOKEN_PROGRAM_ID
          );
          const { blockhash } = await connection.getLatestBlockhash();
          const ataTx = new Transaction({ feePayer: publicKey, recentBlockhash: blockhash }).add(createAtaIx);
          const signedAtaTx = await wallet.adapter.sendTransaction(ataTx, connection);
          await connection.confirmTransaction(signedAtaTx, 'confirmed');
        }
      }

      const itemCategory = getNftCategory(selectedNft);

      // Detect NFT type from DAS API interface field
      const isCompressed = (selectedNft as any).compression?.compressed === true;
      const isPnft = (selectedNft as any).interface === 'ProgrammableNFT';
      const isCore = (selectedNft as any).interface === 'MplCoreAsset';
      // Artifacte-minted NFTs are identified by their update authority
      const isArtifacteNFT = !!(selectedNft as any).authorities?.some((a: any) => a.address === ARTIFACTE_AUTHORITY);

      let tx: string;

      if (isCore) {
        // ── Metaplex Core (Artifacte v2): owner-only, USDC fixed-price ──
        if (!isOwnerWallet(publicKey.toBase58())) {
          throw new Error("Listing Artifacte Core assets is restricted to the owner wallet.");
        }
        if (listingType !== "fixed") {
          throw new Error("Auctions are not supported for Artifacte Core assets — use Fixed Price.");
        }
        const priceUsdc = Math.floor(parseFloat(price) * 1e6);
        showToast.info("Listing on Artifacte (Core)...");
        tx = await auctionProgram.listCoreItem(nftMint, priceUsdc);
      } else if (listingType === "fixed" && isArtifacteNFT) {
        // ── Artifacte collection: fixed-price listing on Artifacte's own on-chain program ──
        showToast.info("Listing on Artifacte...");
        if (isPnft) {
          let royaltyBpsVal = royaltyBps || 500;
          let creatorAddr = new PublicKey(ARTIFACTE_AUTHORITY);
          let ruleSet: PublicKey | null = null;
          try {
            const nftRes = await fetch(`/api/nft?mint=${nftMint.toBase58()}`);
            const nftData = await nftRes.json();
            const asset = nftData.nft || nftData;
            royaltyBpsVal = asset.royalty?.basis_points || royaltyBps || 500;
            const creators = asset.creators || asset.content?.metadata?.creators || [];
            if (creators.length > 0) creatorAddr = new PublicKey(creators[0].address);
            const ruleSetAddr = nftData.result?.programmable_config?.rule_set;
            if (ruleSetAddr) ruleSet = new PublicKey(ruleSetAddr);
          } catch {}
          tx = await auctionProgram.listItemPnft(
            nftMint,
            paymentMint,
            ListingType.FixedPrice,
            priceInUnits,
            undefined,
            itemCategory,
            royaltyBpsVal,
            creatorAddr,
            ruleSet,
          );
        } else {
          tx = await auctionProgram.listItem(
            nftMint,
            sellerNftAccount,
            paymentMint,
            ListingType.FixedPrice,
            priceInUnits,
            undefined,
            itemCategory
          );
        }
      } else if (listingType === "fixed") {
        // ── Fixed-price listings: use Tensor marketplace ──
        let tensorRoute: string;
        let tensorCurrency = isRwaCategory ? 'USDC' : undefined; // SOL for Digital Art

        if (isCompressed) {
          tensorRoute = '/api/tensor-list';
          tensorCurrency = 'USDC';
          showToast.info("Listing compressed NFT on Tensor...");
        } else if (isToken2022) {
          tensorRoute = '/api/tensor-list-t22';
          showToast.info("Listing Token-2022 NFT on Tensor...");
        } else {
          // Standard SPL + pNFTs — both handled by Tensor's legacy instruction
          tensorRoute = '/api/tensor-list-legacy';
          showToast.info("Listing NFT on Tensor...");
        }

        const res = await fetch(tensorRoute, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mint: mintStr,
            owner: publicKey.toBase58(),
            amount: priceInUnits,
            currency: tensorCurrency,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to build Tensor listing');
        const txBytes = Buffer.from(data.tx, 'base64');
        const vtx = VersionedTransaction.deserialize(txBytes);
        if (!signTransaction) throw new Error("Wallet does not support signing");
        const signed = await signTransaction(vtx);
        const sig = await connection.sendRawTransaction(signed.serialize());
        // Poll for confirmation
        for (let i = 0; i < 60; i++) {
          const status = await connection.getSignatureStatuses([sig]);
          const s = status.value[0];
          if (s?.confirmationStatus === 'confirmed' || s?.confirmationStatus === 'finalized') break;
          if (s?.err) throw new Error(`Transaction failed: ${JSON.stringify(s.err)}`);
          await new Promise(r => setTimeout(r, 500));
        }
        tx = sig;
      } else {
        // ── Auction listings: keep using Artifacte auction program ──
        if (isCompressed) {
          throw new Error("Auctions are not available for compressed NFTs. Please use Fixed Price instead.");
        } else if (isPnft) {
          showToast.info("Listing pNFT auction via Metaplex Token Metadata...");
          let royaltyBpsVal = 500;
          let creatorAddr = new PublicKey("DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX");
          let ruleSet: PublicKey | null = null;
          try {
            const nftRes = await fetch(`/api/nft?mint=${nftMint.toBase58()}`);
            const nftData = await nftRes.json();
            const asset = nftData.nft || nftData;
            royaltyBpsVal = asset.royalty?.basis_points || 500;
            const creators = asset.creators || asset.content?.metadata?.creators || [];
            if (creators.length > 0) creatorAddr = new PublicKey(creators[0].address);
            const ruleSetAddr = nftData.result?.programmable_config?.rule_set;
            if (ruleSetAddr) ruleSet = new PublicKey(ruleSetAddr);
          } catch {}
          tx = await auctionProgram.listItemPnft(
            nftMint,
            paymentMint,
            ListingType.Auction,
            priceInUnits,
            durationSeconds,
            itemCategory,
            royaltyBpsVal,
            creatorAddr,
            ruleSet,
          );
        } else {
          showToast.info("Listing auction on Artifacte...");
          tx = await auctionProgram.listItem(
            nftMint,
            sellerNftAccount,
            paymentMint,
            ListingType.Auction,
            priceInUnits,
            durationSeconds,
            itemCategory
          );
        }
      }

      showToast.success("NFT listed successfully!");
      setSubmitted(true);

      // Notify Oracle so the listing appears immediately (fire-and-forget)
      // Small delay to let Tensor index the listing after TX confirmation
      // Skip for Artifacte NFTs — they list on the Artifacte program, not Tensor
      if (listingType === "fixed" && !isArtifacteNFT) {
        setTimeout(() => {
          fetch('/api/listing-notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mint: mintStr }),
          }).catch(() => {});
        }, 3000);
      }
    } catch (err: any) {
      console.error("Listing failed:", err);
      console.error("Listing failed stack:", err?.stack);
      console.error("Listing failed logs:", err?.logs);
      const msg = err?.message || err?.toString() || "Unknown error";
      const logs = err?.logs ? `\nLogs: ${err.logs.slice(-3).join(' | ')}` : '';
      const fullMsg = msg + logs;
      const shortMsg = fullMsg.length > 500 ? fullMsg.slice(0, 500) + "..." : fullMsg;
      setError(shortMsg);
      showToast.error(shortMsg);
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
            <h2 className="font-serif text-2xl text-white mb-2">Listed Successfully</h2>
            <p className="text-gray-400 mb-6">
              Your NFT is now listed on Artifacte and escrowed on-chain.
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
          <Link href="/" className="text-gold-500 hover:text-gold-400 text-sm mb-4 inline-block">← Back to Home</Link>
          <p className="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-3">List Item</p>
          <h1 className="font-serif text-4xl text-white mb-3">List Your Item</h1>
          <p className="text-gray-400 text-base">
            Select an item from your wallet and set your price.
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
            {loadingNfts ? (
              <div>
                <h2 className="font-serif text-xl text-white mb-4">Loading...</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className="bg-dark-800 border border-white/5 rounded-xl h-64 animate-pulse" />
                  ))}
                </div>
              </div>
            ) : eligibleNfts.length === 0 ? (
              <div className="bg-dark-800 border border-white/10 rounded-xl p-12 text-center">
                <div className="text-4xl mb-4">📭</div>
                <p className="text-gray-400 mb-2">No eligible items found</p>
                <p className="text-gray-500 text-sm">
                  You need NFTs from an approved collection. Currently approved: {Object.values(allowedCollections).join(", ") || "None"}.
                </p>
              </div>
            ) : (
              <div className="space-y-10">
                {/* RWA Cards */}
                {eligibleNfts.some(nft => {
                  const g = nft.grouping?.find((g: any) => g.group_key === "collection");
                  return (g && ["CCryptWBYktukHDQ2vHGtVcmtjXxYzvw8XNVY64YN2Yf", "BSG6DyEihFFtfvxtL9mKYsvTwiZXB1rq5gARMTJC2xAM"].includes(g.group_value)) || (nft as any).authorities?.some((a: any) => a.address === "DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX");
                }) && (
                  <div>
                    <h2 className="font-serif text-xl text-white mb-4">
                      <span className="text-gold-400">RWA Cards</span>
                      <span className="text-gray-500 text-sm ml-3 font-sans">
                        {eligibleNfts.filter(nft => {
                          const g = nft.grouping?.find((g: any) => g.group_key === "collection");
                          return (g && ["CCryptWBYktukHDQ2vHGtVcmtjXxYzvw8XNVY64YN2Yf", "BSG6DyEihFFtfvxtL9mKYsvTwiZXB1rq5gARMTJC2xAM"].includes(g.group_value)) || (nft as any).authorities?.some((a: any) => a.address === "DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX");
                        }).length} items
                      </span>
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {eligibleNfts.filter(nft => {
                        const g = nft.grouping?.find((g: any) => g.group_key === "collection");
                        return (g && ["CCryptWBYktukHDQ2vHGtVcmtjXxYzvw8XNVY64YN2Yf", "BSG6DyEihFFtfvxtL9mKYsvTwiZXB1rq5gARMTJC2xAM"].includes(g.group_value)) || (nft as any).authorities?.some((a: any) => a.address === "DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX");
                      }).map((nft) => {
                  const collection = getNftCollection(nft);
                  return (
                    <button
                      key={nft.id}
                      onClick={() => {
                        setSelectedNft(nft);
                        if ((nft as any).compression?.compressed || isRwaNft(nft)) setListingType("fixed");
                        setLoadingRoyalty(true);
                        fetch(`/api/nft?mint=${nft.id}`)
                          .then(r => r.json())
                          .then(data => {
                            const asset = data.nft || data;
                            const addlMeta = asset.mint_extensions?.metadata?.additional_metadata || [];
                            for (const [key, value] of addlMeta) {
                              if (key === 'royalty_basis_points') {
                                setRoyaltyBps(parseInt(value) || 0);
                                setLoadingRoyalty(false);
                                return;
                              }
                            }
                            setRoyaltyBps(asset.royalty?.basis_points || 0);
                            setLoadingRoyalty(false);
                          })
                          .catch(() => { setRoyaltyBps(0); setLoadingRoyalty(false); });
                      }}
                      className="bg-dark-800 border border-white/5 rounded-xl overflow-hidden text-left hover:border-gold-500/50 transition group"
                    >
                      <div className="aspect-square bg-dark-900 relative overflow-hidden">
                        <img
                          src={getNftImage(nft)}
                          alt={nft.content?.metadata?.name}
                          loading="lazy"
                          className="w-full h-full object-contain p-2 group-hover:scale-105 transition duration-300"
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
                  </div>
                )}
                {/* Digital Collectibles */}
                {eligibleNfts.some(nft => {
                  const g = nft.grouping?.find((g: any) => g.group_key === "collection");
                  const isRwa = (g && ["CCryptWBYktukHDQ2vHGtVcmtjXxYzvw8XNVY64YN2Yf", "BSG6DyEihFFtfvxtL9mKYsvTwiZXB1rq5gARMTJC2xAM"].includes(g.group_value)) || (nft as any).authorities?.some((a: any) => a.address === "DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX"); return !isRwa;
                }) && (
                  <div>
                    <h2 className="font-serif text-xl text-white mb-4">
                      <span className="text-blue-400">Digital Collectibles</span>
                      <span className="text-gray-500 text-sm ml-3 font-sans">
                        {eligibleNfts.filter(nft => {
                          const g = nft.grouping?.find((g: any) => g.group_key === "collection");
                          const isRwa = (g && ["CCryptWBYktukHDQ2vHGtVcmtjXxYzvw8XNVY64YN2Yf", "BSG6DyEihFFtfvxtL9mKYsvTwiZXB1rq5gARMTJC2xAM"].includes(g.group_value)) || (nft as any).authorities?.some((a: any) => a.address === "DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX"); return !isRwa;
                        }).length} items
                      </span>
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {eligibleNfts.filter(nft => {
                        const g = nft.grouping?.find((g: any) => g.group_key === "collection");
                        const isRwa = (g && ["CCryptWBYktukHDQ2vHGtVcmtjXxYzvw8XNVY64YN2Yf", "BSG6DyEihFFtfvxtL9mKYsvTwiZXB1rq5gARMTJC2xAM"].includes(g.group_value)) || (nft as any).authorities?.some((a: any) => a.address === "DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX"); return !isRwa;
                      }).map((nft) => {
                        const collection = getNftCollection(nft);
                        return (
                          <button key={nft.id} onClick={() => {
                            setSelectedNft(nft);
                            if ((nft as any).compression?.compressed || isRwaNft(nft)) setListingType("fixed");
                            setLoadingRoyalty(true);
                            fetch(`/api/nft?mint=${nft.id}`)
                              .then(r => r.json())
                              .then(data => {
                                const asset = data.nft || data;
                                const addlMeta = asset.mint_extensions?.metadata?.additional_metadata || [];
                                for (const [key, value] of addlMeta) {
                                  if (key === 'royalty_basis_points') { setRoyaltyBps(parseInt(value) || 0); setLoadingRoyalty(false); return; }
                                }
                                setRoyaltyBps(asset.royalty?.basis_points || 0);
                                setLoadingRoyalty(false);
                              })
                              .catch(() => { setRoyaltyBps(0); setLoadingRoyalty(false); });
                          }}
                          className="bg-dark-800 border border-white/5 rounded-xl overflow-hidden text-left hover:border-blue-500/50 transition group">
                            <div className="aspect-square bg-dark-700 relative overflow-hidden">
                              <img src={getNftImage(nft)} alt={nft.content?.metadata?.name} loading="lazy"
                                className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                                onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.png"; }} />
                            </div>
                            <div className="p-3">
                              <p className="text-white text-sm font-semibold truncate">{nft.content?.metadata?.name || "Unnamed"}</p>
                              <p className="text-gray-500 text-xs mt-1 truncate">{collection?.name}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
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
                  className={`w-24 h-24 rounded-lg ${
                    (() => { const g = selectedNft.grouping?.find((g: any) => g.group_key === 'collection'); return g && [CC_COLLECTION, PHYG_COLLECTION].includes(g.group_value) || (selectedNft as any).authorities?.some((a: any) => a.address === ARTIFACTE_AUTHORITY); })()
                      ? 'object-contain p-1 bg-dark-900'
                      : 'object-cover'
                  }`}
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
                    onClick={() => { if (!((selectedNft as any)?.compression?.compressed) && !(selectedNft && isRwaNft(selectedNft)) && !isCoreNft(selectedNft)) setListingType("auction"); }}
                    disabled={(selectedNft as any)?.compression?.compressed === true || !!(selectedNft && isRwaNft(selectedNft)) || isCoreNft(selectedNft)}
                    title={isCoreNft(selectedNft) ? "Artifacte Core assets support fixed-price USDC listings only" : (selectedNft && isRwaNft(selectedNft)) ? "Auctions are only available for Digital Collectibles" : (selectedNft as any)?.compression?.compressed ? "Auctions are not available for compressed NFTs" : undefined}
                    className={`flex-1 py-3 rounded-lg border text-sm font-semibold transition ${
                      (selectedNft as any)?.compression?.compressed || (selectedNft && isRwaNft(selectedNft)) || isCoreNft(selectedNft)
                        ? "border-white/5 text-gray-600 cursor-not-allowed opacity-50"
                        : listingType === "auction"
                        ? "border-gold-500 bg-gold-500/10 text-gold-400"
                        : "border-white/10 text-gray-400 hover:border-white/20"
                    }`}
                  >
                    Auction
                  </button>
                </div>
                {selectedNft && isRwaNft(selectedNft) && (
                  <p className="text-yellow-500/80 text-xs mt-2">
                    {(selectedNft as any).authorities?.some((a: any) => a.address === ARTIFACTE_AUTHORITY)
                      ? "Artifacte collection NFTs are listed exclusively on the Artifacte platform."
                      : "Auctions are only available for Digital Collectibles. RWA cards support fixed-price listings only."}
                  </p>
                )}
                {(selectedNft as any)?.compression?.compressed && !(selectedNft && isRwaNft(selectedNft)) && (
                  <p className="text-yellow-500/80 text-xs mt-2">Auctions are not available for compressed NFTs. Only fixed-price listings are supported.</p>
                )}
              </div>

              {/* Price */}
              <div className="mb-5">
                <label className="block text-sm text-gray-400 mb-1.5 font-medium">
                  {listingType === "fixed" ? "Price" : "Starting Price"} ({(isCoreNft(selectedNft) || getNftCategory(selectedNft) !== ItemCategory.DigitalArt) ? "USDC" : "SOL"})
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-2.5 text-gray-500">{(isCoreNft(selectedNft) || getNftCategory(selectedNft) !== ItemCategory.DigitalArt) ? "$" : "◎"}</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    className="w-full bg-dark-700 border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-white text-sm focus:outline-hidden focus:border-gold-500 transition"
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
                    className="w-full bg-dark-700 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-hidden focus:border-gold-500 transition"
                  >
                    <option value="0.0833">5 minutes (testing)</option>
                    <option value="0.5">30 minutes (testing)</option>
                    <option value="24">24 hours</option>
                    <option value="48">48 hours</option>
                    <option value="72">3 days</option>
                    <option value="168">7 days</option>
                    <option value="336">14 days</option>
                  </select>
                </div>
              )}

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
                {submitting ? "Listing..." : "List Item"}
              </button>
              <p className="text-gray-600 text-xs text-center mt-3">
                Your NFT stays in your wallet until the escrow transaction is signed.
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
