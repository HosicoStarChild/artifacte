/**
 * Shared Tensor cNFT buy flow — used by both category grid and card detail pages.
 * 
 * 1. Calls /api/tensor-buy to get server-built v0 tx (with ALT)
 * 2. Wallet signs (may inflate ALT references)
 * 3. Patches signature into original compact tx if inflated
 * 4. Sends via /api/rpc proxy
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

  // Step 2: Deserialize buy tx and fee tx
  const txBytes = Uint8Array.from(atob(tensorData.tx), (c: string) => c.charCodeAt(0));
  const buyTx = VersionedTransaction.deserialize(txBytes);

  // Step 3: Sign buy tx
  const signedBuy = await signTransaction(buyTx);
  let buyToSend = signedBuy.serialize();
  if (buyToSend.length > 1232) {
    // Wallet inflated ALT — patch signature into original compact tx
    const inflated = VersionedTransaction.deserialize(buyToSend);
    const patched = new Uint8Array(txBytes);
    patched.set(inflated.signatures[0], 2);
    buyToSend = patched;
  }

  // Step 4: Send buy tx via RPC proxy (fee included in same tx via ALT)
  const b64Tx = btoa(Array.from(new Uint8Array(buyToSend)).map((b: number) => String.fromCharCode(b)).join(''));
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

  // Step 5: Poll for confirmation (1s intervals for faster UX)
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
