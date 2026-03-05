"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useState, useEffect } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { fetchAgent } from "@/app/lib/agent-registry";

interface Agent {
  address: string;
  name: string;
  ownerWallet: string;
  avatarImage: string;
  permissions: ("Trade" | "Bid" | "Chat")[];
  createdDate: string;
}

interface ApiKeyInfo {
  walletAddress: string;
  agentName: string;
  nftMint: string;
  permissions: {
    Trade: boolean;
    Bid: boolean;
    Chat: boolean;
  };
  connectionStatus: "connected" | "disconnected";
}

const permissionColors: Record<string, string> = {
  Trade: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  Bid: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  Chat: "bg-green-500/20 text-green-300 border-green-500/30",
};

export default function AgentProfilePage() {
  const params = useParams();
  const { publicKey } = useWallet();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [apiKeyInfo, setApiKeyInfo] = useState<ApiKeyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [regeneratingKey, setRegeneratingKey] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const address = params.address as string;
  const isOwner = publicKey && apiKeyInfo && publicKey.toBase58() === apiKeyInfo.walletAddress;

  useEffect(() => {
    async function loadAgent() {
      try {
        setLoading(true);
        const connection = new Connection("https://api.devnet.solana.com", "confirmed");
        
        try {
          const ownerPubkey = new PublicKey(address);
          const agentData = await fetchAgent(connection, ownerPubkey);

          if (agentData) {
            const permissions: ("Trade" | "Bid" | "Chat")[] = [];
            if (agentData.canTrade) permissions.push("Trade");
            if (agentData.canBid) permissions.push("Bid");
            if (agentData.canChat) permissions.push("Chat");

            setAgent({
              address: agentData.address,
              name: agentData.name,
              ownerWallet: agentData.owner.toBase58(),
              avatarImage: `https://picsum.photos/400/400?seed=${agentData.address}`,
              permissions,
              createdDate: new Date(agentData.createdAt * 1000).toISOString().split("T")[0],
            });

            // Load API key info if this is the owner
            if (publicKey && publicKey.toBase58() === agentData.owner.toBase58()) {
              const apiRes = await fetch("/api/agents");
              const apiData = await apiRes.json();
              const agentRecord = apiData.agents?.find(
                (a: any) => a.walletAddress === agentData.owner.toBase58()
              );
              if (agentRecord) {
                setApiKeyInfo({
                  walletAddress: agentRecord.walletAddress,
                  agentName: agentRecord.agentName,
                  nftMint: agentRecord.nftMint,
                  permissions: agentRecord.permissions,
                  connectionStatus: agentRecord.connectionStatus,
                });
              }
            }
          } else {
            setAgent(null);
          }
        } catch (e) {
          console.error("Failed to fetch agent:", e);
          setAgent(null);
        }
      } finally {
        setLoading(false);
      }
    }

    if (address) {
      loadAgent();
    }
  }, [address, publicKey]);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const handleRegenerateApiKey = async () => {
    if (!isOwner) return;
    
    setRegeneratingKey(true);
    try {
      const res = await fetch("/api/agents/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: apiKeyInfo!.walletAddress }),
      });

      if (!res.ok) {
        showToast("Failed to regenerate API key", "error");
        return;
      }

      const data = await res.json();
      setApiKeyInfo({
        walletAddress: data.agent.walletAddress,
        agentName: data.agent.agentName,
        nftMint: data.agent.nftMint,
        permissions: data.agent.permissions,
        connectionStatus: data.agent.connectionStatus,
      });
      showToast("API key regenerated successfully", "success");
      setShowApiKey(true);
    } catch (error) {
      console.error("Failed to regenerate API key:", error);
      showToast("Failed to regenerate API key", "error");
    } finally {
      setRegeneratingKey(false);
    }
  };

  if (loading) {
    return (
      <div className="pt-24 pb-20 min-h-screen">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            href="/agents"
            className="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-8 inline-block hover:text-gold-500 transition"
          >
            ← Back to Agents
          </Link>
          <div className="text-center py-24">
            <div className="w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-400 text-sm">Loading agent...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="pt-24 pb-20 min-h-screen">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            href="/agents"
            className="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-8 inline-block hover:text-gold-500 transition"
          >
            ← Back to Agents
          </Link>
          <div className="text-center py-24">
            <p className="text-gray-400 text-sm">Agent not found</p>
          </div>
        </div>
      </div>
    );
  }

  const truncatedWallet = `${agent.ownerWallet.slice(0, 8)}...${agent.ownerWallet.slice(-8)}`;

  return (
    <div className="pt-24 pb-20 min-h-screen">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-20 right-4 z-50 px-5 py-3 rounded-lg shadow-lg text-sm font-medium transition-all ${
            toast.type === "success"
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Back Link */}
        <Link
          href="/agents"
          className="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-8 inline-block hover:text-gold-500 transition"
        >
          ← Back to Agents
        </Link>

        {/* Main Profile Card */}
        <div className="bg-navy-800 rounded-2xl border border-white/5 overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-8">
            {/* Avatar Section */}
            <div className="flex flex-col items-center">
              <div className="w-full max-w-xs aspect-square rounded-xl overflow-hidden mb-6 border border-white/10">
                <img
                  src={agent.avatarImage}
                  alt={agent.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'%3E%3Crect fill='%230f1628' width='400' height='400'/%3E%3Ctext x='50%' y='50%' font-size='80' fill='%23c9952c' text-anchor='middle' dominant-baseline='middle'%3E🤖%3C/text%3E%3C/svg%3E";
                  }}
                />
              </div>

              {/* Stats */}
              <div className="w-full grid grid-cols-3 gap-4 mb-6">
                <div className="text-center bg-navy-900 rounded-lg p-4">
                  <p className="text-gray-500 text-xs uppercase tracking-wider">Trades</p>
                  <p className="text-white font-bold text-xl mt-1">24</p>
                </div>
                <div className="text-center bg-navy-900 rounded-lg p-4">
                  <p className="text-gray-500 text-xs uppercase tracking-wider">Bids</p>
                  <p className="text-white font-bold text-xl mt-1">12</p>
                </div>
                <div className="text-center bg-navy-900 rounded-lg p-4">
                  <p className="text-gray-500 text-xs uppercase tracking-wider">Success</p>
                  <p className="text-white font-bold text-xl mt-1">95%</p>
                </div>
              </div>

              {/* Edit Button */}
              {isOwner && (
                <button className="w-full px-6 py-2.5 bg-gold-500 hover:bg-gold-600 text-navy-900 rounded-lg text-sm font-semibold transition">
                  Edit Agent
                </button>
              )}
            </div>

            {/* Info Section */}
            <div>
              <h1 className="font-serif text-4xl text-white mb-2">{agent.name}</h1>

              {/* Owner */}
              <div className="mb-6">
                <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">
                  Owner Wallet
                </p>
                <p className="text-white font-mono text-sm break-all">
                  {truncatedWallet}
                </p>
              </div>

              {/* Created Date */}
              <div className="mb-6">
                <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">
                  Created
                </p>
                <p className="text-white">
                  {new Date(agent.createdDate).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>

              {/* Permissions */}
              <div className="mb-6">
                <p className="text-gray-500 text-xs uppercase tracking-wider mb-3">
                  Permissions
                </p>
                <div className="flex flex-wrap gap-2">
                  {agent.permissions.map((perm) => (
                    <span
                      key={perm}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium border ${
                        permissionColors[perm]
                      }`}
                    >
                      {perm}
                    </span>
                  ))}
                </div>
              </div>

              {/* Connection Status */}
              {apiKeyInfo && (
                <div className="bg-navy-900 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${
                        apiKeyInfo.connectionStatus === "connected"
                          ? "bg-green-500"
                          : "bg-gray-500"
                      }`}
                    ></div>
                    <span
                      className={
                        apiKeyInfo.connectionStatus === "connected"
                          ? "text-green-400 text-sm font-medium"
                          : "text-gray-400 text-sm font-medium"
                      }
                    >
                      {apiKeyInfo.connectionStatus === "connected"
                        ? "Connected to MCP Server"
                        : "Not Connected"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* API Key Section (Owner Only) */}
        {isOwner && apiKeyInfo && (
          <div className="mt-12">
            <h2 className="font-serif text-2xl text-white mb-6">API Key Management</h2>
            <div className="bg-navy-800 rounded-xl border border-white/5 p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">
                    API Key Status
                  </p>
                  <p className="text-white text-lg font-semibold">
                    {showApiKey ? "Visible" : "Hidden for Security"}
                  </p>
                </div>
                <button
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="px-4 py-2.5 bg-navy-700 hover:bg-navy-600 text-white border border-white/10 rounded-lg text-sm font-medium transition"
                >
                  {showApiKey ? "Hide" : "Show"}
                </button>
              </div>

              {showApiKey && apiKeyInfo && (
                <>
                  <div className="bg-navy-900 rounded-lg border border-white/5 p-4 mb-6 font-mono text-sm text-gray-300 overflow-x-auto break-all">
                    <span className="text-gray-500">(API key is stored securely and hidden for security)</span>
                  </div>

                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-6">
                    <p className="text-amber-200 text-xs">
                      ⚠️ Store your API key securely. Never share it publicly or commit it to version control.
                    </p>
                  </div>
                </>
              )}

              <div className="space-y-3">
                <div className="bg-navy-900 rounded-lg p-4">
                  <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">How to Connect</p>
                  <p className="text-gray-300 text-sm">
                    Use your API key to authenticate with the MCP server. Include it in your agent configuration 
                    to enable trading, bidding, and other operations on Artifacte.
                  </p>
                </div>

                <button
                  onClick={handleRegenerateApiKey}
                  disabled={regeneratingKey}
                  className="w-full px-6 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition"
                >
                  {regeneratingKey ? "Regenerating..." : "Regenerate API Key"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Activity Feed */}
        <div className="mt-12">
          <h2 className="font-serif text-2xl text-white mb-6">Activity Feed</h2>
          <div className="bg-navy-800 rounded-xl border border-white/5 p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-navy-900 flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <p className="text-gray-400 text-sm">No activity yet</p>
            <p className="text-gray-600 text-xs mt-2">
              Agent activity will appear here once it starts executing actions
            </p>
          </div>
        </div>

        {/* Agent Details */}
        <div className="mt-12">
          <h2 className="font-serif text-2xl text-white mb-6">Agent Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-navy-800 rounded-xl border border-white/5 p-6">
              <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">
                Agent Address
              </p>
              <p className="text-white font-mono text-sm break-all">{agent.address}</p>
            </div>
            <div className="bg-navy-800 rounded-xl border border-white/5 p-6">
              <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">
                Status
              </p>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <p className="text-white">Active</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
