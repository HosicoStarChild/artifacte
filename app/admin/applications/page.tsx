"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";

const ADMIN_WALLET = "DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX";

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

type TabType = "pending" | "approved" | "rejected";

export default function AdminApplicationsPage() {
  const { publicKey, connected } = useWallet();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("pending");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (connected && publicKey?.toBase58() === ADMIN_WALLET) {
      fetchApplications();
    } else {
      setLoading(false);
    }
  }, [connected, publicKey]);

  const fetchApplications = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/applications?admin=true");
      if (!response.ok) throw new Error("Failed to fetch applications");
      const data = await response.json();
      setApplications(data.applications || []);
    } catch (err) {
      console.error("Error fetching applications:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (applicationId: string) => {
    try {
      setActionLoading(true);
      const response = await fetch("/api/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: applicationId,
          action: "approve",
          adminWallet: publicKey?.toBase58(),
        }),
      });

      if (!response.ok) throw new Error("Failed to approve application");

      // Refresh applications
      await fetchApplications();
      setReviewingId(null);
    } catch (err) {
      console.error("Error approving application:", err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (applicationId: string) => {
    if (!rejectionReason.trim()) {
      alert("Please provide a rejection reason");
      return;
    }

    try {
      setActionLoading(true);
      const response = await fetch("/api/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: applicationId,
          action: "reject",
          rejectionReason: rejectionReason.trim(),
          adminWallet: publicKey?.toBase58(),
        }),
      });

      if (!response.ok) throw new Error("Failed to reject application");

      // Refresh applications
      await fetchApplications();
      setReviewingId(null);
      setRejectionReason("");
    } catch (err) {
      console.error("Error rejecting application:", err);
    } finally {
      setActionLoading(false);
    }
  };

  if (!connected || !publicKey) {
    return (
      <div className="pt-24 pb-20 min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <div className="bg-navy-800 rounded-xl border border-white/5 p-12 text-center">
              <div className="text-5xl mb-4">🔐</div>
              <h2 className="font-serif text-2xl text-white mb-2">
                Wallet Connection Required
              </h2>
              <p className="text-gray-400 text-sm">
                Connect your wallet to access the admin panel.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (publicKey.toBase58() !== ADMIN_WALLET) {
    return (
      <div className="pt-24 pb-20 min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <div className="bg-navy-800 rounded-xl border border-white/5 p-12 text-center">
              <div className="text-5xl mb-4">🚫</div>
              <h2 className="font-serif text-2xl text-white mb-2">
                Access Denied
              </h2>
              <p className="text-gray-400 text-sm mb-6">
                You do not have permission to access this page.
              </p>
              <Link
                href="/"
                className="inline-block px-6 py-2.5 bg-gold-500 hover:bg-gold-600 text-navy-900 rounded-lg font-semibold text-sm transition"
              >
                Return Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const filteredApplications = applications.filter(
    (app) => app.status === activeTab
  );

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

  if (loading) {
    return (
      <div className="pt-24 pb-20 min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-gray-400">Loading applications...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-24 pb-20 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="max-w-2xl mb-12">
          <p className="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-4">
            Admin Panel
          </p>
          <h1 className="font-serif text-4xl text-white mb-4">
            Review Applications
          </h1>
          <p className="text-gray-400 text-base leading-relaxed">
            Review and approve or reject creator applications.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-8 border-b border-white/10">
          {(["pending", "approved", "rejected"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-semibold transition border-b-2 ${
                activeTab === tab
                  ? "text-gold-400 border-gold-400"
                  : "text-gray-400 border-transparent hover:text-white"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)} (
              {applications.filter((app) => app.status === tab).length})
            </button>
          ))}
        </div>

        {/* Applications Grid */}
        {filteredApplications.length === 0 ? (
          <div className="bg-navy-800 rounded-xl border border-white/5 p-12 text-center">
            <p className="text-gray-400 text-sm">
              No {activeTab} applications to display.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 mb-12">
            {filteredApplications.map((app) => (
              <div
                key={app.id}
                className="bg-navy-800 rounded-xl border border-white/5 overflow-hidden"
              >
                {/* Card Content */}
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-white font-semibold text-lg">
                        {app.collectionName}
                      </h3>
                      <p className="text-gray-500 text-xs mt-1">
                        {app.category} • {app.collectionAddress}
                      </p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(
                        app.status
                      )}`}
                    >
                      {app.status.charAt(0).toUpperCase() + app.status.slice(1)}
                    </span>
                  </div>

                  {/* Creator Info */}
                  <div className="mb-4">
                    <p className="text-gray-500 text-xs mb-2">
                      <span className="text-gray-400">Creator Wallet:</span>{" "}
                      {app.walletAddress}
                    </p>
                    {app.website && (
                      <p className="text-gray-500 text-xs mb-1">
                        <span className="text-gray-400">Website:</span>{" "}
                        <a href={app.website} target="_blank" rel="noopener noreferrer" className="text-gold-400 hover:text-gold-300">
                          {app.website}
                        </a>
                      </p>
                    )}
                    {app.twitter && (
                      <p className="text-gray-500 text-xs">
                        <span className="text-gray-400">Twitter:</span>{" "}
                        <a href={`https://twitter.com/${app.twitter}`} target="_blank" rel="noopener noreferrer" className="text-gold-400 hover:text-gold-300">
                          {app.twitter}
                        </a>
                      </p>
                    )}
                  </div>

                  {/* Description and Pitch */}
                  <div className="mb-4 pb-4 border-b border-white/10">
                    <div className="mb-3">
                      <p className="text-gray-400 text-xs font-semibold mb-1">
                        Description
                      </p>
                      <p className="text-gray-300 text-sm">{app.description}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs font-semibold mb-1">
                        Pitch
                      </p>
                      <p className="text-gray-300 text-sm">{app.pitch}</p>
                    </div>
                  </div>

                  {/* Sample Images */}
                  {app.sampleImages && app.sampleImages.length > 0 && (
                    <div className="mb-4 pb-4 border-b border-white/10">
                      <p className="text-gray-400 text-xs font-semibold mb-2">
                        Sample Images
                      </p>
                      <div className="flex gap-3">
                        {app.sampleImages.map((img, idx) => (
                          <a
                            key={idx}
                            href={img}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gold-400 hover:text-gold-300 text-xs underline"
                          >
                            Image {idx + 1}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Review Section */}
                  {app.status === "pending" ? (
                    reviewingId === app.id ? (
                      <div className="bg-navy-900/50 rounded-lg p-4 space-y-3">
                        <div>
                          <label className="block text-sm text-gray-400 mb-1.5">
                            Rejection Reason (required if rejecting)
                          </label>
                          <textarea
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            className="w-full bg-navy-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition resize-none"
                            rows={3}
                            placeholder="Explain why this application is being rejected..."
                          />
                        </div>
                        <div className="flex gap-3">
                          <button
                            onClick={() => handleApprove(app.id)}
                            disabled={actionLoading}
                            className="flex-1 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg font-semibold text-sm transition"
                          >
                            {actionLoading ? "Processing..." : "Approve"}
                          </button>
                          <button
                            onClick={() => handleReject(app.id)}
                            disabled={actionLoading || !rejectionReason.trim()}
                            className="flex-1 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-semibold text-sm transition"
                          >
                            {actionLoading ? "Processing..." : "Reject"}
                          </button>
                          <button
                            onClick={() => {
                              setReviewingId(null);
                              setRejectionReason("");
                            }}
                            className="px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-lg font-semibold text-sm transition"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setReviewingId(app.id)}
                        className="w-full py-2 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-lg font-semibold text-sm transition"
                      >
                        Review Application
                      </button>
                    )
                  ) : (
                    <div className="text-gray-500 text-xs space-y-1">
                      <p>
                        <span className="text-gray-400">Reviewed by:</span>{" "}
                        {app.reviewedBy}
                      </p>
                      <p>
                        <span className="text-gray-400">Date:</span>{" "}
                        {app.reviewedAt &&
                          new Date(app.reviewedAt).toLocaleDateString()}
                      </p>
                      {app.rejectionReason && (
                        <p>
                          <span className="text-gray-400">Reason:</span>{" "}
                          {app.rejectionReason}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
