"use client";

import { useWallet, useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import Link from "next/link";
import { PublicKey, Connection, Transaction, VersionedTransaction } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { AuctionProgram } from "@/lib/auction-program";
import { fetchAllowlist } from "@/lib/allowlist";

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

const TENSOR_MARKETPLACE_PROGRAM = new PublicKey("TCMPhJdwDryooaGtiocG1u3xcYbRpiJzb283XfCZsDp");
const LIST_STATE_DISCRIMINATOR = new Uint8Array([78, 242, 89, 138, 161, 221, 176, 75]);
const USDC_MINT_ADDR = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

type TabType = "active" | "completed" | "cancelled";

interface MyListing {
  id: string;
  name: string;
  image: string;
  nftMint: string;
  price: number;
  currency: string;
  status: "active" | "completed" | "cancelled";
  listingType: string;
  endsAt?: number;
  currentBid?: number;
  highestBidder?: string;
  royaltyBps: number;
  collectionAddress?: string;
  isPnft?: boolean;
  isCore?: boolean;
}

export default function MyListingsPage() {
  const { publicKey, connected, wallet, sendTransaction, signTransaction } = useWallet();
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const [activeTab, setActiveTab] = useState<TabType>("active");
  const [myListings, setMyListings] = useState<MyListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [cancellingMint, setCancellingMint] = useState<string | null>(null);

  useEffect(() => {
    if (connected && publicKey) {
      fetchMyListings();
    } else {
      setMyListings([]);
    }
  }, [connected, publicKey]);

  async function fetchNftMeta(mintAddr: string): Promise<{ name: string; image: string; collection: string }> {
    let name = mintAddr.slice(0, 8) + "...";
    let image = "/placeholder-card.svg";
    let collection = "";
    try {
      const resp = await fetch(`/api/nft?mint=${mintAddr}`);
      const data = await resp.json();
      const nft = data.nft || data;
      name = nft.name || nft.content?.metadata?.name || name;
      collection = nft.collection || "";
      const rawImage = nft.image || nft.content?.links?.image || nft.content?.files?.[0]?.uri || "";
      if (rawImage.includes("arweave.net") || rawImage.includes("irys.xyz")) {
        image = `/api/img-proxy?url=${encodeURIComponent(rawImage)}`;
      } else if (rawImage) {
        image = rawImage;
      }
    } catch {}
    return { name, image, collection };
  }

  async function fetchTensorListings(owner: PublicKey, conn: Connection): Promise<MyListing[]> {
    try {
      // Fetch ListState accounts where owner matches (owner at offset 10)
      const accounts = await conn.getProgramAccounts(TENSOR_MARKETPLACE_PROGRAM, {
        filters: [
          { memcmp: { offset: 0, bytes: "ECt8xkbczt2" } },
          { memcmp: { offset: 10, bytes: owner.toBase58() } },
        ],
      });

      const listings: MyListing[] = await Promise.all(
        accounts.map(async (acc) => {
          const data = acc.account.data;
          // Parse assetId (mint) at offset 42 (10 + 32 owner)
          const assetId = new PublicKey(data.subarray(42, 74));
          // Parse amount at offset 74
          const amount = Number(data.readBigUInt64LE(74));
          // Parse currency option at offset 82 (1 byte option flag + 32 bytes address)
          const hasCurrency = data[82] === 1;
          const currencyAddr = hasCurrency ? new PublicKey(data.subarray(83, 115)).toBase58() : null;
          const currency = currencyAddr === USDC_MINT_ADDR ? "USDC" : "SOL";
          const decimals = currency === "SOL" ? 9 : 6;
          const price = amount / Math.pow(10, decimals);

          const mintAddr = assetId.toBase58();
          const { name, image, collection } = await fetchNftMeta(mintAddr);

          return {
            id: acc.pubkey.toBase58(),
            name,
            image,
            nftMint: mintAddr,
            price,
            currency,
            status: "active" as const,
            listingType: "Fixed Price (Tensor)",
            royaltyBps: 0,
            collectionAddress: collection,
          };
        })
      );

      return listings;
    } catch (err) {
      console.error("Failed to fetch Tensor listings:", err);
      return [];
    }
  }

  async function fetchMyListings() {
    if (!publicKey || !wallet) return;
    setLoading(true);
    setError("");
    try {
      // Fetch auction program listings and Tensor listings in parallel
      const dummyWallet = {
        publicKey,
        signTransaction: async (tx: any) => tx,
        signAllTransactions: async (txs: any) => txs,
      };
      const program = new AuctionProgram(connection, dummyWallet);

      const [allListings, tensorListings, allowlist] = await Promise.all([
        program.fetchAllListings(),
        fetchTensorListings(publicKey, connection),
        fetchAllowlist(),
      ]);

      const allowedAddresses = new Set(
        allowlist.map((e) => e.collectionAddress).filter(Boolean)
      );

      console.log('[my-listings] auction program listings:', allListings.length, 'tensor listings:', tensorListings.length);
      console.log('[my-listings] connected wallet:', publicKey.toBase58());
      if (allListings.length > 0) {
        console.log('[my-listings] listing sellers:', allListings.map((l: any) => l.account.seller.toBase58()));
        console.log('[my-listings] listing mints:', allListings.map((l: any) => l.account.nftMint.toBase58()));
      }

      // Filter auction program listings where seller is the connected wallet
      const mine = allListings.filter(
        (l: any) => l.account.seller.toBase58() === publicKey.toBase58()
      );
      console.log('[my-listings] matched listings for wallet:', mine.length);

      // Enrich auction program listings with NFT metadata
      const auctionEnriched: MyListing[] = await Promise.all(
        mine.map(async (l: any) => {
          const acc = l.account;
          const mintAddr = acc.nftMint.toBase58();
          const { name, image, collection } = await fetchNftMeta(mintAddr);

          let status: "active" | "completed" | "cancelled" = "active";
          const statusObj = acc.status;
          if (statusObj.settled !== undefined) status = "completed";
          else if (statusObj.cancelled !== undefined) status = "cancelled";

          const isAuction = acc.listingType?.auction !== undefined;
          const paymentMint = acc.paymentMint.toBase58();
          const currency = paymentMint === "So11111111111111111111111111111111111111112" ? "SOL"
            : paymentMint === "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB" ? "USD1"
            : "USDC";

          const decimals = currency === "SOL" ? 9 : 6;
          const price = Number(acc.price) / Math.pow(10, decimals);
          const currentBid = Number(acc.currentBid) / Math.pow(10, decimals);

          return {
            id: l.publicKey.toBase58(),
            name,
            image,
            nftMint: mintAddr,
            price,
            currency,
            status,
            listingType: isAuction ? "Auction" : "Fixed Price",
            endsAt: isAuction && acc.endTime ? Number(acc.endTime) * 1000 : undefined,
            currentBid: currentBid > 0 ? currentBid : undefined,
            highestBidder: acc.highestBidder?.toBase58() !== PublicKey.default.toBase58() ? acc.highestBidder?.toBase58() : undefined,
            royaltyBps: acc.royaltyBasisPoints || 0,
            collectionAddress: collection,
            isPnft: acc.isPnft || false,
            isCore: acc.isCore || false,
          };
        })
      );

      // Log resolved collections for debugging
      console.log('[my-listings] auction enriched:', auctionEnriched.map(l => ({ mint: l.nftMint, collection: l.collectionAddress })));

      // Auction program listings: always show the user's own listings (no allowlist gate)
      // Tensor listings: filter to allowed collections only
      const filteredTensor = tensorListings.filter(
        (l) => l.collectionAddress && allowedAddresses.has(l.collectionAddress)
      );
      console.log('[my-listings] tensor after allowlist filter:', filteredTensor.length, '/', tensorListings.length);

      // Merge both sources, dedup by nftMint
      const seen = new Set<string>();
      const all: MyListing[] = [];
      for (const listing of [...auctionEnriched, ...filteredTensor]) {
        if (!seen.has(listing.nftMint)) {
          seen.add(listing.nftMint);
          all.push(listing);
        }
      }

      setMyListings(all);
    } catch (err: any) {
      console.error("Failed to fetch listings:", err);
      setError(err.message || "Failed to fetch listings");
    } finally {
      setLoading(false);
    }
  }

  async function handleCancelListing(nftMintStr: string, isPnft?: boolean, isCore?: boolean) {
    if (!publicKey || !anchorWallet) return;
    setCancellingMint(nftMintStr);
    try {
      const nftMint = new PublicKey(nftMintStr);
      const auctionProgram = new AuctionProgram(connection, anchorWallet, sendTransaction);

      if (isCore) {
        await auctionProgram.cancelListingCore(nftMint);
      } else if (isPnft) {
        // pNFT: use cancel_listing_pnft which handles escrow_authority + Metaplex TransferV1
        await auctionProgram.cancelListingPnft(nftMint);
      } else {
        // Standard SPL / Token-2022: use cancel_listing with escrow_nft PDA
        const mintInfo = await connection.getAccountInfo(nftMint);
        const isToken2022 = mintInfo?.owner.equals(TOKEN_2022_PROGRAM_ID) || false;
        const tokenProgramId = isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

        const sellerNftAccount = await getAssociatedTokenAddress(
          nftMint, publicKey, false, tokenProgramId
        );

        const ataInfo = await connection.getAccountInfo(sellerNftAccount);
        if (!ataInfo) {
          const createAtaIx = createAssociatedTokenAccountInstruction(
            publicKey, sellerNftAccount, publicKey, nftMint, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID
          );
          const ataTx = new Transaction().add(createAtaIx);
          const ataSig = await sendTransaction(ataTx, connection);
          await connection.confirmTransaction(ataSig, "confirmed");
        }

        await auctionProgram.cancelListing(nftMint, sellerNftAccount);
      }

      setMyListings((prev) =>
        prev.map((l) => l.nftMint === nftMintStr ? { ...l, status: "cancelled" as const } : l)
      );
    } catch (err: any) {
      console.error("Cancel listing failed:", err);
      setError(err.message || "Failed to cancel listing");
    } finally {
      setCancellingMint(null);
    }
  }

  async function handleTensorDelist(nftMintStr: string) {
    if (!publicKey || !signTransaction) return;
    setCancellingMint(nftMintStr);
    try {
      // Detect NFT type to choose the correct Tensor delist route
      let delistRoute = '/api/tensor-delist';
      try {
        const nftRes = await fetch(`/api/nft?mint=${nftMintStr}`);
        const nftData = await nftRes.json();
        const rawAsset = nftData.result || {};
        const isCompressed = rawAsset.compression?.compressed === true;
        if (isCompressed) {
          delistRoute = '/api/tensor-delist';
        } else {
          const mintInfo = await connection.getAccountInfo(new PublicKey(nftMintStr));
          const isToken2022 = mintInfo?.owner.toBase58() === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
          if (isToken2022) {
            delistRoute = '/api/tensor-delist-t22';
          } else {
            delistRoute = '/api/tensor-delist-legacy';
          }
        }
        console.log('[my-listings] delist route:', delistRoute, 'compressed:', isCompressed);
      } catch {}

      const res = await fetch(delistRoute, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mint: nftMintStr, owner: publicKey.toBase58() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to build delist transaction');

      const txBytes = Buffer.from(data.tx, 'base64');
      const vtx = VersionedTransaction.deserialize(txBytes);
      const signed = await signTransaction(vtx);
      const sig = await connection.sendRawTransaction(signed.serialize());

      for (let i = 0; i < 60; i++) {
        const status = await connection.getSignatureStatuses([sig]);
        const s = status.value[0];
        if (s?.confirmationStatus === 'confirmed' || s?.confirmationStatus === 'finalized') break;
        if (s?.err) throw new Error(`Transaction failed: ${JSON.stringify(s.err)}`);
        await new Promise(r => setTimeout(r, 500));
      }

      setMyListings((prev) =>
        prev.map((l) => l.nftMint === nftMintStr ? { ...l, status: "cancelled" as const } : l)
      );
    } catch (err: any) {
      console.error("Tensor delist failed:", err);
      setError(err.message || "Failed to delist");
    } finally {
      setCancellingMint(null);
    }
  }

  function getFilteredListings(): MyListing[] {
    return myListings.filter((listing) => listing.status === activeTab);
  }

  function getTabCount(tab: TabType): number {
    return myListings.filter((l) => l.status === tab).length;
  }

  function getTimeRemaining(endsAt?: number): string {
    if (!endsAt) return "";
    const diff = endsAt - Date.now();
    if (diff <= 0) return "Ended";
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}m left`;
    if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}h left`;
    return `${Math.floor(diff / (24 * 60 * 60 * 1000))}d left`;
  }

  const filteredListings = getFilteredListings();

  return (
    <main className="min-h-screen bg-dark-900 pt-32 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-12">
          <Link href="/" className="text-gold-500 hover:text-gold-400 text-sm mb-4 inline-block">← Back to Home</Link>
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-white mb-4">My Listings</h1>
          <p className="text-gray-400 text-lg">Manage your NFT listings on Artifacte</p>
        </div>

        {!connected ? (
          <div className="bg-dark-800 border border-white/10 rounded-xl p-8 md:p-12 text-center max-w-2xl mx-auto">
            <h2 className="font-serif text-2xl font-bold text-white mb-4">Connect Your Wallet</h2>
            <p className="text-gray-400 mb-8">Connect your wallet to view your listings.</p>
            <div className="flex justify-center">
              <WalletMultiButton className="!bg-gold-500 hover:!bg-gold-600 !rounded-lg !h-12 !text-sm !font-semibold !px-8" />
            </div>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="mb-8 flex gap-4 border-b border-white/10">
              {(["active", "completed", "cancelled"] as TabType[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-6 py-4 font-semibold transition-all border-b-2 capitalize ${
                    activeTab === tab
                      ? "border-gold-500 text-gold-500"
                      : "border-transparent text-gray-400 hover:text-white"
                  }`}
                >
                  {tab}
                  <span className="ml-2 text-sm opacity-75">({getTabCount(tab)})</span>
                </button>
              ))}
            </div>

            {loading && (
              <div className="text-center py-12">
                <div className="inline-block animate-spin">
                  <div className="w-8 h-8 border-4 border-gray-700 border-t-gold-500 rounded-full" />
                </div>
                <p className="text-gray-400 mt-4">Loading your listings...</p>
              </div>
            )}

            {error && (
              <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 mb-6 text-red-400">
                {error}
              </div>
            )}

            {!loading && filteredListings.length === 0 && (
              <div className="bg-dark-800 border border-white/10 rounded-xl p-12 text-center">
                <p className="text-gray-400">
                  {activeTab === "active"
                    ? "You have no active listings"
                    : activeTab === "completed"
                    ? "No completed sales yet"
                    : "No cancelled listings"}
                </p>
              </div>
            )}

            {!loading && filteredListings.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredListings.map((listing) => (
                  <div
                    key={listing.id}
                    className="bg-dark-800 border border-white/10 rounded-xl overflow-hidden hover:border-gold-500/50 transition-all"
                  >
                  <Link
                    href={`/auctions/cards/${listing.nftMint}`}
                    className="block"
                  >
                    {/* Image */}
                    <div className="aspect-square bg-dark-700 overflow-hidden relative">
                      <img
                        src={listing.image}
                        alt={listing.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = "/placeholder-card.svg";
                        }}
                      />
                      
                      <div className="absolute top-3 right-3">
                        {listing.status === "active" && (
                          <span className="bg-green-900/60 text-green-300 border border-green-700/50 px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-sm">
                            Active
                          </span>
                        )}
                        {listing.status === "completed" && (
                          <span className="bg-blue-900/60 text-blue-300 border border-blue-700/50 px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-sm">
                            Sold
                          </span>
                        )}
                        {listing.status === "cancelled" && (
                          <span className="bg-red-900/60 text-red-300 border border-red-700/50 px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-sm">
                            Cancelled
                          </span>
                        )}
                      </div>

                      {listing.status === "active" && listing.endsAt && (
                        <div className="absolute bottom-3 left-3 px-3 py-1.5 rounded-lg bg-dark-900/80 backdrop-blur-sm border border-white/10">
                          <p className="text-xs text-gold-500 font-semibold">
                            {getTimeRemaining(listing.endsAt)}
                          </p>
                        </div>
                      )}

                      <div className="absolute top-3 left-3">
                        <span className="bg-dark-900/80 backdrop-blur-sm text-gold-400 px-2 py-1 rounded text-xs font-semibold">
                          {listing.listingType}
                        </span>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-4">
                      <h3 className="font-semibold text-white truncate mb-1">{listing.name}</h3>
                      <p className="text-xs text-gray-500 mb-4 font-mono truncate">{listing.nftMint}</p>

                      <div className="space-y-2 pt-3 border-t border-white/10">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">
                            {listing.listingType === "Auction" ? "Starting Price" : "Price"}
                          </span>
                          <div className="text-right">
                            <span className="text-white font-semibold">
                              {listing.currency === "USDC" ? "$" : listing.currency === "SOL" ? "◎ " : ""}{listing.price} {listing.currency}
                            </span>
                          </div>
                        </div>
                        {listing.currentBid !== undefined && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Current Bid</span>
                            <span className="text-gold-500 font-semibold">
                              {listing.currentBid} {listing.currency}
                            </span>
                          </div>
                        )}
                        {/* royalty removed */}
                      </div>
                    </div>
                  </Link>

                  {/* Cancel / Delist button for active listings */}
                  {listing.status === "active" && (
                    <div className="px-4 pb-4">
                      {listing.listingType.includes("Tensor") ? (
                        <button
                          onClick={() => handleTensorDelist(listing.nftMint)}
                          disabled={cancellingMint === listing.nftMint}
                          className="w-full bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-700/50 font-semibold px-4 py-2.5 rounded-lg text-xs transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {cancellingMint === listing.nftMint ? "Delisting..." : "Delist"}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleCancelListing(listing.nftMint, listing.isPnft, listing.isCore)}
                          disabled={cancellingMint === listing.nftMint}
                          className="w-full bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-700/50 font-semibold px-4 py-2.5 rounded-lg text-xs transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {cancellingMint === listing.nftMint ? "Cancelling..." : "Cancel Listing & Return NFT"}
                        </button>
                      )}
                    </div>
                  )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
