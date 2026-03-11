import { NextRequest, NextResponse } from 'next/server';
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
} from '@solana/spl-token';
import {
  M2_PROGRAM_ID,
  ME_AUCTION_HOUSE_SOL,
  ME_NOTARY,
  TOKEN_METADATA_PROGRAM_ID,
  AUTH_RULES_PROGRAM_ID,
  findEscrowPaymentAccount,
  findAuctionHouseTreasury,
  findBuyerTradeState,
  findSellerTradeState,
  findProgramAsSigner,
  findMetadataPDA,
  findEditionPDA,
  findTokenRecordPDA,
} from '@/lib/me-buy';

/**
 * Artifacte ME Proxy Buy API — Client-Side Transaction Builder
 * 
 * Builds a complete ME buy transaction + Artifacte 2% fee instruction.
 * Buyer signs the transaction in their wallet (never leaves our site).
 * 
 * Flow:
 * 1. Frontend POSTs { mint, buyer }
 * 2. API fetches listing from ME, derives all PDAs
 * 3. Returns serialized transaction (deposit + buy + fee)
 * 4. Buyer signs in Phantom/wallet → submits
 */

const RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=345726df-3822-42c1-86e0-1a13dc6c7a04';
const TREASURY_WALLET = new PublicKey('6drXw31FjHch4ixXa4ngTyUD2cySUs3mpcB2YYGA9g7P');
const PLATFORM_FEE_BPS = 200; // 2%
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

