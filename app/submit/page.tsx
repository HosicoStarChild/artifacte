"use client";

import { useState } from "react";

const steps = [
  { icon: "💬", title: "Describe The Asset", desc: "Provide details about your real-world asset including type, condition, and estimated value." },
  { icon: "📤", title: "Upload Proof & Documentation", desc: "Submit certificates, appraisals, photos, and any legal documentation for verification." },
  { icon: "📋", title: "Review And Submit", desc: "Review your submission details and confirm everything is accurate before submitting." },
  { icon: "🔗", title: "Asset Verification", desc: "Our team verifies authenticity, ownership, and documentation of your asset." },
  { icon: "🏛️", title: "Auction Goes Live", desc: "Once verified, your asset NFT is minted on Solana and the auction goes live." },
];

export default function SubmitPage() {
  const [form, setForm] = useState({
    name: "", category: "DIGITAL_ART", description: "", value: "", condition: "", contact: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) setSubmitted(true);
    } catch (err) {
      console.error("Submit failed:", err);
    } finally {
      setSubmitting(false);
    }
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
                  disabled={submitting}
                  className="w-full py-3 bg-gold-500 hover:bg-gold-600 text-navy-900 rounded-lg font-semibold text-sm transition mt-2 disabled:opacity-50"
                >
                  {submitting ? "Submitting..." : "Submit Now"}
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
                onClick={() => { setSubmitted(false); setForm({ name: "", category: "REAL_ESTATE", description: "", value: "", condition: "", contact: "" }); }}
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
