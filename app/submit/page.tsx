"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";

interface SubmissionForm {
  name: string;
  category: string;
  description: string;
  photos: string[];
  contact: string;
}

const steps = [
  { icon: "💬", title: "Describe The Asset", desc: "Provide details about your real-world asset including type, condition, and estimated value." },
  { icon: "📤", title: "Upload Proof & Documentation", desc: "Submit certificates, appraisals, photos, and any legal documentation for verification." },
  { icon: "📋", title: "Review And Submit", desc: "Review your submission details and confirm everything is accurate before submitting." },
  { icon: "🔗", title: "Asset Verification", desc: "Our team verifies authenticity, ownership, and documentation of your asset." },
  { icon: "🏛️", title: "Auction Goes Live", desc: "Once verified, your asset NFT is minted on Solana and the auction goes live." },
];

const categories = [
  "TCG Cards",
  "Sports Cards",
  "Watches",
  "Spirits",
  "Digital Art",
  "Sealed Product",
  "Merchandise",
];

export default function SubmitPage() {
  const { publicKey, connected } = useWallet();
  const [form, setForm] = useState<SubmissionForm>({
    name: "",
    category: "Digital Art",
    description: "",
    photos: ["", "", "", "", ""],
    contact: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const handlePhotoChange = (index: number, value: string) => {
    const newPhotos = [...form.photos];
    newPhotos[index] = value;
    setForm({ ...form, photos: newPhotos });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Validate form
      if (!form.name.trim()) {
        throw new Error("Item name is required");
      }
      if (!form.description.trim()) {
        throw new Error("Description is required");
      }
      if (!form.contact.trim()) {
        throw new Error("Contact info is required");
      }

      // Filter out empty photo URLs
      const filledPhotos = form.photos.filter(p => p.trim().length > 0);
      if (filledPhotos.length === 0) {
        throw new Error("Please provide at least one photo URL");
      }

      if (!connected || !publicKey) {
        throw new Error("Please connect your wallet first");
      }

      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          category: form.category,
          description: form.description,
          photos: filledPhotos,
          sellerWallet: publicKey.toBase58(),
          contact: form.contact,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Submission failed");
      }

      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || "Failed to submit");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pt-24 pb-20 min-h-screen bg-dark-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header Section */}
        <div className="max-w-2xl mb-16">
          <p className="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-4">Submit Asset</p>
          <h1 className="font-serif text-4xl text-white mb-4">
            How to Submit Real-World Asset NFTs for Auction
          </h1>
          <p className="text-gray-400 text-base leading-relaxed">
            List your real-world assets as NFTs in just a few simple steps — secure, transparent, and globally accessible.
          </p>
        </div>

        {/* Steps */}
        <div className="max-w-xl mb-16">
          <div className="relative">
            <div className="absolute left-[18px] top-2 bottom-2 w-px bg-white/10" />
            <div className="space-y-8">
              {steps.map((step, i) => (
                <div key={i} className="flex items-start gap-5 relative">
                  <div className="w-9 h-9 rounded-lg bg-dark-800 border border-white/10 flex items-center justify-center shrink-0 z-10 text-lg">
                    {step.icon}
                  </div>
                  <div>
                    <h3 className="text-white font-semibold text-base">{step.title}</h3>
                    <p className="text-gray-500 text-sm mt-1">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Submission Form */}
        {!submitted ? (
          <div className="max-w-2xl">
            <div className="bg-dark-800 rounded-xl border border-white/5 p-8">
              <h2 className="font-serif text-2xl text-white mb-6">Submit Now</h2>

              {!connected ? (
                <div className="bg-amber-900/20 border border-amber-700 rounded-lg p-4 mb-6 text-amber-400 text-sm">
                  Please connect your wallet to submit an asset.
                </div>
              ) : null}

              {error && (
                <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 mb-6 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Item Name */}
                <div>
                  <label className="block text-sm text-gold-400 mb-2 font-medium">Item Name *</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-hidden focus:border-gold-500 transition"
                    placeholder="e.g. Vintage Rolex Submariner"
                    disabled={!connected}
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="block text-sm text-gold-400 mb-2 font-medium">Category *</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-hidden focus:border-gold-500 transition"
                    disabled={!connected}
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm text-gold-400 mb-2 font-medium">Description *</label>
                  <textarea
                    required
                    rows={4}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-hidden focus:border-gold-500 transition resize-none"
                    placeholder="Describe your asset, condition, provenance, and any relevant details..."
                    disabled={!connected}
                  />
                </div>

                {/* Photos */}
                <div>
                  <label className="block text-sm text-gold-400 mb-2 font-medium">Photos (URLs) *</label>
                  <p className="text-gray-500 text-xs mb-3">
                    Provide up to 5 image URLs. At least one is required.
                  </p>
                  <div className="space-y-3">
                    {form.photos.map((photo, index) => (
                      <input
                        key={index}
                        type="url"
                        value={photo}
                        onChange={(e) => handlePhotoChange(index, e.target.value)}
                        className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-hidden focus:border-gold-500 transition"
                        placeholder={`Photo ${index + 1} URL (optional)`}
                        disabled={!connected}
                      />
                    ))}
                  </div>
                </div>

                {/* Contact */}
                <div>
                  <label className="block text-sm text-gold-400 mb-2 font-medium">Contact (Email or Telegram) *</label>
                  <input
                    type="text"
                    required
                    value={form.contact}
                    onChange={(e) => setForm({ ...form, contact: e.target.value })}
                    className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-hidden focus:border-gold-500 transition"
                    placeholder="email@example.com or @telegram_username"
                    disabled={!connected}
                  />
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={!connected || loading}
                  className={`w-full py-3 rounded-lg font-semibold text-sm transition mt-8 ${
                    !connected || loading
                      ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                      : "bg-gold-500 hover:bg-gold-600 text-dark-900"
                  }`}
                >
                  {loading ? "Submitting..." : !connected ? "Connect Wallet to Submit" : "Submit Asset"}
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl">
            <div className="bg-dark-800 rounded-xl border border-white/5 p-12 text-center">
              <div className="text-6xl mb-4">✅</div>
              <h2 className="font-serif text-2xl text-white mb-2">Submission Received</h2>
              <p className="text-gray-400 text-sm mb-6">
                Your asset submission is under review. Our verification team will contact you within 48 hours at the email or Telegram handle you provided.
              </p>
              <button
                onClick={() => {
                  setSubmitted(false);
                  setForm({
                    name: "",
                    category: "Digital Art",
                    description: "",
                    photos: ["", "", "", "", ""],
                    contact: "",
                  });
                  setError("");
                }}
                className="px-6 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm hover:bg-white/10 transition"
              >
                Submit Another Asset
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
