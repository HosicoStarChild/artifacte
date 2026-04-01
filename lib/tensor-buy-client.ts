/**
 * Shared Tensor cNFT buy flow — used by both category grid and card detail pages.
 * 
 * 1. Calls /api/tensor-buy to get server-built v0 tx (with ALT) + fee tx
 * 2. Wallet signs both at once via signAllTransactions (correct balance simulation)
 * 3. Patches signature into original compact tx if inflated
 * 4. Sends buy tx + fee tx via /api/rpc proxy
 * 5. Polls for confirmation
 */

import { VersionedTransaction } from '@solana/web3.js';

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
  signAllTransactions?: (txs: any[]) => Promise<any[]>,
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
  const feeText = tensorData.platformFee ? ` + $${tensorData.platformFee.toFixed(2)} fee` : '';
  onStatus?.(`💳 Confirm purchase — $${tensorData.price.toFixed(2)}${feeText} USDC`);

  // Step 2: Deserialize buy tx
  const txBytes = Uint8Array.from(atob(tensorData.tx), (c: string) => c.charCodeAt(0));
  const buyTx = VersionedTransaction.deserialize(txBytes);

  let signedBuyBytes: Uint8Array;
  let signedFeeBytes: Uint8Array | null = null;

  if (tensorData.feeTx && signAllTransactions) {
    // Sign both txs together — wallet simulates them in sequence, correct balance context
    const feeBytes = Uint8Array.from(atob(tensorData.feeTx), (c: string) => c.charCodeAt(0));
    const feeTx = VersionedTransaction.deserialize(feeBytes);
    const [signedBuy, signedFee] = await signAllTransactions([buyTx, feeTx]);
    signedBuyBytes = new Uint8Array(signedBuy.serialize());
    signedFeeBytes = new Uint8Array(signedFee.serialize());
  } else {
    // Fallback: sign buy tx only
    const signedBuy = await signTransaction(buyTx);
    signedBuyBytes = new Uint8Array(signedBuy.serialize());

    // Sign fee tx separately if present
    if (tensorData.feeTx) {
      const feeBytes = Uint8Array.from(atob(tensorData.feeTx), (c: string) => c.charCodeAt(0));
      const feeTx = VersionedTransaction.deserialize(feeBytes);
      const signedFee = await signTransaction(feeTx);
      signedFeeBytes = new Uint8Array(signedFee.serialize());
    }
  }

  // Patch signature if wallet inflated ALT
  let buyToSend = signedBuyBytes;
  if (buyToSend.length > 1232) {
    const inflated = VersionedTransaction.deserialize(buyToSend);
    const patched = new Uint8Array(txBytes);
    patched.set(inflated.signatures[0], 2);
    buyToSend = patched;
  }

  // Send fee tx (fire and forget)
  if (signedFeeBytes) {
    const feeB64 = btoa(Array.from(signedFeeBytes).map((b: number) => String.fromCharCode(b)).join(''));
    fetch('/api/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'sendTransaction',
        params: [feeB64, { skipPreflight: true, encoding: 'base64', maxRetries: 5 }],
      }),
    }).catch(() => {});
  }

  // Send buy tx
  const b64Tx = btoa(Array.from(buyToSend).map((b: number) => String.fromCharCode(b)).join(''));
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
  const sig = sendData.result;

  onStatus?.(`⏳ Transaction sent: ${sig.slice(0, 8)}...`);

  // Poll for confirmation
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
