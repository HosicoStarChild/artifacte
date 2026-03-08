"use client";

import Link from "next/link";
import { useState, useMemo, useEffect } from "react";
import { PublicKey } from "@solana/web3.js";
import { useAgentRegistry } from "@/hooks/useAgentRegistry";

interface Agent {
  address: string;
  name: string;
  ownerWallet: string;
  avatarImage: string;
  description: string;
  permissions: ("Trade" | "Bid" | "Chat")[];
  reputation: number;
  totalFeedbacks: number;
  createdDate: string;
  hasApiKey: boolean;
  connectionStatus: "connected" | "disconnected";
}

export default function AgentsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPermission, setFilterPermission] = useState<"Trade" | "Bid" | "Chat" | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const { getCollectionAgents, getSummary } = useAgentRegistry();

  useEffect(() => {
    async function loadAgents() {
      try {
        setLoading(true);

        // Fetch agents from 8004 collection
        const collectionPointer = process.env.NEXT_PUBLIC_8004_COLLECTION_POINTER;
        const agentData = collectionPointer
          ? await getCollectionAgents(collectionPointer)
          : [];

        // Fetch API key data from API endpoint (for Artifacte-specific data)
        const apiRes = await fetch("/api/agents");
        const apiData = await apiRes.json();
        const apiAgents = apiData.agents || [];

        // Create a map of agent asset address to API key info
        const apiKeyMap = new Map<string, any>(
          apiAgents.map((ak: any) => [ak.agentAssetAddress, ak])
        );

        // Transform 8004 data to UI format and fetch reputation
        const transformedAgents: Agent[] = await Promise.all(
          agentData.map(async (agent) => {
            const assetAddr = agent.assetPubkey;
            const apiKeyInfo: any = apiKeyMap.get(assetAddr);

            // Fetch reputation from ATOM engine
            let reputationScore = 0;
            let totalFeedbacks = 0;
            try {
              const summary = await getSummary(agent.assetPubkey);
              if (summary) {
                reputationScore = summary.averageScore;
                totalFeedbacks = summary.totalFeedbacks;
              }
            } catch (e) {
              console.error("Failed to fetch reputation:", e);
            }

            return {
              address: assetAddr,
              name: agent.name,
              description: agent.description,
              ownerWallet: `${agent.owner.slice(0, 8)}...${agent.owner.slice(-4)}`,
              avatarImage: agent.imageUri || `https://picsum.photos/200/200?seed=${assetAddr}`,
              permissions: [] as ("Trade" | "Bid" | "Chat")[],
              reputation: reputationScore,
              totalFeedbacks,
              createdDate: new Date().toISOString().split("T")[0],
              hasApiKey: !!apiKeyInfo,
              connectionStatus: apiKeyInfo?.connectionStatus || "disconnected",
            };
          })
        );

        setAgents(transformedAgents);
      } catch (error) {
        console.error("Failed to load agents:", error);
        setAgents([]);
      } finally {
        setLoading(false);
      }
    }

    loadAgents();
  }, [getCollectionAgents, getSummary]);

  const filteredAgents = useMemo(() => {
    return agents.filter((agent) => {
      const matchesSearch = agent.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPermission = !filterPermission || agent.permissions.includes(filterPermission);
      return matchesSearch && matchesPermission;
    });
  }, [agents, searchQuery, filterPermission]);

  const permissionBadgeColor = (permission: string) => {
    switch (permission) {
      case "Trade":
        return "bg-blue-500/20 text-blue-300 border-blue-500/30";
      case "Bid":
        return "bg-purple-500/20 text-purple-300 border-purple-500/30";
      case "Chat":
        return "bg-green-500/20 text-green-300 border-green-500/30";
      default:
        return "bg-gray-500/20 text-gray-300 border-gray-500/30";
    }
  };

  return (
    <div className="pt-24 pb-20 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-4 mb-4">
            <p className="text-gold-500 text-xs font-semibold tracking-widest uppercase">
              AI Agents
            </p>
            <span className="text-gray-600 text-xs">powered by</span>
            <img src="/hosico-labs.jpg" alt="Hosico Labs" className="h-14 rounded" />
          </div>
          <h1 className="font-serif text-4xl md:text-5xl text-white mb-3">Agent Dashboard</h1>
          <p className="text-gray-400 text-base">
            Discover and interact with registered AI agents on the Artifacte platform
          </p>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-4 mb-10 pb-8 border-b border-white/5">
          <input
            type="text"
            placeholder="Search agents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 px-4 py-2.5 bg-dark-800 border border-white/5 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gold-500 transition-colors"
          />

          <div className="flex gap-2 flex-wrap">
            {(["Trade", "Bid", "Chat"] as const).map((perm) => (
              <button
                key={perm}
                onClick={() => setFilterPermission(filterPermission === perm ? null : perm)}
                className={`px-4 py-2.5 rounded-lg text-xs font-medium transition-colors duration-200 ${
                  filterPermission === perm
                    ? "bg-gold-500 text-dark-900"
                    : "bg-dark-800 text-gray-400 border border-white/5 hover:text-white"
                }`}
              >
                {perm}
              </button>
            ))}
          </div>

          {/* CTA Button */}
          <Link
            href="/agents/register"
            className="px-6 py-2.5 bg-gold-500 hover:bg-gold-600 text-dark-900 rounded-lg text-sm font-semibold transition-colors duration-200 whitespace-nowrap"
          >
            + Register Agent
          </Link>
        </div>

        {/* Agent Count */}
        <div className="mb-8">
          <p className="text-gray-400 text-sm">
            Total Agents: <span className="text-gold-500 font-semibold">{filteredAgents.length}</span>
          </p>
        </div>

        {/* Agents Grid */}
        {loading ? (
          <div className="text-center py-24">
            <div className="w-8 h-8 border-2 border-gold-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-400 text-sm">Loading agents from devnet...</p>
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-gray-400 text-sm">No agents found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredAgents.map((agent) => (
              <Link href={`/agents/${agent.address}`} key={agent.address}>
                <div className="bg-dark-800 rounded-lg border border-white/5 overflow-hidden card-hover cursor-pointer group h-full relative">
                  {/* API Key Status Indicator */}
                  <div className="absolute top-4 right-4 z-10">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        agent.hasApiKey && agent.connectionStatus === "connected"
                          ? "bg-green-500 shadow-lg shadow-green-500/50"
                          : agent.hasApiKey
                          ? "bg-yellow-500 shadow-lg shadow-yellow-500/50"
                          : "bg-gray-600"
                      }`}
                      title={
                        agent.hasApiKey
                          ? agent.connectionStatus === "connected"
                            ? "Connected"
                            : "Registered (not connected)"
                          : "No API key"
                      }
                    ></div>
                  </div>

                  {/* Avatar */}
                  <div className="aspect-square overflow-hidden bg-dark-900">
                    <img
                      src={agent.avatarImage}
                      alt={agent.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Crect fill='%23141419' width='200' height='200'/%3E%3Ctext x='50%' y='50%' font-size='40' fill='%23C9A55C' text-anchor='middle' dominant-baseline='middle'%3E🤖%3C/text%3E%3C/svg%3E";
                      }}
                    />
                  </div>

                  {/* Info */}
                  <div className="p-6">
                    <h3 className="text-white font-serif text-lg">{agent.name}</h3>

                    {/* Description */}
                    <p className="text-gray-500 text-xs mt-2 line-clamp-2">
                      {agent.description || "No description"}
                    </p>

                    {/* Wallet */}
                    <p className="text-gray-600 text-xs mt-3 font-mono">
                      Owner: {agent.ownerWallet}
                    </p>

                    {/* Reputation Score */}
                    <div className="flex flex-wrap gap-2 mt-4 mb-6">
                      <div className="px-3 py-1.5 rounded-md text-xs font-medium bg-gold-500/20 border border-gold-500/30 text-gold-300 flex items-center gap-1">
                        <span>⭐</span>
                        <span>{agent.reputation.toFixed(1)}</span>
                        <span className="text-gray-500 text-xs">({agent.totalFeedbacks})</span>
                      </div>
                    </div>

                    {/* Date and Status */}
                    <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                      <p className="text-gray-600 text-xs">
                        {new Date(agent.createdDate).toLocaleDateString()}
                      </p>
                      <a
                        href={`https://8004scan.io/agents/${agent.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-gold-400 hover:text-gold-300 transition"
                      >
                        View on 8004scan ↗
                      </a>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
