/**
 * Shared Tensor cNFT buy flow — used by both category grid and card detail pages.
 *
 * Strategy:
 * - Solflare: sendTransaction (wallet handles submission natively — balance preview, reliable)
 * - Phantom + others: signTransaction + manual send via Helius (we own the submission — reliable)
 */

import { VersionedTransaction, Connection } from '@solana/web3.js';

interface TensorBuyFeeContext {
  collectionAddress?: string;
  collectionName?: string;
  source?: string;
}

interface TensorBuyResult {
  sig: string;
  price: number;
  confirmed: boolean;
}

function isUserRejectedError(error: unknown): boolean {
  const queue: any[] = [error];
  const seen = new Set<any>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);

    const message = [current.message, current.name, current.error?.message, current.cause?.message]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const code = current.code ?? current.error?.code ?? current.cause?.code;

    if (
      code === 4001 ||
      message.includes('user rejected') ||
      message.includes('rejected the request') ||
      message.includes('user declined') ||
      message.includes('declined') ||
      message.includes('cancelled') ||
      message.includes('canceled')
    ) {
      return true;
    }

    if (current.error) queue.push(current.error);
    if (current.cause) queue.push(current.cause);
  }

  return false;
}

export async function executeTensorBuy(
  mint: string,
  buyer: string,
  signTransaction: (tx: any) => Promise<any>,
  onStatus?: (msg: string) => void,
  sendTransaction?: (tx: any, connection: Connection, options?: any) => Promise<string>,
  walletName?: string,
  feeContext?: TensorBuyFeeContext,
): Promise<TensorBuyResult> {
  // Step 1: Get server-built tx
  const tensorRes = await fetch('/api/tensor-buy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mint, buyer, ...feeContext }),
  });

  if (!tensorRes.ok) {
    const errData = await tensorRes.json().catch(() => ({ error: 'Failed to build transaction' }));
    throw new Error(errData.error || 'Failed to build Tensor transaction');
  }

  const tensorData = await tensorRes.json();
  const feeCurrency = tensorData.platformFeeCurrency || 'USDC';
  const feeDisplay = tensorData.platformFee ? ` + $${tensorData.platformFee.toFixed(2)} ${feeCurrency} fee` : '';
  onStatus?.(`💳 Confirm purchase — ${tensorData.price} USDC${feeDisplay}`);

  // Step 2: Deserialize tx
  const txBytes = Uint8Array.from(atob(tensorData.tx), (c: string) => c.charCodeAt(0));
  const tx = VersionedTransaction.deserialize(txBytes);

  const HELIUS_RPC = 'https://margy-w7f73z-fast-mainnet.helius-rpc.com';
  const conn = new Connection(HELIUS_RPC, 'confirmed');

  let sig: string;

  // Solflare: use sendTransaction — wallet submits natively with balance preview
  // Phantom + all others: use signTransaction + manual Helius send — we control submission
  const isSolflare = walletName?.toLowerCase().includes('solflare');
  let usedSendTransaction = false;

  if (isSolflare && sendTransaction) {
    try {
      sig = await sendTransaction(tx, conn, { skipPreflight: true, preflightCommitment: 'confirmed' });
      usedSendTransaction = true;
      console.log('[tensor-buy] Solflare: sendTransaction used');
    } catch (e: any) {
      if (isUserRejectedError(e)) {
        throw e;
      }
      console.log('[tensor-buy] Solflare sendTransaction failed, falling back:', e?.message);
    }
  }

  if (!usedSendTransaction) {
    // Phantom + fallback: signTransaction + manual send via Helius
    // We own the submission — reliable, no silent drops
    console.log(`[tensor-buy] ${walletName || 'unknown'}: using signTransaction + Helius send`);
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

    const b64Tx = Buffer.from(txToSend).toString('base64');
    const sendRes = await fetch('/api/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'sendTransaction',
        params: [b64Tx, { skipPreflight: true, encoding: 'base64', maxRetries: 5 }],
      }),
    });
    const sendData = await sendRes.json();
    if (sendData.error) throw new Error(sendData.error.message || JSON.stringify(sendData.error));
    sig = sendData.result;
  }

  onStatus?.(`⏳ Transaction sent: ${sig!.slice(0, 8)}...`);

  // Step 3: Poll for confirmation (60s window — Solana can be slow)
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const statusRes = await fetch('/api/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSignatureStatuses', params: [[sig!]] }),
    });
    if (statusRes.status === 429) continue; // rate limited — skip this poll, try again
    const statusData = await statusRes.json();
    const status = statusData.result?.value?.[0];
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
      if (status.err) throw new Error('Transaction failed on-chain');
      // Remove from oracle immediately after confirmed buy (fire and forget)
      fetch('/api/listing-sold', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mint }) }).catch(() => {});
      return { sig: sig!, price: tensorData.price, confirmed: true };
    }
  }

  return { sig: sig!, price: tensorData.price, confirmed: false };
}
