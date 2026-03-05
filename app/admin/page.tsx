"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

const ADMIN_WALLET = "DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX";

interface AllowlistEntry {
  mintAuthority: string;
  name: string;
  category: string;
  addedAt: number;
  addedBy: string;
  verified: boolean;
}

export default function AdminPage() {
  const { publicKey, connected } = useWallet();
  const [collections, setCollections] = useState<AllowlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ mintAuthority: "", name: "", category: "Digital Art" });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [searchCategory, setSearchCategory] = useState<string>("all");

  const isAdmin = connected && publicKey?.toBase58() === ADMIN_WALLET;

  // Fetch collections on mount
  useEffect(() => {
    fetchCollections();
  }, []);

  const fetchCollections = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/allowlist");
      const data = await res.json();
      if (data.ok || data.collections) {
        setCollections(data.collections || []);
      }
    } catch (error) {
      console.error("Failed to fetch collections:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !publicKey) return;

    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/allowlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mintAuthority: form.mintAuthority,
          name: form.name,
          category: form.category,
          adminWallet: publicKey.toBase58(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to add collection" });
        return;
      }

      setMessage({ type: "success", text: "✓ Collection added successfully" });
      setForm({ mintAuthority: "", name: "", category: "Digital Art" });
      await fetchCollections();
    } catch (error: any) {
      setMessage({ type: "error", text: "Error adding collection" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveCollection = async (mintAuthority: string) => {
    if (!isAdmin || !publicKey) return;

    if (!confirm("Are you sure you want to remove this collection?")) return;

    try {
      const res = await fetch("/api/admin/allowlist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mintAuthority,
          adminWallet: publicKey.toBase58(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to remove collection" });
        return;
      }

      setMessage({ type: "success", text: "✓ Collection removed successfully" });
      await fetchCollections();
    } catch (error) {
      setMessage({ type: "error", text: "Error removing collection" });
    }
  };

  const filteredCollections = collections.filter(
    (c) => searchCategory === "all" || c.category === searchCategory
  );

  const categories = Array.from(new Set(collections.map((c) => c.category)));

  return (
    <div className="pt-24 pb-20 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-4">Administration</p>
        <h1 className="font-serif text-4xl text-white mb-2">Allowlist Management</h1>
        <p className="text-gray-400 text-sm mb-8">Manage approved NFT collections for Artifacte</p>

        {!connected ? (
          <div className="flex flex-col items-center justify-center py-24 gap-6 bg-navy-800 rounded-xl border border-white/5 p-8">
            <div className="w-20 h-20 rounded-2xl bg-navy-700 border border-white/10 flex items-center justify-center">
              <svg className="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <p className="text-gray-400 text-sm">Connect your wallet to access the admin panel</p>
            <WalletMultiButton className="!bg-gold-500 hover:!bg-gold-600 !rounded-lg !h-10 !text-sm !font-medium" />
          </div>
        ) : !isAdmin ? (
          <div className="flex flex-col items-center justify-center py-24 gap-6 bg-navy-800 rounded-xl border border-white/5 p-8">
            <div className="w-20 h-20 rounded-2xl bg-red-900/20 border border-red-500/30 flex items-center justify-center">
              <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4v2m0 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-red-400 text-sm font-medium">Access Denied</p>
            <p className="text-gray-400 text-sm">This page is restricted to the admin wallet only.</p>
            <p className="text-gray-500 text-xs font-mono bg-navy-900 px-4 py-2 rounded-lg mt-2 max-w-md text-center break-all">
              {publicKey?.toBase58()}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Add Collection Form */}
            <div className="lg:col-span-1">
              <div className="bg-navy-800 rounded-xl border border-white/5 p-6 sticky top-24">
                <h2 className="font-serif text-xl text-white mb-5">Add Collection</h2>

                {message && (
                  <div className={`mb-4 p-3 rounded-lg text-sm ${
                    message.type === "success"
                      ? "bg-green-900/20 border border-green-500/30 text-green-400"
                      : "bg-red-900/20 border border-red-500/30 text-red-400"
                  }`}>
                    {message.text}
                  </div>
                )}

                <form onSubmit={handleAddCollection} className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1.5">Mint Authority Address</label>
                    <input
                      type="text"
                      required
                      value={form.mintAuthority}
                      onChange={(e) => setForm({ ...form, mintAuthority: e.target.value })}
                      className="w-full bg-navy-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500 transition"
                      placeholder="Enter Solana address..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-1.5">Collection Name</label>
                    <input
                      type="text"
                      required
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full bg-navy-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500 transition"
                      placeholder="e.g. Artifacte Premium"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-1.5">Category</label>
                    <select
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      className="w-full bg-navy-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500 transition"
                    >
                      <option value="Digital Art">Digital Art</option>
                      <option value="Real Estate">Real Estate</option>
                      <option value="Precious Metals">Precious Metals</option>
                      <option value="Luxury">Luxury</option>
                      <option value="Spirits">Spirits</option>
                      <option value="Aviation">Aviation</option>
                      <option value="Agriculture">Agriculture</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 bg-gold-500 hover:bg-gold-600 disabled:opacity-50 text-navy-900 rounded-lg font-semibold text-sm transition mt-6"
                  >
                    {submitting ? "Adding..." : "Add Collection"}
                  </button>
                </form>
              </div>
            </div>

            {/* Collections Table */}
            <div className="lg:col-span-2">
              <div className="bg-navy-800 rounded-xl border border-white/5 p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="font-serif text-xl text-white">Approved Collections</h2>
                  <span className="text-sm text-gray-400">{filteredCollections.length} total</span>
                </div>

                {/* Category Filter */}
                <div className="mb-6 flex flex-wrap gap-2">
                  <button
                    onClick={() => setSearchCategory("all")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      searchCategory === "all"
                        ? "bg-gold-500 text-navy-900"
                        : "bg-navy-700 text-gray-400 hover:text-white"
                    }`}
                  >
                    All ({collections.length})
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSearchCategory(cat)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                        searchCategory === cat
                          ? "bg-gold-500 text-navy-900"
                          : "bg-navy-700 text-gray-400 hover:text-white"
                      }`}
                    >
                      {cat} ({collections.filter((c) => c.category === cat).length})
                    </button>
                  ))}
                </div>

                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-6 h-6 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : filteredCollections.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-400 text-sm">
                      {collections.length === 0 ? "No collections added yet" : "No collections in this category"}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/5">
                          <th className="px-4 py-3 text-left text-gray-400 font-medium">Name</th>
                          <th className="px-4 py-3 text-left text-gray-400 font-medium">Category</th>
                          <th className="px-4 py-3 text-left text-gray-400 font-medium">Added</th>
                          <th className="px-4 py-3 text-left text-gray-400 font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {filteredCollections.map((c) => (
                          <tr key={c.mintAuthority} className="hover:bg-navy-700/30 transition">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="text-gold-400">✓</span>
                                <div>
                                  <p className="text-white font-medium">{c.name}</p>
                                  <p className="text-gray-500 text-xs font-mono mt-1 truncate max-w-xs">
                                    {c.mintAuthority}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-300 text-sm">{c.category}</td>
                            <td className="px-4 py-3 text-gray-500 text-xs">
                              {new Date(c.addedAt).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() => handleRemoveCollection(c.mintAuthority)}
                                className="px-3 py-1.5 bg-red-900/20 border border-red-500/30 text-red-400 rounded text-xs font-medium hover:bg-red-900/40 transition"
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
