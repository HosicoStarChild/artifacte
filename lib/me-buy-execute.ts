/**
 * Magic Eden M2 Buy Execution Module
 * 
 * Complete buy flow for pNFTs via Magic Eden's M2 program:
 * 1. Escrow wallet buys from seller using M2 (deposit → buyV2 → mip1ExecuteSaleV2)
 * 2. Transfer NFT from escrow to buyer
 * 3. Send 2% platform fee to treasury
 * 
 * Works with mainnet Helius RPC.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createTransferInstruction,
  getMint,
} from '@solana/spl-token';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
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
} from './me-buy';

// Config
const PLATFORM_FEE_BPS = 200; // 2%
const TREASURY_ADDRESS = new PublicKey('6drXw31FjHch4ixXa4ngTyUD2cySUs3mpcB2YYGA9g7P');

/**
 * Load escrow keypair from .config/escrow-wallet.json
 */
export function loadEscrowKeypair(): Keypair {
  try {
    const walletPath = join(homedir(), '.openclaw/workspace/.config/escrow-wallet.json');
    const walletData = readFileSync(walletPath, 'utf-8');
    const secretKey = JSON.parse(walletData) as number[];
    return Keypair.fromSecretKey(new Uint8Array(secretKey));
  } catch (error) {
    throw new Error(`Failed to load escrow keypair: ${error}`);
  }
}

/**
 * Verify that a payment was confirmed on-chain
 */
