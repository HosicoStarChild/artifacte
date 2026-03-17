/**
 * Artifacte M2 Direct Buy Module
 * 
 * Builds ME M2 buy transactions client-side — no API, no notary needed.
 * Based on reverse-engineering of real Tensor/ME transactions.
 * 
 * Flow: ComputeBudget → Deposit → BuyV2 → ExecuteSaleV2
 * Single wallet prompt. Works for regular NFTs on the default ME auction house.
 * 
 * Reference tx: 2k489s2SkLunQiRTDMtAe7Hg2UiGEmjr3DsiAc5hMohfzzHjDe89kcQ9hgURTGNmhqFw4bKkyHynsQexgS643B1z
 */

import {
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
  Connection,
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from '@solana/spl-token';

// ── Constants ──────────────────────────────────────────────

export const M2_PROGRAM_ID = new PublicKey('M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K');
export const ME_AUCTION_HOUSE = new PublicKey('E8cU1WiRWjanGxmn96ewBgk9vPTcL6AEZ1t6F6fkgUWe');
export const ME_AUTHORITY = new PublicKey('autMW8SgBkVYeBgqYiTuJZnkvDZMVU2MHJh9Jh7CSQ2');
export const ME_NOTARY = new PublicKey('NTYeYJ1wr4bpM5xo6zx5En44SvJFAd35zTxxNoERYqd');
export const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

// Artifacte treasury — receives our platform fee
export const ARTIFACTE_TREASURY = new PublicKey('6drXw31FjHch4ixXa4ngTyUD2cySUs3mpcB2YYGA9g7P');

const PREFIX = 'm2';
const TREASURY = 'treasury';
const SIGNER = 'signer';

// Anchor discriminators (SHA256("global:<name>")[:8])
const DISC_DEPOSIT     = Buffer.from([242, 35, 198, 137, 82, 225, 242, 182]);
const DISC_BUY_V2      = Buffer.from([184, 23, 238, 97, 103, 197, 211, 61]);
const DISC_EXEC_SALE   = Buffer.from([91, 220, 49, 223, 204, 129, 53, 193]);
// For pNFTs (CC cards) — future use
const DISC_MIP1_EXEC   = Buffer.from([236, 163, 204, 173, 71, 144, 235, 118]);

// ── PDA Derivations ────────────────────────────────────────

export function findEscrowPaymentAccount(auctionHouse: PublicKey, buyer: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PREFIX), auctionHouse.toBuffer(), buyer.toBuffer()],
    M2_PROGRAM_ID
  );
}

export function findAuctionHouseTreasury(auctionHouse: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PREFIX), auctionHouse.toBuffer(), Buffer.from(TREASURY)],
    M2_PROGRAM_ID
  );
}

export function findBuyerTradeState(buyer: PublicKey, auctionHouse: PublicKey, tokenMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PREFIX), buyer.toBuffer(), auctionHouse.toBuffer(), tokenMint.toBuffer()],
    M2_PROGRAM_ID
  );
}

export function findSellerTradeState(
  seller: PublicKey, auctionHouse: PublicKey, tokenAccount: PublicKey, tokenMint: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PREFIX), seller.toBuffer(), auctionHouse.toBuffer(), tokenAccount.toBuffer(), tokenMint.toBuffer()],
    M2_PROGRAM_ID
  );
}

export function findProgramAsSigner(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PREFIX), Buffer.from(SIGNER)],
    M2_PROGRAM_ID
  );
}

export function findMetadataPDA(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    TOKEN_METADATA_PROGRAM_ID
  );
  return pda;
}

// ── Serialization helpers ──────────────────────────────────

function writeU8(buf: Buffer, val: number, offset: number): number {
  buf.writeUInt8(val, offset);
  return offset + 1;
}

function writeU16LE(buf: Buffer, val: number, offset: number): number {
  buf.writeUInt16LE(val, offset);
  return offset + 2;
}

function writeI16LE(buf: Buffer, val: number, offset: number): number {
  buf.writeInt16LE(val, offset);
  return offset + 2;
}

function writeU64LE(buf: Buffer, val: bigint, offset: number): number {
  buf.writeBigUInt64LE(val, offset);
  return offset + 8;
}

function writeI64LE(buf: Buffer, val: bigint, offset: number): number {
  buf.writeBigInt64LE(val, offset);
  return offset + 8;
}

// ── Instruction Builders ───────────────────────────────────

/**
 * Build Deposit instruction
 * Deposits SOL into buyer's escrow payment account
 */
