"use client";

import Link from "next/link";
import { useState, useMemo } from "react";

interface Agent {
  address: string;
  name: string;
  ownerWallet: string;
  avatarImage: string;
  permissions: ("Trade" | "Bid" | "Chat")[];
  createdDate: string;
}

const MOCK_AGENTS: Agent[] = [
  {
    address: "agent_0x1A2B3C4D",
    name: "TradeMaster AI",
    ownerWallet: "7UXmB...Qf2Uw",
    avatarImage: "https://picsum.photos/200/200?random=1",
    permissions: ["Trade", "Bid", "Chat"],
    createdDate: "2025-02-15",
  },
  {
    address: "agent_0x5E6F7G8H",
    name: "Auction Scout",
    ownerWallet: "3k9mL...Zt8Vx",
    avatarImage: "https://picsum.photos/200/200?random=2",
    permissions: ["Bid", "Chat"],
    createdDate: "2025-02-10",
  },
  {
    address: "agent_0x9I0J1K2L",
    name: "Portfolio Analyzer",
    ownerWallet: "8qRsT...Pn4Hy",
    avatarImage: "https://picsum.photos/200/200?random=3",
    permissions: ["Trade"],
    createdDate: "2025-02-08",
  },
  {
    address: "agent_0x3M4N5O6P",
    name: "Market Monitor",
    ownerWallet: "2cDeFg...Ij9Kl",
    avatarImage: "https://picsum.photos/200/200?random=4",
    permissions: ["Chat"],
    createdDate: "2025-02-05",
  },
  {
    address: "agent_0x7Q8R9S0T",
    name: "Smart Bidder",
    ownerWallet: "5mNoPq...Rst1Uv",
    avatarImage: "https://picsum.photos/200/200?random=5",
    permissions: ["Trade", "Bid"],
    createdDate: "2025-02-01",
  },
  {
    address: "agent_0x1U2V3W4X",
    name: "DeFi Explorer",
    ownerWallet: "9wXyZ...AbC2De",
    avatarImage: "https://picsum.photos/200/200?random=6",
    permissions: ["Trade", "Chat"],
    createdDate: "2025-01-28",
  },
];

export default function AgentsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPermission, setFilterPermission] = useState<"Trade" | "Bid" | "Chat" | null>(null);

  const filteredAgents = useMemo(() => {
    return MOCK_AGENTS.filter((agent) => {
      const matchesSearch = agent.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPermission = !filterPermission || agent.permissions.includes(filterPermission);
      return matchesSearch && matchesPermission;
    });
  }, [searchQuery, filterPermission]);

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
          <p className="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">
            AI Agents
          </p>
          <h1 className="font-serif text-4xl text-white mb-2">Agent Dashboard</h1>
          <p className="text-gray-400 text-sm">
            Discover and interact with registered AI agents on Artifacte
          </p>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <input
            type="text"
            placeholder="Search agents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 px-4 py-2.5 bg-navy-800 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gold-500 transition"
          />

          <div className="flex gap-2 flex-wrap">
            {(["Trade", "Bid", "Chat"] as const).map((perm) => (
              <button
                key={perm}
                onClick={() => setFilterPermission(filterPermission === perm ? null : perm)}
                className={`px-3 py-2.5 rounded-lg text-xs font-medium transition ${
                  filterPermission === perm
                    ? "bg-gold-500 text-navy-900"
                    : "bg-navy-800 text-gray-400 border border-white/10 hover:text-white"
                }`}
              >
                {perm}
              </button>
            ))}
          </div>
        </div>

        {/* CTA Button */}
        <div className="flex justify-end mb-8">
          <Link
            href="/agents/register"
            className="px-6 py-2.5 bg-gold-500 hover:bg-gold-600 text-navy-900 rounded-lg text-sm font-semibold transition"
          >
            + Register Your Agent
          </Link>
        </div>

        {/* Agents Grid */}
        {filteredAgents.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-gray-400 text-sm">No agents found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAgents.map((agent) => (
              <Link href={`/agents/${agent.address}`} key={agent.address}>
                <div className="bg-navy-800 rounded-xl border border-white/5 overflow-hidden card-hover cursor-pointer group h-full">
                  {/* Avatar */}
                  <div className="aspect-square overflow-hidden bg-navy-900">
                    <img
                      src={agent.avatarImage}
                      alt={agent.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Crect fill='%230f1628' width='200' height='200'/%3E%3Ctext x='50%' y='50%' font-size='40' fill='%23c9952c' text-anchor='middle' dominant-baseline='middle'%3E🤖%3C/text%3E%3C/svg%3E";
                      }}
                    />
                  </div>

                  {/* Info */}
                  <div className="p-5">
                    <h3 className="text-white font-semibold text-lg">{agent.name}</h3>

                    {/* Wallet */}
                    <p className="text-gray-500 text-xs mt-2 font-mono">
                      Owner: {agent.ownerWallet}
                    </p>

                    {/* Permissions */}
                    <div className="flex flex-wrap gap-2 mt-4 mb-4">
                      {agent.permissions.map((perm) => (
                        <span
                          key={perm}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium border ${permissionBadgeColor(
                            perm
                          )}`}
                        >
                          {perm}
                        </span>
                      ))}
                    </div>

                    {/* Date */}
                    <p className="text-gray-600 text-[10px]">
                      Created {new Date(agent.createdDate).toLocaleDateString()}
                    </p>
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