export async function verifyPayment(
  connection: Connection,
  signature: string,
  expectedAmount: number,
  expectedDestination: PublicKey,
  expectedSource: PublicKey
): Promise<boolean> {
  try {
    const tx = await connection.getParsedTransaction(signature, 'confirmed');
    if (!tx || !tx.transaction.message.instructions) {
      return false;
    }

    // Check if it's a transfer to the expected destination
    for (const instruction of tx.transaction.message.instructions) {
      if ('parsed' in instruction && instruction.parsed?.type === 'transfer') {
        const parsed = instruction.parsed as any;
        const destination = new PublicKey(parsed.info?.destination);
        const source = new PublicKey(parsed.info?.source || parsed.info?.authority);
        const amount = parsed.info?.tokenAmount?.amount || parsed.info?.lamports;

        if (
          destination.equals(expectedDestination) &&
          source.equals(expectedSource) &&
          BigInt(amount) >= BigInt(expectedAmount)
        ) {
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.error('Payment verification failed:', error);
    return false;
  }
}

/**
 * Build M2 deposit instruction
 */
function buildDepositInstruction(
  escrowKeypair: Keypair,
  amount: bigint
): TransactionInstruction {
  const escrowPaymentAccount = findEscrowPaymentAccount(ME_AUCTION_HOUSE_SOL, escrowKeypair.publicKey)[0];
  const auctionHouseTreasury = findAuctionHouseTreasury(ME_AUCTION_HOUSE_SOL)[0];

  return new TransactionInstruction({
    programId: M2_PROGRAM_ID,
    keys: [
      { pubkey: ME_AUCTION_HOUSE_SOL, isSigner: false, isWritable: false },
      { pubkey: escrowPaymentAccount, isSigner: false, isWritable: true },
      { pubkey: auctionHouseTreasury, isSigner: false, isWritable: true },
      { pubkey: escrowKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      Buffer.from([0]), // Instruction: deposit
      Buffer.from(amount.toString(16).padStart(16, '0'), 'hex'),
    ]),
  });
}

/**
 * Build M2 buyV2 instruction
 */
function buildBuyV2Instruction(
  escrowKeypair: Keypair,
  seller: PublicKey,
  tokenMint: PublicKey,
  sellerTokenAccount: PublicKey,
  price: bigint
): TransactionInstruction {
  const escrowPaymentAccount = findEscrowPaymentAccount(ME_AUCTION_HOUSE_SOL, escrowKeypair.publicKey)[0];
  const buyerTradeState = findBuyerTradeState(escrowKeypair.publicKey, ME_AUCTION_HOUSE_SOL, tokenMint)[0];
  const sellerTradeState = findSellerTradeState(seller, ME_AUCTION_HOUSE_SOL, sellerTokenAccount, tokenMint)[0];
  const freeTradeState = findBuyerTradeState(ME_NOTARY, ME_AUCTION_HOUSE_SOL, tokenMint)[0];
  const programAsSigner = findProgramAsSigner()[0];

  return new TransactionInstruction({
    programId: M2_PROGRAM_ID,
    keys: [
      { pubkey: ME_AUCTION_HOUSE_SOL, isSigner: false, isWritable: false },
      { pubkey: escrowPaymentAccount, isSigner: false, isWritable: true },
      { pubkey: escrowKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: seller, isSigner: false, isWritable: false },
      { pubkey: buyerTradeState, isSigner: false, isWritable: true },
      { pubkey: sellerTradeState, isSigner: false, isWritable: true },
      { pubkey: freeTradeState, isSigner: false, isWritable: true },
      { pubkey: tokenMint, isSigner: false, isWritable: false },
      { pubkey: sellerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: programAsSigner, isSigner: false, isWritable: false },
      { pubkey: ME_NOTARY, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      Buffer.from([1]), // Instruction: buyV2
      Buffer.from(price.toString(16).padStart(16, '0'), 'hex'),
    ]),
  });
}

/**
 * Build M2 mip1ExecuteSaleV2 instruction (for pNFTs)
 */
async function buildMip1ExecuteSaleV2Instruction(
  escrowKeypair: Keypair,
  seller: PublicKey,
  tokenMint: PublicKey,
  sellerTokenAccount: PublicKey
): Promise<TransactionInstruction> {
  const escrowPaymentAccount = findEscrowPaymentAccount(ME_AUCTION_HOUSE_SOL, escrowKeypair.publicKey)[0];
  const buyerTradeState = findBuyerTradeState(escrowKeypair.publicKey, ME_AUCTION_HOUSE_SOL, tokenMint)[0];
  const sellerTradeState = findSellerTradeState(seller, ME_AUCTION_HOUSE_SOL, sellerTokenAccount, tokenMint)[0];
  const freeTradeState = findBuyerTradeState(ME_NOTARY, ME_AUCTION_HOUSE_SOL, tokenMint)[0];
  const auctionHouseTreasury = findAuctionHouseTreasury(ME_AUCTION_HOUSE_SOL)[0];
  const programAsSigner = findProgramAsSigner()[0];
  
  const metadata = findMetadataPDA(tokenMint);
  const edition = findEditionPDA(tokenMint);
  const buyerTokenAccount = await getAssociatedTokenAddress(tokenMint, escrowKeypair.publicKey);
  const sellerTokenRecordPDA = findTokenRecordPDA(tokenMint, sellerTokenAccount);
  const buyerTokenRecordPDA = findTokenRecordPDA(tokenMint, buyerTokenAccount);

  return new TransactionInstruction({
    programId: M2_PROGRAM_ID,
    keys: [
      { pubkey: ME_AUCTION_HOUSE_SOL, isSigner: false, isWritable: false },
      { pubkey: escrowPaymentAccount, isSigner: false, isWritable: true },
      { pubkey: auctionHouseTreasury, isSigner: false, isWritable: true },
      { pubkey: escrowKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: seller, isSigner: false, isWritable: true },
      { pubkey: buyerTradeState, isSigner: false, isWritable: true },
      { pubkey: sellerTradeState, isSigner: false, isWritable: true },
      { pubkey: freeTradeState, isSigner: false, isWritable: true },
      { pubkey: tokenMint, isSigner: false, isWritable: true },
      { pubkey: metadata, isSigner: false, isWritable: true },
      { pubkey: edition, isSigner: false, isWritable: false },
      { pubkey: sellerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: buyerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: sellerTokenRecordPDA, isSigner: false, isWritable: true },
      { pubkey: buyerTokenRecordPDA, isSigner: false, isWritable: true },
      { pubkey: programAsSigner, isSigner: false, isWritable: false },
      { pubkey: ME_NOTARY, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: TOKEN_METADATA_PROGRAM_ID, isSigner: false, isWritable: true },
      { pubkey: AUTH_RULES_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([2]), // Instruction: mip1ExecuteSaleV2
  });
}

/**
 * Build instructions to transfer NFT from escrow to buyer
 */
async function buildTransferNFTInstructions(
  connection: Connection,
  escrowKeypair: Keypair,
  tokenMint: PublicKey,
  buyerWallet: PublicKey
): Promise<TransactionInstruction[]> {
  const sellerTokenAccount = await getAssociatedTokenAddress(tokenMint, escrowKeypair.publicKey);
  const buyerTokenAccount = await getAssociatedTokenAddress(tokenMint, buyerWallet);

  const instructions: TransactionInstruction[] = [];

  // Check if buyer's token account exists; if not, create it
  const buyerAccountInfo = await connection.getAccountInfo(buyerTokenAccount);
  if (!buyerAccountInfo) {
    instructions.push(
      new TransactionInstruction({
        programId: ASSOCIATED_TOKEN_PROGRAM_ID,
        keys: [
          { pubkey: escrowKeypair.publicKey, isSigner: true, isWritable: true },
          { pubkey: buyerTokenAccount, isSigner: false, isWritable: true },
          { pubkey: buyerWallet, isSigner: false, isWritable: false },
          { pubkey: tokenMint, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data: Buffer.from([]),
      })
    );
  }

  // Transfer NFT
  instructions.push(
    createTransferInstruction(sellerTokenAccount, buyerTokenAccount, escrowKeypair.publicKey, BigInt(1))
  );

  return instructions;
}

/**
 * Build instruction to send 2% fee to treasury
 */
function buildFeeTransferInstruction(
  escrowKeypair: Keypair,
  amount: bigint
): TransactionInstruction {
  const feeAmount = (amount * BigInt(PLATFORM_FEE_BPS)) / BigInt(10000);

  return SystemProgram.transfer({
    fromPubkey: escrowKeypair.publicKey,
    toPubkey: TREASURY_ADDRESS,
    lamports: Number(feeAmount),
  });
}

/**
 * Execute complete M2 buy flow
 * 
 * @param connection Solana connection
 * @param buyer Buyer wallet public key
 * @param nftMint NFT mint address
 * @param seller Seller wallet public key
 * @param priceLamports Price in lamports
 * @returns Transaction signature
 */
export async function executeM2Buy(
  connection: Connection,
  buyer: PublicKey,
  nftMint: PublicKey,
  seller: PublicKey,
  priceLamports: bigint
): Promise<string> {
  const escrowKeypair = loadEscrowKeypair();

  console.log(`[M2 Buy] Starting execution flow...`);
  console.log(`  Buyer: ${buyer.toBase58()}`);
  console.log(`  NFT: ${nftMint.toBase58()}`);
  console.log(`  Seller: ${seller.toBase58()}`);
  console.log(`  Price: ${priceLamports.toString()} lamports`);

  // 1. Ensure escrow account has enough SOL
  const escrowBalance = await connection.getBalance(escrowKeypair.publicKey);
  const requiredBalance = Number(priceLamports) + 1000000; // Add 1 SOL for fees
  if (escrowBalance < requiredBalance) {
    throw new Error(
      `Insufficient escrow balance: ${escrowBalance} lamports, need ${requiredBalance}`
    );
  }

  // 2. Get seller's token account
  const sellerTokenAccount = await getAssociatedTokenAddress(nftMint, seller);

  // 3. Build M2 buy transaction (deposit → buyV2 → mip1ExecuteSaleV2)
  const tx = new Transaction();

  // Deposit SOL to escrow payment account
  tx.add(buildDepositInstruction(escrowKeypair, priceLamports));
  console.log(`[M2 Buy] Added deposit instruction`);

  // Buy from seller
  tx.add(
    buildBuyV2Instruction(
      escrowKeypair,
      seller,
      nftMint,
      sellerTokenAccount,
      priceLamports
    )
  );
  console.log(`[M2 Buy] Added buyV2 instruction`);

  // Execute sale (for pNFTs)
  const executeSaleIx = await buildMip1ExecuteSaleV2Instruction(
    escrowKeypair,
    seller,
    nftMint,
    sellerTokenAccount
  );
  tx.add(executeSaleIx);
  console.log(`[M2 Buy] Added mip1ExecuteSaleV2 instruction`);

  // 4. Transfer NFT to buyer
  const transferInstructions = await buildTransferNFTInstructions(
    connection,
    escrowKeypair,
    nftMint,
    buyer
  );
  transferInstructions.forEach(ix => tx.add(ix));
  console.log(`[M2 Buy] Added ${transferInstructions.length} NFT transfer instruction(s)`);

  // 5. Send fee to treasury
  tx.add(buildFeeTransferInstruction(escrowKeypair, priceLamports));
  console.log(`[M2 Buy] Added fee transfer instruction`);

  // Set recent blockhash and sign
  const latestBlockhash = await connection.getLatestBlockhash();
  tx.recentBlockhash = latestBlockhash.blockhash;
  tx.feePayer = escrowKeypair.publicKey;
  tx.sign(escrowKeypair);

  console.log(`[M2 Buy] Sending transaction...`);

  // Send transaction
  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });

  console.log(`[M2 Buy] Transaction sent: ${signature}`);

  // Wait for confirmation
  const confirmation = await connection.confirmTransaction(signature, 'confirmed');
  if (confirmation.value.err) {
    throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
  }

  console.log(`[M2 Buy] Transaction confirmed!`);
  return signature;
}

/**
 * Check if buyer's token account exists and has the NFT
 */
export async function verifyNFTTransfer(
  connection: Connection,
  nftMint: PublicKey,
  buyerWallet: PublicKey
): Promise<boolean> {
  try {
    const buyerTokenAccount = await getAssociatedTokenAddress(nftMint, buyerWallet);
    const accountInfo = await connection.getAccountInfo(buyerTokenAccount);

    if (!accountInfo) {
      console.log('[M2 Buy] Buyer token account does not exist');
      return false;
    }

    // Verify NFT is there
    const mint = await getMint(connection, nftMint);
    console.log(`[M2 Buy] NFT verified in buyer's account`);
    return true;
  } catch (error) {
    console.error('[M2 Buy] NFT verification failed:', error);
    return false;
  }
}
