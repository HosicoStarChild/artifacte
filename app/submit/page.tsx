"use client";

import { useState, useEffect } from "react";
import { fetchAllowlist } from "@/lib/allowlist";

interface AllowlistEntry {
  mintAuthority: string;
  name: string;
  category: string;
}

const steps = [
  { icon: "💬", title: "Describe The Asset", desc: "Provide details about your real-world asset including type, condition, and estimated value." },
  { icon: "📤", title: "Upload Proof & Documentation", desc: "Submit certificates, appraisals, photos, and any legal documentation for verification." },
  { icon: "📋", title: "Review And Submit", desc: "Review your submission details and confirm everything is accurate before submitting." },
  { icon: "🔗", title: "Asset Verification", desc: "Our team verifies authenticity, ownership, and documentation of your asset." },
  { icon: "🏛️", title: "Auction Goes Live", desc: "Once verified, your asset NFT is minted on Solana and the auction goes live." },
];

export default function SubmitPage() {
  const [form, setForm] = useState({
    name: "", category: "DIGITAL_ART", description: "", value: "", condition: "", contact: "", collectionMint: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [allowlist, setAllowlist] = useState<AllowlistEntry[]>([]);
  const [isCollectionAllowlisted, setIsCollectionAllowlisted] = useState(false);
  const [checkingAllowlist, setCheckingAllowlist] = useState(false);
  const [allowlistError, setAllowlistError] = useState<string | null>(null);

  // Fetch allowlist on mount
  useEffect(() => {
    loadAllowlist();
  }, []);

  const loadAllowlist = async () => {
    const data = await fetchAllowlist();
    setAllowlist(data);
  };

  // Check if collection is allowlisted when mint authority changes
  useEffect(() => {
    if (form.collectionMint.trim().length === 0) {
      setIsCollectionAllowlisted(false);
      setAllowlistError(null);
      return;
    }

    setCheckingAllowlist(true);
    const isAllowed = allowlist.some(
      (entry) => entry.mintAuthority === form.collectionMint.trim()
    );
    setIsCollectionAllowlisted(isAllowed);
    setAllowlistError(
      !isAllowed
        ? "This collection is not yet approved for listing on Artifacte. Contact us to apply."
        : null
    );
    setCheckingAllowlist(false);
  }, [form.collectionMint, allowlist]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Check allowlist before submitting
    if (form.collectionMint.trim().length > 0 && !isCollectionAllowlisted) {
      setAllowlistError(
        "This collection is not yet approved for listing on Artifacte. Contact us to apply."
      );
      return;
    }

    setSubmitted(true);
  };

  return (
    <div className="pt-24 pb-20 min-h-screen">
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
                  <div className="w-9 h-9 rounded-lg bg-navy-800 border border-white/10 flex items-center justify-center flex-shrink-0 z-10 text-lg">
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
            <div className="bg-navy-800 rounded-xl border border-white/5 p-8">
              <h2 className="font-serif text-2xl text-white mb-6">Submit Now</h2>
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Collection Verification Section */}
                <div className="bg-navy-900 rounded-lg border border-white/10 p-4 mb-6">
                  <label className="block text-sm text-gray-400 mb-1.5 font-medium">NFT Collection Authority (Required)</label>
                  <p className="text-gray-500 text-xs mb-3">
                    Enter the mint authority of your NFT collection. Only allowlisted collections can be listed.
                  </p>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={form.collectionMint}
                      onChange={e => setForm({ ...form, collectionMint: e.target.value })}
                      className={`w-full bg-navy-800 border rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none transition ${
                        form.collectionMint.trim().length > 0
                          ? isCollectionAllowlisted
                            ? "border-green-500/50 focus:border-green-500"
                            : "border-red-500/50 focus:border-red-500"
                          : "border-white/10 focus:border-gold-500"
                      }`}
                      placeholder="Paste Solana mint authority address..."
                    />
                    {form.collectionMint.trim().length > 0 && (
                      <div className="absolute right-3 top-2.5">
                        {checkingAllowlist ? (
                          <div className="w-5 h-5 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
                        ) : isCollectionAllowlisted ? (
                          <span className="text-xl">✓</span>
                        ) : (
                          <span className="text-xl">✗</span>
                        )}
                      </div>
                    )}
                  </div>
                  {allowlistError && (
                    <p className="text-red-400 text-xs mt-2 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      {allowlistError}
                    </p>
                  )}
                  {isCollectionAllowlisted && (
                    <p className="text-green-400 text-xs mt-2 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      Collection verified! Ready to proceed.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Asset Name</label>
                  <input
                    type="text" required
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full bg-navy-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition"
                    placeholder="e.g. Miami Oceanfront Penthouse"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Category</label>
                  <select
                    value={form.category}
                    onChange={e => setForm({ ...form, category: e.target.value })}
                    className="w-full bg-navy-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition"
                  >
                    <option value="DIGITAL_ART">Digital Art</option>
                    <option value="SPIRITS">Spirits</option>
                    <option value="TCG_CARDS">TCG Cards</option>
                    <option value="SPORTS_CARDS">Sports Cards</option>
                    <option value="WATCHES">Watches</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Description</label>
                  <textarea
                    required rows={4}
                    value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                    className="w-full bg-navy-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition resize-none"
                    placeholder="Describe your asset, its history, and any relevant details..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1.5">Estimated Value (USD)</label>
                    <input
                      type="text" required
                      value={form.value}
                      onChange={e => setForm({ ...form, value: e.target.value })}
                      className="w-full bg-navy-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition"
                      placeholder="$100,000"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1.5">Condition Grade</label>
                    <input
                      type="text" required
                      value={form.condition}
                      onChange={e => setForm({ ...form, condition: e.target.value })}
                      className="w-full bg-navy-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition"
                      placeholder="e.g. Mint, A+, Museum Grade"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Contact Email</label>
                  <input
                    type="email" required
                    value={form.contact}
                    onChange={e => setForm({ ...form, contact: e.target.value })}
                    className="w-full bg-navy-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition"
                    placeholder="you@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Upload Documentation</label>
                  <div className="w-full bg-navy-900 border border-dashed border-white/20 rounded-lg px-4 py-8 text-center cursor-pointer hover:border-gold-500/50 transition">
                    <p className="text-gray-500 text-sm">📤 Click to upload or drag and drop</p>
                    <p className="text-gray-600 text-xs mt-1">PDF, PNG, JPG up to 50MB</p>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={form.collectionMint.trim().length > 0 && !isCollectionAllowlisted}
                  className={`w-full py-3 rounded-lg font-semibold text-sm transition mt-2 ${
                    form.collectionMint.trim().length > 0 && !isCollectionAllowlisted
                      ? "bg-gray-600 text-gray-400 cursor-not-allowed opacity-50"
                      : "bg-gold-500 hover:bg-gold-600 text-navy-900"
                  }`}
                >
                  {form.collectionMint.trim().length === 0
                    ? "Enter Collection Authority to Submit"
                    : isCollectionAllowlisted
                    ? "Submit Now"
                    : "Collection Not Approved"}
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl">
            <div className="bg-navy-800 rounded-xl border border-white/5 p-12 text-center">
              <div className="text-5xl mb-4">✅</div>
              <h2 className="font-serif text-2xl text-white mb-2">Submission Received</h2>
              <p className="text-gray-400 text-sm mb-6">
                Your asset submission is under review. Our verification team will contact you within 48 hours.
              </p>
              <button
                onClick={() => { setSubmitted(false); setForm({ name: "", category: "DIGITAL_ART", description: "", value: "", condition: "", contact: "", collectionMint: "" }); }}
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
