/**
 * Artifacte Platform Client
 * Interacts with on-chain USD1 auctions on Solana.
 */

import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { createTransferInstruction, getAssociatedTokenAddress } from '@solana/spl-token';

const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const TREASURY = new PublicKey('DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX');
const USD1_MINT = new PublicKey('USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB');
const USD1_DECIMALS = 6;

const ARTIFACTE_API = process.env.ARTIFACTE_API_URL || 'http://localhost:3000';

const connection = new Connection(SOLANA_RPC, 'confirmed');

/**
 * Get the current highest bid for an auction from Artifacte's API
 */
export async function getCurrentBid(auctionSlug) {
  const res = await fetch(`${ARTIFACTE_API}/api/auctions/${auctionSlug}`);
  if (!res.ok) {
    throw new Error(`Artifacte getCurrentBid failed (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  return {
    currentBid: data.currentBid,
    bidCount: data.bidCount || 0,
    slug: auctionSlug,
  };
}

/**
 * Place a USD1 bid on-chain for an Artifacte auction.
 * In production this would use a keypair signer; here we build the transaction.
 * 
 * @param {string} auctionSlug - The auction identifier
 * @param {number} amount - Bid amount in USD1 (dollars)
 * @param {import('@solana/web3.js').Keypair} walletKeypair - Signer keypair
 */
export async function placeBid(auctionSlug, amount, walletKeypair) {
  const tokenAmount = BigInt(Math.round(amount * 10 ** USD1_DECIMALS));

  const senderAta = await getAssociatedTokenAddress(USD1_MINT, walletKeypair.publicKey);
  const treasuryAta = await getAssociatedTokenAddress(USD1_MINT, TREASURY);

  const tx = new Transaction().add(
    createTransferInstruction(
      senderAta,
      treasuryAta,
      walletKeypair.publicKey,
      tokenAmount,
    )
  );

  tx.feePayer = walletKeypair.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.sign(walletKeypair);

  const sig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction(sig, 'confirmed');

  // Notify Artifacte API about the bid
  const notifyRes = await fetch(`${ARTIFACTE_API}/api/auctions/${auctionSlug}/bid`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount,
      wallet: walletKeypair.publicKey.toBase58(),
      txSignature: sig,
      source: 'sync-engine',
    }),
  });

  if (!notifyRes.ok) {
    console.warn(`[artifacte] Bid placed on-chain (${sig}) but API notification failed`);
  }

  return { success: true, signature: sig, amount };
}
