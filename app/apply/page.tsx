"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";

interface Application {
  id: string;
  walletAddress: string;
  collectionName: string;
  collectionAddress: string;
  category: string;
  description: string;
  pitch: string;
  sampleImages: string[];
  website?: string;
  twitter?: string;
  status: "pending" | "approved" | "rejected";
  submittedAt: number;
  reviewedAt: null | number;
  reviewedBy: null | string;
  rejectionReason: null | string;
}

const CATEGORIES = [
  "Digital Art",
  "Spirits",
  "TCG Cards",
  "Sports Cards",
  "Watches",
];

export default function ApplyPage() {
  const { publicKey, connected } = useWallet();
  const [form, setForm] = useState({
    collectionName: "",
    collectionAddress: "",
    category: "Digital Art",
    description: "",
    pitch: "",
    sampleImages: ["", "", ""],
    website: "",
    twitter: "",
  });

  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [userApplications, setUserApplications] = useState<Application[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);

  // Fetch user's applications
  useEffect(() => {
    if (connected && publicKey) {
      fetchUserApplications();
    }
  }, [connected, publicKey]);

  const fetchUserApplications = async () => {
    try {
      setLoadingApps(true);
      const response = await fetch(
        `/api/applications?wallet=${publicKey?.toBase58()}`
      );
      if (!response.ok) throw new Error("Failed to fetch applications");
      const data = await response.json();
      setUserApplications(data.applications || []);
    } catch (err) {
      console.error("Error fetching applications:", err);
    } finally {
      setLoadingApps(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicKey) return;

    setLoading(true);
    setError("");

    try {
      // Filter out empty sample images
      const sampleImages = form.sampleImages.filter((img) => img.trim() !== "");

      const response = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: publicKey.toBase58(),
          collectionName: form.collectionName,
          collectionAddress: form.collectionAddress,
          category: form.category,
          description: form.description,
          pitch: form.pitch,
          sampleImages,
          website: form.website || undefined,
          twitter: form.twitter || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to submit application");
      }

      setSubmitted(true);
      // Refresh applications list
      await fetchUserApplications();
      // Reset form
      setForm({
        collectionName: "",
        collectionAddress: "",
        category: "Digital Art",
        description: "",
        pitch: "",
        sampleImages: ["", "", ""],
        website: "",
        twitter: "",
      });
    } catch (err: any) {
      setError(err.message || "Failed to submit application");
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved":
        return "bg-green-900/30 border-green-500/30 text-green-400";
      case "rejected":
        return "bg-red-900/30 border-red-500/30 text-red-400";
      case "pending":
      default:
        return "bg-gold-900/30 border-gold-500/30 text-gold-400";
    }
  };

  const getStatusLabel = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  if (!connected || !publicKey) {
    return (
      <div className="pt-24 pb-20 min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <div className="bg-dark-800 rounded-lg border border-white/5 p-12 text-center">
              <div className="text-5xl mb-4">🔐</div>
              <h2 className="font-serif text-2xl text-white mb-3">
                Wallet Connection Required
              </h2>
              <p className="text-gray-400 text-base">
                Connect your wallet to submit an application to the Artifacte platform.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-24 pb-20 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header Section */}
        <div className="max-w-2xl mb-16">
          <Link href="/" className="text-gold-500 hover:text-gold-400 text-sm mb-4 inline-block">← Back to Home</Link>
          <p className="text-gold-500 text-xs font-semibold tracking-widest uppercase mb-4">
            Apply to Artifacte
          </p>
          <h1 className="font-serif text-4xl md:text-5xl text-white mb-4">
            Apply Your Collection
          </h1>
          <p className="text-gray-400 text-base leading-relaxed">
            Submit your collection for review to be listed on Artifacte. Our team reviews all applications within 48 hours and connects qualified creators with collectors.
          </p>
        </div>

        {/* Application Form */}
        {!submitted ? (
          <div className="max-w-2xl mb-16">
            <div className="bg-dark-800 rounded-lg border border-white/5 p-8 md:p-10">
              <h2 className="font-serif text-2xl text-white mb-8">
                Collection Details
              </h2>

              {error && (
                <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 mb-8">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Collection Name */}
                <div>
                  <label className="block text-sm text-gray-300 font-medium mb-2">
                    Collection Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={form.collectionName}
                    onChange={(e) =>
                      setForm({ ...form, collectionName: e.target.value })
                    }
                    className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition-colors"
                    placeholder="My Amazing Collection"
                  />
                </div>

                {/* Collection Address */}
                <div>
                  <label className="block text-sm text-gray-300 font-medium mb-2">
                    Collection Address / Mint Authority <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={form.collectionAddress}
                    onChange={(e) =>
                      setForm({ ...form, collectionAddress: e.target.value })
                    }
                    className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition-colors"
                    placeholder="HZwXCVqDvBVGx8d7wFqkxHwvkU1gL3rDQHtPqDdKa6f"
                  />
                  <p className="text-gray-500 text-xs mt-1.5">
                    Solana public key for your collection
                  </p>
                </div>

                {/* Category */}
                <div>
                  <label className="block text-sm text-gray-300 font-medium mb-2">
                    Category <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={form.category}
                    onChange={(e) =>
                      setForm({ ...form, category: e.target.value })
                    }
                    className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition-colors"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm text-gray-300 font-medium mb-2">
                    Description <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    required
                    rows={3}
                    maxLength={500}
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                    className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition-colors resize-none"
                    placeholder="Describe your collection, its history, and any relevant details..."
                  />
                  <p className="text-gray-500 text-xs mt-1.5">
                    {form.description.length}/500 characters
                  </p>
                </div>

                {/* Pitch */}
                <div>
                  <label className="block text-sm text-gray-300 font-medium mb-2">
                    Why it belongs on Artifacte <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    required
                    rows={3}
                    maxLength={300}
                    value={form.pitch}
                    onChange={(e) =>
                      setForm({ ...form, pitch: e.target.value })
                    }
                    className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition-colors resize-none"
                    placeholder="Explain what makes your collection unique and why it fits our platform..."
                  />
                  <p className="text-gray-500 text-xs mt-1.5">
                    {form.pitch.length}/300 characters
                  </p>
                </div>

                {/* Sample Images */}
                <div>
                  <label className="block text-sm text-gray-300 font-medium mb-2">
                    Sample Image URLs (up to 3)
                  </label>
                  {form.sampleImages.map((img, index) => (
                    <input
                      key={index}
                      type="url"
                      value={img}
                      onChange={(e) => {
                        const newImages = [...form.sampleImages];
                        newImages[index] = e.target.value;
                        setForm({ ...form, sampleImages: newImages });
                      }}
                      className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition-colors mb-2"
                      placeholder={`Image URL ${index + 1} (optional)`}
                    />
                  ))}
                </div>

                {/* Website */}
                <div>
                  <label className="block text-sm text-gray-300 font-medium mb-2">
                    Website (optional)
                  </label>
                  <input
                    type="url"
                    value={form.website}
                    onChange={(e) =>
                      setForm({ ...form, website: e.target.value })
                    }
                    className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition-colors"
                    placeholder="https://example.com"
                  />
                </div>

                {/* Twitter */}
                <div>
                  <label className="block text-sm text-gray-300 font-medium mb-2">
                    Twitter Handle (optional)
                  </label>
                  <input
                    type="text"
                    value={form.twitter}
                    onChange={(e) =>
                      setForm({ ...form, twitter: e.target.value })
                    }
                    className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition-colors"
                    placeholder="@yourhandle"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-gold-500 hover:bg-gold-600 disabled:opacity-50 disabled:cursor-not-allowed text-dark-900 rounded-lg font-semibold text-sm transition-colors duration-200 mt-4"
                >
                  {loading ? "Submitting..." : "Submit Application"}
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mb-16">
            <div className="bg-dark-800 rounded-lg border border-white/5 p-12 text-center">
              <div className="text-5xl mb-6">✅</div>
              <h2 className="font-serif text-2xl text-white mb-3">
                Application Submitted!
              </h2>
              <p className="text-gray-400 text-base mb-8">
                We'll review your application within 48 hours. Check back soon for updates.
              </p>
              <button
                onClick={() => setSubmitted(false)}
                className="px-6 py-2.5 bg-dark-900 border border-white/10 rounded-lg text-white text-sm hover:bg-white/5 transition-colors duration-200"
              >
                Submit Another Application
              </button>
            </div>
          </div>
        )}

        {/* User's Applications */}
        {!loadingApps && userApplications.length > 0 && (
          <div className="max-w-2xl">
            <h2 className="font-serif text-2xl text-white mb-8">
              Your Applications
            </h2>
            <div className="space-y-4">
              {userApplications.map((app) => (
                <div
                  key={app.id}
                  className="bg-dark-800 rounded-lg border border-white/5 p-6"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-white font-semibold text-lg">
                        {app.collectionName}
                      </h3>
                      <p className="text-gray-500 text-xs mt-1">
                        {app.category}
                      </p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(
                        app.status
                      )}`}
                    >
                      {getStatusLabel(app.status)}
                    </span>
                  </div>

                  <p className="text-gray-400 text-sm mb-4">
                    {app.description}
                  </p>

                  <div className="text-gray-500 text-xs space-y-1 mb-4">
                    <p>
                      <span className="text-gray-400">Submitted:</span>{" "}
                      {new Date(app.submittedAt).toLocaleDateString()}
                    </p>
                    {app.reviewedAt && (
                      <>
                        <p>
                          <span className="text-gray-400">Reviewed:</span>{" "}
                          {new Date(app.reviewedAt).toLocaleDateString()}
                        </p>
                        {app.rejectionReason && (
                          <p>
                            <span className="text-gray-400">Reason:</span>{" "}
                            {app.rejectionReason}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
