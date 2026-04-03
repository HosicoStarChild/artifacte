"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { soundClick, soundCharge, soundExplosion, soundReveal, soundEpicFanfare } from "@/lib/gacha-sounds";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

const TIERS = [
  { id: "common", name: "Common", color: "#94a3b8", glow: "rgba(148,163,184,0.3)", odds: "80%", valueRange: "$24–48" },
  { id: "uncommon", name: "Uncommon", color: "#f97316", glow: "rgba(249,115,22,0.5)", odds: "15%", valueRange: "$48–88" },
  { id: "rare", name: "Rare", color: "#ef4444", glow: "rgba(239,68,68,0.6)", odds: "4%", valueRange: "$88–200" },
  { id: "epic", name: "Epic", color: "#d4af37", glow: "rgba(212,175,55,0.7)", odds: "1%", valueRange: "$200+" },
];

type PullState = "idle" | "paying" | "blackout" | "charge" | "flash" | "reveal" | "done";

export default function GachaPage() {
  const [pullState, setPullState] = useState<PullState>("idle");
  const [revealedCard, setRevealedCard] = useState<any>(null);
  const [revealedTier, setRevealedTier] = useState<any>(null);
  const [shake, setShake] = useState(false);
  const [flashOpacity, setFlashOpacity] = useState(0);
  const [cardScale, setCardScale] = useState(0);
  const [cardOpacity, setCardOpacity] = useState(0);
  const [glowIntensity, setGlowIntensity] = useState(0);
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; angle: number; dist: number }[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const handlePull = async () => {
    if (pullState !== "idle") return;
    soundClick();

    // 1. Payment processing
    setPullState("paying");
    await new Promise(r => setTimeout(r, 1000));

    // 2. Determine result
    const rand = Math.random() * 100;
    const tier = rand < 1 ? TIERS[3] : rand < 5 ? TIERS[2] : rand < 20 ? TIERS[1] : TIERS[0];
    setRevealedTier(tier);
    setRevealedCard({ name: "Son Goku, Awakened Power", set: "Fusion World OP08", number: "OP08-001", rarity: tier.name });

    // 3. Blackout — screen goes dark
    setPullState("blackout");
    await new Promise(r => setTimeout(r, 600));

    // 4. Charge up — energy building
    setPullState("charge");
    setGlowIntensity(0);
    soundCharge(0.9);
    for (let i = 0; i <= 10; i++) {
      await new Promise(r => setTimeout(r, 80));
      setGlowIntensity(i / 10);
    }

    // 5. Flash explosion
    setPullState("flash");
    soundExplosion();
    setFlashOpacity(1);
    // Screen shake for rare/epic
    if (tier.id === "rare" || tier.id === "epic") {
      setShake(true);
      setTimeout(() => setShake(false), 600);
    }
    await new Promise(r => setTimeout(r, 100));
    setFlashOpacity(0.6);
    await new Promise(r => setTimeout(r, 100));
    setFlashOpacity(0.3);
    await new Promise(r => setTimeout(r, 150));
    setFlashOpacity(0);

    // 6. Card materializes
    setPullState("reveal");
    setCardScale(0);
    setCardOpacity(0);
    // Sound on reveal
    if (tier.id === "rare" || tier.id === "epic") {
      soundEpicFanfare();
    } else {
      soundReveal(false);
    }

    // Spawn burst particles
    const burst = Array.from({ length: 32 }, (_, i) => ({
      id: i,
      x: 50,
      y: 50,
      angle: (i / 32) * 360,
      dist: 30 + Math.random() * 40,
    }));
    setParticles(burst);

    // Card scales in with bounce
    for (let i = 0; i <= 10; i++) {
      await new Promise(r => setTimeout(r, 30));
      const t = i / 10;
      // Ease out elastic
      const scale = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      setCardScale(Math.min(scale * 1.1, 1.08));
      setCardOpacity(Math.min(t * 2, 1));
    }
    setCardScale(1);

    await new Promise(r => setTimeout(r, 200));
    setParticles([]);
    setPullState("done");
  };

  const handleReset = () => {
    setPullState("idle");
    setRevealedCard(null);
    setRevealedTier(null);
    setShake(false);
    setFlashOpacity(0);
    setCardScale(0);
    setCardOpacity(0);
    setGlowIntensity(0);
    setParticles([]);
  };

  const isRevealing = pullState === "reveal" || pullState === "done";
  const activeColor = revealedTier?.color || "#ef4444";
  const activeGlow = revealedTier?.glow || "rgba(239,68,68,0.4)";

  return (
    <div
      className="min-h-screen"
      style={{
        background: "radial-gradient(ellipse at 50% -10%, rgba(239,68,68,0.12) 0%, #070b1a 55%)",
        backgroundColor: "#070b1a",
      }}
    >
      {/* Global flash overlay */}
      {flashOpacity > 0 && (
        <div
          className="fixed inset-0 z-50 pointer-events-none"
          style={{ background: `rgba(255,255,255,${flashOpacity})`, transition: "opacity 0.1s" }}
        />
      )}

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
          <h1 className="font-serif text-4xl font-bold text-white mb-1">Dragon Ball Z</h1>
          <h2 className="font-serif text-2xl font-bold mb-3" style={{ color: "#f97316" }}>Fusion World Machine</h2>
          <p className="text-gray-400 text-sm">Every pull is on-chain. Cards delivered to your wallet.</p>
        </div>

        {/* Machine */}
        <div
          ref={containerRef}
          className="rounded-2xl overflow-hidden"
          style={{
            background: "linear-gradient(180deg, #13172b 0%, #0a0d1c 100%)",
            border: "1px solid rgba(239,68,68,0.25)",
            boxShadow: "0 0 80px rgba(239,68,68,0.08), inset 0 1px 0 rgba(255,255,255,0.04)",
            transform: shake ? "translateX(0)" : "none",
            animation: shake ? "shake 0.6s cubic-bezier(.36,.07,.19,.97) both" : "none",
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
                height: 300,
                background: pullState === "blackout" ? "#000"
                  : pullState === "charge" ? `radial-gradient(circle at 50% 50%, ${activeColor}${Math.floor(glowIntensity * 30).toString(16).padStart(2, "0")} 0%, #090c18 70%)`
                  : "linear-gradient(135deg, #090c18 0%, #0f1424 100%)",
                border: `1px solid ${isRevealing || pullState === "charge" ? `${activeColor}60` : "rgba(239,68,68,0.2)"}`,
                boxShadow: isRevealing
                  ? `inset 0 0 80px ${activeGlow}, 0 0 40px ${activeGlow}`
                  : pullState === "charge"
                  ? `inset 0 0 ${Math.floor(glowIntensity * 60)}px ${activeGlow}`
                  : "inset 0 0 40px rgba(239,68,68,0.06)",
                transition: pullState === "blackout" ? "background 0.3s, box-shadow 0.3s" : "none",
              }}
            >
              {/* Corner energy lines */}
              {["tl", "tr", "bl", "br"].map(c => (
                <div
                  key={c}
                  className="absolute w-8 h-8"
                  style={{
                    top: c.includes("t") ? 0 : "auto",
                    bottom: c.includes("b") ? 0 : "auto",
                    left: c.includes("l") ? 0 : "auto",
                    right: c.includes("r") ? 0 : "auto",
                    borderTop: c.includes("t") ? `2px solid ${isRevealing ? activeColor : "rgba(239,68,68,0.4)"}` : "none",
                    borderBottom: c.includes("b") ? `2px solid ${isRevealing ? activeColor : "rgba(239,68,68,0.4)"}` : "none",
                    borderLeft: c.includes("l") ? `2px solid ${isRevealing ? activeColor : "rgba(239,68,68,0.4)"}` : "none",
                    borderRight: c.includes("r") ? `2px solid ${isRevealing ? activeColor : "rgba(239,68,68,0.4)"}` : "none",
                    borderRadius: c === "tl" ? "8px 0 0 0" : c === "tr" ? "0 8px 0 0" : c === "bl" ? "0 0 0 8px" : "0 0 8px 0",
                    transition: "border-color 0.3s",
                  }}
                />
              ))}

              {/* Burst particles */}
              {particles.map(p => (
                <div
                  key={p.id}
                  className="absolute w-2 h-2 rounded-full"
                  style={{
                    left: "50%",
                    top: "50%",
                    background: activeColor,
                    boxShadow: `0 0 10px ${activeColor}`,
                    transform: `translate(-50%, -50%) rotate(${p.angle}deg) translateX(${p.dist}px)`,
                    opacity: 0.8,
                    transition: "transform 0.4s ease-out, opacity 0.4s",
                  }}
                />
              ))}

              {/* IDLE */}
              {pullState === "idle" && (
                <div className="text-center">
                  <div className="text-7xl mb-3" style={{ filter: "drop-shadow(0 0 20px rgba(239,68,68,0.6))" }}>🐉</div>
                  <p className="text-gray-500 text-sm">Connect wallet and pull</p>
                </div>
              )}

              {/* PAYING */}
              {pullState === "paying" && (
                <div className="text-center">
                  <div className="w-12 h-12 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-3"
                    style={{ borderColor: "#f97316", borderTopColor: "transparent" }} />
                  <p className="text-orange-400 text-sm">Processing $40 USDC...</p>
                </div>
              )}

              {/* BLACKOUT */}
              {pullState === "blackout" && (
                <div className="text-center">
                  <p className="text-gray-600 text-xs animate-pulse">Preparing...</p>
                </div>
              )}

              {/* CHARGE */}
              {pullState === "charge" && (
                <div className="text-center">
                  <div
                    className="text-6xl mb-2"
                    style={{
                      filter: `drop-shadow(0 0 ${Math.floor(glowIntensity * 40)}px ${activeColor})`,
                      transform: `scale(${0.8 + glowIntensity * 0.4})`,
                      transition: "all 0.08s",
                    }}
                  >
                    ⚡
                  </div>
                  <div
                    className="h-1 rounded-full mx-auto mt-2 transition-all duration-75"
                    style={{ width: `${glowIntensity * 80}%`, background: `linear-gradient(90deg, ${activeColor}, ${activeColor}80)`, boxShadow: `0 0 10px ${activeColor}` }}
                  />
                </div>
              )}

              {/* REVEAL + DONE */}
              {isRevealing && revealedCard && revealedTier && (
                <div
                  className="text-center px-4"
                  style={{
                    transform: `scale(${cardScale})`,
                    opacity: cardOpacity,
                    transition: "none",
                  }}
                >
                  <div
                    className="w-36 h-48 mx-auto rounded-xl mb-3 flex flex-col items-center justify-center relative overflow-hidden"
                    style={{
                      background: `linear-gradient(135deg, ${revealedTier.color}30, #0a0d1c 60%)`,
                      border: `2px solid ${revealedTier.color}`,
                      boxShadow: `0 0 60px ${revealedTier.glow}, 0 0 120px ${revealedTier.glow}, inset 0 0 30px ${revealedTier.glow}`,
                    }}
                  >
                    <div className="text-4xl mb-1">🃏</div>
                    <div
                      className="absolute bottom-0 left-0 right-0 py-1.5 text-xs font-bold text-center"
                      style={{ background: `${revealedTier.color}40`, color: revealedTier.color }}
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
              style={{ background: "rgba(0,0,0,0.6)", border: "1px solid rgba(239,68,68,0.15)", boxShadow: "inset 0 2px 8px rgba(0,0,0,0.8)" }}
            >
              <div className="w-20 h-0.5 rounded-full" style={{ background: "rgba(239,68,68,0.3)" }} />
            </div>
          </div>

          {/* Odds */}
          <div className="px-5 pb-3">
            <div className="grid grid-cols-4 gap-1.5">
              {TIERS.map(t => (
                <div key={t.id} className="rounded-lg py-2 text-center"
                  style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${t.color}25` }}>
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
                <button onClick={handleReset}
                  className="w-full py-4 rounded-xl font-bold text-sm"
                  style={{ background: "linear-gradient(135deg, #ef4444, #f97316)", color: "white", boxShadow: "0 4px 20px rgba(239,68,68,0.4)" }}>
                  Pull Again · $40 USDC
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button className="py-2.5 rounded-xl text-xs font-medium border transition-all"
                    style={{ borderColor: "rgba(212,175,55,0.3)", color: "#d4af37", background: "rgba(212,175,55,0.05)" }}>
                    Claim Card
                  </button>
                  <button className="py-2.5 rounded-xl text-xs font-medium border transition-all"
                    style={{ borderColor: "rgba(255,255,255,0.1)", color: "#94a3b8", background: "rgba(255,255,255,0.03)" }}>
                    Leave in Machine
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={handlePull} disabled={pullState !== "idle"}
                className="w-full py-4 rounded-xl font-bold text-base transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: pullState === "idle" ? "linear-gradient(135deg, #ef4444 0%, #f97316 100%)" : "rgba(255,255,255,0.05)",
                  color: pullState === "idle" ? "white" : "#555",
                  boxShadow: pullState === "idle" ? "0 4px 24px rgba(239,68,68,0.4)" : "none",
                }}>
                {pullState === "idle" ? "Pull · $40 USDC" : "Processing..."}
              </button>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t flex items-center justify-between" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
            <span className="text-xs text-gray-600">Dragon Ball Z · Fusion World</span>
            <span className="text-xs text-gray-600">5% royalty on resale</span>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[{ label: "Total Pulls", value: "—" }, { label: "Cards Remaining", value: "100" }, { label: "Biggest Win", value: "—" }].map(s => (
            <div key={s.label} className="rounded-xl py-3 text-center"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
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
              <div key={i.n} className="flex items-center gap-3 p-3 rounded-xl"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                  style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" }}>
                  {i.n}
                </div>
                <p className="text-gray-300 text-sm">{i.t}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          10%, 90% { transform: translateX(-2px); }
          20%, 80% { transform: translateX(4px); }
          30%, 50%, 70% { transform: translateX(-6px); }
          40%, 60% { transform: translateX(6px); }
          100% { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
