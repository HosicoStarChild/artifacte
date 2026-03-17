/**
 * React hook for buying NFTs via M2 direct transaction
 * Pure pass-through — no platform fee, exactly like Tensor
 */

'use client';

import { useCallback, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { buildM2BuyTransaction, fetchListingInfo } from './m2-buy';

export interface M2BuyState {
  loading: boolean;
  error: string | null;
  txSignature: string | null;
}

export function useM2Buy() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [state, setState] = useState<M2BuyState>({
    loading: false,
    error: null,
    txSignature: null,
  });

  const buyNFT = useCallback(async (mintAddress: string) => {
    if (!publicKey) {
      setState({ loading: false, error: 'Wallet not connected', txSignature: null });
      return null;
    }

    setState({ loading: true, error: null, txSignature: null });

    try {
      // 1. Fetch listing info from ME
      const listing = await fetchListingInfo(mintAddress);
      if (!listing) throw new Error('No active listing found');

      // 2. Build transaction (no fee, pass-through)
      const tx = await buildM2BuyTransaction({
        listing,
        buyer: publicKey,
        connection,
      });

      // 3. Set blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      // 4. Send
      const signature = await sendTransaction(tx, connection, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      // 5. Confirm
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

      setState({ loading: false, error: null, txSignature: signature });
      return signature;
    } catch (err: any) {
      setState({ loading: false, error: err?.message || 'Transaction failed', txSignature: null });
      return null;
    }
  }, [publicKey, sendTransaction, connection]);

  return { ...state, buyNFT };
}
