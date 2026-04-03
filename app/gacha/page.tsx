"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

// Machine tiers
const TIERS = [
  {
    id: "common",
    name: "Common Pull",
    price: 10,
    currency: "USDC",
    color: "#4a9eff",
    glow: "rgba(74, 158, 255, 0.4)",
    description: "Common & uncommon cards",
    odds: "Common 70% · Uncommon 25% · Rare 5%",
  },
  {
    id: "rare",
    name: "Rare Pull",
    price: 25,
    currency: "USDC",
    color: "#b44fff",
    glow: "rgba(180, 79, 255, 0.4)",
    description: "Rare & ultra rare cards",
    odds: "Rare 60% · Ultra Rare 30% · Secret Rare 10%",
  },
  {
    id: "ultra",
    name: "Ultra Pull",
    price: 40,
    currency: "USDC",
    color: "#d4af37",
    glow: "rgba(212, 175, 55, 0.5)",
    description: "Premium graded & ultra rare cards",
    odds: "Ultra Rare 50% · Secret Rare 35% · Pristine 15%",
  },
];

type PullState = "idle" | "paying" | "spinning" | "revealing" | "done";

export default function GachaPage() {
  const [selectedTier, setSelectedTier] = useState(TIERS[2]); // default $40
  const [pullState, setPullState] = useState<PullState>("idle");
  const [revealedCard, setRevealedCard] = useState<any>(null);
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; color: string }[]>([]);

  const handlePull = async () => {
    if (pullState !== "idle") return;
    setPullState("paying");
    // Simulate payment + pull (will be wired to real logic later)
    await new Promise(r => setTimeout(r, 1000));
    setPullState("spinning");
    await new Promise(r => setTimeout(r, 2000));
    setPullState("revealing");
    // Mock revealed card
    setRevealedCard({
      name: "Charizard VSTAR",
      set: "Pokémon GO",
      rarity: "Ultra Rare",
      grade: "PSA 10",
      image: "/placeholder-card.jpg",
      value: "$45.00",
    });
    // Spawn particles
    const newParticles = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      color: selectedTier.color,
    }));
    setParticles(newParticles);
    await new Promise(r => setTimeout(r, 3000));
    setPullState("done");
  };

  const handleReset = () => {
    setPullState("idle");
    setRevealedCard(null);
    setParticles([]);
  };

  return (
    <div className="min-h-screen bg-[#070b1a]" style={{ backgroundImage: "radial-gradient(ellipse at 50% 0%, rgba(212,175,55,0.08) 0%, transparent 60%)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-[#d4af37] flex items-center justify-center">
            <span className="text-[#070b1a] font-serif font-semibold text-sm">A</span>
          </div>
          <span className="font-serif text-lg font-bold italic" style={{ color: "#f5f5f0" }}>Artifacte</span>
        </Link>
        <WalletMultiButton />
      </div>

      <div className="max-w-5xl mx-auto px-4 py-12">
        {/* Title */}
        <div className="text-center mb-10">
          <h1 className="font-serif text-5xl font-bold mb-2" style={{ color: "#d4af37" }}>
            Card Machine
          </h1>
          <p className="text-gray-400 text-lg">Pull rare trading cards. Every pull is on-chain.</p>
        </div>

        {/* Vending Machine */}
        <div className="relative mx-auto" style={{ maxWidth: 480 }}>
          {/* Machine body */}
          <div
            className="relative rounded-2xl overflow-hidden"
            style={{
              background: "linear-gradient(180deg, #1a1f35 0%, #0d1020 100%)",
              border: "1px solid rgba(212,175,55,0.3)",
              boxShadow: `0 0 60px rgba(212,175,55,0.1), inset 0 1px 0 rgba(255,255,255,0.05)`,
            }}
          >
            {/* Top sign */}
            <div
              className="text-center py-4 border-b"
              style={{ borderColor: "rgba(212,175,55,0.2)", background: "rgba(212,175,55,0.05)" }}
            >
              <span
                className="font-serif text-2xl font-bold tracking-widest"
                style={{ color: "#d4af37", textShadow: `0 0 20px rgba(212,175,55,0.8)` }}
              >
                ARTIFACTE
              </span>
              <p className="text-xs text-gray-500 mt-1 tracking-widest uppercase">Premium Card Machine</p>
            </div>

            {/* Display window */}
            <div className="p-6">
              <div
                className="relative rounded-xl overflow-hidden flex items-center justify-center"
                style={{
                  height: 260,
                  background: "linear-gradient(135deg, #0a0e1a 0%, #111827 100%)",
                  border: `1px solid ${selectedTier.color}40`,
                  boxShadow: `inset 0 0 40px ${selectedTier.glow}`,
                }}
              >
                {/* Particle effects */}
                {particles.map(p => (
                  <div
                    key={p.id}
                    className="absolute w-1.5 h-1.5 rounded-full animate-bounce"
                    style={{
                      left: `${p.x}%`,
                      top: `${p.y}%`,
                      background: p.color,
                      boxShadow: `0 0 6px ${p.color}`,
                      animationDelay: `${p.id * 0.1}s`,
                      animationDuration: `${0.5 + Math.random()}s`,
                    }}
                  />
                ))}

                {pullState === "idle" && (
                  <div className="text-center">
                    <div
                      className="text-6xl mb-3"
                      style={{ filter: `drop-shadow(0 0 20px ${selectedTier.color})` }}
                    >
                      🃏
                    </div>
                    <p className="text-gray-400 text-sm">Select a tier and pull</p>
                  </div>
                )}

                {pullState === "paying" && (
                  <div className="text-center">
                    <div className="w-10 h-10 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-3"
                      style={{ borderColor: selectedTier.color, borderTopColor: "transparent" }} />
                    <p className="text-gray-300 text-sm">Processing payment...</p>
                  </div>
                )}

                {pullState === "spinning" && (
                  <div className="text-center">
                    <div
                      className="text-6xl animate-spin mb-3"
                      style={{ animationDuration: "0.5s", filter: `drop-shadow(0 0 30px ${selectedTier.color})` }}
                    >
                      ✨
                    </div>
                    <p style={{ color: selectedTier.color }} className="text-sm font-medium">Selecting your card...</p>
                  </div>
                )}

                {(pullState === "revealing" || pullState === "done") && revealedCard && (
                  <div className="text-center animate-pulse p-4">
                    <div
                      className="w-32 h-44 mx-auto rounded-lg mb-3 flex items-center justify-center"
                      style={{
                        background: "linear-gradient(135deg, #1a1f35, #0d1020)",
                        border: `2px solid ${selectedTier.color}`,
                        boxShadow: `0 0 30px ${selectedTier.glow}`,
                      }}
                    >
                      <span className="text-4xl">🃏</span>
                    </div>
                    <p className="font-semibold text-white text-sm">{revealedCard.name}</p>
                    <p className="text-xs text-gray-400">{revealedCard.set}</p>
                    <p className="text-xs mt-1" style={{ color: selectedTier.color }}>{revealedCard.rarity}</p>
                    <p className="text-xs text-gray-300 mt-0.5">{revealedCard.grade} · {revealedCard.value}</p>
                  </div>
                )}
              </div>

              {/* Dispenser slot */}
              <div
                className="mt-4 rounded-lg h-10 flex items-center justify-center"
                style={{
                  background: "rgba(0,0,0,0.5)",
                  border: `1px solid ${selectedTier.color}30`,
                  boxShadow: `inset 0 2px 8px rgba(0,0,0,0.5)`,
                }}
              >
                <div className="w-16 h-1 rounded-full" style={{ background: selectedTier.color, opacity: 0.4 }} />
              </div>
            </div>

            {/* Tier selector */}
            <div className="px-6 pb-4">
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">Select Tier</p>
              <div className="grid grid-cols-3 gap-2">
                {TIERS.map(tier => (
                  <button
                    key={tier.id}
                    onClick={() => pullState === "idle" && setSelectedTier(tier)}
                    className="rounded-lg py-3 px-2 text-center transition-all duration-200"
                    style={{
                      background: selectedTier.id === tier.id
                        ? `${tier.color}20`
                        : "rgba(255,255,255,0.03)",
                      border: `1px solid ${selectedTier.id === tier.id ? tier.color : "rgba(255,255,255,0.08)"}`,
                      boxShadow: selectedTier.id === tier.id ? `0 0 15px ${tier.glow}` : "none",
                    }}
                  >
                    <div className="text-xs font-bold" style={{ color: tier.color }}>${tier.price}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{tier.name.split(" ")[0]}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Odds display */}
            <div className="px-6 pb-4">
              <p className="text-xs text-gray-600">{selectedTier.odds}</p>
            </div>

            {/* Pull button */}
            <div className="px-6 pb-6">
              {pullState === "done" ? (
                <div className="space-y-2">
                  <button
                    onClick={handleReset}
                    className="w-full py-3 rounded-xl font-semibold text-sm transition-all"
                    style={{ background: `${selectedTier.color}20`, border: `1px solid ${selectedTier.color}`, color: selectedTier.color }}
                  >
                    Pull Again
                  </button>
                  <button className="w-full py-2 rounded-xl text-xs text-gray-400 border border-white/10">
                    View in Portfolio
                  </button>
                </div>
              ) : (
                <button
                  onClick={handlePull}
                  disabled={pullState !== "idle"}
                  className="w-full py-4 rounded-xl font-semibold text-base transition-all duration-200 disabled:opacity-50"
                  style={{
                    background: pullState === "idle"
                      ? `linear-gradient(135deg, ${selectedTier.color}, ${selectedTier.color}cc)`
                      : "rgba(255,255,255,0.05)",
                    color: pullState === "idle" ? "#070b1a" : "#666",
                    boxShadow: pullState === "idle" ? `0 4px 20px ${selectedTier.glow}` : "none",
                  }}
                >
                  {pullState === "idle" ? `Pull for $${selectedTier.price} USDC` : "Processing..."}
                </button>
              )}
            </div>
          </div>

          {/* Stats strip */}
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            {[
              { label: "Total Pulls", value: "—" },
              { label: "Cards Available", value: "—" },
              { label: "Rarest Pull", value: "—" },
            ].map(stat => (
              <div key={stat.label} className="rounded-lg py-3 px-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="text-sm font-semibold text-white">{stat.value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* How it works */}
        <div className="mt-12 max-w-lg mx-auto">
          <h2 className="font-serif text-xl font-bold text-white text-center mb-6">How it works</h2>
          <div className="space-y-3">
            {[
              { step: "1", text: "Select a pull tier based on your budget" },
              { step: "2", text: "Pay in USDC — transaction goes on-chain" },
              { step: "3", text: "A random card from the pool is selected" },
              { step: "4", text: "Card is transferred to your wallet instantly" },
            ].map(item => (
              <div key={item.step} className="flex items-center gap-4 p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm"
                  style={{ background: "rgba(212,175,55,0.15)", color: "#d4af37", border: "1px solid rgba(212,175,55,0.3)" }}>
                  {item.step}
                </div>
                <p className="text-gray-300 text-sm">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
