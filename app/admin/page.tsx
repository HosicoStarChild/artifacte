"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useState, useEffect } from "react";
import { BAXUS_SELLER_FEE_ENABLED, TREASURY_WALLET } from "@/lib/data";

interface AdminListing {
  id: string;
  name: string;
  image: string;
  price: number;
  status: "pending" | "active" | "approved" | "completed" | "cancelled" | "rejected";
  seller: string;
  createdAt: string;
}

interface PlatformStats {
  totalSales: number;
  totalFees: number;
  activeListingsCount: number;
  completedListings: number;
  totalVolume: number;
}

export default function AdminPage() {
  const { publicKey, connected } = useWallet();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [listings, setListings] = useState<AdminListing[]>([]);
  const [stats, setStats] = useState<PlatformStats>({
    totalSales: 0,
    totalFees: 0,
    activeListingsCount: 0,
    completedListings: 0,
    totalVolume: 0,
  });
  const [baxusFeesEnabled, setBaxusFeesEnabled] = useState(BAXUS_SELLER_FEE_ENABLED);
  const [activeTab, setActiveTab] = useState<"overview" | "listings" | "whitelist" | "settings">("overview");
  const [whitelistedWallets, setWhitelistedWallets] = useState<any[]>([]);
  const [newWalletAddr, setNewWalletAddr] = useState("");
  const [newWalletName, setNewWalletName] = useState("");

  useEffect(() => {
    if (connected && publicKey) {
      const walletAddress = publicKey.toBase58();
      if (walletAddress === TREASURY_WALLET) {
        setIsAdmin(true);
        loadAdminData();
      } else {
        setError("Unauthorized: You are not the treasury wallet");
      }
    }
  }, [connected, publicKey]);

  async function loadAdminData() {
    setLoading(true);
    try {
      // Fetch real pending listings from API
      const res = await fetch("/api/listings");
      const data = await res.json();
      const apiListings: AdminListing[] = (data.listings || []).map((l: any) => ({
        id: l.id,
        name: l.nftName || l.name || "Unknown",
        image: l.nftImage || l.image || "",
        price: l.price,
        status: l.status || "pending",
        seller: l.seller,
        createdAt: l.submittedAt ? new Date(l.submittedAt).toISOString() : new Date().toISOString(),
        nftMint: l.nftMint,
        collectionName: l.collectionName,
        listingType: l.listingType,
      }));
      setListings(apiListings);

      const pending = apiListings.filter(l => l.status === "pending").length;
      const active = apiListings.filter(l => l.status === "approved" || l.status === "active").length;
      const completed = apiListings.filter(l => l.status === "completed").length;

      setStats({
        totalSales: 0,
        totalFees: 0,
        activeListingsCount: active,
        completedListings: completed,
        totalVolume: 0,
      });

      // Load wallet whitelist
      const wlRes = await fetch("/api/admin/wallet-whitelist");
      const wlData = await wlRes.json();
      setWhitelistedWallets(wlData.wallets || []);
    } catch (err: any) {
      setError("Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }

  async function approveListing(id: string) {
    try {
      const res = await fetch("/api/listings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "approve", adminWallet: publicKey?.toBase58() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const updated = listings.map((l) => (l.id === id ? { ...l, status: "active" as const } : l));
      setListings(updated);
    } catch (err: any) {
      setError("Failed to approve listing: " + err.message);
    }
  }

  async function rejectListing(id: string) {
    try {
      const res = await fetch("/api/listings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "reject", adminWallet: publicKey?.toBase58() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const updated = listings.map((l) => (l.id === id ? { ...l, status: "cancelled" as const } : l));
      setListings(updated);
    } catch (err: any) {
      setError("Failed to reject listing: " + err.message);
    }
  }

  async function toggleBaxusFee() {
    try {
      setBaxusFeesEnabled(!baxusFeesEnabled);
      // In production, this would call an API to persist the setting
      alert(`BAXUS fees ${!baxusFeesEnabled ? "enabled" : "disabled"}`);
    } catch (err: any) {
      setError("Failed to toggle BAXUS fees");
    }
  }

  if (!connected) {
    return (
      <main className="min-h-screen bg-dark-900 pt-32 pb-20">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-dark-800 border border-white/10 rounded-xl p-12 text-center">
            <h2 className="font-serif text-2xl font-bold text-white mb-4">Admin Access Required</h2>
            <p className="text-gray-400">Please connect your wallet to access the admin dashboard.</p>
          </div>
        </div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="min-h-screen bg-dark-900 pt-32 pb-20">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-red-900/20 border border-red-700 rounded-xl p-12 text-center">
            <h2 className="font-serif text-2xl font-bold text-white mb-4">Access Denied</h2>
            <p className="text-gray-400">You do not have permission to access this page. Only the treasury wallet can access the admin dashboard.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-dark-900 pt-32 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-12">
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-white mb-4">Admin Dashboard</h1>
          <p className="text-gray-400 text-lg">Manage platform, listings, and settings</p>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 mb-6 text-red-400">
            {error}
          </div>
        )}

        {/* Tabs */}
        <div className="mb-8 flex gap-4 border-b border-white/10">
          {(["overview", "listings", "whitelist", "settings"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-4 font-semibold transition-all border-b-2 capitalize ${
                activeTab === tab
                  ? "border-gold-500 text-gold-500"
                  : "border-transparent text-gray-400 hover:text-white"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {loading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin">
              <div className="w-8 h-8 border-4 border-gray-700 border-t-gold-500 rounded-full" />
            </div>
            <p className="text-gray-400 mt-4">Loading admin data...</p>
          </div>
        )}

        {!loading && activeTab === "overview" && (
          <div>
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-12">
              <div className="bg-dark-800 border border-white/10 rounded-xl p-6">
                <p className="text-gray-500 text-sm mb-2">Active Listings</p>
                <p className="font-serif text-4xl font-bold text-white">{stats.activeListingsCount}</p>
              </div>
              <div className="bg-dark-800 border border-white/10 rounded-xl p-6">
                <p className="text-gray-500 text-sm mb-2">Total Sales</p>
                <p className="font-serif text-4xl font-bold text-gold-500">${stats.totalSales.toLocaleString()}</p>
              </div>
              <div className="bg-dark-800 border border-white/10 rounded-xl p-6">
                <p className="text-gray-500 text-sm mb-2">Total Fees Collected</p>
                <p className="font-serif text-4xl font-bold text-green-400">${stats.totalFees.toLocaleString()}</p>
              </div>
              <div className="bg-dark-800 border border-white/10 rounded-xl p-6">
                <p className="text-gray-500 text-sm mb-2">Completed Listings</p>
                <p className="font-serif text-4xl font-bold text-white">{stats.completedListings}</p>
              </div>
              <div className="bg-dark-800 border border-white/10 rounded-xl p-6">
                <p className="text-gray-500 text-sm mb-2">Total Volume</p>
                <p className="font-serif text-4xl font-bold text-blue-400">${stats.totalVolume.toLocaleString()}</p>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-dark-800 border border-white/10 rounded-xl p-8">
              <h2 className="font-serif text-2xl font-bold text-white mb-6">Quick Actions</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={toggleBaxusFee}
                  className="px-6 py-3 rounded-lg bg-gold-500 hover:bg-gold-600 text-dark-900 font-semibold transition-all"
                >
                  {baxusFeesEnabled ? "Disable BAXUS Fees" : "Enable BAXUS Fees"}
                </button>
                <button className="px-6 py-3 rounded-lg border border-white/10 text-white hover:bg-dark-700 font-semibold transition-all">
                  Manage Categories
                </button>
              </div>
            </div>
          </div>
        )}

        {!loading && activeTab === "listings" && (
          <div>
            {/* Filter Tabs */}
            <div className="mb-6 flex gap-2 flex-wrap">
              {(["pending", "active", "completed", "cancelled"] as const).map((status) => (
                <button
                  key={status}
                  className="px-4 py-2 rounded-lg border border-white/10 text-sm font-medium text-gray-400 hover:text-white hover:border-white/20 transition-all capitalize"
                >
                  {status}
                </button>
              ))}
            </div>

            {/* Listings Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left px-6 py-4 font-semibold text-gray-400 text-sm">Listing</th>
                    <th className="text-left px-6 py-4 font-semibold text-gray-400 text-sm">Seller</th>
                    <th className="text-left px-6 py-4 font-semibold text-gray-400 text-sm">Price</th>
                    <th className="text-left px-6 py-4 font-semibold text-gray-400 text-sm">Status</th>
                    <th className="text-left px-6 py-4 font-semibold text-gray-400 text-sm">Created</th>
                    <th className="text-right px-6 py-4 font-semibold text-gray-400 text-sm">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {listings.map((listing) => (
                    <tr key={listing.id} className="hover:bg-dark-800/50 transition-all">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={listing.image}
                            alt={listing.name}
                            className="w-10 h-10 rounded object-cover"
                          />
                          <div className="text-sm">
                            <p className="font-semibold text-white truncate w-32">{listing.name}</p>
                            <p className="text-gray-500">{listing.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-400">{listing.seller}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-white">${listing.price.toLocaleString()}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                            listing.status === "active"
                              ? "bg-green-900/40 text-green-300 border border-green-700"
                              : listing.status === "pending"
                              ? "bg-yellow-900/40 text-yellow-300 border border-yellow-700"
                              : listing.status === "completed"
                              ? "bg-blue-900/40 text-blue-300 border border-blue-700"
                              : "bg-red-900/40 text-red-300 border border-red-700"
                          }`}
                        >
                          {listing.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-400">
                        {new Date(listing.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {listing.status === "pending" && (
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => approveListing(listing.id)}
                              className="text-xs px-3 py-1 bg-green-900/40 text-green-400 border border-green-700 rounded hover:bg-green-900/60 transition-all"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => rejectListing(listing.id)}
                              className="text-xs px-3 py-1 bg-red-900/40 text-red-400 border border-red-700 rounded hover:bg-red-900/60 transition-all"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                        {listing.status !== "pending" && (
                          <span className="text-xs text-gray-500">No actions</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && activeTab === "whitelist" && (
          <div className="space-y-8">
            {/* Add Wallet */}
            <div className="bg-dark-800 border border-white/10 rounded-xl p-8">
              <h3 className="font-serif text-xl font-bold text-white mb-6">Add Wallet to Whitelist</h3>
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-sm text-gray-400 mb-1.5">Wallet Address</label>
                  <input
                    type="text"
                    value={newWalletAddr}
                    onChange={e => setNewWalletAddr(e.target.value)}
                    className="w-full bg-dark-700 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition font-mono"
                    placeholder="Solana wallet address..."
                  />
                </div>
                <div className="w-48">
                  <label className="block text-sm text-gray-400 mb-1.5">Name</label>
                  <input
                    type="text"
                    value={newWalletName}
                    onChange={e => setNewWalletName(e.target.value)}
                    className="w-full bg-dark-700 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition"
                    placeholder="Seller name..."
                  />
                </div>
                <button
                  onClick={async () => {
                    if (!newWalletAddr || !newWalletName) return;
                    try {
                      const res = await fetch("/api/admin/wallet-whitelist", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ address: newWalletAddr, name: newWalletName, role: "seller", adminWallet: publicKey?.toBase58() }),
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error);
                      setWhitelistedWallets([...whitelistedWallets, data.wallet]);
                      setNewWalletAddr("");
                      setNewWalletName("");
                    } catch (err: any) {
                      setError(err.message);
                    }
                  }}
                  className="px-6 py-2.5 bg-gold-500 hover:bg-gold-600 text-dark-900 font-semibold rounded-lg transition text-sm whitespace-nowrap"
                >
                  Add Wallet
                </button>
              </div>
            </div>

            {/* Current Whitelist */}
            <div className="bg-dark-800 border border-white/10 rounded-xl p-8">
              <h3 className="font-serif text-xl font-bold text-white mb-6">
                Whitelisted Wallets ({whitelistedWallets.length})
              </h3>
              {whitelistedWallets.length === 0 ? (
                <p className="text-gray-500">No wallets whitelisted yet.</p>
              ) : (
                <div className="space-y-3">
                  {whitelistedWallets.map((w: any) => (
                    <div key={w.address} className="flex items-center justify-between p-4 bg-dark-700 rounded-lg border border-white/5">
                      <div>
                        <p className="text-white font-semibold text-sm">{w.name}</p>
                        <p className="text-gray-500 text-xs font-mono mt-1">{w.address}</p>
                        <p className="text-gray-600 text-xs mt-1">
                          {w.role} • Added {new Date(w.addedAt).toLocaleDateString()}
                        </p>
                      </div>
                      {w.role !== "admin" && (
                        <button
                          onClick={async () => {
                            try {
                              const res = await fetch("/api/admin/wallet-whitelist", {
                                method: "DELETE",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ address: w.address, adminWallet: publicKey?.toBase58() }),
                              });
                              if (!res.ok) throw new Error("Failed to remove");
                              setWhitelistedWallets(whitelistedWallets.filter((wl: any) => wl.address !== w.address));
                            } catch (err: any) {
                              setError(err.message);
                            }
                          }}
                          className="text-xs px-3 py-1 bg-red-900/40 text-red-400 border border-red-700 rounded hover:bg-red-900/60 transition"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {!loading && activeTab === "settings" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* BAXUS Fees Setting */}
            <div className="bg-dark-800 border border-white/10 rounded-xl p-8">
              <h3 className="font-serif text-xl font-bold text-white mb-6">BAXUS Seller Fees</h3>
              <p className="text-gray-400 mb-6">
                Control whether BAXUS verified NFTs incur a 10% seller fee on transaction completion.
              </p>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-dark-700 rounded-lg border border-white/10">
                  <div>
                    <p className="font-semibold text-white">Fee Status</p>
                    <p className="text-sm text-gray-500">Currently {baxusFeesEnabled ? "enabled" : "disabled"}</p>
                  </div>
                  <button
                    onClick={toggleBaxusFee}
                    className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                      baxusFeesEnabled
                        ? "bg-red-900/40 text-red-400 border border-red-700 hover:bg-red-900/60"
                        : "bg-green-900/40 text-green-400 border border-green-700 hover:bg-green-900/60"
                    }`}
                  >
                    {baxusFeesEnabled ? "Disable" : "Enable"}
                  </button>
                </div>
                <div className="text-sm text-gray-500 bg-dark-700 rounded-lg p-4 border border-white/10">
                  <p className="font-semibold text-white mb-2">Fee Details</p>
                  <ul className="space-y-1">
                    <li>• Rate: 10% of sale price</li>
                    <li>• Applies to: BAXUS verified NFTs only</li>
                    <li>• Collected to: Treasury wallet</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Platform Settings */}
            <div className="bg-dark-800 border border-white/10 rounded-xl p-8">
              <h3 className="font-serif text-xl font-bold text-white mb-6">Platform Settings</h3>
              <p className="text-gray-400 mb-6">Manage global platform configuration.</p>
              <div className="space-y-4">
                <div className="p-4 bg-dark-700 rounded-lg border border-white/10">
                  <label className="block">
                    <p className="font-semibold text-white mb-2">Marketplace Status</p>
                    <select className="w-full bg-dark-600 border border-white/10 rounded px-3 py-2 text-white focus:border-gold-500 outline-none transition-all">
                      <option>Active</option>
                      <option>Maintenance</option>
                      <option>Paused</option>
                    </select>
                  </label>
                </div>
                <div className="p-4 bg-dark-700 rounded-lg border border-white/10">
                  <label className="block">
                    <p className="font-semibold text-white mb-2">Minimum Listing Price (USD)</p>
                    <input
                      type="number"
                      defaultValue="10"
                      className="w-full bg-dark-600 border border-white/10 rounded px-3 py-2 text-white focus:border-gold-500 outline-none transition-all"
                    />
                  </label>
                </div>
                <div className="p-4 bg-dark-700 rounded-lg border border-white/10">
                  <label className="block">
                    <p className="font-semibold text-white mb-2">Maximum Auction Duration (days)</p>
                    <input
                      type="number"
                      defaultValue="90"
                      className="w-full bg-dark-600 border border-white/10 rounded px-3 py-2 text-white focus:border-gold-500 outline-none transition-all"
                    />
                  </label>
                </div>
                <button className="w-full px-6 py-3 bg-gold-500 hover:bg-gold-600 text-dark-900 font-semibold rounded-lg transition-all">
                  Save Settings
                </button>
              </div>
            </div>

            {/* Categories */}
            <div className="bg-dark-800 border border-white/10 rounded-xl p-8 lg:col-span-2">
              <h3 className="font-serif text-xl font-bold text-white mb-6">Manage Categories</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {["Digital Art", "Spirits", "TCG Cards", "Sports Cards", "Watches", "Watches", "Real Estate", "Aviation"].map(
                  (cat) => (
                    <div key={cat} className="p-4 bg-dark-700 rounded-lg border border-white/10 hover:border-gold-500 transition-all cursor-pointer">
                      <p className="font-semibold text-white text-sm">{cat}</p>
                      <p className="text-xs text-gray-500 mt-2">128 listings</p>
                    </div>
                  )
                )}
              </div>
              <button className="w-full mt-6 px-6 py-3 border border-white/10 text-white hover:bg-dark-700 font-semibold rounded-lg transition-all">
                + Add Category
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