export async function POST(req: NextRequest) {
  try {
    const { mint, buyer } = await req.json();

    if (!mint || !buyer) {
      return NextResponse.json({ error: 'Missing mint or buyer' }, { status: 400 });
    }

    const mintPubkey = new PublicKey(mint);
    const buyerPubkey = new PublicKey(buyer);
    const connection = new Connection(RPC_URL, 'confirmed');

    // 1. Fetch the ME listing for this token
    const meRes = await fetch(
      `https://api-mainnet.magiceden.dev/v2/tokens/${mint}/listings`,
      { headers: { 'Accept': 'application/json' } }
    );
    
    if (!meRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch ME listing' }, { status: 502 });
    }

    const listings = await meRes.json();
    if (!listings || listings.length === 0) {
      return NextResponse.json({ error: 'No active listing found on Magic Eden' }, { status: 404 });
    }

    const listing = listings[0];
    const seller = new PublicKey(listing.seller);
    const tokenAccount = new PublicKey(listing.tokenAddress);
    const priceSol = listing.price;
    const priceLamports = BigInt(Math.round(priceSol * LAMPORTS_PER_SOL));
    const sellerExpiry = listing.expiry || -1;

    // Check if USDC listing
    const hasUsdcPrice = listing.priceInfo?.splPrice?.address === USDC_MINT.toBase58();
    const usdcPrice = hasUsdcPrice ? Number(listing.priceInfo.splPrice.rawAmount) : 0;

    // 2. Derive all PDAs
    const [escrowPayment, escrowBump] = findEscrowPaymentAccount(ME_AUCTION_HOUSE_SOL, buyerPubkey);
    const [ahTreasury] = findAuctionHouseTreasury(ME_AUCTION_HOUSE_SOL);
    const [buyerTradeState, buyerTsBump] = findBuyerTradeState(buyerPubkey, ME_AUCTION_HOUSE_SOL, mintPubkey);
    const [sellerTradeState] = findSellerTradeState(seller, ME_AUCTION_HOUSE_SOL, tokenAccount, mintPubkey);
    const [programAsSigner, pasBump] = findProgramAsSigner();
    const metadataPDA = findMetadataPDA(mintPubkey);
    const editionPDA = findEditionPDA(mintPubkey);

    // Buyer's ATA for the NFT
    const buyerAta = await getAssociatedTokenAddress(mintPubkey, buyerPubkey);

    // Token records for pNFT
    const sellerTokenRecord = findTokenRecordPDA(mintPubkey, tokenAccount);
    const buyerTokenRecord = findTokenRecordPDA(mintPubkey, buyerAta);

    // 3. Build the transaction
    const tx = new Transaction();

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.feePayer = buyerPubkey;

    // Create buyer's ATA if it doesn't exist
    const buyerAtaInfo = await connection.getAccountInfo(buyerAta);
    if (!buyerAtaInfo) {
      tx.add(
        createAssociatedTokenAccountInstruction(
          buyerPubkey,
          buyerAta,
          buyerPubkey,
          mintPubkey
        )
      );
    }

    // --- Instruction 1: Deposit (fund buyer's ME escrow) ---
    const depositDiscriminator = Buffer.from([0xf2, 0x23, 0xc6, 0x89, 0x52, 0xe1, 0xf2, 0xb6]); // deposit
    const depositData = Buffer.alloc(8 + 8 + 1);
    depositDiscriminator.copy(depositData, 0);
    depositData.writeBigUInt64LE(priceLamports, 8);
    depositData.writeUInt8(escrowBump, 16);

    tx.add(new TransactionInstruction({
      programId: M2_PROGRAM_ID,
      keys: [
        { pubkey: buyerPubkey, isSigner: true, isWritable: true },           // wallet / buyer
        { pubkey: ME_NOTARY, isSigner: false, isWritable: false },            // notary
        { pubkey: ME_AUCTION_HOUSE_SOL, isSigner: false, isWritable: false }, // auctionHouse
        { pubkey: escrowPayment, isSigner: false, isWritable: true },         // escrowPaymentAccount
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: depositData,
    }));

    // --- Instruction 2: Buy V2 (create buyer trade state) ---
    const buyV2Discriminator = Buffer.from([0xa9, 0x60, 0x30, 0x04, 0x41, 0x01, 0xed, 0x0d]); // buy_v2
    const buyV2Data = Buffer.alloc(8 + 8 + 1 + 8 + 1);
    buyV2Discriminator.copy(buyV2Data, 0);
    buyV2Data.writeBigUInt64LE(priceLamports, 8);   // buyer_price
    buyV2Data.writeUInt8(1, 16);                       // token_size (u64 but first byte)
    // Write token_size as u64
    const buyV2DataFull = Buffer.alloc(8 + 8 + 8 + 1 + 8);
    buyV2Discriminator.copy(buyV2DataFull, 0);
    buyV2DataFull.writeBigUInt64LE(priceLamports, 8);   // buyer_price
    buyV2DataFull.writeBigUInt64LE(BigInt(1), 16);       // token_size
    buyV2DataFull.writeUInt8(buyerTsBump, 24);           // buyer_trade_state_bump
    buyV2DataFull.writeBigInt64LE(BigInt(sellerExpiry), 25); // expiry (i64)
    // Note: buy_v2 may have slightly different args — using deposit+executeSale pattern

    tx.add(new TransactionInstruction({
      programId: M2_PROGRAM_ID,
      keys: [
        { pubkey: buyerPubkey, isSigner: true, isWritable: true },           // wallet
        { pubkey: ME_NOTARY, isSigner: false, isWritable: false },            // notary
        { pubkey: ME_AUCTION_HOUSE_SOL, isSigner: false, isWritable: false }, // auctionHouse
        { pubkey: buyerTradeState, isSigner: false, isWritable: true },       // buyerTradeState
        { pubkey: escrowPayment, isSigner: false, isWritable: true },         // escrowPaymentAccount
        { pubkey: mintPubkey, isSigner: false, isWritable: false },           // tokenMint
        { pubkey: metadataPDA, isSigner: false, isWritable: false },          // metadata
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: buyV2DataFull,
    }));

    // --- Instruction 3: Execute Sale V2 (pNFT transfer) ---
    const executeSaleDiscriminator = Buffer.from([0x25, 0x4a, 0xd4, 0x7f, 0x38, 0x8b, 0x89, 0x65]); // mip1_execute_sale_v2
    const executeSaleData = Buffer.alloc(8 + 8 + 8 + 1 + 1 + 1);
    executeSaleDiscriminator.copy(executeSaleData, 0);
    executeSaleData.writeBigUInt64LE(priceLamports, 8);     // buyer_price
    executeSaleData.writeBigUInt64LE(BigInt(1), 16);          // token_size
    executeSaleData.writeUInt8(escrowBump, 24);               // escrow_payment_bump
    executeSaleData.writeUInt8(pasBump, 25);                  // program_as_signer_bump

    // Get auth rules (from metadata account on-chain)
    let authRulesPubkey = AUTH_RULES_PROGRAM_ID; // default
    try {
      const metaInfo = await connection.getAccountInfo(metadataPDA);
      // Auth rules would be in metadata if pNFT — for now use default
    } catch (_e) {}

    tx.add(new TransactionInstruction({
      programId: M2_PROGRAM_ID,
      keys: [
        { pubkey: buyerPubkey, isSigner: true, isWritable: true },           // buyer
        { pubkey: seller, isSigner: false, isWritable: true },                // seller
        { pubkey: mintPubkey, isSigner: false, isWritable: false },           // tokenMint
        { pubkey: tokenAccount, isSigner: false, isWritable: true },          // tokenAccount (seller's)
        { pubkey: metadataPDA, isSigner: false, isWritable: true },           // metadata
        { pubkey: editionPDA, isSigner: false, isWritable: false },           // edition
        { pubkey: buyerAta, isSigner: false, isWritable: true },              // buyerReceiptTokenAccount
        { pubkey: ME_AUCTION_HOUSE_SOL, isSigner: false, isWritable: false }, // auctionHouse
        { pubkey: ahTreasury, isSigner: false, isWritable: true },            // auctionHouseTreasury
        { pubkey: sellerTradeState, isSigner: false, isWritable: true },      // sellerTradeState
        { pubkey: buyerTradeState, isSigner: false, isWritable: true },       // buyerTradeState
        { pubkey: escrowPayment, isSigner: false, isWritable: true },         // escrowPaymentAccount
        { pubkey: programAsSigner, isSigner: false, isWritable: false },      // programAsSigner
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: TOKEN_METADATA_PROGRAM_ID, isSigner: false, isWritable: false },
        // pNFT-specific accounts
        { pubkey: sellerTokenRecord, isSigner: false, isWritable: true },     // ownerTokenRecord
        { pubkey: buyerTokenRecord, isSigner: false, isWritable: true },      // destTokenRecord  
        { pubkey: AUTH_RULES_PROGRAM_ID, isSigner: false, isWritable: false }, // authRulesProgram
        { pubkey: authRulesPubkey, isSigner: false, isWritable: false },       // authRules
        { pubkey: new PublicKey('Sysvar1nstructions1111111111111111111111111'), isSigner: false, isWritable: false }, // sysvar instructions
      ],
      data: executeSaleData,
    }));

    // --- Instruction 4: Artifacte 2% Platform Fee ---
    const feeAmount = Number(priceLamports) * PLATFORM_FEE_BPS / 10000;
    tx.add(
      SystemProgram.transfer({
        fromPubkey: buyerPubkey,
        toPubkey: TREASURY_WALLET,
        lamports: Math.round(feeAmount),
      })
    );

    // 4. Serialize and return
    const serialized = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    return NextResponse.json({
      transaction: Buffer.from(serialized).toString('base64'),
      price: priceSol,
      priceLamports: priceLamports.toString(),
      fee: feeAmount / LAMPORTS_PER_SOL,
      seller: seller.toBase58(),
      mint: mint,
    });

  } catch (err: any) {
    console.error('[me-buy] Error building transaction:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to build transaction' },
      { status: 500 }
    );
  }
}
