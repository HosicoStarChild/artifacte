'use client';

import { useCallback, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';

// 8004-solana uses node:fs — can't import directly in client code
// All SDK calls go through API routes (server-side)

const AGENT_REGISTRY_PROGRAM_ID = '8oo4dC4JvBLwy5tGgiH3WwK4B9PWxL9Z4XjA2jzkQMbQ';
const ATOM_ENGINE_PROGRAM_ID = 'AToMw53aiPQ8j7iHVb4fGt6nzUNxUhcPc3tbPBZuzVVb';

export interface Agent8004Data {
  name: string;
  description: string;
  imageUri: string;
  services: Array<{ type: string; value: string }>;
  skills?: string[];
  domains?: string[];
  owner: string;
  assetPubkey: string;
  reputationScore?: number;
  totalFeedbacks?: number;
  trustTier?: number;
}

export interface ReputableFeedback {
  value: string;
  tag1?: string;
  tag2?: string;
  feedbackUri?: string;
}

export interface ReputationSummary {
  averageScore: number;
  totalFeedbacks: number;
  trustTier?: number;
}

/**
 * Hook for interacting with the ERC-8004 Solana Agent Registry
 * SDK calls proxied through /api/agents/8004 routes (server-side only)
 */
export function useAgentRegistry() {
  const wallet = useWallet();
  const { connection } = useConnection();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const registerAgent = useCallback(
    async (
      name: string,
      description: string,
      imageUri: string,
      services: Array<{ type: string; value: string }>,
      collectionPointer?: string,
      skills?: string[],
      domains?: string[]
    ): Promise<string> => {
      try {
        setLoading(true);
        setError(null);

        if (!wallet.publicKey) throw new Error('Wallet not connected');

        const res = await fetch('/api/agents/8004/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name, description, imageUri, services,
            collectionPointer, skills, domains,
            owner: wallet.publicKey.toBase58(),
          }),
        });

        if (!res.ok) throw new Error((await res.json()).error || 'Registration failed');
        const data = await res.json();
        return data.assetAddress;
      } catch (err: any) {
        setError(err?.message || 'Failed to register agent');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [wallet.publicKey]
  );

  const loadAgent = useCallback(
    async (assetPubkey: string): Promise<Agent8004Data | null> => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/agents/8004/load?asset=${assetPubkey}`);
        if (!res.ok) return null;
        return await res.json();
      } catch (err: any) {
        setError(err?.message || 'Failed to load agent');
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const giveFeedback = useCallback(
    async (assetPubkey: string, feedback: ReputableFeedback): Promise<void> => {
      try {
        setLoading(true);
        setError(null);

        if (!wallet.publicKey) throw new Error('Wallet not connected');

        const res = await fetch('/api/agents/8004/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assetPubkey, feedback, signer: wallet.publicKey.toBase58() }),
        });

        if (!res.ok) throw new Error((await res.json()).error || 'Feedback failed');
      } catch (err: any) {
        setError(err?.message || 'Failed to give feedback');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [wallet.publicKey]
  );

  const getSummary = useCallback(
    async (assetPubkey: string): Promise<ReputationSummary | null> => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/agents/8004/reputation?asset=${assetPubkey}`);
        if (!res.ok) return null;
        return await res.json();
      } catch (err: any) {
        setError(err?.message || 'Failed to get reputation');
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const getCollectionAgents = useCallback(
    async (collectionPointer?: string): Promise<Agent8004Data[]> => {
      try {
        setLoading(true);
        setError(null);

        const params = collectionPointer ? `?collection=${collectionPointer}` : '';
        const res = await fetch(`/api/agents/8004/list${params}`);
        if (!res.ok) return [];
        const data = await res.json();
        return data.agents || [];
      } catch (err: any) {
        setError(err?.message || 'Failed to fetch agents');
        return [];
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    registerAgent,
    loadAgent,
    giveFeedback,
    getSummary,
    getCollectionAgents,
    loading,
    error,
    connected: wallet.connected,
    publicKey: wallet.publicKey,
  };
}
