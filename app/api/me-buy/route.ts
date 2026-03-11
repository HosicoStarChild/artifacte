import { NextRequest, NextResponse } from 'next/server';
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
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
 * Artifacte ME Proxy Buy — Client-Side Transaction Builder
 * 
 * Builds complete ME buy tx + 2% Artifacte fee.
 * Buyer signs in their wallet, never leaves our site.
 * 
 * Account layouts verified against:
 * https://github.com/magicoss/m2/tree/main/programs/m2/src
 */

const RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=345726df-3822-42c1-86e0-1a13dc6c7a04';
const TREASURY_WALLET = new PublicKey('6drXw31FjHch4ixXa4ngTyUD2cySUs3mpcB2YYGA9g7P');
const PLATFORM_FEE_BPS = 200; // 2%

// ME Auction House authority = same as notary (from on-chain AuctionHouse struct)
const ME_AUTHORITY = new PublicKey('autMW8SgBkVYeBgqYiTuJZnkvDZMVU2MHJh9Jh7CSQ2');

// ME Auction House notary (from on-chain AuctionHouse.notary field — different from authority!)
const ME_AH_NOTARY = new PublicKey('NTYeYJ1wr4bpM5xo6zx5En44SvJFAd35zTxxNoERYqd');

// Sysvar Instructions
const SYSVAR_INSTRUCTIONS = new PublicKey('Sysvar1nstructions1111111111111111111111111');

// Anchor discriminators: sha256("global:<name>")[0..8]
const DEPOSIT_DISC = Buffer.from([0xf2, 0x23, 0xc6, 0x89, 0x52, 0xe1, 0xf2, 0xb6]);
const BUY_V2_DISC = Buffer.from([0xb8, 0x17, 0xee, 0x61, 0x67, 0xc5, 0xd3, 0x3d]);
// execute_sale_v2 disc computed separately in the instruction builder

function encodeU64(val: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(val);
  return buf;
}

function encodeI64(val: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(val);
  return buf;
}

function encodeU16(val: number): Buffer {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(val);
  return buf;
}

function encodeI16(val: number): Buffer {
  const buf = Buffer.alloc(2);
  buf.writeInt16LE(val);
  return buf;
}

