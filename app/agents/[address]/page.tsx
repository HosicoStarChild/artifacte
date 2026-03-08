"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useState, useEffect } from "react";
import { PublicKey } from "@solana/web3.js";
import { useAgentRegistry } from "@/hooks/useAgentRegistry";

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
  description: string;
  ownerWallet: string;
  avatarImage: string;
  services: Array<{ type: string; value: string }>;
  reputation: number;
  totalFeedbacks: number;
  createdDate: string;
}

interface ApiKeyInfo {
  walletAddress: string;
  agentName: string;
  nftMint: string;
  agentAssetAddress?: string;
  permissions: {
    Trade: boolean;
    Bid: boolean;
    Chat: boolean;
  };
  categories: string[];
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

export default function AgentProfilePage() {
  const params = useParams();
  const { publicKey } = useWallet();
  const { loadAgent, getSummary, giveFeedback } = useAgentRegistry();

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
  const [feedbackScore, setFeedbackScore] = useState(5);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const address = params.address as string;
  const isOwner = publicKey && apiKeyInfo && publicKey.toBase58() === apiKeyInfo.walletAddress;

  useEffect(() => {
    async function loadAgentData() {
      try {
        setLoading(true);

        // Load agent from 8004
        const agentData = await loadAgent(address);

        if (agentData) {
          // Fetch reputation from ATOM engine
          let reputationScore = 0;
          let totalFeedbacks = 0;
          try {
            const summary = await getSummary(agentData.assetPubkey);
            if (summary) {
              reputationScore = summary.averageScore;
              totalFeedbacks = summary.totalFeedbacks;
            }
          } catch (e) {
            console.error("Failed to fetch reputation:", e);
          }

          setAgent({
            address: agentData.assetPubkey.toBase58(),
            name: agentData.name,
            description: agentData.description,
            ownerWallet: agentData.owner.toBase58(),
            avatarImage: agentData.imageUri || `https://picsum.photos/400/400?seed=${address}`,
            services: agentData.services,
            reputation: reputationScore,
            totalFeedbacks,
            createdDate: new Date().toISOString().split("T")[0],
          });

          // Load API key info if this is the owner
          if (publicKey && publicKey.toBase58() === agentData.owner.toBase58()) {
            const apiRes = await fetch("/api/agents");
            const apiData = await apiRes.json();
            const agentRecord = apiData.agents?.find(
              (a: any) => a.agentAssetAddress === address
            );
            if (agentRecord) {
              setApiKeyInfo({
                walletAddress: agentRecord.walletAddress,
                agentName: agentRecord.agentName,
                nftMint: agentRecord.nftMint,
                agentAssetAddress: agentRecord.agentAssetAddress,
                permissions: agentRecord.permissions,
                categories: agentRecord.categories || [],
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
      } catch (error) {
        console.error("Failed to fetch agent:", error);
        setAgent(null);
      } finally {
        setLoading(false);
      }
    }

    if (address) {
      loadAgentData();
    }
  }, [address, publicKey, loadAgent, getSummary]);

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
        agentAssetAddress: data.agent.agentAssetAddress,
        permissions: data.agent.permissions,
        categories: data.agent.categories || [],
        connectionStatus: data.agent.connectionStatus,
        spendingLimits: data.agent.spendingLimits,
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

  const handleGiveFeedback = async () => {
    if (!publicKey || !agent) {
      showToast("Please connect your wallet", "error");
      return;
    }

    setSubmittingFeedback(true);
    try {
      await giveFeedback(agent.address, {
        value: feedbackScore.toString(),
        tag1: "quality",
        tag2: "feedback",
      });

      showToast("Feedback submitted successfully", "success");
      setFeedbackScore(5);

      // Refresh reputation
      const summary = await getSummary(agent.address);
      if (summary && agent) {
        setAgent({
          ...agent,
          reputation: summary.averageScore,
          totalFeedbacks: summary.totalFeedbacks,
        });
      }
    } catch (error: any) {
      console.error("Failed to submit feedback:", error);
      showToast(error?.message || "Failed to submit feedback", "error");
    } finally {
      setSubmittingFeedback(false);
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Profile Card */}
          <div className="lg:col-span-1">
            <div className="bg-dark-800 rounded-xl border border-white/5 overflow-hidden sticky top-32">
              {/* Avatar */}
              <div className="aspect-square overflow-hidden bg-dark-900">
                <img
                  src={agent.avatarImage}
                  alt={agent.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Crect fill='%23141419' width='200' height='200'/%3E%3Ctext x='50%' y='50%' font-size='40' fill='%23C9A55C' text-anchor='middle' dominant-baseline='middle'%3E🤖%3C/text%3E%3C/svg%3E";
                  }}
                />
              </div>

              {/* Info */}
              <div className="p-6">
                <h1 className="font-serif text-2xl text-white">{agent.name}</h1>
                <p className="text-gray-500 text-xs font-mono mt-3 break-all">
                  {agent.address}
                </p>

                {/* 8004 Link */}
                <a
                  href={`https://8004scan.io/agents/${agent.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-4 px-4 py-2 bg-gold-500/20 hover:bg-gold-500/30 border border-gold-500/30 text-gold-300 rounded-lg text-xs font-medium transition"
                >
                  View on 8004scan ↗
                </a>

                {/* Stats */}
                <div className="space-y-3 mt-6 pt-6 border-t border-white/5">
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">
                      Reputation
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold text-gold-400">
                        {agent.reputation.toFixed(1)}
                      </span>
                      <span className="text-gray-500 text-sm">
                        ({agent.totalFeedbacks} feedbacks)
                      </span>
                    </div>
                  </div>

                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">
                      Owner
                    </p>
                    <p className="text-white font-mono text-xs">{truncatedWallet}</p>
                  </div>
                </div>

                {/* Services */}
                {agent.services && agent.services.length > 0 && (
                  <div className="space-y-3 mt-6 pt-6 border-t border-white/5">
                    <p className="text-gray-500 text-xs uppercase tracking-wider">
                      Services
                    </p>
                    {agent.services.map((svc, idx) => (
                      <div key={idx} className="text-xs">
                        <p className="text-gray-400 uppercase">{svc.type}</p>
                        <p className="text-gold-300 break-all text-xs mt-1 font-mono">
                          {svc.value}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Details & Owner Controls */}
          <div className="lg:col-span-2 space-y-6">
            {/* Description */}
            {agent.description && (
              <div className="bg-dark-800 rounded-xl border border-white/5 p-6">
                <h2 className="text-white font-serif text-lg mb-3">About</h2>
                <p className="text-gray-400 text-sm leading-relaxed">{agent.description}</p>
              </div>
            )}

            {/* Reputation Section */}
            <div className="bg-dark-800 rounded-xl border border-white/5 p-6">
              <h2 className="text-white font-serif text-lg mb-4">Reputation & Feedback</h2>

              <div className="space-y-4">
                <div className="p-4 bg-dark-900 rounded-lg border border-white/5">
                  <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">
                    Score
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="text-3xl font-bold text-gold-400">
                      {agent.reputation.toFixed(1)}
                    </div>
                    <div className="flex-1">
                      <div className="w-full bg-dark-800 rounded-full h-2 mb-1">
                        <div
                          className="bg-gradient-to-r from-gold-500 to-gold-400 h-2 rounded-full transition-all"
                          style={{
                            width: `${Math.min((agent.reputation / 5) * 100, 100)}%`,
                          }}
                        />
                      </div>
                      <p className="text-gray-500 text-xs">
                        {agent.totalFeedbacks} verified feedbacks
                      </p>
                    </div>
                  </div>
                </div>

                {/* Give Feedback */}
                <div className="p-4 bg-dark-900 rounded-lg border border-white/5">
                  <p className="text-gray-500 text-xs uppercase tracking-wider mb-3">
                    Give Feedback
                  </p>
                  <div className="space-y-3">
                    <div>
                      <label className="text-gray-400 text-xs block mb-2">
                        Score: {feedbackScore}/5
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="5"
                        step="0.5"
                        value={feedbackScore}
                        onChange={(e) => setFeedbackScore(parseFloat(e.target.value))}
                        className="w-full"
                      />
                    </div>
                    <button
                      onClick={handleGiveFeedback}
                      disabled={submittingFeedback}
                      className="w-full px-4 py-2 bg-gold-500 hover:bg-gold-600 disabled:opacity-50 text-dark-900 rounded-lg text-sm font-medium transition"
                    >
                      {submittingFeedback ? "Submitting..." : "Submit Feedback"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Owner-Only Controls */}
            {isOwner && (
              <>
                {/* API Key Section */}
                <div className="bg-dark-800 rounded-xl border border-white/5 p-6">
                  <h2 className="text-white font-serif text-lg mb-4">API Key</h2>

                  {showApiKey && apiKeyInfo && (
                    <div className="p-4 bg-dark-900 rounded-lg border border-white/5 mb-4">
                      <p className="text-amber-300 text-xs font-medium mb-3">
                        ⚠️ Keep this secret!
                      </p>
                      <div className="bg-dark-800 rounded border border-white/5 p-3 mb-3 overflow-hidden">
                        <code className="text-white font-mono text-xs break-all">
                          {apiKeyInfo.agentName}
                        </code>
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(apiKeyInfo.agentName);
                          setApiKeyCopied(true);
                          setTimeout(() => setApiKeyCopied(false), 2000);
                        }}
                        className="w-full px-4 py-2 bg-gold-500 hover:bg-gold-600 text-dark-900 rounded-lg text-xs font-medium transition"
                      >
                        {apiKeyCopied ? "✓ Copied!" : "Copy API Key"}
                      </button>
                    </div>
                  )}

                  <button
                    onClick={handleRegenerateApiKey}
                    disabled={regeneratingKey}
                    className="w-full px-4 py-2 bg-dark-700 hover:bg-dark-600 border border-white/5 text-white rounded-lg text-sm font-medium transition"
                  >
                    {regeneratingKey ? "Regenerating..." : "Regenerate API Key"}
                  </button>
                </div>

                {/* Spending Limits Section */}
                {budgetStatus && (
                  <div className="bg-dark-800 rounded-xl border border-white/5 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-white font-serif text-lg">Spending Limits</h2>
                      {!editingLimits && (
                        <button
                          onClick={handleEditLimits}
                          className="text-gold-400 hover:text-gold-300 text-xs font-medium transition"
                        >
                          Edit
                        </button>
                      )}
                    </div>

                    <div className="space-y-4">
                      {(["daily", "weekly", "monthly"] as const).map((period) => {
                        const limit = editingLimits
                          ? editedLimits?.[period]
                          : budgetStatus.limits[period];
                        const progress = budgetStatus.progress[period];

                        return (
                          <div
                            key={period}
                            className="p-4 bg-dark-900 rounded-lg border border-white/5"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-gray-400 text-sm capitalize font-medium">
                                {period} Limit
                              </p>
                              {limit?.enabled ? (
                                <span className="text-gold-300 text-xs font-medium">
                                  {limit.spent?.toFixed(2) || 0} / {limit.limit?.toFixed(2) || 0}{" "}
                                  {limit.currency}
                                </span>
                              ) : (
                                <span className="text-gray-500 text-xs">Unlimited</span>
                              )}
                            </div>

                            {limit?.enabled && (
                              <div className="w-full bg-dark-800 rounded-full h-1.5">
                                <div
                                  className={`h-1.5 rounded-full transition-all ${
                                    progress > 80
                                      ? "bg-red-500"
                                      : progress > 50
                                      ? "bg-yellow-500"
                                      : "bg-gold-500"
                                  }`}
                                  style={{ width: `${Math.min(progress, 100)}%` }}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {editingLimits && editedLimits && (
                      <div className="flex gap-3 mt-4">
                        <button
                          onClick={() => setEditingLimits(false)}
                          className="flex-1 px-4 py-2 bg-dark-700 hover:bg-dark-600 border border-white/5 text-white rounded-lg text-sm font-medium transition"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveLimits}
                          disabled={savingLimits}
                          className="flex-1 px-4 py-2 bg-gold-500 hover:bg-gold-600 disabled:opacity-50 text-dark-900 rounded-lg text-sm font-medium transition"
                        >
                          {savingLimits ? "Saving..." : "Save Changes"}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Agent Info */}
                {apiKeyInfo && (
                  <div className="bg-dark-800 rounded-xl border border-white/5 p-6">
                    <h2 className="text-white font-serif text-lg mb-4">Agent Configuration</h2>

                    <div className="space-y-4">
                      <div>
                        <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">
                          Permissions
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {["Trade", "Bid", "Chat"].map((perm) => (
                            <span
                              key={perm}
                              className={`px-3 py-1 rounded-md text-xs font-medium border ${
                                (apiKeyInfo.permissions as any)[perm]
                                  ? "bg-gold-500/20 text-gold-300 border-gold-500/30"
                                  : "bg-dark-900 text-gray-500 border-white/5"
                              }`}
                            >
                              {perm}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">
                          Categories
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {apiKeyInfo.categories.map((cat) => (
                            <span
                              key={cat}
                              className="px-3 py-1 rounded-md text-xs font-medium bg-gold-500/20 text-gold-300 border border-gold-500/30"
                            >
                              {cat}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
