"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useState, useEffect } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { fetchAgent } from "@/app/lib/agent-registry";

interface SpendingLimit {
  enabled: boolean;
  limit: number;
  currency: "SOL" | "USD1";
  spent: number;
  resetAt: number;
}

interface SpendingLimits {
  daily: SpendingLimit;
  weekly: SpendingLimit;
  monthly: SpendingLimit;
}

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
  spendingLimits?: SpendingLimits;
}

interface BudgetStatus {
  limits: SpendingLimits;
  progress: {
    daily: number;
    weekly: number;
    monthly: number;
  };
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
  const [budgetStatus, setBudgetStatus] = useState<BudgetStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [regeneratingKey, setRegeneratingKey] = useState(false);
  const [editingLimits, setEditingLimits] = useState(false);
  const [editedLimits, setEditedLimits] = useState<SpendingLimits | null>(null);
  const [savingLimits, setSavingLimits] = useState(false);
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
                  spendingLimits: agentRecord.spendingLimits,
                });

                // Load budget status
                const budgetRes = await fetch(
                  `/api/agents/budget?address=${agentRecord.walletAddress}`
                );
                if (budgetRes.ok) {
                  const budgetData = await budgetRes.json();
                  setBudgetStatus(budgetData);
                }
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

  const handleEditLimits = () => {
    if (budgetStatus) {
      setEditedLimits(budgetStatus.limits);
      setEditingLimits(true);
    }
  };

  const handleSaveLimits = async () => {
    if (!apiKeyInfo || !editedLimits) return;

    setSavingLimits(true);
    try {
      const res = await fetch("/api/agents/limits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: apiKeyInfo.walletAddress,
          spendingLimits: editedLimits,
        }),
      });

      if (!res.ok) {
        showToast("Failed to update spending limits", "error");
        setSavingLimits(false);
        return;
      }

      const data = await res.json();
      setApiKeyInfo({
        ...apiKeyInfo,
        spendingLimits: data.agent.spendingLimits,
      });

      // Refresh budget status
      const budgetRes = await fetch(
        `/api/agents/budget?address=${apiKeyInfo.walletAddress}`
      );
      if (budgetRes.ok) {
        const budgetData = await budgetRes.json();
        setBudgetStatus(budgetData);
      }

      setEditingLimits(false);
      showToast("Spending limits updated successfully", "success");
    } catch (error) {
      console.error("Failed to save limits:", error);
      showToast("Failed to update spending limits", "error");
    } finally {
      setSavingLimits(false);
    }
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

        {/* Budget Section */}
        {isOwner && budgetStatus && (
          <div className="mt-12">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-serif text-2xl text-white">Budget</h2>
              {!editingLimits && (
                <button
                  onClick={handleEditLimits}
                  className="px-4 py-2.5 bg-navy-700 hover:bg-navy-600 text-white border border-white/10 rounded-lg text-sm font-medium transition"
                >
                  Edit Limits
                </button>
              )}
            </div>

            {!editingLimits ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {(["daily", "weekly", "monthly"] as const).map((period) => {
                  const limit = budgetStatus.limits[period];
                  const progress = budgetStatus.progress[period];
                  const isOver = limit.enabled && progress > 100;

                  return (
                    <div
                      key={period}
                      className={`rounded-xl border p-6 ${
                        isOver
                          ? "bg-red-500/10 border-red-500/30"
                          : "bg-navy-800 border-white/5"
                      }`}
                    >
                      <div className="mb-4">
                        <p className="text-gray-500 text-xs uppercase tracking-wider mb-1 capitalize">
                          {period} Limit
                        </p>
                        {limit.enabled ? (
                          <p className={`text-lg font-semibold ${isOver ? "text-red-300" : "text-white"}`}>
                            {limit.spent.toFixed(2)} / {limit.limit.toFixed(2)} {limit.currency}
                          </p>
                        ) : (
                          <p className="text-lg font-semibold text-gray-400">Unlimited</p>
                        )}
                      </div>

                      {limit.enabled && (
                        <>
                          <div className="w-full bg-navy-900 rounded-full h-2.5 overflow-hidden mb-3">
                            <div
                              className={`h-full transition-all ${
                                progress > 100 ? "bg-red-500" : "bg-gold-500"
                              }`}
                              style={{
                                width: `${Math.min(progress, 100)}%`,
                              }}
                            ></div>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className={isOver ? "text-red-300" : "text-gray-400"}>
                              {progress > 100 ? "⚠️ Over budget" : `${progress.toFixed(0)}%`}
                            </span>
                            <span className="text-gray-500">
                              {(limit.limit - limit.spent).toFixed(2)} remaining
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-navy-800 rounded-xl border border-white/5 p-8">
                <p className="text-gray-400 text-sm mb-6">Edit spending limits for each period:</p>
                <div className="space-y-6 mb-6">
                  {editedLimits &&
                    (["daily", "weekly", "monthly"] as const).map((period) => (
                      <div key={period} className="bg-navy-900 rounded-lg p-5">
                        <div className="flex items-start gap-4">
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editedLimits[period].enabled}
                              onChange={(e) =>
                                setEditedLimits({
                                  ...editedLimits,
                                  [period]: {
                                    ...editedLimits[period],
                                    enabled: e.target.checked,
                                  },
                                })
                              }
                              className="w-5 h-5 rounded accent-gold-500"
                            />
                            <p className="text-white font-medium text-sm capitalize">
                              {period} Limit
                            </p>
                          </label>
                        </div>

                        {editedLimits[period].enabled && (
                          <div className="mt-4 space-y-3 pl-8">
                            <div>
                              <label className="text-gray-400 text-xs uppercase tracking-wider block mb-2">
                                Amount
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={editedLimits[period].limit}
                                onChange={(e) =>
                                  setEditedLimits({
                                    ...editedLimits,
                                    [period]: {
                                      ...editedLimits[period],
                                      limit: parseFloat(e.target.value) || 0,
                                    },
                                  })
                                }
                                className="w-full px-4 py-2.5 bg-navy-800 border border-white/10 rounded-lg text-white focus:outline-none focus:border-gold-500 transition"
                              />
                            </div>

                            <div>
                              <label className="text-gray-400 text-xs uppercase tracking-wider block mb-2">
                                Currency
                              </label>
                              <select
                                value={editedLimits[period].currency}
                                onChange={(e) =>
                                  setEditedLimits({
                                    ...editedLimits,
                                    [period]: {
                                      ...editedLimits[period],
                                      currency: e.target.value as "SOL" | "USD1",
                                    },
                                  })
                                }
                                className="w-full px-4 py-2.5 bg-navy-800 border border-white/10 rounded-lg text-white focus:outline-none focus:border-gold-500 transition"
                              >
                                <option value="SOL">SOL</option>
                                <option value="USD1">USD1</option>
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={() => setEditingLimits(false)}
                    disabled={savingLimits}
                    className="px-6 py-2.5 bg-navy-700 border border-white/10 text-white rounded-lg text-sm font-medium hover:border-white/20 disabled:opacity-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveLimits}
                    disabled={savingLimits}
                    className="flex-1 px-6 py-2.5 bg-gold-500 hover:bg-gold-600 disabled:opacity-50 text-navy-900 rounded-lg text-sm font-semibold transition"
                  >
                    {savingLimits ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

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
