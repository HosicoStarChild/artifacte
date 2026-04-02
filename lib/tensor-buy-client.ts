/**
 * Shared Tensor cNFT buy flow — used by both category grid and card detail pages.
 * 
 * Uses wallet adapter's sendTransaction with skipPreflight: true.
 * - Phantom: skips internal security simulation (no "Failed to simulate" warning)
 * - Solflare: still shows balance preview (uses own backend sim), approve stays active
 * - RPC node: skipPreflight bypasses RPC-level simulation, tx goes straight to chain
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

  if (sendTransaction) {
    // Use wallet adapter's sendTransaction with skipPreflight: true
    // - Phantom: signAndSendTransaction({ skipPreflight: true }) — skips security simulation, no warning
    // - Solflare: signAndSendTransaction({ skipPreflight: true }) — balance preview still works via Solflare's own backend sim
    sig = await sendTransaction(tx, conn, { skipPreflight: true, preflightCommitment: 'confirmed' });
  } else {
    // Fallback: signTransaction + manual RPC send (for wallets without sendTransaction)
    const signed = await signTransaction(tx);
    const serialized = signed.serialize();

    // Patch signature if wallet inflated ALT references
    let txToSend = serialized;
    if (serialized.length > 1232) {
      const signedTx = VersionedTransaction.deserialize(serialized);
      const patched = new Uint8Array(txBytes);
      patched.set(signedTx.signatures[0], 2);
      txToSend = patched;
    }

    const b64Tx = btoa(Array.from(new Uint8Array(txToSend)).map((b: number) => String.fromCharCode(b)).join(''));
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

  onStatus?.(`⏳ Transaction sent: ${sig.slice(0, 8)}...`);

  // Step 3: Poll for confirmation
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const statusRes = await fetch('/api/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSignatureStatuses', params: [[sig]] }),
    });
    const statusData = await statusRes.json();
    const status = statusData.result?.value?.[0];
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
      if (status.err) throw new Error('Transaction failed on-chain');
      return { sig, price: tensorData.price, confirmed: true };
    }
  }

  return { sig, price: tensorData.price, confirmed: false };
}
