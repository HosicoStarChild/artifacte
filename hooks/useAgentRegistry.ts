'use client';

import { useCallback, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { SolanaSDK, IPFSClient, buildRegistrationFileJson, ServiceType } from '8004-solana';

// mainnet program IDs from 8004
const AGENT_REGISTRY_PROGRAM_ID = '8oo4dC4JvBLwy5tGgiH3WwK4B9PWxL9Z4XjA2jzkQMbQ';
const ATOM_ENGINE_PROGRAM_ID = 'AToMw53aiPQ8j7iHVb4fGt6nzUNxUhcPc3tbPBZuzVVb';

export interface Agent8004Data {
  name: string;
  description: string;
  imageUri: string;
  services: Array<{ type: string; value: string }>;
  skills?: string[];
  domains?: string[];
  owner: PublicKey;
  assetPubkey: PublicKey;
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
 */
export function useAgentRegistry() {
  const wallet = useWallet();
  const { connection } = useConnection();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Get or create the 8004 SDK instance
   */
  const getSDK = useCallback(async (signerRequired: boolean = false) => {
    if (signerRequired && !wallet.publicKey) {
      throw new Error('Wallet not connected');
    }

    // Initialize IPFS client (optional - for production add Pinata JWT)
    const ipfs = new IPFSClient({
      pinataEnabled: false, // Set to true and add JWT for production
    });

    // If wallet is connected, create SDK with signer
    if (wallet.publicKey && wallet.signMessage && signerRequired) {
      // For browser wallet, we use the SignerWalletAdapter pattern
      const sdk = new SolanaSDK({
        connection,
        wallet: wallet as any, // Solana wallet adapters are compatible
        ipfsClient: ipfs,
      });
      return sdk;
    }

    // Read-only SDK without signer
    const sdk = new SolanaSDK({
      connection,
      ipfsClient: ipfs,
    });

    return sdk;
  }, [wallet, connection]);

  /**
   * Register a new agent on 8004
   */
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

        if (!wallet.publicKey) {
          throw new Error('Wallet not connected');
        }

        const sdk = await getSDK(true);

        // Build metadata JSON
        const metadata = buildRegistrationFileJson({
          name,
          description,
          image: imageUri,
          services,
          skills: skills || [],
          domains: domains || [],
        });

        // Upload metadata to IPFS
        const cid = await (sdk as any).ipfsClient.addJson(metadata);

        // Register agent on chain
        const result = await (sdk as any).registerAgent(`ipfs://${cid}`, {
          collectionPointer: collectionPointer || undefined,
        });

        return result.asset.toBase58();
      } catch (err: any) {
        const errorMsg = err?.message || 'Failed to register agent';
        setError(errorMsg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [wallet.publicKey, getSDK]
  );

  /**
   * Load agent data from 8004
   */
  const loadAgent = useCallback(
    async (assetPubkey: PublicKey | string): Promise<Agent8004Data | null> => {
      try {
        setLoading(true);
        setError(null);

        const sdk = await getSDK(false);
        const assetKey =
          typeof assetPubkey === 'string' ? new PublicKey(assetPubkey) : assetPubkey;

        const agent = await (sdk as any).loadAgent(assetKey);

        if (!agent) {
          return null;
        }

        return {
          name: agent.nft_name || '',
          description: agent.description || '',
          imageUri: agent.image_uri || '',
          services: agent.services || [],
          skills: agent.skills,
          domains: agent.domains,
          owner: agent.getOwnerPublicKey(),
          assetPubkey: assetKey,
        };
      } catch (err: any) {
        const errorMsg = err?.message || 'Failed to load agent';
        setError(errorMsg);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [getSDK]
  );

  /**
   * Set the operational wallet for an agent
   */
  const setAgentWallet = useCallback(
    async (assetPubkey: PublicKey | string, newWallet: PublicKey): Promise<void> => {
      try {
        setLoading(true);
        setError(null);

        const sdk = await getSDK(true);
        const assetKey =
          typeof assetPubkey === 'string' ? new PublicKey(assetPubkey) : assetPubkey;

        await (sdk as any).setAgentWallet(assetKey, newWallet);
      } catch (err: any) {
        const errorMsg = err?.message || 'Failed to set agent wallet';
        setError(errorMsg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [getSDK]
  );

  /**
   * Give feedback/reputation to an agent
   */
  const giveFeedback = useCallback(
    async (
      assetPubkey: PublicKey | string,
      feedback: ReputableFeedback
    ): Promise<void> => {
      try {
        setLoading(true);
        setError(null);

        const sdk = await getSDK(true);
        const assetKey =
          typeof assetPubkey === 'string' ? new PublicKey(assetPubkey) : assetPubkey;

        await (sdk as any).giveFeedback(assetKey, feedback);
      } catch (err: any) {
        const errorMsg = err?.message || 'Failed to give feedback';
        setError(errorMsg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [getSDK]
  );

  /**
   * Get reputation summary for an agent
   */
  const getSummary = useCallback(
    async (assetPubkey: PublicKey | string): Promise<ReputationSummary | null> => {
      try {
        setLoading(true);
        setError(null);

        const sdk = await getSDK(false);
        const assetKey =
          typeof assetPubkey === 'string' ? new PublicKey(assetPubkey) : assetPubkey;

        const summary = await (sdk as any).getSummary(assetKey);

        if (!summary) {
          return null;
        }

        return {
          averageScore: parseFloat(summary.averageScore || '0'),
          totalFeedbacks: summary.totalFeedbacks || 0,
          trustTier: summary.trustTier,
        };
      } catch (err: any) {
        const errorMsg = err?.message || 'Failed to get reputation summary';
        setError(errorMsg);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [getSDK]
  );

  /**
   * Get all agents from the registry (reads from on-chain)
   */
  const getAllAgents = useCallback(async (): Promise<Agent8004Data[]> => {
    try {
      setLoading(true);
      setError(null);

      const sdk = await getSDK(false);
      const agents = await (sdk as any).getAllAgents();

      return (agents || []).map((agent: any) => ({
        name: agent.nft_name || '',
        description: agent.description || '',
        imageUri: agent.image_uri || '',
        services: agent.services || [],
        skills: agent.skills,
        domains: agent.domains,
        owner: agent.getOwnerPublicKey(),
        assetPubkey: agent.asset,
      }));
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to fetch agents';
      setError(errorMsg);
      return [];
    } finally {
      setLoading(false);
    }
  }, [getSDK]);

  /**
   * Get agents in a specific collection
   */
  const getCollectionAgents = useCallback(
    async (collectionPointer: string): Promise<Agent8004Data[]> => {
      try {
        setLoading(true);
        setError(null);

        const sdk = await getSDK(false);
        const agents = await (sdk as any).getCollectionAgents(collectionPointer);

        return (agents || []).map((agent: any) => ({
          name: agent.nft_name || '',
          description: agent.description || '',
          imageUri: agent.image_uri || '',
          services: agent.services || [],
          skills: agent.skills,
          domains: agent.domains,
          owner: agent.getOwnerPublicKey(),
          assetPubkey: agent.asset,
        }));
      } catch (err: any) {
        const errorMsg = err?.message || 'Failed to fetch collection agents';
        setError(errorMsg);
        return [];
      } finally {
        setLoading(false);
      }
    },
    [getSDK]
  );

  return {
    registerAgent,
    loadAgent,
    setAgentWallet,
    giveFeedback,
    getSummary,
    getAllAgents,
    getCollectionAgents,
    loading,
    error,
    connected: wallet.connected,
    publicKey: wallet.publicKey,
  };
}
