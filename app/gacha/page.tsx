"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

const PULL_PRICE = 40;

const TIERS = [
  { id: "common", name: "Common", color: "#94a3b8", glow: "rgba(148,163,184,0.3)", odds: "80%", valueRange: "$24–48" },
  { id: "uncommon", name: "Uncommon", color: "#f97316", glow: "rgba(249,115,22,0.4)", odds: "15%", valueRange: "$48–88" },
  { id: "rare", name: "Rare", color: "#ef4444", glow: "rgba(239,68,68,0.4)", odds: "4%", valueRange: "$88–200" },
  { id: "epic", name: "Epic", color: "#d4af37", glow: "rgba(212,175,55,0.5)", odds: "1%", valueRange: "$200+" },
];

type PullState = "idle" | "paying" | "spinning" | "revealing" | "done";

export default function GachaPage() {
  const [pullState, setPullState] = useState<PullState>("idle");
  const [revealedCard, setRevealedCard] = useState<any>(null);
  const [revealedTier, setRevealedTier] = useState<any>(null);
  const [particles, setParticles] = useState<{ id: number; x: number; y: number }[]>([]);

  const handlePull = async () => {
    if (pullState !== "idle") return;
    setPullState("paying");
    await new Promise(r => setTimeout(r, 1200));
    setPullState("spinning");
    await new Promise(r => setTimeout(r, 2500));

    // Mock result — weighted random
    const rand = Math.random() * 100;
    const tier = rand < 1 ? TIERS[3] : rand < 5 ? TIERS[2] : rand < 20 ? TIERS[1] : TIERS[0];
    setRevealedTier(tier);
    setRevealedCard({
      name: "Son Goku, Awakened Power",
      set: "Fusion World OP08",
      rarity: tier.name,
      number: "OP08-001",
    });

    const newParticles = Array.from({ length: 24 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
    }));
    setParticles(newParticles);
    setPullState("revealing");
    await new Promise(r => setTimeout(r, 500));
    setPullState("done");
  };

  const handleReset = () => {
    setPullState("idle");
    setRevealedCard(null);
    setRevealedTier(null);
    setParticles([]);
  };

  const activeColor = revealedTier?.color || "#f97316";
  const activeGlow = revealedTier?.glow || "rgba(249,115,22,0.4)";

  return (
    <div
      className="min-h-screen"
      style={{
        background: "radial-gradient(ellipse at 50% -10%, rgba(239,68,68,0.12) 0%, #070b1a 55%)",
        backgroundColor: "#070b1a",
      }}
    >
      {/* Nav */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-[#d4af37] flex items-center justify-center">
            <span className="text-[#070b1a] font-serif font-semibold text-sm">A</span>
          </div>
          <span className="font-serif text-lg font-bold italic" style={{ color: "#f5f5f0", letterSpacing: "-0.02em" }}>
            Artifacte
          </span>
        </Link>
        <WalletMultiButton />
      </div>

      <div className="max-w-lg mx-auto px-4 py-10">
        {/* Header */}
        <div className="text-center mb-8">
          <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">Powered by Artifacte</p>
          <h1 className="font-serif text-4xl font-bold text-white mb-1">
            Dragon Ball Z
          </h1>
          <h2 className="font-serif text-2xl font-bold mb-3" style={{ color: "#f97316" }}>
            Fusion World Machine
          </h2>
          <p className="text-gray-400 text-sm">Every pull is on-chain. Cards delivered to your wallet.</p>
        </div>

        {/* Machine */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "linear-gradient(180deg, #13172b 0%, #0a0d1c 100%)",
            border: "1px solid rgba(239,68,68,0.25)",
            boxShadow: "0 0 80px rgba(239,68,68,0.08), inset 0 1px 0 rgba(255,255,255,0.04)",
          }}
        >
          {/* Top bar */}
          <div
            className="flex items-center justify-between px-5 py-3 border-b"
            style={{ borderColor: "rgba(239,68,68,0.15)", background: "rgba(239,68,68,0.05)" }}
          >
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-[#d4af37] flex items-center justify-center">
                <span className="text-[#070b1a] font-serif font-bold text-xs">A</span>
              </div>
              <span className="font-serif text-sm font-bold italic" style={{ color: "#f5f5f0" }}>Artifacte</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs text-gray-400">Live</span>
            </div>
          </div>

          {/* Display window */}
          <div className="p-5">
            <div
              className="relative rounded-xl overflow-hidden flex items-center justify-center"
              style={{
                height: 280,
                background: "linear-gradient(135deg, #090c18 0%, #0f1424 100%)",
                border: `1px solid ${pullState === "idle" ? "rgba(239,68,68,0.2)" : `${activeColor}40`}`,
                boxShadow: pullState !== "idle" ? `inset 0 0 60px ${activeGlow}` : "inset 0 0 40px rgba(239,68,68,0.06)",
                transition: "all 0.5s ease",
              }}
            >
              {/* Corner energy lines */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 rounded-tl-lg" style={{ borderColor: "rgba(239,68,68,0.4)" }} />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 rounded-tr-lg" style={{ borderColor: "rgba(239,68,68,0.4)" }} />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 rounded-bl-lg" style={{ borderColor: "rgba(239,68,68,0.4)" }} />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 rounded-br-lg" style={{ borderColor: "rgba(239,68,68,0.4)" }} />

              {/* Particles */}
              {particles.map(p => (
                <div
                  key={p.id}
                  className="absolute w-1.5 h-1.5 rounded-full"
                  style={{
                    left: `${p.x}%`,
                    top: `${p.y}%`,
                    background: activeColor,
                    boxShadow: `0 0 8px ${activeColor}`,
                    animation: "ping 1s cubic-bezier(0,0,0.2,1) forwards",
                    animationDelay: `${p.id * 0.05}s`,
                  }}
                />
              ))}

              {/* States */}
              {pullState === "idle" && (
                <div className="text-center">
                  <div className="text-7xl mb-3" style={{ filter: "drop-shadow(0 0 20px rgba(239,68,68,0.6))" }}>
                    🐉
                  </div>
                  <p className="text-gray-500 text-sm">Connect wallet and pull</p>
                </div>
              )}

              {pullState === "paying" && (
                <div className="text-center">
                  <div
                    className="w-12 h-12 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-3"
                    style={{ borderColor: "#f97316", borderTopColor: "transparent" }}
                  />
                  <p className="text-orange-400 text-sm">Processing $40 USDC...</p>
                </div>
              )}

              {pullState === "spinning" && (
                <div className="text-center">
                  <div
                    className="text-6xl mb-3"
                    style={{ animation: "spin 0.4s linear infinite", filter: "drop-shadow(0 0 30px #f97316)" }}
                  >
                    ⚡
                  </div>
                  <p className="text-orange-400 text-sm font-medium animate-pulse">Selecting your card...</p>
                </div>
              )}

              {(pullState === "revealing" || pullState === "done") && revealedCard && revealedTier && (
                <div className="text-center px-4">
                  {/* Card */}
                  <div
                    className="w-32 h-44 mx-auto rounded-xl mb-3 flex flex-col items-center justify-center relative overflow-hidden"
                    style={{
                      background: `linear-gradient(135deg, ${revealedTier.color}20, #0a0d1c)`,
                      border: `2px solid ${revealedTier.color}`,
                      boxShadow: `0 0 40px ${revealedTier.glow}, inset 0 0 20px ${revealedTier.glow}`,
                    }}
                  >
                    <div className="text-4xl mb-1">🃏</div>
                    <div
                      className="absolute bottom-0 left-0 right-0 py-1 text-xs font-bold text-center"
                      style={{ background: `${revealedTier.color}30`, color: revealedTier.color }}
                    >
                      {revealedTier.name.toUpperCase()}
                    </div>
                  </div>
                  <p className="font-semibold text-white text-sm leading-tight">{revealedCard.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{revealedCard.set} · {revealedCard.number}</p>
                  <p className="text-xs mt-1 font-medium" style={{ color: revealedTier.color }}>{revealedTier.valueRange}</p>
                </div>
              )}
            </div>

            {/* Dispenser slot */}
            <div
              className="mt-3 h-8 rounded-lg flex items-center justify-center"
              style={{
                background: "rgba(0,0,0,0.6)",
                border: "1px solid rgba(239,68,68,0.15)",
                boxShadow: "inset 0 2px 8px rgba(0,0,0,0.8)",
              }}
            >
              <div className="w-20 h-0.5 rounded-full" style={{ background: "rgba(239,68,68,0.3)" }} />
            </div>
          </div>

          {/* Odds info */}
          <div className="px-5 pb-3">
            <div className="grid grid-cols-4 gap-1.5">
              {TIERS.map(t => (
                <div
                  key={t.id}
                  className="rounded-lg py-2 text-center"
                  style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${t.color}25` }}
                >
                  <div className="text-xs font-bold" style={{ color: t.color }}>{t.odds}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{t.name}</div>
                  <div className="text-xs text-gray-600">{t.valueRange}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Pull button */}
          <div className="px-5 pb-5">
            {pullState === "done" ? (
              <div className="space-y-2">
                <button
                  onClick={handleReset}
                  className="w-full py-4 rounded-xl font-bold text-sm transition-all"
                  style={{
                    background: "linear-gradient(135deg, #ef4444, #f97316)",
                    color: "white",
                    boxShadow: "0 4px 20px rgba(239,68,68,0.4)",
                  }}
                >
                  Pull Again · $40 USDC
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className="py-2.5 rounded-xl text-xs font-medium border transition-all"
                    style={{ borderColor: "rgba(212,175,55,0.3)", color: "#d4af37", background: "rgba(212,175,55,0.05)" }}
                  >
                    Claim Card
                  </button>
                  <button
                    className="py-2.5 rounded-xl text-xs font-medium border transition-all"
                    style={{ borderColor: "rgba(255,255,255,0.1)", color: "#94a3b8", background: "rgba(255,255,255,0.03)" }}
                  >
                    Leave in Machine
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={handlePull}
                disabled={pullState !== "idle"}
                className="w-full py-4 rounded-xl font-bold text-base transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: pullState === "idle"
                    ? "linear-gradient(135deg, #ef4444 0%, #f97316 100%)"
                    : "rgba(255,255,255,0.05)",
                  color: pullState === "idle" ? "white" : "#555",
                  boxShadow: pullState === "idle" ? "0 4px 24px rgba(239,68,68,0.4)" : "none",
                }}
              >
                {pullState === "idle" ? "Pull · $40 USDC" : "Processing..."}
              </button>
            )}
          </div>

          {/* Footer */}
          <div
            className="px-5 py-3 border-t flex items-center justify-between"
            style={{ borderColor: "rgba(255,255,255,0.04)" }}
          >
            <span className="text-xs text-gray-600">Dragon Ball Z · Fusion World</span>
            <span className="text-xs text-gray-600">5% royalty on resale</span>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            { label: "Total Pulls", value: "—" },
            { label: "Cards Remaining", value: "100" },
            { label: "Biggest Win", value: "—" },
          ].map(s => (
            <div
              key={s.label}
              className="rounded-xl py-3 text-center"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
            >
              <div className="text-sm font-semibold text-white">{s.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* How it works */}
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-4 text-center">How it works</h3>
          <div className="space-y-2">
            {[
              { n: "1", t: "Pay $40 USDC — transaction confirmed on Solana" },
              { n: "2", t: "A random Dragon Ball Z card is selected from the pool" },
              { n: "3", t: "Claim it to your wallet, or leave it in the machine" },
              { n: "4", t: "Unclaimed cards can be pulled again by other users" },
            ].map(i => (
              <div
                key={i.n}
                className="flex items-center gap-3 p-3 rounded-xl"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                  style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" }}
                >
                  {i.n}
                </div>
                <p className="text-gray-300 text-sm">{i.t}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
