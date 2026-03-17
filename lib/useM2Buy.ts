/**
 * React hook for buying NFTs via M2 direct transaction
 * Used on digital collectibles pages
 */

'use client';

import { useCallback, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  buildM2BuyTransaction,
  fetchListingInfo,
  calculatePlatformFee,
  ARTIFACTE_TREASURY,
} from './m2-buy';

export interface M2BuyState {
  loading: boolean;
  error: string | null;
  txSignature: string | null;
}

export function useM2Buy() {
  const { connection } = useConnection();
  const { publicKey, signTransaction, sendTransaction } = useWallet();
  const [state, setState] = useState<M2BuyState>({
    loading: false,
    error: null,
    txSignature: null,
  });

  const buyNFT = useCallback(async (
    mintAddress: string,
    /** Optional: override platform fee basis points (default 200 = 2%) */
    feeBp: number = 200,
  ) => {
    if (!publicKey || !signTransaction) {
      setState({ loading: false, error: 'Wallet not connected', txSignature: null });
      return null;
    }

    setState({ loading: true, error: null, txSignature: null });

    try {
      // 1. Fetch listing info from ME
      const listing = await fetchListingInfo(mintAddress);
      if (!listing) {
        throw new Error('No active listing found for this NFT');
      }

      // 2. Calculate platform fee
      const platformFee = calculatePlatformFee(listing.priceLamports, feeBp);

      // 3. Build transaction
      const tx = await buildM2BuyTransaction({
        listing,
        buyer: publicKey,
        connection,
        buyerReferral: ARTIFACTE_TREASURY,
        platformFeeLamports: platformFee,
      });

      // 4. Get recent blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      // 5. Send transaction (wallet adapter handles signing)
      const signature = await sendTransaction(tx, connection, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      // 6. Confirm
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');

      setState({ loading: false, error: null, txSignature: signature });
      return signature;

    } catch (err: any) {
      const msg = err?.message || 'Transaction failed';
      setState({ loading: false, error: msg, txSignature: null });
      return null;
    }
  }, [publicKey, signTransaction, sendTransaction, connection]);

  return { ...state, buyNFT };
}
