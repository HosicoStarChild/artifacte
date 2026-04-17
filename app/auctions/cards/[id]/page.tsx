"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import VerifiedBadge from "@/components/VerifiedBadge";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction, VersionedTransaction, Connection } from "@solana/web3.js";
import dynamic from "next/dynamic";
import { showToast } from "@/components/ToastContainer";
import PriceHistory from "@/components/PriceHistory";
import {
  calculateExternalMarketplaceFee,
  shouldApplyExternalMarketplaceFee,
} from "@/lib/external-purchase-fees";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

const TENSOR_MARKETPLACE = new PublicKey("TCMPhJdwDryooaGtiocG1u3xcYbRpiJzb283XfCZsDp");
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const AUCTION_PROGRAM_ID = new PublicKey("81s1tEx4MPdVvqS6X84Mok5K4N5fMbRLzcsT5eo2K8J3");
const SOL_MINT = "So11111111111111111111111111111111111111112";
const USD1_MINT = "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB";

async function fetchTensorPrice(conn: Connection, mint: string): Promise<{ usdcPrice: number | null; solPrice: number | null; seller: string | null } | null> {
  try {
    const [listStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("list_state"), new PublicKey(mint).toBuffer()],
      TENSOR_MARKETPLACE
    );
    const info = await conn.getAccountInfo(listStatePda);
    if (!info || info.data.length < 82) return null;
    const owner = new PublicKey(info.data.subarray(10, 42)).toBase58();
    const amount = Number(info.data.readBigUInt64LE(74));
    const hasCurrency = info.data[82] === 1;
    const currencyAddr = hasCurrency ? new PublicKey(info.data.subarray(83, 115)).toBase58() : null;
    if (currencyAddr === USDC_MINT) {
      return { usdcPrice: amount / 1e6, solPrice: null, seller: owner };
    }
    return { usdcPrice: null, solPrice: amount / 1e9, seller: owner };
  } catch {
    return null;
  }
}

interface AuctionListing {
  price: number;
  currency: string;
  seller: string;
  listingType: 'fixedPrice' | 'auction';
  startTime: number;
  endTime: number;
  currentBid: number;
  highestBidder: string | null;
  status: 'active' | 'settled' | 'cancelled';
}

async function fetchAuctionListing(conn: Connection, mint: string): Promise<AuctionListing | null> {
  try {
    const nftMint = new PublicKey(mint);
    const [listingPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("listing"), nftMint.toBuffer()],
      AUCTION_PROGRAM_ID
    );
    const [escrowNftPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow_nft"), nftMint.toBuffer()],
      AUCTION_PROGRAM_ID
    );
    // Fetch listing PDA and escrow account in parallel
    const [info, escrowInfo] = await Promise.all([
      conn.getAccountInfo(listingPda),
      conn.getAccountInfo(escrowNftPda),
    ]);
    if (!info || info.data.length < 140) return null;
    // Verify it belongs to our program
    if (!info.owner.equals(AUCTION_PROGRAM_ID)) return null;
    // Verify the escrow actually holds the NFT — if not, listing is stale
    if (!escrowInfo || escrowInfo.data.length === 0) {
      // Return a special stale marker so the owner can clean it up
      const data = info.data;
      const seller = new PublicKey(data.subarray(8, 40)).toBase58();
      const status = data[130];
      if (status === 0) {
        return {
          price: 0, currency: 'USDC', seller,
          listingType: 'fixedPrice', startTime: 0, endTime: 0,
          currentBid: 0, highestBidder: null, status: 'active',
          stale: true,
        } as AuctionListing & { stale: boolean };
      }
      return null;
    }

    const data = info.data;
    const seller = new PublicKey(data.subarray(8, 40)).toBase58();
    const paymentMint = new PublicKey(data.subarray(72, 104)).toBase58();
    const price = Number(data.readBigUInt64LE(104));
    const listingType = data[112]; // 0=FixedPrice, 1=Auction
    const startTime = Number(data.readBigInt64LE(114));
    const endTime = Number(data.readBigInt64LE(122));
    const status = data[130]; // 0=Active, 1=Settled, 2=Cancelled

    if (status !== 0) return null; // Only return active listings

    const currentBid = Number(data.readBigUInt64LE(174));
    const highestBidder = new PublicKey(data.subarray(182, 214)).toBase58();
    const defaultKey = PublicKey.default.toBase58();

    const currency = paymentMint === SOL_MINT ? 'SOL'
      : paymentMint === USD1_MINT ? 'USD1'
      : 'USDC';
    const decimals = currency === 'SOL' ? 9 : 6;

    return {
      price: price / Math.pow(10, decimals),
      currency,
      seller,
      listingType: listingType === 0 ? 'fixedPrice' : 'auction',
      startTime: startTime * 1000,
      endTime: endTime * 1000,
      currentBid: currentBid / Math.pow(10, decimals),
      highestBidder: highestBidder !== defaultKey ? highestBidder : null,
      status: 'active',
    };
  } catch {
    return null;
  }
}

