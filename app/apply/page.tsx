"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

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

const inputClassName =
  "h-11 border-white/10 bg-dark-900/70 px-4 text-white placeholder:text-gray-500 shadow-none";

const textareaClassName =
  "min-h-[120px] border-white/10 bg-dark-900/70 px-4 py-3 text-white placeholder:text-gray-500 shadow-none";

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
        return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
      case "rejected":
        return "border-red-400/30 bg-red-500/10 text-red-300";
      case "pending":
      default:
        return "border-gold-500/30 bg-gold-500/10 text-gold-500";
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
            <Card className="border border-white/8 bg-dark-800/90 py-0 text-center shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
              <CardContent className="p-12">
                <div className="text-5xl mb-4">🔐</div>
                <h2 className="font-serif text-2xl text-white mb-3">
                  Wallet Connection Required
                </h2>
                <p className="text-gray-400 text-base">
                  Connect your wallet to submit an application to the Artifacte platform.
                </p>
              </CardContent>
            </Card>
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
          <Badge
            variant="outline"
            className="mb-4 border-gold-500/30 bg-gold-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-gold-500"
          >
            Apply to Artifacte
          </Badge>
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
            <Card className="border border-white/8 bg-dark-800/90 py-0 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
              <CardHeader className="border-b border-white/5 px-8 pb-6 pt-8 md:px-10 md:pt-10">
                <CardTitle className="font-serif text-2xl text-white">
                  Collection Details
                </CardTitle>
                <CardDescription className="text-base text-gray-400">
                  Share the core collection details, a concise pitch, and a few representative links for review.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-8 py-8 md:px-10">
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
                  <Input
                    required
                    value={form.collectionName}
                    onChange={(e) =>
                      setForm({ ...form, collectionName: e.target.value })
                    }
                    className={inputClassName}
                    placeholder="My Amazing Collection"
                  />
                </div>

                {/* Collection Address */}
                <div>
                  <label className="block text-sm text-gray-300 font-medium mb-2">
                    Collection Address / Mint Authority <span className="text-red-400">*</span>
                  </label>
                  <Input
                    required
                    value={form.collectionAddress}
                    onChange={(e) =>
                      setForm({ ...form, collectionAddress: e.target.value })
                    }
                    className={inputClassName}
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
                  <Select
                    value={form.category}
                    onValueChange={(value) =>
                      value && setForm({ ...form, category: value })
                    }
                  >
                    <SelectTrigger className="h-11 w-full border-white/10 bg-dark-900/70 px-4 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border border-white/10 bg-dark-800 text-white">
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm text-gray-300 font-medium mb-2">
                    Description <span className="text-red-400">*</span>
                  </label>
                  <Textarea
                    required
                    rows={3}
                    maxLength={500}
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                    className={textareaClassName}
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
                  <Textarea
                    required
                    rows={3}
                    maxLength={300}
                    value={form.pitch}
                    onChange={(e) =>
                      setForm({ ...form, pitch: e.target.value })
                    }
                    className={textareaClassName}
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
                    <Input
                      key={index}
                      value={img}
                      onChange={(e) => {
                        const newImages = [...form.sampleImages];
                        newImages[index] = e.target.value;
                        setForm({ ...form, sampleImages: newImages });
                      }}
                      className={`${inputClassName} mb-2`}
                      placeholder={`Image URL ${index + 1} (optional)`}
                      type="url"
                    />
                  ))}
                </div>

                {/* Website */}
                <div>
                  <label className="block text-sm text-gray-300 font-medium mb-2">
                    Website (optional)
                  </label>
                  <Input
                    value={form.website}
                    onChange={(e) =>
                      setForm({ ...form, website: e.target.value })
                    }
                    className={inputClassName}
                    placeholder="https://example.com"
                    type="url"
                  />
                </div>

                {/* Twitter */}
                <div>
                  <label className="block text-sm text-gray-300 font-medium mb-2">
                    Twitter Handle (optional)
                  </label>
                  <Input
                    value={form.twitter}
                    onChange={(e) =>
                      setForm({ ...form, twitter: e.target.value })
                    }
                    className={inputClassName}
                    placeholder="@yourhandle"
                    type="text"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  size="lg"
                  className="mt-4 h-12 w-full bg-gold-500 text-dark-900 hover:bg-gold-600"
                >
                  {loading ? "Submitting..." : "Submit Application"}
                </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="max-w-2xl mb-16">
            <Card className="border border-white/8 bg-dark-800/90 py-0 text-center shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
              <CardContent className="p-12">
                <div className="text-5xl mb-6">✅</div>
                <h2 className="font-serif text-2xl text-white mb-3">
                  Application Submitted!
                </h2>
                <p className="text-gray-400 text-base mb-8">
                  We&apos;ll review your application within 48 hours. Check back soon for updates.
                </p>
                <Button
                  variant="outline"
                  onClick={() => setSubmitted(false)}
                  className="h-11 border-white/10 bg-dark-900 text-white hover:bg-white/5"
                >
                  Submit Another Application
                </Button>
              </CardContent>
            </Card>
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
                <Card
                  key={app.id}
                  className="border border-white/8 bg-dark-800/90 py-0 shadow-[0_16px_48px_rgba(0,0,0,0.24)]"
                >
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-white font-semibold text-lg">
                          {app.collectionName}
                        </h3>
                        <p className="text-gray-500 text-xs mt-1">
                          {app.category}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusColor(
                          app.status
                        )}`}
                      >
                        {getStatusLabel(app.status)}
                      </Badge>
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
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
