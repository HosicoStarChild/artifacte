/**
 * Shared Tensor cNFT buy flow — used by both category grid and card detail pages.
 *
 * Strategy:
 * 1. Try sendTransaction with skipPreflight (works for Solflare — native flow, balance preview)
 * 2. If sendTransaction fails (Phantom throws WalletSendTransactionError), fall back to
 *    signTransaction + manual RPC send (works for Phantom — user signs, we send directly)
 */

import { VersionedTransaction, Connection } from '@solana/web3.js';

interface TensorBuyResult {
  sig: string;
  price: number;
  confirmed: boolean;
}

export async function executeTensorBuy(
  mint: string,
  buyer: string,
  signTransaction: (tx: any) => Promise<any>,
  onStatus?: (msg: string) => void,
  sendTransaction?: (tx: any, connection: Connection, options?: any) => Promise<string>,
): Promise<TensorBuyResult> {
  // Step 1: Get server-built tx
  const tensorRes = await fetch('/api/tensor-buy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mint, buyer }),
  });

  if (!tensorRes.ok) {
    const errData = await tensorRes.json().catch(() => ({ error: 'Failed to build transaction' }));
    throw new Error(errData.error || 'Failed to build Tensor transaction');
  }

  const tensorData = await tensorRes.json();
  onStatus?.(`💳 Confirm purchase — ${tensorData.price} USDC`);

  // Step 2: Deserialize tx
  const txBytes = Uint8Array.from(atob(tensorData.tx), (c: string) => c.charCodeAt(0));
  const tx = VersionedTransaction.deserialize(txBytes);

  const HELIUS_RPC = 'https://margy-w7f73z-fast-mainnet.helius-rpc.com';
  const conn = new Connection(HELIUS_RPC, 'confirmed');

  let sig: string;

  // Try sendTransaction first (Solflare: works natively with balance preview)
  // Fall back to signTransaction + manual send (Phantom: sendTransaction blocked by security layer)
  let usedSendTransaction = false;
  if (sendTransaction) {
    try {
      sig = await sendTransaction(tx, conn, { skipPreflight: true, preflightCommitment: 'confirmed' });
      usedSendTransaction = true;
    } catch (e: any) {
      // Phantom throws WalletSendTransactionError — fall through to signTransaction
      console.log('[tensor-buy] sendTransaction failed, falling back to signTransaction:', e?.message);
    }
  }

  if (!usedSendTransaction) {
    // Fallback: signTransaction + manual RPC send
    // Phantom: shows "Failed to simulate" warning, user clicks "Confirm unsafe", we sign and send directly
    const signed = await signTransaction(tx);
    const serialized = signed.serialize();

    // Patch signature if wallet inflated ALT references
    let txToSend = serialized;
    if (serialized.length > 1232) {
      const signedTx = VersionedTransaction.deserialize(serialized);
      const patched = new Uint8Array(txBytes);
      patched.set(signedTx.signatures[0], 2); // offset: version(1) + sig_count(1)
      txToSend = patched;
    }

    sig = await conn.sendRawTransaction(txToSend, { skipPreflight: true, maxRetries: 5 });
  }

  onStatus?.(`⏳ Transaction sent: ${sig!.slice(0, 8)}...`);

  // Step 3: Poll for confirmation
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const statusRes = await fetch('/api/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSignatureStatuses', params: [[sig!]] }),
    });
    const statusData = await statusRes.json();
    const status = statusData.result?.value?.[0];
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
      if (status.err) throw new Error('Transaction failed on-chain');
      return { sig: sig!, price: tensorData.price, confirmed: true };
    }
  }

  return { sig: sig!, price: tensorData.price, confirmed: false };
}