export async function POST(req: NextRequest) {
  try {
    const { mint, buyer } = await req.json();
    if (!mint || !buyer) {
      return NextResponse.json({ error: 'Missing mint or buyer' }, { status: 400 });
    }

    const mintPubkey = new PublicKey(mint);
    const buyerPubkey = new PublicKey(buyer);
    const connection = new Connection(RPC_URL, 'confirmed');

    // 1. Fetch ME listing
    const meRes = await fetch(
      `https://api-mainnet.magiceden.dev/v2/tokens/${mint}/listings`,
      { headers: { 'Accept': 'application/json' } }
    );
    if (!meRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch ME listing' }, { status: 502 });
    }
    const listings = await meRes.json();
    if (!listings?.length) {
      return NextResponse.json({ error: 'No active listing found on Magic Eden' }, { status: 404 });
    }

    const listing = listings[0];
    const seller = new PublicKey(listing.seller);
    const tokenAccount = new PublicKey(listing.tokenAddress);
    const sellerReferral = new PublicKey(listing.sellerReferral || ME_NOTARY.toBase58());
    const priceSol = listing.price;
    const priceLamports = BigInt(Math.round(priceSol * LAMPORTS_PER_SOL));

    // 2. Derive all PDAs
    const [escrowPayment] = findEscrowPaymentAccount(ME_AUCTION_HOUSE_SOL, buyerPubkey);
    const [ahTreasury] = findAuctionHouseTreasury(ME_AUCTION_HOUSE_SOL);
    const [buyerTradeState] = findBuyerTradeState(buyerPubkey, ME_AUCTION_HOUSE_SOL, mintPubkey);
    const [sellerTradeState] = findSellerTradeState(seller, ME_AUCTION_HOUSE_SOL, tokenAccount, mintPubkey);
    const [programAsSigner] = findProgramAsSigner();
    const metadataPDA = findMetadataPDA(mintPubkey);
    const editionPDA = findEditionPDA(mintPubkey);
    const buyerAta = await getAssociatedTokenAddress(mintPubkey, buyerPubkey);
    const sellerTokenRecord = findTokenRecordPDA(mintPubkey, tokenAccount);
    const buyerTokenRecord = findTokenRecordPDA(mintPubkey, buyerAta);

    // Try to get auth rules from on-chain metadata
    let authRules = AUTH_RULES_PROGRAM_ID; // default fallback
    try {
      const metaInfo = await connection.getAccountInfo(metadataPDA);
      if (metaInfo?.data) {
        // pNFT programmable config contains auth rules — for now use default
        // Most CC cards use the same auth rules set
      }
    } catch (_) {}

    // 3. Build transaction
    const tx = new Transaction();
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.feePayer = buyerPubkey;

    // Create buyer ATA if needed
    const buyerAtaInfo = await connection.getAccountInfo(buyerAta);
    if (!buyerAtaInfo) {
      tx.add(createAssociatedTokenAccountInstruction(buyerPubkey, buyerAta, buyerPubkey, mintPubkey));
    }

    // --- Artifacte 2% Platform Fee (pay first while wallet is fully funded) ---
    const feeAmount = Math.round(Number(priceLamports) * PLATFORM_FEE_BPS / 10000);
    tx.add(
      SystemProgram.transfer({
        fromPubkey: buyerPubkey,
        toPubkey: TREASURY_WALLET,
        lamports: feeAmount,
      })
    );

    // --- Deposit ---
    // Accounts: wallet, notary, escrow_payment_account, authority, auction_house, system_program
    // Args: _escrow_payment_bump (u8), amount (u64)
    const depositData = Buffer.concat([
      DEPOSIT_DISC,
      Buffer.from([0]), // escrow_payment_bump (ignored by program, uses bump from seeds)
      encodeU64(priceLamports),
    ]);
    tx.add(new TransactionInstruction({
      programId: M2_PROGRAM_ID,
      keys: [
        { pubkey: buyerPubkey, isSigner: true, isWritable: true },
        { pubkey: ME_NOTARY, isSigner: false, isWritable: false },
        { pubkey: escrowPayment, isSigner: false, isWritable: true },
        { pubkey: ME_AUTHORITY, isSigner: false, isWritable: false },
        { pubkey: ME_AUCTION_HOUSE_SOL, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: depositData,
    }));

    // --- Buy V2 ---
    // Accounts: wallet, notary, token_mint, metadata, escrow_payment_account, 
    //           authority, auction_house, buyer_trade_state, buyer_referral, token_program, system_program
    // Args: buyer_price (u64), token_size (u64), buyer_state_expiry (i64), 
    //        buyer_creator_royalty_bp (u16), extra_args (Vec<u8>)
    const buyV2Data = Buffer.concat([
      BUY_V2_DISC,
      encodeU64(priceLamports),          // buyer_price
      encodeU64(BigInt(1)),               // token_size
      encodeI64(BigInt(-1)),              // buyer_state_expiry (no expiry)
      encodeU16(0),                       // buyer_creator_royalty_bp (0 = default)
      Buffer.from([0, 0, 0, 0]),          // extra_args: Vec<u8> length=0 (Borsh encoding)
    ]);
    tx.add(new TransactionInstruction({
      programId: M2_PROGRAM_ID,
      keys: [
        { pubkey: buyerPubkey, isSigner: true, isWritable: true },
        { pubkey: ME_NOTARY, isSigner: false, isWritable: false },
        { pubkey: mintPubkey, isSigner: false, isWritable: false },
        { pubkey: metadataPDA, isSigner: false, isWritable: false },
        { pubkey: escrowPayment, isSigner: false, isWritable: true },
        { pubkey: ME_AUTHORITY, isSigner: false, isWritable: false },
        { pubkey: ME_AUCTION_HOUSE_SOL, isSigner: false, isWritable: false },
        { pubkey: buyerTradeState, isSigner: false, isWritable: true },
        { pubkey: buyerPubkey, isSigner: false, isWritable: false }, // buyer_referral (self)
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: buyV2Data,
    }));

    // --- Execute Sale V2 ---
    // Accounts: buyer, seller, notary, token_account, token_mint, metadata,
    //           escrow_payment_account, buyer_receipt_token_account, authority,
    //           auction_house, auction_house_treasury, buyer_trade_state,
    //           buyer_referral, seller_trade_state, seller_referral,
    //           token_program, system_program, ata_program, program_as_signer, rent
    // + remaining accounts: creators (for royalty distribution)

    // Get escrow bump and program_as_signer bump
    const [, escrowBump] = findEscrowPaymentAccount(ME_AUCTION_HOUSE_SOL, buyerPubkey);
    const [, pasBump] = findProgramAsSigner();

    // Parse seller's expiry from trade state if available
    const sellerExpiry = listing.expiry || -1;

    const EXEC_SALE_V2_DISC = Buffer.from([0x5b, 0xdc, 0x31, 0xdf, 0xcc, 0x81, 0x35, 0xc1]);
    const execData = Buffer.concat([
      EXEC_SALE_V2_DISC,
      Buffer.from([escrowBump]),         // escrow_payment_bump
      Buffer.from([pasBump]),            // program_as_signer_bump
      encodeU64(priceLamports),          // buyer_price
      encodeU64(BigInt(1)),              // token_size
      encodeI64(BigInt(-1)),             // buyer_state_expiry
      encodeI64(BigInt(sellerExpiry)),    // seller_state_expiry
      encodeI16(0),                      // maker_fee_bp
      encodeU16(200),                    // taker_fee_bp (ME standard 2%)
    ]);

    tx.add(new TransactionInstruction({
      programId: M2_PROGRAM_ID,
      keys: [
        { pubkey: buyerPubkey, isSigner: true, isWritable: true },     // buyer
        { pubkey: seller, isSigner: false, isWritable: true },          // seller
        { pubkey: ME_AH_NOTARY, isSigner: false, isWritable: false },   // notary
        { pubkey: tokenAccount, isSigner: false, isWritable: true },    // token_account
        { pubkey: mintPubkey, isSigner: false, isWritable: false },     // token_mint
        { pubkey: metadataPDA, isSigner: false, isWritable: false },    // metadata
        { pubkey: escrowPayment, isSigner: false, isWritable: true },   // escrow_payment_account
        { pubkey: buyerAta, isSigner: false, isWritable: true },        // buyer_receipt_token_account
        { pubkey: ME_AUTHORITY, isSigner: false, isWritable: false },   // authority
        { pubkey: ME_AUCTION_HOUSE_SOL, isSigner: false, isWritable: false }, // auction_house
        { pubkey: ahTreasury, isSigner: false, isWritable: true },      // auction_house_treasury
        { pubkey: buyerTradeState, isSigner: false, isWritable: true },  // buyer_trade_state
        { pubkey: buyerPubkey, isSigner: false, isWritable: true },        // buyer_referral (same as buy_v2)
        { pubkey: sellerTradeState, isSigner: false, isWritable: true }, // seller_trade_state
        { pubkey: sellerReferral, isSigner: false, isWritable: true },   // seller_referral
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: programAsSigner, isSigner: false, isWritable: false }, // program_as_signer
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data: execData,
    }));

    // 4. Serialize
    const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });

    return NextResponse.json({
      transaction: Buffer.from(serialized).toString('base64'),
      price: priceSol,
      priceLamports: priceLamports.toString(),
      fee: feeAmount / LAMPORTS_PER_SOL,
      feelamports: feeAmount,
      seller: seller.toBase58(),
      mint,
    });

  } catch (err: any) {
    console.error('[me-buy] Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to build transaction' }, { status: 500 });
  }
}