function buildDepositIx(
  buyer: PublicKey,
  escrowPaymentAccount: PublicKey,
  escrowBump: number,
  amount: bigint,
): TransactionInstruction {
  // Args: escrow_payment_bump (u8) + amount (u64)
  const data = Buffer.alloc(8 + 1 + 8);
  DISC_DEPOSIT.copy(data, 0);
  let offset = 8;
  offset = writeU8(data, escrowBump, offset);
  writeU64LE(data, amount, offset);

  return new TransactionInstruction({
    programId: M2_PROGRAM_ID,
    keys: [
      { pubkey: buyer, isSigner: true, isWritable: true },
      { pubkey: ME_NOTARY, isSigner: false, isWritable: false },
      { pubkey: escrowPaymentAccount, isSigner: false, isWritable: true },
      { pubkey: ME_AUTHORITY, isSigner: false, isWritable: false },
      { pubkey: ME_AUCTION_HOUSE, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Build BuyV2 instruction
 * Creates buyer trade state (bid) at specified price
 */
function buildBuyV2Ix(
  buyer: PublicKey,
  tokenMint: PublicKey,
  metadata: PublicKey,
  escrowPaymentAccount: PublicKey,
  buyerTradeState: PublicKey,
  buyerReferral: PublicKey,
  buyerPrice: bigint,
  tokenSize: bigint,
  buyerStateExpiry: bigint,
  buyerCreatorRoyaltyBp: number,
): TransactionInstruction {
  // Args: buyer_price (u64) + token_size (u64) + buyer_state_expiry (i64) + buyer_creator_royalty_bp (u16) + extra_args (bytes = 4-byte len + data, empty = 0)
  const data = Buffer.alloc(8 + 8 + 8 + 8 + 2 + 4);
  DISC_BUY_V2.copy(data, 0);
  let offset = 8;
  offset = writeU64LE(data, buyerPrice, offset);
  offset = writeU64LE(data, tokenSize, offset);
  offset = writeI64LE(data, buyerStateExpiry, offset);
  offset = writeU16LE(data, buyerCreatorRoyaltyBp, offset);
  // extra_args: empty bytes (length = 0)
  data.writeUInt32LE(0, offset);

  return new TransactionInstruction({
    programId: M2_PROGRAM_ID,
    keys: [
      { pubkey: buyer, isSigner: true, isWritable: true },
      { pubkey: ME_NOTARY, isSigner: false, isWritable: false },
      { pubkey: tokenMint, isSigner: false, isWritable: false },
      { pubkey: metadata, isSigner: false, isWritable: false },
      { pubkey: escrowPaymentAccount, isSigner: false, isWritable: true },
      { pubkey: ME_AUTHORITY, isSigner: false, isWritable: false },
      { pubkey: ME_AUCTION_HOUSE, isSigner: false, isWritable: false },
      { pubkey: buyerTradeState, isSigner: false, isWritable: true },
      { pubkey: buyerReferral, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Build ExecuteSaleV2 instruction
 * Executes the swap: SOL from escrow → seller, NFT → buyer
 */
function buildExecuteSaleV2Ix(
  buyer: PublicKey,
  seller: PublicKey,
  sellerTokenAccount: PublicKey,
  tokenMint: PublicKey,
  metadata: PublicKey,
  escrowPaymentAccount: PublicKey,
  buyerReceiptTokenAccount: PublicKey,
  auctionHouseTreasury: PublicKey,
  buyerTradeState: PublicKey,
  buyerReferral: PublicKey,
  sellerTradeState: PublicKey,
  sellerReferral: PublicKey,
  programAsSigner: PublicKey,
  creators: PublicKey[],
  escrowBump: number,
  programAsSignerBump: number,
  buyerPrice: bigint,
  tokenSize: bigint,
  buyerStateExpiry: bigint,
  sellerStateExpiry: bigint,
  makerFeeBp: number,
  takerFeeBp: number,
): TransactionInstruction {
  // Args: escrow_payment_bump (u8) + program_as_signer_bump (u8) + buyer_price (u64) + token_size (u64) + buyer_state_expiry (i64) + seller_state_expiry (i64) + maker_fee_bp (i16) + taker_fee_bp (u16)
  const data = Buffer.alloc(8 + 1 + 1 + 8 + 8 + 8 + 8 + 2 + 2);
  DISC_EXEC_SALE.copy(data, 0);
  let offset = 8;
  offset = writeU8(data, escrowBump, offset);
  offset = writeU8(data, programAsSignerBump, offset);
  offset = writeU64LE(data, buyerPrice, offset);
  offset = writeU64LE(data, tokenSize, offset);
  offset = writeI64LE(data, buyerStateExpiry, offset);
  offset = writeI64LE(data, sellerStateExpiry, offset);
  offset = writeI16LE(data, makerFeeBp, offset);
  writeU16LE(data, takerFeeBp, offset);

  const keys = [
    { pubkey: buyer, isSigner: false, isWritable: true },
    { pubkey: seller, isSigner: false, isWritable: true },
    { pubkey: ME_NOTARY, isSigner: false, isWritable: false },
    { pubkey: sellerTokenAccount, isSigner: false, isWritable: true },
    { pubkey: tokenMint, isSigner: false, isWritable: false },
    { pubkey: metadata, isSigner: false, isWritable: false },
    { pubkey: escrowPaymentAccount, isSigner: false, isWritable: true },
    { pubkey: buyerReceiptTokenAccount, isSigner: false, isWritable: true },
    { pubkey: ME_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: ME_AUCTION_HOUSE, isSigner: false, isWritable: false },
    { pubkey: auctionHouseTreasury, isSigner: false, isWritable: true },
    { pubkey: buyerTradeState, isSigner: false, isWritable: true },
    { pubkey: buyerReferral, isSigner: false, isWritable: true },
    { pubkey: sellerTradeState, isSigner: false, isWritable: true },
    { pubkey: sellerReferral, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: programAsSigner, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    // Remaining accounts: creator addresses for royalty distribution
    ...creators.map(c => ({ pubkey: c, isSigner: false, isWritable: true })),
  ];

  return new TransactionInstruction({
    programId: M2_PROGRAM_ID,
    keys,
    data,
  });
}

// ── Metadata Helpers ───────────────────────────────────────

interface Creator {
  address: PublicKey;
  verified: boolean;
  share: number;
}

/**
 * Fetch creators from on-chain metadata (for royalty distribution)
 */
async function getMetadataCreators(connection: Connection, mint: PublicKey): Promise<Creator[]> {
  const metadataPDA = findMetadataPDA(mint);
  const accountInfo = await connection.getAccountInfo(metadataPDA);
  if (!accountInfo?.data) return [];

  try {
    // Metaplex metadata v1 layout:
    // 1 byte key, 32 bytes update auth, 32 bytes mint,
    // 4+N bytes name, 4+N bytes symbol, 4+N bytes uri,
    // 2 bytes seller_fee_basis_points, 
    // 1+4+(34*N) creators option
    const data = accountInfo.data;
    let offset = 1 + 32 + 32; // key + update_authority + mint

    // name (4-byte len + string)
    const nameLen = data.readUInt32LE(offset);
    offset += 4 + nameLen;

    // symbol
    const symLen = data.readUInt32LE(offset);
    offset += 4 + symLen;

    // uri
    const uriLen = data.readUInt32LE(offset);
    offset += 4 + uriLen;

    // seller_fee_basis_points
    offset += 2;

    // creators option (1 byte: 0=none, 1=some)
    const hasCreators = data[offset];
    offset += 1;

    if (!hasCreators) return [];

    const numCreators = data.readUInt32LE(offset);
    offset += 4;

    const creators: Creator[] = [];
    for (let i = 0; i < numCreators; i++) {
      const address = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;
      const verified = data[offset] === 1;
      offset += 1;
      const share = data[offset];
      offset += 1;
      creators.push({ address, verified, share });
    }
    return creators;
  } catch {
    return [];
  }
}

// ── Listing Info ───────────────────────────────────────────

export interface ListingInfo {
  /** NFT mint address */
  mint: PublicKey;
  /** Seller wallet */
  seller: PublicKey;
  /** Seller's token account holding the NFT */
  sellerTokenAccount: PublicKey;
  /** Price in lamports */
  priceLamports: bigint;
  /** Seller state expiry (-1 for no expiry) */
  sellerExpiry: bigint;
  /** Seller referral (usually ME_AUTHORITY) */
  sellerReferral: PublicKey;
}

/**
 * Fetch listing info from ME API
 */
export async function fetchListingInfo(
  mintAddress: string,
  meApiKey?: string
): Promise<ListingInfo | null> {
  const headers: Record<string, string> = {};
  if (meApiKey) headers['Authorization'] = `Bearer ${meApiKey}`;

  const res = await fetch(
    `https://api-mainnet.magiceden.dev/v2/tokens/${mintAddress}/listings`,
    { headers }
  );
  if (!res.ok) return null;

  const listings = await res.json();
  if (!listings?.length) return null;

  const listing = listings[0];
  return {
    mint: new PublicKey(mintAddress),
    seller: new PublicKey(listing.seller),
    sellerTokenAccount: new PublicKey(listing.tokenAddress),
    priceLamports: BigInt(Math.round(listing.price * LAMPORTS_PER_SOL)),
    sellerExpiry: BigInt(listing.expiry ?? -1),
    sellerReferral: new PublicKey(listing.sellerReferral || ME_AUTHORITY.toBase58()),
  };
}

// ── Main Builder ───────────────────────────────────────────

export interface BuyTransactionOptions {
  /** NFT listing info */
  listing: ListingInfo;
  /** Buyer wallet */
  buyer: PublicKey;
  /** Connection for metadata lookups */
  connection: Connection;
  /** Buyer referral wallet (default: ARTIFACTE_TREASURY) */
  buyerReferral?: PublicKey;
  /** Platform fee in lamports (added as SOL transfer, default: 0) */
  platformFeeLamports?: bigint;
  /** Creator royalty basis points to honor (default: 10000 = full) */
  buyerCreatorRoyaltyBp?: number;
  /** Compute unit price in micro-lamports (default: 100000) */
  computeUnitPrice?: number;
  /** Buyer state expiry timestamp (default: ~1 hour from now) */
  buyerExpiry?: bigint;
}

/**
 * Build a complete M2 buy transaction for a regular NFT listing
 * Returns a Transaction ready for wallet signing (single signer: buyer)
 */
export async function buildM2BuyTransaction(opts: BuyTransactionOptions): Promise<Transaction> {
  const {
    listing,
    buyer,
    connection,
    buyerReferral = ARTIFACTE_TREASURY,
    platformFeeLamports = BigInt(0),
    buyerCreatorRoyaltyBp = 10000, // 100% = honor full royalties
    computeUnitPrice = 100_000,
    buyerExpiry,
  } = opts;

  const { mint, seller, sellerTokenAccount, priceLamports, sellerExpiry, sellerReferral } = listing;

  // Calculate buyer expiry (~1 hour from now if not specified)
  const buyerStateExpiry = buyerExpiry ?? BigInt(Math.floor(Date.now() / 1000) + 3600);

  // Derive all PDAs
  const [escrowPaymentAccount, escrowBump] = findEscrowPaymentAccount(ME_AUCTION_HOUSE, buyer);
  const [buyerTradeState] = findBuyerTradeState(buyer, ME_AUCTION_HOUSE, mint);
  const [sellerTradeState] = findSellerTradeState(seller, ME_AUCTION_HOUSE, sellerTokenAccount, mint);
  const [auctionHouseTreasury] = findAuctionHouseTreasury(ME_AUCTION_HOUSE);
  const [programAsSigner, programAsSignerBump] = findProgramAsSigner();
  const metadata = findMetadataPDA(mint);

  // Buyer's ATA for receiving the NFT
  const buyerReceiptTokenAccount = await getAssociatedTokenAddress(mint, buyer);

  // Fetch creators from on-chain metadata for royalty distribution
  const creators = await getMetadataCreators(connection, mint);
  const creatorPubkeys = creators.map(c => c.address);

  // Deposit amount = price (ME takes escrow then distributes)
  const depositAmount = priceLamports;

  // Build transaction
  const tx = new Transaction();

  // 1. Set compute budget
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: computeUnitPrice }));

  // 2. Platform fee (SOL transfer to our treasury)
  if (platformFeeLamports > BigInt(0)) {
    tx.add(
      SystemProgram.transfer({
        fromPubkey: buyer,
        toPubkey: ARTIFACTE_TREASURY,
        lamports: platformFeeLamports,
      })
    );
  }

  // 3. Deposit into escrow
  tx.add(buildDepositIx(buyer, escrowPaymentAccount, escrowBump, depositAmount));

  // 4. BuyV2 — create buyer trade state
  tx.add(buildBuyV2Ix(
    buyer, mint, metadata, escrowPaymentAccount, buyerTradeState,
    buyerReferral, priceLamports, BigInt(1), buyerStateExpiry, buyerCreatorRoyaltyBp,
  ));

  // 5. ExecuteSaleV2 — execute the swap
  tx.add(buildExecuteSaleV2Ix(
    buyer, seller, sellerTokenAccount, mint, metadata,
    escrowPaymentAccount, buyerReceiptTokenAccount,
    auctionHouseTreasury, buyerTradeState, buyerReferral,
    sellerTradeState, sellerReferral, programAsSigner,
    creatorPubkeys,
    escrowBump, programAsSignerBump,
    priceLamports, BigInt(1), buyerStateExpiry, sellerExpiry,
    0, // makerFeeBp (0 for buys)
    0, // takerFeeBp (0 — ME collects via auction house config)
  ));

  return tx;
}

/**
 * Calculate Artifacte platform fee for a given price
 * @param priceLamports NFT price in lamports
 * @param feeBp Fee in basis points (default: 200 = 2%)
 */
export function calculatePlatformFee(priceLamports: bigint, feeBp: number = 200): bigint {
  return (priceLamports * BigInt(feeBp)) / BigInt(10000);
}
