/**
 * Shared Tensor cNFT buy flow — used by both category grid and card detail pages.
 *
 * Strategy:
 * - Solflare: sendTransaction (wallet handles submission natively — balance preview, reliable)
 * - Phantom + others: signTransaction + manual send via the RPC proxy (we own the submission — reliable)
 */

import { createSolanaRpc, signature } from '@solana/kit';
import type { SendTransactionOptions } from '@solana/wallet-adapter-base';
import { Connection, VersionedTransaction } from '@solana/web3.js';

import type { AnchorWalletLike } from '@/hooks/useWalletCapabilities';
import { isTransactionRequestRejected } from '@/lib/client/transaction-errors';
import { shouldUseTensorWalletSendTransaction } from '@/lib/tensor-buy-strategy';

type WalletSignTransaction = AnchorWalletLike['signTransaction'];
type WalletSendTransaction = (
  transaction: VersionedTransaction,
  connection: Connection,
  options?: SendTransactionOptions,
) => Promise<string>;

interface TensorBuyFeeContext {
  collectionAddress?: string;
  collectionName?: string;
  source?: string;
}

interface TensorBuyBuildResponse {
  tx: string;
  price: number;
  platformFee?: number;
  platformFeeCurrency?: string;
}

interface TensorBuyErrorResponse {
  error?: string;
}

interface TensorBuyResult {
  sig: string;
  price: number;
  totalPrice: number;
  currency: string;
  confirmed: boolean;
}

interface RpcSignatureStatus {
  confirmationStatus?: 'processed' | 'confirmed' | 'finalized' | null;
  err?: object | string | null;
}

const RPC_PROXY_PATH = '/api/rpc';
const rpc = createSolanaRpc(RPC_PROXY_PATH);

type WireTransactionBase64 = Parameters<typeof rpc.sendTransaction>[0];

function getTensorBuyHostname(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.location.hostname;
}

export async function executeTensorBuy(
  mint: string,
  buyer: string,
  signTransaction: WalletSignTransaction,
  onStatus?: (msg: string) => void,
  sendTransaction?: WalletSendTransaction,
  walletName?: string,
  feeContext?: TensorBuyFeeContext,
  hideFeeInToast = false,
): Promise<TensorBuyResult> {
  const tensorRes = await fetch('/api/tensor-buy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mint, buyer, ...feeContext }),
  });

  if (!tensorRes.ok) {
    let errorMessage = 'Failed to build Tensor transaction';

    try {
      const errorPayload: TensorBuyErrorResponse = await tensorRes.json();
      errorMessage = errorPayload.error ?? errorMessage;
    } catch {}

    throw new Error(errorMessage);
  }

  const tensorData: TensorBuyBuildResponse = await tensorRes.json();
  const feeCurrency = tensorData.platformFeeCurrency ?? 'USDC';
  const platformFee = tensorData.platformFee ?? 0;
  const totalPrice = Number(tensorData.price) + Number(platformFee);
  const feeDisplay = platformFee > 0 ? ` + $${platformFee.toFixed(2)} ${feeCurrency} fee` : '';
  onStatus?.(`💳 Confirm purchase — ${hideFeeInToast ? totalPrice : tensorData.price} ${feeCurrency}${hideFeeInToast ? '' : feeDisplay}`);

  const txBytes = Uint8Array.from(atob(tensorData.tx), (c: string) => c.charCodeAt(0));
  const tx = VersionedTransaction.deserialize(txBytes);

  let sig = '';

  // Solflare: use sendTransaction — wallet submits natively with balance preview
  // Phantom + all others: use signTransaction + manual RPC submission
  const hostname = getTensorBuyHostname();
  const shouldUseWalletSendTransaction = shouldUseTensorWalletSendTransaction(walletName, hostname);
  let usedSendTransaction = false;

  if (shouldUseWalletSendTransaction && sendTransaction) {
    const connection = createProxyConnection();

    try {
      sig = await sendTransaction(tx, connection, {
        skipPreflight: true,
        preflightCommitment: 'confirmed',
      });
      usedSendTransaction = true;
      console.log('[tensor-buy] Solflare: sendTransaction used');
    } catch (error) {
      if (isTransactionRequestRejected(error)) {
        throw error;
      }

      const fallbackMessage = error instanceof Error ? error.message : 'Unknown sendTransaction failure';
      console.log('[tensor-buy] Solflare sendTransaction failed, falling back:', fallbackMessage);
    }
  } else if (sendTransaction && walletName?.toLowerCase().includes('solflare')) {
    console.log(`[tensor-buy] Solflare localhost detected (${hostname || 'unknown host'}), using signTransaction + proxy send`);
  }

  if (!usedSendTransaction) {
    // Phantom + fallback: signTransaction + manual RPC send — we own the submission
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

    sig = await sendViaProxy(txToSend);
  }

  if (!sig) {
    throw new Error('Failed to submit Tensor transaction');
  }

  onStatus?.(`⏳ Transaction sent: ${sig.slice(0, 8)}...`);

  const confirmed = await waitForTransactionConfirmation(sig);

  if (confirmed) {
    fetch('/api/listing-sold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mint }),
    }).catch(() => {});
  }

  return { sig, price: tensorData.price, totalPrice, currency: feeCurrency, confirmed };
}

function createProxyConnection(): Connection {
  if (typeof window === 'undefined') {
    throw new Error('Tensor buy client must run in the browser');
  }

  return new Connection(new URL(RPC_PROXY_PATH, window.location.origin).toString(), 'confirmed');
}

function toWireTransactionBase64(base64Transaction: string): WireTransactionBase64 {
  return base64Transaction as WireTransactionBase64;
}

function encodeBase64Transaction(rawTransactionBytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < rawTransactionBytes.length; index += chunkSize) {
    const chunk = rawTransactionBytes.subarray(index, index + chunkSize);

    for (let chunkIndex = 0; chunkIndex < chunk.length; chunkIndex += 1) {
      binary += String.fromCharCode(chunk[chunkIndex] ?? 0);
    }
  }

  return btoa(binary);
}

async function sendViaProxy(rawTransactionBytes: Uint8Array): Promise<string> {
  const encodedTransaction = encodeBase64Transaction(rawTransactionBytes);
  const signatureValue = await rpc
    .sendTransaction(toWireTransactionBase64(encodedTransaction), {
      skipPreflight: true,
      encoding: 'base64',
      maxRetries: BigInt(5),
    })
    .send();

  return `${signatureValue}`;
}

function isConfirmedStatus(status: RpcSignatureStatus | null | undefined): boolean {
  return status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized';
}

async function waitForTransactionConfirmation(signatureValue: string): Promise<boolean> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const statusResponse = await rpc.getSignatureStatuses([signature(signatureValue)]).send();
    const status = (statusResponse.value[0] ?? null) as RpcSignatureStatus | null;

    if (status?.err) {
      throw new Error('Transaction failed on-chain');
    }

    if (isConfirmedStatus(status)) {
      return true;
    }
  }

  return false;
}
