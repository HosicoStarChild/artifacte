import { NextRequest, NextResponse } from 'next/server';

/**
 * Collector Crypt Proxy Buy API
 * 
 * Flow:
 * 1. Buyer pays us (SOL/USDC to treasury) — handled on frontend
 * 2. Frontend calls this API with payment signature + CC listing ID
 * 3. We verify the payment on-chain
 * 4. We buy the NFT from Magic Eden using our service wallet
 * 5. We transfer the NFT to the buyer
 * 
 * Status: ARCHITECTURE READY — ME buy step needs API key
 */

// Load CC listings data
import ccListingsData from '@/data/cc-listings.json';
const ccListings = ccListingsData as any[];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ccId, buyerWallet, paymentSignature } = body;

    if (!ccId || !buyerWallet || !paymentSignature) {
      return NextResponse.json(
        { error: 'Missing required fields: ccId, buyerWallet, paymentSignature' },
        { status: 400 }
      );
    }

    // Find the CC listing
    const listing = ccListings.find((l: any) => l.ccId === ccId);
    if (!listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    }

    // TODO: Step 1 - Verify payment on-chain
    // - Check that paymentSignature is a valid confirmed transaction
    // - Verify it sends the correct amount (listing.price) to our treasury
    // - Verify it's from buyerWallet

    // TODO: Step 2 - Buy from Magic Eden
    // - Use ME SDK or API to purchase the NFT
    // - Needs ME API key (sign up at magiceden.io developer portal)
    // - Service wallet: ~/.config/solana/id.json or dedicated hot wallet
    // 
    // const sdk = MagicEdenSDK.v1.createSolanaKeypairClient(ME_API_KEY, serviceKeypair, {
    //   rpcUrl: 'https://mainnet.helius-rpc.com/?api-key=...'
    // });
    // await sdk.nft.buy({
    //   auctionHouseAddress: '...',
    //   buyer: serviceWallet.publicKey,
    //   seller: listing.sellerWallet,
    //   tokenMint: listing.nftAddress,
    //   price: listing.ccPrice,
    // });

    // TODO: Step 3 - Transfer NFT to buyer
    // - Create transfer instruction for the pNFT
    // - Send from service wallet to buyerWallet

    return NextResponse.json({
      status: 'pending',
      message: 'Payment received. NFT purchase and transfer will be processed shortly.',
      ccId,
      nftAddress: listing.nftAddress,
      buyerWallet,
      paymentSignature,
      // Once ME integration is live, this will return the NFT transfer signature
    });

  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET endpoint to check listing availability (is it still on ME?)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ccId = searchParams.get('ccId');
  
  if (!ccId) {
    return NextResponse.json({ error: 'Missing ccId param' }, { status: 400 });
  }

  const listing = ccListings.find((l: any) => l.ccId === ccId);
  if (!listing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({
    available: true, // TODO: check on-chain if still listed
    ccId: listing.ccId,
    name: listing.name,
    price: listing.price,
    ccPrice: listing.ccPrice,
    currency: listing.currency,
    nftAddress: listing.nftAddress,
    markup: listing.markup,
  });
}
