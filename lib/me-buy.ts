/**
 * Magic Eden M2 Buy Module
 * 
 * Buys pNFTs from Magic Eden's M2 marketplace program directly on-chain.
 * No API key needed — uses the open-source M2 IDL.
 * 
 * Flow: deposit → buyV2 → mip1ExecuteSaleV2
 * 
 * Program: M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K
 * Source: https://github.com/me-foundation/m2
 */

import {
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  Transaction,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from '@solana/spl-token';

// ME M2 Program
export const M2_PROGRAM_ID = new PublicKey('M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K');

// ME Auction House (SOL)
export const ME_AUCTION_HOUSE_SOL = new PublicKey('E8cU1WiRWjanGxmn96ewBgk9vPTcL6AEZ1t6F6fkgUWe');

// ME Notary
export const ME_NOTARY = new PublicKey('autMW8SgBkVYeBgqYiTuJZnkvDZMVU2MHJh9Jh7CSQ2');

// Metaplex Token Metadata
export const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

// Metaplex Auth Rules
export const AUTH_RULES_PROGRAM_ID = new PublicKey('auth9SigNpDKz4sJJ1DfCTuZrZNSAgh9sFD3rboVmgg');

const PREFIX = 'm2';
const TREASURY = 'treasury';
const SIGNER = 'signer';

/**
 * Derive PDA for buyer escrow payment account
 */
export function findEscrowPaymentAccount(
  auctionHouse: PublicKey,
  buyer: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(PREFIX),
      auctionHouse.toBuffer(),
      buyer.toBuffer(),
    ],
    M2_PROGRAM_ID
  );
}

/**
 * Derive PDA for auction house treasury
 */
export function findAuctionHouseTreasury(
  auctionHouse: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(PREFIX),
      auctionHouse.toBuffer(),
      Buffer.from(TREASURY),
    ],
    M2_PROGRAM_ID
  );
}

/**
 * Derive PDA for buyer trade state
 */
export function findBuyerTradeState(
  buyer: PublicKey,
  auctionHouse: PublicKey,
  tokenMint: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(PREFIX),
      buyer.toBuffer(),
      auctionHouse.toBuffer(),
      tokenMint.toBuffer(),
    ],
    M2_PROGRAM_ID
  );
}

/**
 * Derive PDA for seller trade state
 */
export function findSellerTradeState(
  seller: PublicKey,
  auctionHouse: PublicKey,
  tokenAccount: PublicKey,
  tokenMint: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(PREFIX),
      seller.toBuffer(),
      auctionHouse.toBuffer(),
      tokenAccount.toBuffer(),
      tokenMint.toBuffer(),
    ],
    M2_PROGRAM_ID
  );
}

/**
 * Derive program as signer PDA
 */
export function findProgramAsSigner(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PREFIX), Buffer.from(SIGNER)],
    M2_PROGRAM_ID
  );
}

/**
 * Derive metadata PDA
 */
export function findMetadataPDA(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
  return pda;
}

/**
 * Derive master edition PDA
 */
export function findEditionPDA(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
      Buffer.from('edition'),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
  return pda;
}

/**
 * Derive token record PDA (for pNFTs)
 */
export function findTokenRecordPDA(mint: PublicKey, tokenAccount: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
      Buffer.from('token_record'),
      tokenAccount.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
  return pda;
}

export interface CCListing {
  nftAddress: string;
  sellerWallet: string;
  ccPrice: number;
  price: number;
  currency: string; // SOL or USDC
}

/**
 * Get info needed for buy — looks up seller's token account and auth rules on-chain
 */
export async function getBuyInfo(
  connection: Connection,
  tokenMint: PublicKey,
  seller: PublicKey
) {
  // Get seller's token account for this NFT
  const sellerTokenAccount = await getAssociatedTokenAddress(tokenMint, seller);
  
  // Get metadata to find auth rules
  const metadataPDA = findMetadataPDA(tokenMint);
  
  return {
    sellerTokenAccount,
    metadataPDA,
  };
}