function formatFeeDisplay(amount: number, currency: string): string {
  if (currency === 'SOL') {
    return `◎ ${amount.toLocaleString(undefined, {
      minimumFractionDigits: amount < 1 ? 2 : 0,
      maximumFractionDigits: 4,
    })}`;
  }

  return `$${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function CardDetailPage() {
  const params = useParams();
  const cardId = params.id as string;
  const [card, setCard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [unlisting, setUnlisting] = useState(false);
  const { publicKey, signTransaction, signAllTransactions, sendTransaction, connected, wallet } = useWallet();
  const { connection } = useConnection();

  useEffect(() => {
    if (!cardId) return;
    
    async function loadCard() {
      // Phygital cards: load directly from Helius
      if (cardId.startsWith('phyg-')) {
        const mint = cardId.replace('phyg-', '');
        try {
          // Search oracle for this specific card by name/mint
          const searchRes = await fetch(`/api/me-listings?category=TCG_CARDS&q=${encodeURIComponent(mint)}&perPage=1`);
          const searchData = searchRes.ok ? await searchRes.json() : null;
          const oracleListing = searchData?.listings?.find((l: any) => l.id === cardId || l.nftAddress === mint);
          
          // Fetch Helius metadata and Tensor listing price and Anchor auction listing in parallel
          const [assetRes, tensorPrice, auctionListing] = await Promise.all([
            fetch(`/api/nft?mint=${mint}`),
            fetchTensorPrice(connection, mint),
            fetchAuctionListing(connection, mint),
          ]);
          const assetData = assetRes.ok ? await assetRes.json() : null;
          const nft = assetData?.nft || assetData || {};
          const attrs = nft?.content?.metadata?.attributes || nft?.attributes || [];
          const getAttr = (name: string) => attrs.find((a: any) => a.trait_type?.toLowerCase() === name.toLowerCase())?.value;

          const tcgPlayerId = getAttr('TCGPlayer ID') || getAttr('TCGplayer Product ID') || oracleListing?.tcgPlayerId || '';

          // Merge prices: oracle has SOL price from ME, Tensor may have USDC price, Anchor may have auction listing
          const solPrice = oracleListing?.solPrice || oracleListing?.price || tensorPrice?.solPrice || 0;
          const usdcPrice = auctionListing?.currency === 'USDC' ? auctionListing.price
            : tensorPrice?.usdcPrice || (oracleListing?.currency === 'USDC' ? oracleListing?.price : null) || oracleListing?.usdcPrice || null;

          setCard({
            id: cardId,
            name: oracleListing?.name || nft.name || mint.slice(0, 12),
            subtitle: (() => {
              const parts = [getAttr('TCG') || getAttr('Category'), getAttr('Set'), getAttr('Rarity'), '• Phygital'].filter(Boolean);
              return parts.length > 1 ? parts.join(' • ') : (oracleListing?.subtitle || '• Phygital');
            })(),
            image: oracleListing?.image || nft.image || '',
            nftAddress: mint,
            source: 'phygitals',
            currency: auctionListing ? auctionListing.currency : usdcPrice ? 'USDC' : (oracleListing?.currency || 'SOL'),
            category: 'TCG_CARDS',
            price: auctionListing ? auctionListing.price : (usdcPrice || solPrice),
            solPrice,
            usdcPrice,
            auctionListing,
            seller: auctionListing?.seller || oracleListing?.seller || tensorPrice?.seller || '',
            grade: oracleListing?.grade || getAttr('Grade') || 'Ungraded',
            gradingCompany: oracleListing?.gradingCompany || (() => {
              const g = (getAttr('Grade') || '').match(/^(PSA|BGS|CGC|SGC)\s/i);
              return g ? g[1].toUpperCase() : (getAttr('Grader') || null);
            })(),
            gradeNum: oracleListing?.gradeNum || (() => {
              const g = (getAttr('Grade') || '').match(/^(?:PSA|BGS|CGC|SGC)\s+(.+)$/i);
              return g ? g[1] : null;
            })(),
            gradingId: getAttr('Cert Number') || getAttr('Grading ID') || null,
            tcg: oracleListing?.tcg || getAttr('TCG') || '',
            rarity: oracleListing?.rarity || getAttr('Rarity') || '',
            set: oracleListing?.set || getAttr('Set') || '',
            cardNumber: oracleListing?.cardNumber || getAttr('Card Number') || '',
            year: oracleListing?.year || getAttr('Year') || '',
            tcgPlayerId,
            priceSource: tcgPlayerId ? 'TCGplayer' : undefined,
            priceSourceId: tcgPlayerId || undefined,
            verifiedBy: (getAttr('Cert Number') || getAttr('Grading ID')) ? (getAttr('Grader') || 'Graded') : (tcgPlayerId ? 'TCGplayer' : 'Phygitals'),
          });
          setLoading(false);
          return;
        } catch (e) {
          console.error('[phyg] loadCard error:', e);
        }
      }

      // First try: search oracle by card ID
      try {
        const ccId = cardId.replace('cc-', '');
        const listRes = await fetch(`/api/me-listings?q=${encodeURIComponent(ccId)}&perPage=5`);
        const data = await listRes.json();
        const found = (data.listings || []).find((l: any) => l.id === cardId || l.nftAddress === cardId || l.ccId === ccId);
        if (found) {
          // Also check Tensor for a USDC listing price
          const mint = found.nftAddress || cardId;
          const tp = await fetchTensorPrice(connection, mint);
          if (tp?.usdcPrice) {
            found.usdcPrice = tp.usdcPrice;
            found.solPrice = found.solPrice || found.price || tp.solPrice || 0;
            found.currency = 'USDC';
            found.price = tp.usdcPrice;
            if (tp.seller) found.seller = tp.seller;
          } else if (tp?.solPrice && !found.solPrice) {
            found.solPrice = tp.solPrice;
          }
          if (tp?.seller && !found.seller) found.seller = tp.seller;
          setCard(found);
          setLoading(false);
          return;
        }
      } catch {}

      // Second try: direct Helius lookup (Artifacte-minted cards)
      try {
        const nftRes = await fetch(`/api/nft?mint=${cardId}`);
        if (nftRes.ok) {
          const nftData = await nftRes.json();
          const asset = nftData.result || nftData.nft;
          if (asset) {
            const attrs = asset.content?.metadata?.attributes || asset.attributes || [];
            const getAttr = (key: string) => attrs.find((a: any) => a.trait_type === key)?.value || "";
            const isArtifacte = asset.authorities?.some((a: any) => a.address === "DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX");
            const ccCollection = asset.grouping?.find((g: any) => g.group_value === "CCryptWBYktukHDQ2vHGtVcmtjXxYzvw8XNVY64YN2Yf") || 
                                 asset.collection === "CCryptWBYktukHDQ2vHGtVcmtjXxYzvw8XNVY64YN2Yf";
            const isCC = !!ccCollection;
            const isPhygital = asset.grouping?.some((g: any) => g.group_value === "BSG6DyEihFFtfvxtL9mKYsvTwiZXB1rq5gARMTJC2xAM");
            
            if (isPhygital) {
              const phygAttrs = asset.content?.metadata?.attributes || [];
              const getPhygAttr = (key: string) => phygAttrs.find((a: any) => a.trait_type === key)?.value || "";
              const tcgPlayerId = getPhygAttr('TCGPlayer ID') || getPhygAttr('TCGplayer Product ID') || '';
              // Parse grade into company + number (e.g. "PSA 10" → PSA + 10)
              const gradeRaw = getPhygAttr('Grade') || 'Ungraded';
              const gradeMatch = gradeRaw.match(/^(PSA|BGS|CGC|SGC)\s+(.+)$/i);
              const phygGradingCompany = gradeMatch ? gradeMatch[1].toUpperCase() : (getPhygAttr('Grader') || null);
              const phygGradeNum = gradeMatch ? gradeMatch[2] : null;
              const phygGradingId = getPhygAttr('Cert Number') || getPhygAttr('Grading ID') || null;
              // Check Tensor for listing price
              const tp = await fetchTensorPrice(connection, asset.id || cardId);

              setCard({
                id: asset.id || cardId,
                name: asset.content?.metadata?.name || "Unknown",
                subtitle: [getPhygAttr('TCG'), getPhygAttr('Set'), getPhygAttr('Rarity'), '• Phygital'].filter(Boolean).join(' • '),
                image: asset.content?.links?.image || asset.content?.links?.animation_url || "",
                nftAddress: asset.id || cardId,
                source: 'phygitals',
                currency: tp?.usdcPrice ? 'USDC' : 'SOL',
                category: 'TCG_CARDS',
                price: tp?.usdcPrice || tp?.solPrice || 0,
                solPrice: tp?.solPrice || 0,
                usdcPrice: tp?.usdcPrice || null,
                grade: gradeRaw,
                gradeNum: phygGradeNum,
                gradingCompany: phygGradingCompany,
                gradingId: phygGradingId,
                tcg: getPhygAttr('TCG') || '',
                rarity: getPhygAttr('Rarity') || '',
                set: getPhygAttr('Set') || '',
                cardNumber: getPhygAttr('Card Number') || '',
                year: getPhygAttr('Year') || '',
                tcgPlayerId,
                priceSource: tcgPlayerId ? 'TCGplayer' : undefined,
                priceSourceId: tcgPlayerId || undefined,
                verifiedBy: 'TCGplayer',
                seller: tp?.seller || asset.ownership?.owner || '',
              });
              setLoading(false);
              return;
            }

            if (isArtifacte) {
              const mintAddr = asset.id || asset.mint || cardId;
              const [tp, auctionListing] = await Promise.all([
                fetchTensorPrice(connection, mintAddr),
                fetchAuctionListing(connection, mintAddr),
              ]);
              const listingPrice = auctionListing?.price || tp?.usdcPrice || tp?.solPrice || 0;
              const listingCurrency = auctionListing?.currency || (tp?.usdcPrice ? 'USDC' : (tp?.solPrice ? 'SOL' : 'SOL'));
              setCard({
                id: mintAddr,
                name: asset.content?.metadata?.name || asset.name || "Unknown",
                image: asset.content?.links?.image || asset.image || "",
                nftAddress: mintAddr,
                category: "TCG_CARDS",
                source: "artifacte",
                collection: "Artifacte",
                currency: listingCurrency,
                price: listingPrice,
                solPrice: tp?.solPrice || 0,
                usdcPrice: tp?.usdcPrice || null,
                auctionListing,
                grade: getAttr("Condition") === "Graded" ? `${getAttr("Grading Company")} ${getAttr("Grade")}` : getAttr("Condition"),
                gradeNum: getAttr("Grade") || null,
                gradingCompany: getAttr("Grading Company") || null,
                gradingId: getAttr("Grading ID") || null,
                year: getAttr("Year"),
                ccCategory: getAttr("TCG"),
                variant: getAttr("Variant"),
                language: getAttr("Language"),
                cardName: getAttr("Card Name"),
                set: getAttr("Set"),
                cardNumber: getAttr("Card Number"),
                priceSource: getAttr("Price Source"),
                priceSourceId: getAttr("Price Source ID"),
                seller: auctionListing?.seller || tp?.seller || asset.ownership?.owner,
                insuredValue: null,
                vault: null,
              });
              setLoading(false);
              return;
            }

            if (isCC) {
              const ccName = asset.content?.metadata?.name || asset.name || "Unknown";
              const mintAddr = asset.id || asset.mint || cardId;
              const [tp, auctionListing] = await Promise.all([
                fetchTensorPrice(connection, mintAddr),
                fetchAuctionListing(connection, mintAddr),
              ]);
              const listingPrice = auctionListing?.price || tp?.usdcPrice || tp?.solPrice || 0;
              const listingCurrency = auctionListing?.currency || (tp?.usdcPrice ? 'USDC' : (tp?.solPrice ? 'SOL' : 'SOL'));
              setCard({
                id: mintAddr,
                name: ccName,
                image: asset.content?.links?.image || asset.image || "",
                nftAddress: mintAddr,
                category: "TCG_CARDS",
                source: "collector-crypt",
                collection: "Collectors Crypt",
                currency: listingCurrency,
                price: listingPrice,
                solPrice: tp?.solPrice || 0,
                usdcPrice: tp?.usdcPrice || null,
                auctionListing,
                grade: `${getAttr("Grading Company")} ${getAttr("The Grade") || getAttr("GradeNum")}`.trim(),
                gradeNum: getAttr("GradeNum") || null,
                gradingCompany: getAttr("Grading Company") || null,
                gradingId: getAttr("Grading ID") || null,
                year: getAttr("Year"),
                ccCategory: getAttr("Category"),
                insuredValue: getAttr("Insured Value") ? parseInt(getAttr("Insured Value")) : null,
                vault: getAttr("Vault"),
                seller: auctionListing?.seller || tp?.seller || asset.ownership?.owner || (asset as any).owner,
                subtitle: `${getAttr("Category")} • ${getAttr("Grading Company")} ${getAttr("GradeNum")} • ${getAttr("Vault") || "Vault"}`,
              });
              setLoading(false);
              return;
            }
          }
        }
      } catch {}

      setLoading(false);
    }
    
    loadCard();
  }, [cardId]);

  const handleBuy = async () => {
    if (!connected || !publicKey || !card) return;
    if (!card.nftAddress) {
      showToast.error("NFT mint address not available");
      return;
    }
    setBuying(true);

    try {
      showToast.info("Building transaction...");

      // Anchor auction program listings: buy directly via on-chain program
      if (card.auctionListing) {
        if (!signTransaction) throw new Error("Wallet does not support signing");
        const { AuctionProgram } = await import('@/lib/auction-program');
        const { getAssociatedTokenAddress } = await import('@solana/spl-token');
        const auctionProgram = new AuctionProgram(connection, { publicKey, signTransaction, signAllTransactions } as any);
        const nftMintPk = new PublicKey(card.nftAddress);
        const paymentMintPk = new PublicKey(
          card.auctionListing.currency === 'SOL' ? 'So11111111111111111111111111111111111111112'
          : card.auctionListing.currency === 'USD1' ? 'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB'
          : 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
        );
        const decimals = card.auctionListing.currency === 'SOL' ? 9 : 6;
        const priceInUnits = Math.round(card.auctionListing.price * Math.pow(10, decimals));
        const buyerNftAccount = await getAssociatedTokenAddress(nftMintPk, publicKey);
        const buyerPaymentAccount = await getAssociatedTokenAddress(paymentMintPk, publicKey);
        const sellerPk = new PublicKey(card.auctionListing.seller);
        const sellerPaymentAccount = await getAssociatedTokenAddress(paymentMintPk, sellerPk);
        showToast.info(`💳 Confirm purchase — ${card.auctionListing.currency === 'SOL' ? '◎' : '$'}${card.auctionListing.price.toLocaleString()} ${card.auctionListing.currency}`);
        const sig = await auctionProgram.buyNow(
          nftMintPk, sellerPaymentAccount, buyerPaymentAccount,
          buyerNftAccount, priceInUnits, paymentMintPk
        );
        showToast.success(`✅ NFT purchased! TX: ${sig.slice(0, 16)}...`);
        setCard((prev: any) => prev ? { ...prev, sold: true } : prev);
        setBuying(false);
        return;
      }

      // Route Tensor listings to Tensor buy flow (phyg- prefix or source/buyKind)
      const isTensorBuy = cardId.startsWith('phyg-') || card.source === 'phygitals' || card.buyKind === 'tensorCompressed' || card.buyKind === 'tensorStandard';
      if (isTensorBuy) {
        if (!signTransaction) throw new Error("Wallet does not support signing");
        const { executeTensorBuy } = await import('@/lib/tensor-buy-client');
        const result = await executeTensorBuy(
          card.nftAddress,
          publicKey.toBase58(),
          signTransaction,
          showToast.info,
          sendTransaction ?? undefined,
          wallet?.adapter?.name,
          {
            source: card.source,
            collectionName: card.collection,
          }
        );
        if (result.confirmed) {
          showToast.success(`✅ Card purchased for ${result.price} USDC!`);
        } else {
          showToast.info(`Transaction sent but not confirmed yet. Check Solscan.`);
        }
        setCard((prev: any) => prev ? { ...prev, sold: true } : prev);
        setBuying(false);
        return;
      }

      // Step 1: Get ME notary-cosigned transaction from our API (CC cards)
      const buildRes = await fetch('/api/me-buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mint: card.nftAddress,
          buyer: publicKey.toBase58(),
          source: card.source,
          collectionName: card.collection,
        }),
      });

      let sig = '';

      if (!buildRes.ok) {
        throw new Error(`Buy failed: ${buildRes.status}`);
      }

      const {
        v0Tx,
        v0TxSigned,
        price,
        platformFee,
        platformFeeCurrency,
        blockhash,
        lastValidBlockHeight,
      } = await buildRes.json();
      
      if (!v0Tx && !v0TxSigned) throw new Error("No transaction returned from API");
      
      if (!signTransaction) {
        throw new Error("Wallet does not support signing");
      }

      const feeDisplay = platformFee
        ? ` + ${platformFee.toFixed(platformFeeCurrency === 'SOL' ? 4 : 2)} ${platformFeeCurrency} fee`
        : '';
      showToast.info(`💳 Confirm purchase — ${price} SOL${feeDisplay}`);
      
      const txBase64 = v0TxSigned || v0Tx;
      const txBytes = Uint8Array.from(atob(txBase64), c => c.charCodeAt(0));
      const vTx = VersionedTransaction.deserialize(txBytes);
      
      const feePayer = vTx.message.staticAccountKeys[0];
      if (feePayer.toBase58() !== publicKey.toBase58()) {
        throw new Error("Transaction fee payer doesn't match connected wallet");
      }
      
      const M2_PROGRAM = 'M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K';
      const M3_PROGRAM = 'M3mxk5W2tt27WGT7THox7PmgRDp4m6NEhL5xvxrBfS1';
      const hasME = vTx.message.staticAccountKeys.some(k => 
        k.toBase58() === M2_PROGRAM || k.toBase58() === M3_PROGRAM
      );
      if (!hasME) {
        throw new Error("Transaction doesn't interact with ME marketplace");
      }

      // Pre-simulate with sigVerify:false before wallet signing.
      // Phantom simulates during signTransaction — multi-signer notary txs fail
      // Phantom's simulation without this, showing "unable to safely predict" warning.
      try {
        await fetch('/api/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'simulateTransaction', params: [txBase64, { sigVerify: false, encoding: 'base64', commitment: 'processed' }] }),
        });
      } catch {}
      
      const signed = await signTransaction(vTx as any);
      const rawTx = (signed as any).serialize();
      
      showToast.info("⏳ Submitting transaction...");
      sig = await connection.sendRawTransaction(rawTx, {
        skipPreflight: true,
        maxRetries: 0,
      });
      
      const startTime = Date.now();
      const MAX_RETRY_MS = 60_000;
      let confirmed = false;
      
      while (!confirmed && Date.now() - startTime < MAX_RETRY_MS) {
        const status = await connection.getSignatureStatus(sig);
        if (status?.value?.confirmationStatus === 'confirmed' || 
            status?.value?.confirmationStatus === 'finalized') {
          confirmed = true;
          break;
        }
        if (status?.value?.err) {
          throw new Error('Transaction failed on-chain');
        }
        
        const valid = await connection.isBlockhashValid(blockhash);
        if (!valid?.value) break;
        
        try {
          await connection.sendRawTransaction(rawTx, { skipPreflight: true, maxRetries: 0 });
        } catch {}
        
        await new Promise(r => setTimeout(r, 1000));
      }
      
      if (confirmed) {
        showToast.success(`✅ NFT purchased! TX: ${sig.slice(0, 16)}...`);
      } else {
        showToast.info(`⏳ TX sent: ${sig.slice(0, 8)}... — check your wallet in a moment`);
      }
      setCard((prev: any) => prev ? { ...prev, sold: true } : prev);
    } catch (err: any) {
      const message = err.message || "";
      const lowerMessage = message.toLowerCase();

      if (
        lowerMessage.includes("user rejected") ||
        lowerMessage.includes("rejected the request") ||
        lowerMessage.includes("declined") ||
        lowerMessage.includes("cancelled") ||
        lowerMessage.includes("canceled")
      ) {
        showToast.error("Transaction cancelled");
      } else if (lowerMessage.includes("insufficient")) {
        showToast.error("Insufficient SOL balance");
      } else if (lowerMessage.includes("no longer available") || lowerMessage.includes("already been sold")) {
        showToast.error("This item has already been sold");
      } else if (message.includes("No active listing")) {
        showToast.error("This item is no longer listed");
      } else if (lowerMessage.includes("simulation failed")) {
        showToast.error("Transaction simulation failed. This listing may be stale — try refreshing the page.");
      } else {
        showToast.error(`Error: ${message.slice(0, 120)}`);
      }
    } finally {
      setBuying(false);
    }
  };

  const handleUnlist = async () => {
    if (!connected || !publicKey || !card?.nftAddress || !signTransaction) return;
    setUnlisting(true);
    try {
      showToast.info("Building delist transaction...");

      // Check if listed on Anchor auction program first
      const nftMintPk = new PublicKey(card.nftAddress);
      const auctionListing = await fetchAuctionListing(connection, card.nftAddress);
      if (auctionListing) {
        // Cancel via Anchor auction program
        const { AuctionProgram } = await import('@/lib/auction-program');
        const auctionProgram = new AuctionProgram(connection, { publicKey, signTransaction, signAllTransactions } as any);
        const { getAssociatedTokenAddress } = await import('@solana/spl-token');
        const sellerNftAccount = await getAssociatedTokenAddress(nftMintPk, publicKey);
        const sig = await auctionProgram.cancelListing(nftMintPk, sellerNftAccount);
        showToast.success(`NFT unlisted successfully! TX: ${sig.slice(0, 12)}...`);
        setCard((prev: any) => prev ? { ...prev, price: 0, usdcPrice: null, solPrice: 0, auctionListing: null } : prev);
        setUnlisting(false);
        return;
      }

      // Detect NFT type to choose the correct Tensor delist route
      let delistRoute = '/api/tensor-delist'; // default: compressed
      try {
        const nftRes = await fetch(`/api/nft?mint=${card.nftAddress}`);
        const nftData = await nftRes.json();
        const rawAsset = nftData.result || {};
        const isCompressed = rawAsset.compression?.compressed === true;
        if (isCompressed) {
          delistRoute = '/api/tensor-delist';
        } else {
          const mintInfo = await connection.getAccountInfo(new PublicKey(card.nftAddress));
          const isToken2022 = mintInfo?.owner.toBase58() === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
          if (isToken2022) {
            delistRoute = '/api/tensor-delist-t22';
          } else {
            delistRoute = '/api/tensor-delist-legacy';
          }
        }
        console.log('[delist] route:', delistRoute, 'compressed:', isCompressed);
      } catch {
        // If detection fails, try compressed (original behavior)
      }

      const res = await fetch(delistRoute, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mint: card.nftAddress,
          owner: publicKey.toBase58(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to build delist transaction');

      const txBytes = Buffer.from(data.tx, 'base64');
      const vtx = VersionedTransaction.deserialize(txBytes);
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

      showToast.success("NFT unlisted successfully!");
      setCard((prev: any) => prev ? { ...prev, price: 0, usdcPrice: null, solPrice: 0 } : prev);
    } catch (err: any) {
      console.error("Unlist failed:", err);
      showToast.error(err.message || "Failed to unlist");
    } finally {
      setUnlisting(false);
    }
  };

  if (loading) {
    return (
      <div className="pt-24 pb-20 min-h-screen">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center py-20">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-gold-500 border-t-transparent mb-4"></div>
            <p className="text-gray-400">Loading card details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="pt-24 pb-20 min-h-screen">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center py-20">
          <h1 className="font-serif text-4xl text-white mb-4">Card Not Found</h1>
          <p className="text-gray-400 mb-8">This listing may have been sold or removed.</p>
          <Link href="/auctions/categories/tcg-cards" className="text-gold-500 hover:text-gold-400 font-medium">
            ← Browse TCG Cards
          </Link>
        </div>
      </div>
    );
  }

  const showSolTransactionPrice = card.source === 'collector-crypt' && !card.auctionListing && card.solPrice > 0;
  const primaryPrice = showSolTransactionPrice ? card.solPrice : (card.usdcPrice || card.price);
  const primaryCurrency = showSolTransactionPrice ? 'SOL' : (card.usdcPrice || card.currency === 'USDC' ? 'USDC' : card.currency);
  const buyPrice = showSolTransactionPrice ? card.solPrice : card.price;
  const buyCurrency = showSolTransactionPrice ? 'SOL' : card.currency;
  const isExternalMarketplaceCard = !card.auctionListing && (
    card.source === 'collector-crypt'
    || card.source === 'phygitals'
    || card.buyKind === 'tensorCompressed'
    || card.buyKind === 'tensorStandard'
  );
  const showExternalFeeNote = isExternalMarketplaceCard && shouldApplyExternalMarketplaceFee({
    source: card.source,
    collectionName: card.collection,
  });
  const externalFee = showExternalFeeNote ? calculateExternalMarketplaceFee(buyPrice) : 0;
  const marketplaceLabel = card.auctionListing
    ? 'Listed on Artifacte'
    : (card.source === 'phygitals' || card.buyKind === 'tensorCompressed' || card.buyKind === 'tensorStandard')
      ? 'Powered by Tensor'
      : 'Powered by Magic Eden';

  return (
    <div className="pt-24 pb-20 min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <div className="mb-8">
          <button
            onClick={() => window.history.back()}
            className="text-gold-500 hover:text-gold-400 text-sm font-medium transition cursor-pointer"
          >
            ← Back to {card.category === 'MERCHANDISE' ? 'Merchandise' : card.category === 'SEALED' ? 'Sealed Product' : card.category === 'SPORTS_CARDS' ? 'Sports Cards' : 'TCG Cards'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Left: Image */}
          <div className="bg-dark-800 rounded-xl border border-white/5 p-6 flex items-start justify-center self-start lg:sticky lg:top-28">
            <img
              src={(() => {
                let u = card.image || '';
                if (u.includes('arweave.net/') || u.includes('nftstorage.link/') || u.includes('/ipfs/') || u.startsWith('ipfs://')) {
                  if (u.startsWith('ipfs://')) u = u.replace('ipfs://', 'https://nftstorage.link/ipfs/');
                  return `/api/img-proxy?url=${encodeURIComponent(u)}`;
                }
                return u;
              })()}
              alt={card.name}
              className="max-h-[500px] w-auto object-contain rounded-lg"
              onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder-card.svg'; }}
            />
          </div>

          {/* Right: Details */}
          <div className="space-y-8">
            {/* Header */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-gold-500 text-xs font-semibold tracking-widest uppercase">{card.ccCategory}</span>
                <VerifiedBadge collectionName={card.name} verifiedBy={card.verifiedBy} />
                {card.collection && (
                  <span className="px-2 py-0.5 rounded-full bg-gold-500/10 border border-gold-500/30 text-gold-400 text-xs font-semibold tracking-wide">
                    {card.collection}
                  </span>
                )}
              </div>
              <h1 className="font-serif text-3xl md:text-4xl text-white mb-2">{card.name}</h1>
              <p className="text-gray-400 text-sm">{card.subtitle}</p>
            </div>

            {/* Price */}
            {card.source === "artifacte" ? (
              <ArtifactePriceSection card={card} />
            ) : (
              <div className="bg-dark-800 rounded-xl border border-white/5 p-6">
                <p className="text-gray-500 text-xs font-medium tracking-wider mb-2">
                  {card.auctionListing?.listingType === 'auction' ? 'Auction' : card.price ? "Price" : "Status"}
                </p>
                {card.price ? (
                  <>
                    <div className="flex items-baseline gap-3">
                      <p className="text-white font-serif text-4xl">
                        {primaryCurrency === 'SOL' ? `◎ ${primaryPrice.toLocaleString()}` : `$${primaryPrice.toLocaleString()}`}
                      </p>
                      <span className="text-gold-500 text-sm font-medium">{primaryCurrency}</span>
                    </div>
                    {card.auctionListing?.listingType === 'auction' && card.auctionListing.currentBid > 0 && (
                      <p className="text-gold-400 text-sm mt-1">
                        Current bid: {card.auctionListing.currency === 'SOL' ? '◎ ' : '$'}{card.auctionListing.currentBid.toLocaleString()} {card.auctionListing.currency}
                      </p>
                    )}
                    {card.auctionListing?.listingType === 'auction' && card.auctionListing.endTime > 0 && (
                      <p className="text-gray-400 text-sm mt-1 mb-4">
                        Ends: {new Date(card.auctionListing.endTime).toLocaleDateString()} {new Date(card.auctionListing.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                    {!card.auctionListing && primaryCurrency !== 'SOL' && card.solPrice > 0 && (
                      <p className="text-gray-400 text-sm mt-1 mb-4">◎ {card.solPrice.toLocaleString()} SOL</p>
                    )}
                    {showExternalFeeNote && (
                      <p className="text-amber-300 text-sm mt-2 mb-4">
                        + {formatFeeDisplay(externalFee, buyCurrency)} Artifacte fee at checkout
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-white font-serif text-4xl mb-4">Unlisted</p>
                )}

                {!card.price && (card.auctionListing as any)?.stale && connected && publicKey && card.auctionListing?.seller === publicKey.toBase58() && (
                  <button
                    onClick={async () => {
                      if (!signTransaction || !card.nftAddress) return;
                      setUnlisting(true);
                      try {
                        showToast.info("Closing stale listing...");
                        const { AuctionProgram } = await import('@/lib/auction-program');
                        const ap = new AuctionProgram(connection, { publicKey, signTransaction, signAllTransactions } as any);
                        const sig = await ap.closeStaleListing(new PublicKey(card.nftAddress));
                        showToast.success(`Stale listing closed! TX: ${sig.slice(0, 12)}...`);
                        setCard((prev: any) => prev ? { ...prev, auctionListing: null } : prev);
                      } catch (err: any) {
                        showToast.error(err.message?.slice(0, 80) || "Failed to close listing");
                      } finally {
                        setUnlisting(false);
                      }
                    }}
                    disabled={unlisting}
                    className={`w-full px-6 py-3 rounded-lg text-sm font-semibold transition ${
                      unlisting ? "bg-gray-600/50 cursor-not-allowed text-gray-400" : "bg-dark-700 border border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/10"
                    }`}
                  >
                    {unlisting ? "Closing..." : "Close Stale Listing (reclaim rent)"}
                  </button>
                )}

                {card.price ? (
                  connected && publicKey && card.seller && publicKey.toBase58() === card.seller ? (
                    <div className="space-y-3">
                      <div className="w-full px-6 py-3 rounded-lg text-sm font-semibold bg-dark-700 border border-gold-500/30 text-gold-500 text-center">
                        Your Listing
                      </div>
                      <button
                        onClick={handleUnlist}
                        disabled={unlisting}
                        className={`w-full px-6 py-3.5 rounded-lg text-base font-semibold transition ${
                          unlisting
                            ? "bg-gray-600/50 cursor-not-allowed text-gray-400"
                            : "bg-red-600 hover:bg-red-700 text-white"
                        }`}
                      >
                        {unlisting ? "Unlisting..." : "Unlist Item"}
                      </button>
                    </div>
                  ) : card.auctionListing ? (
                    connected ? (
                      <button
                        onClick={handleBuy}
                        disabled={buying || card.sold}
                        className={`w-full px-6 py-3.5 rounded-lg text-base font-semibold transition ${
                          buying || card.sold
                            ? "bg-gray-600/50 cursor-not-allowed text-gray-400"
                            : "bg-gold-500 hover:bg-gold-600 text-dark-900"
                        }`}
                      >
                        {card.sold ? "✅ Sold" : buying ? "Processing..." : card.auctionListing.listingType === 'auction' ? 'Place Bid' : `Buy Now — ${buyCurrency === 'SOL' ? '◎' : '$'}${buyPrice.toLocaleString()} ${buyCurrency}`}
                      </button>
                    ) : (
                      <WalletMultiButton className="w-full !bg-gold-500 !text-dark-900 !rounded-lg !text-base !font-semibold !py-3.5" />
                    )
                  ) : connected ? (
                    <button
                      onClick={handleBuy}
                      disabled={buying || card.sold}
                      className={`w-full px-6 py-3.5 rounded-lg text-base font-semibold transition ${
                        buying || card.sold
                          ? "bg-gray-600/50 cursor-not-allowed text-gray-400"
                          : "bg-gold-500 hover:bg-gold-600 text-dark-900"
                      }`}
                    >
                      {card.sold ? "✅ Sold" : buying ? "Processing..." : `Buy Now — ${buyCurrency === 'SOL' ? '◎' : '$'}${buyPrice.toLocaleString()} ${buyCurrency}`}
                    </button>
                  ) : (
                    <WalletMultiButton className="w-full !bg-gold-500 !text-dark-900 !rounded-lg !text-base !font-semibold !py-3.5" />
                  )
                ) : (
                  <p className="text-gray-500 text-sm">This item is not currently listed for sale</p>
                )}
                {card.price && <p className="text-gray-600 text-xs mt-2">{marketplaceLabel}</p>}
              </div>
            )}

            {/* Grading Info */}
            <div className="bg-dark-800 rounded-xl border border-white/5 p-6">
              <h3 className="text-white font-medium text-sm mb-4 tracking-wider uppercase">{card.source === "artifacte" && card.condition !== "Graded" ? "Card Details" : "Grading Details"}</h3>
              <div className="grid grid-cols-2 gap-4">
                {card.gradingCompany && (
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Grading Company</p>
                    <p className="text-white text-sm font-medium">{card.gradingCompany}</p>
                  </div>
                )}
                {card.grade && (
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Grade</p>
                    <p className="text-white text-sm font-medium">{card.grade}</p>
                  </div>
                )}
                {(card.gradeNum !== undefined || card.source === "artifacte") && (
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Grade Number</p>
                    <p className="text-white text-sm font-medium">{card.gradeNum || (card.condition === "Graded" ? card.grade : "Ungraded")}</p>
                  </div>
                )}
                {card.year && (
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Year</p>
                    <p className="text-white text-sm font-medium">{card.year}</p>
                  </div>
                )}
                {card.gradingId && (
                  <div className="col-span-2">
                    <p className="text-gray-500 text-xs mb-1">Certificate #</p>
                    <div className="flex items-center gap-3">
                      <p className="text-white text-sm font-mono">{card.gradingId}</p>
                      {card.gradingCompany === 'PSA' && (
                        <a
                          href={`https://www.psacard.com/cert/${card.gradingId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-gold-500 hover:text-gold-400 transition"
                        >
                          Verify on PSA →
                        </a>
                      )}
                      {(card.gradingCompany === 'BGS' || card.gradingCompany === 'BVG') && (
                        <a
                          href={`https://www.beckett.com/grading/card-lookup/${card.gradingId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-gold-500 hover:text-gold-400 transition"
                        >
                          Verify on Beckett →
                        </a>
                      )}
                      {card.gradingCompany === 'CGC' && (
                        <a
                          href={`https://www.cgccards.com/certlookup/${card.gradingId}/`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-gold-500 hover:text-gold-400 transition"
                        >
                          Verify on CGC →
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Vault / Custody */}
            <div className="bg-dark-800 rounded-xl border border-white/5 p-6">
              <h3 className="text-white font-medium text-sm mb-4 tracking-wider uppercase">Vault & Custody</h3>
              <div className="space-y-3">
                {card.vault && (
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Stored At</p>
                    <p className="text-white text-sm font-medium">{card.vault}</p>
                  </div>
                )}
                {card.vaultLocation && (
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Location</p>
                    <p className="text-white text-sm font-medium">{card.vaultLocation}</p>
                  </div>
                )}
                {card.insuredValue && (
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Insured Value</p>
                    <p className="text-white text-sm font-medium">${card.insuredValue.toLocaleString()}</p>
                  </div>
                )}
              </div>
              <div className="mt-4 pt-4 border-t border-white/5">
                {card.source === "artifacte" ? (
                  <p className="text-gray-400 text-xs leading-relaxed">
                    📦 Physical card securely stored and custodied by <span className="text-gold-500 font-medium">Artifacte</span>. After purchase, you own the NFT representing this card. To claim the physical card, contact Artifacte for redemption.
                  </p>
                ) : (
                  <p className="text-gray-400 text-xs leading-relaxed">
                    📦 Physical card securely stored at {card.vault || 'vault facility'}. After purchase, you own the NFT representing this card. To claim the physical card, redeem via{' '}
                    {card.source === 'phygitals' ? (
                      <a href="https://phygitals.io" target="_blank" rel="noopener noreferrer" className="text-gold-500 hover:text-gold-400 underline">
                        Phygitals
                      </a>
                    ) : (
                      <a href="https://collectorcrypt.com" target="_blank" rel="noopener noreferrer" className="text-gold-500 hover:text-gold-400 underline">
                        Collector Crypt
                      </a>
                    )}.
                  </p>
                )}
              </div>
            </div>

            {/* Phygitals: show TCGplayer price box */}
            {card.source === 'phygitals' && card.priceSourceId && (
              <TcgPlayerPriceBox productId={card.priceSourceId} />
            )}
            {/* CC cards with TCGplayer source: show TCGplayer price box */}
            {card.source !== 'phygitals' && card.priceSource === 'TCGplayer' && card.priceSourceId && (
              <TcgPlayerPriceBox productId={card.priceSourceId} />
            )}
            {/* Oracle Price History — CC, Sports, Phygitals */}
            {card.category !== 'MERCHANDISE' && (
            <PriceHistory 
              cardName={card.name} 
              category={card.category} 
              grade={card.gradingCompany && card.gradeNum ? `${card.gradingCompany} ${card.gradeNum}` : undefined}
              year={card.year}
              nftAddress={card.nftAddress}
              source={card.source}
              tcgPlayerId={card.tcgPlayerId || card.priceSourceId}
              gradingId={card.gradingId}
              gradingCompany={card.gradingCompany}
              priceSource={card.priceSource}
              priceSourceId={card.priceSourceId}
            />
            )}

            {/* NFT Details */}
            <div className="bg-dark-800 rounded-xl border border-white/5 p-6">
              <h3 className="text-white font-medium text-sm mb-4 tracking-wider uppercase">NFT Details</h3>
              <div className="space-y-3">
                {card.nftAddress && (
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Mint Address</p>
                    <p className="text-white text-xs font-mono break-all">{card.nftAddress}</p>
                  </div>
                )}
{/* CC ID removed */}
                {card.seller && (
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Seller</p>
                    <p className="text-white text-xs font-mono break-all">{card.seller}</p>
                  </div>
                )}
              </div>
              <div className="mt-4 flex gap-3">
                {card.nftAddress && (
                  <a
                    href={`https://explorer.solana.com/address/${card.nftAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-gold-500 hover:text-gold-400 transition"
                  >
                    View on Explorer →
                  </a>
                )}
{/* CC link removed */}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TcgPlayerPriceBox({ productId }: { productId: string }) {
  const [price, setPrice] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/tcgplayer-price?id=${productId}`)
      .then(r => r.json())
      .then(d => setPrice(d.marketPrice || d.listedMedianPrice || null))
      .catch(() => {});
  }, [productId]);

  return (
    <div className="bg-dark-800 rounded-xl border border-white/5 p-6">
      <h3 className="text-white font-medium text-sm mb-4 tracking-wider uppercase">Market Price</h3>
      <p className="text-white font-serif text-3xl font-bold mb-1">
        {price ? `$${price.toFixed(2)}` : "Loading..."}
      </p>
      <p className="text-gray-500 text-xs">Current market price per TCGplayer</p>
    </div>
  );
}

function ArtifactePriceSection({ card }: { card: any }) {
  const [marketPrice, setMarketPrice] = useState<number | null>(null);

  useEffect(() => {
    if (card.priceSource === "TCGplayer" && card.priceSourceId) {
      fetch(`/api/tcgplayer-price?id=${card.priceSourceId}`)
        .then(r => r.json())
        .then(d => setMarketPrice(d.marketPrice || d.listedMedianPrice || null))
        .catch(() => {});
    }
  }, [card.priceSource, card.priceSourceId]);

  const al = card.auctionListing as AuctionListing | null | undefined;
  const hasListing = !!(al || card.price);

  return (
    <div className="bg-dark-800 rounded-xl border border-white/5 p-6 space-y-4">
      {/* Auction / Fixed Price listing info */}
      {hasListing && (
        <div>
          <p className="text-gray-500 text-xs font-medium tracking-wider mb-2">
            {al?.listingType === 'auction' ? 'Auction' : 'Price'}
          </p>
          <div className="flex items-baseline gap-3">
            <p className="text-white font-serif text-4xl">
              {al ? (
                al.currency === 'SOL' ? `◎ ${al.price.toLocaleString()}` : `$${al.price.toLocaleString()}`
              ) : (
                card.usdcPrice ? `$${card.usdcPrice.toLocaleString()}` : `◎ ${card.price?.toLocaleString()}`
              )}
            </p>
            <span className="text-gold-500 text-sm font-medium">{al?.currency || card.currency}</span>
          </div>
          {al?.listingType === 'auction' && al.currentBid > 0 && (
            <p className="text-gold-400 text-sm mt-1">
              Current bid: {al.currency === 'SOL' ? '◎ ' : '$'}{al.currentBid.toLocaleString()} {al.currency}
            </p>
          )}
          {al?.listingType === 'auction' && al.endTime > 0 && (
            <p className="text-gray-400 text-sm mt-1">
              Ends: {new Date(al.endTime).toLocaleDateString()} {new Date(al.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
      )}

      {!hasListing && (
        <div>
          <p className="text-gray-500 text-xs font-medium tracking-wider mb-2">Status</p>
          <p className="text-white font-serif text-4xl">Unlisted</p>
        </div>
      )}

      {/* Market Price from TCGplayer */}
      <div>
        <p className="text-gray-500 text-xs font-medium tracking-wider mb-2">Market Price</p>
        <div className="flex items-baseline gap-3 mb-2">
          <p className="text-white font-serif text-2xl">
            {marketPrice ? `$${marketPrice.toFixed(2)}` : "—"}
          </p>
          {card.priceSource && (
            <span className="text-gold-500 text-xs font-medium">via {card.priceSource}</span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-gray-400">
        {card.variant && <span className="bg-dark-700 px-2 py-1 rounded">{card.variant}</span>}
        {card.language && <span className="bg-dark-700 px-2 py-1 rounded">{card.language}</span>}
        {card.grade && <span className="bg-dark-700 px-2 py-1 rounded">{card.grade}</span>}
        <span className="bg-dark-700 px-2 py-1 rounded">Artifacte Collection</span>
      </div>

      {card.price && !card.auctionListing && (
        <p className="text-emerald-300 text-sm">
          Artifacte collection items do not incur the 2% external Artifacte fee.
        </p>
      )}
    </div>
  );
}
