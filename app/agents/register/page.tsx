"use client";

import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

interface NFTItem {
  mint: string;
  name: string;
  image: string;
}

export default function RegisterAgentPage() {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();

  // Step states
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);
  const [nfts, setNfts] = useState<NFTItem[]>([]);
  const [selectedNFT, setSelectedNFT] = useState<NFTItem | null>(null);
  const [agentName, setAgentName] = useState("");
  const [permissions, setPermissions] = useState({
    Trade: false,
    Bid: false,
    Chat: false,
  });
  const [loading, setLoading] = useState(false);
  const [nftLoading, setNftLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Fetch NFTs when wallet connects
  useEffect(() => {
    if (!connected || !publicKey) {
      setNfts([]);
      setSelectedNFT(null);
      return;
    }

    let cancelled = false;

    async function fetchNFTs() {
      setNftLoading(true);
      try {
        const wallet = publicKey!.toBase58();
        const { PublicKey } = await import("@solana/web3.js");
        const METADATA_PROGRAM = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

        // Get NFT mints
        const rpcRes = await fetch("/api/rpc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getTokenAccountsByOwner",
            params: [
              wallet,
              { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
              { encoding: "jsonParsed" },
            ],
          }),
        });
        const rpcData = await rpcRes.json();
        if (!rpcData.result?.value) {
          setNfts([]);
          setNftLoading(false);
          return;
        }

        const nftMints: string[] = rpcData.result.value
          .filter((acc: any) => {
            const info = acc.account.data.parsed.info;
            return info.tokenAmount.decimals === 0 && info.tokenAmount.uiAmount === 1;
          })
          .map((acc: any) => acc.account.data.parsed.info.mint);

        if (nftMints.length === 0) {
          setNfts([]);
          setNftLoading(false);
          return;
        }

        // Derive metadata PDAs
        const pdas = nftMints.map((mint) => {
          const mintKey = new PublicKey(mint);
          const [pda] = PublicKey.findProgramAddressSync(
            [Buffer.from("metadata"), METADATA_PROGRAM.toBuffer(), mintKey.toBuffer()],
            METADATA_PROGRAM
          );
          return pda.toBase58();
        });

        // Batch fetch metadata
        const allAccounts: any[] = [];
        for (let i = 0; i < pdas.length; i += 100) {
          const batch = pdas.slice(i, i + 100);
          const res = await fetch("/api/rpc", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "getMultipleAccounts",
              params: [batch, { encoding: "base64" }],
            }),
          });
          const data = await res.json();
          if (data.result?.value) allAccounts.push(...data.result.value);
          else allAccounts.push(...new Array(batch.length).fill(null));
        }

        if (cancelled) return;

        // Parse metadata
        const items: NFTItem[] = [];

        for (let i = 0; i < nftMints.length; i++) {
          const mint = nftMints[i];
          const account = allAccounts[i];
          let name = mint.slice(0, 4) + "..." + mint.slice(-4);
          let image = "";

          if (account?.data?.[0]) {
            const parsed = parseMetaplexMetadata(account.data[0]);
            if (parsed) {
              name = parsed.name || name;
              if (parsed.uri) {
                try {
                  const uriRes = await fetch(parsed.uri, {
                    signal: AbortSignal.timeout(3000),
                  });
                  const json = await uriRes.json();
                  image = json.image || "";
                } catch {}
              }
            }
          }

          items.push({ mint, name, image });
        }

        if (!cancelled) {
          setNfts(items);
        }
      } catch (e) {
        console.error("Failed to fetch NFTs:", e);
      }
      if (!cancelled) setNftLoading(false);
    }

    fetchNFTs();
    return () => {
      cancelled = true;
    };
  }, [connected, publicKey, connection]);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const handleStepForward = () => {
    if (currentStep === 1) {
      if (!selectedNFT) {
        showToast("Please select an NFT", "error");
        return;
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      if (!agentName.trim()) {
        showToast("Please enter an agent name", "error");
        return;
      }
      setCurrentStep(3);
    } else if (currentStep === 3) {
      if (!Object.values(permissions).some((v) => v)) {
        showToast("Please select at least one permission", "error");
        return;
      }
      setCurrentStep(4);
    }
  };

  const handleRegisterAgent = async () => {
    setLoading(true);
    try {
      // Simulate transaction (for now just show success)
      await new Promise((resolve) => setTimeout(resolve, 1500));
      showToast("✓ Agent registered successfully!", "success");
      setTimeout(() => {
        window.location.href = "/agents";
      }, 1500);
    } catch (e) {
      showToast("Failed to register agent", "error");
    } finally {
      setLoading(false);
    }
  };

  if (!connected) {
    return (
      <div className="pt-24 pb-20 min-h-screen">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-center py-24 gap-6">
            <div className="w-20 h-20 rounded-2xl bg-navy-800 border border-white/10 flex items-center justify-center">
              <svg
                className="w-10 h-10 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3"
                />
              </svg>
            </div>
            <p className="text-gray-400 text-sm">Connect your wallet to register an agent</p>
            <WalletMultiButton className="!bg-gold-500 hover:!bg-gold-600 !rounded-lg !h-10 !text-sm !font-medium" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-24 pb-20 min-h-screen">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-20 right-4 z-50 px-5 py-3 rounded-lg shadow-lg text-sm font-medium transition-all ${
            toast.type === "success"
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-12">
          <Link href="/agents" className="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-4 inline-block hover:text-gold-500 transition">
            ← Back to Agents
          </Link>
          <h1 className="font-serif text-4xl text-white mb-2">Register Your Agent</h1>
          <p className="text-gray-400 text-sm">
            Follow the steps below to register your AI agent
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Steps Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-navy-800 rounded-xl border border-white/5 p-6 sticky top-24">
              <h3 className="text-white font-semibold mb-6">Registration Steps</h3>
              <div className="space-y-4">
                {[
                  { step: 1, title: "Select NFT" },
                  { step: 2, title: "Agent Name" },
                  { step: 3, title: "Permissions" },
                  { step: 4, title: "Review & Register" },
                ].map((item) => (
                  <div
                    key={item.step}
                    className={`flex items-center gap-3 pb-4 border-b border-white/5 last:border-b-0 transition ${
                      item.step === currentStep
                        ? "opacity-100"
                        : item.step < currentStep
                        ? "opacity-60"
                        : "opacity-40"
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        item.step < currentStep
                          ? "bg-green-600 text-white"
                          : item.step === currentStep
                          ? "bg-gold-500 text-navy-900"
                          : "bg-navy-700 text-gray-400"
                      }`}
                    >
                      {item.step < currentStep ? "✓" : item.step}
                    </div>
                    <span
                      className={`text-sm ${
                        item.step === currentStep ? "text-white" : "text-gray-500"
                      }`}
                    >
                      {item.title}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-2">
            {/* Step 1: Select NFT */}
            {currentStep === 1 && (
              <div>
                <h2 className="text-white font-serif text-2xl mb-4">Select NFT Avatar</h2>
                <p className="text-gray-400 text-sm mb-6">
                  Choose an NFT from your wallet to use as your agent's avatar
                </p>

                {nftLoading ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-4">
                    <div className="w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
                    <p className="text-gray-400 text-sm">Loading your NFTs...</p>
                  </div>
                ) : nfts.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-gray-400 text-sm">No NFTs found in your wallet</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
                    {nfts.map((nft) => (
                      <div
                        key={nft.mint}
                        onClick={() => setSelectedNFT(nft)}
                        className={`cursor-pointer rounded-lg overflow-hidden border-2 transition ${
                          selectedNFT?.mint === nft.mint
                            ? "border-gold-500 shadow-lg shadow-gold-500/20"
                            : "border-white/10 hover:border-white/20"
                        }`}
                      >
                        <div className="aspect-square bg-navy-900 overflow-hidden">
                          <img
                            src={nft.image}
                            alt={nft.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src =
                                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Crect fill='%230f1628' width='200' height='200'/%3E%3Ctext x='50%' y='50%' font-size='40' fill='%23c9952c' text-anchor='middle' dominant-baseline='middle'%3E🖼️%3C/text%3E%3C/svg%3E";
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {selectedNFT && (
                  <div className="bg-navy-800 rounded-lg border border-white/5 p-4 mb-6">
                    <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">Selected NFT</p>
                    <p className="text-white font-medium">{selectedNFT.name}</p>
                    <p className="text-gray-600 text-xs mt-1 font-mono">
                      {selectedNFT.mint.slice(0, 8)}...{selectedNFT.mint.slice(-4)}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Agent Name */}
            {currentStep === 2 && (
              <div>
                <h2 className="text-white font-serif text-2xl mb-4">Choose Agent Name</h2>
                <p className="text-gray-400 text-sm mb-6">
                  Give your agent a descriptive name (max 32 characters)
                </p>

                {selectedNFT && (
                  <div className="mb-6 p-4 bg-navy-800 rounded-lg border border-white/5">
                    <div className="flex items-center gap-4">
                      <img
                        src={selectedNFT.image}
                        alt={selectedNFT.name}
                        className="w-16 h-16 rounded-lg object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Crect fill='%230f1628' width='200' height='200'/%3E%3C/svg%3E";
                        }}
                      />
                      <div>
                        <p className="text-gray-500 text-xs uppercase tracking-wider">NFT Avatar</p>
                        <p className="text-white font-medium">{selectedNFT.name}</p>
                      </div>
                    </div>
                  </div>
                )}

                <input
                  type="text"
                  placeholder="e.g., TradeMaster AI"
                  value={agentName}
                  onChange={(e) =>
                    setAgentName(e.target.value.slice(0, 32))
                  }
                  className="w-full px-4 py-3 bg-navy-800 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gold-500 transition"
                />
                <p className="text-gray-600 text-xs mt-2">
                  {agentName.length} / 32 characters
                </p>
              </div>
            )}

            {/* Step 3: Permissions */}
            {currentStep === 3 && (
              <div>
                <h2 className="text-white font-serif text-2xl mb-4">Set Permissions</h2>
                <p className="text-gray-400 text-sm mb-6">
                  Select which actions your agent is allowed to perform
                </p>

                {selectedNFT && (
                  <div className="mb-6 p-4 bg-navy-800 rounded-lg border border-white/5">
                    <div className="flex items-center gap-4">
                      <img
                        src={selectedNFT.image}
                        alt={selectedNFT.name}
                        className="w-16 h-16 rounded-lg object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Crect fill='%230f1628' width='200' height='200'/%3E%3C/svg%3E";
                        }}
                      />
                      <div>
                        <p className="text-gray-500 text-xs uppercase tracking-wider">Agent</p>
                        <p className="text-white font-medium">{agentName}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  {(["Trade", "Bid", "Chat"] as const).map((perm) => (
                    <label
                      key={perm}
                      className="flex items-center gap-3 p-4 bg-navy-800 rounded-lg border border-white/5 cursor-pointer hover:border-white/10 transition"
                    >
                      <input
                        type="checkbox"
                        checked={permissions[perm]}
                        onChange={(e) =>
                          setPermissions({
                            ...permissions,
                            [perm]: e.target.checked,
                          })
                        }
                        className="w-5 h-5 rounded accent-gold-500"
                      />
                      <div>
                        <p className="text-white font-medium text-sm">{perm}</p>
                        <p className="text-gray-500 text-xs">
                          {perm === "Trade"
                            ? "Allow agent to execute trades"
                            : perm === "Bid"
                            ? "Allow agent to place bids"
                            : "Allow agent to send messages"}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Step 4: Review */}
            {currentStep === 4 && (
              <div>
                <h2 className="text-white font-serif text-2xl mb-4">Review & Register</h2>
                <p className="text-gray-400 text-sm mb-6">
                  Review your agent details before registering
                </p>

                <div className="space-y-4">
                  {/* NFT */}
                  <div className="bg-navy-800 rounded-lg border border-white/5 p-5">
                    <p className="text-gray-500 text-xs uppercase tracking-wider mb-3">NFT Avatar</p>
                    <div className="flex items-center gap-4">
                      {selectedNFT && (
                        <>
                          <img
                            src={selectedNFT.image}
                            alt={selectedNFT.name}
                            className="w-20 h-20 rounded-lg object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src =
                                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Crect fill='%230f1628' width='200' height='200'/%3E%3C/svg%3E";
                            }}
                          />
                          <div>
                            <p className="text-white font-medium">{selectedNFT.name}</p>
                            <p className="text-gray-600 text-xs mt-1 font-mono">
                              {selectedNFT.mint.slice(0, 8)}...
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Agent Name */}
                  <div className="bg-navy-800 rounded-lg border border-white/5 p-5">
                    <p className="text-gray-500 text-xs uppercase tracking-wider mb-3">
                      Agent Name
                    </p>
                    <p className="text-white font-medium text-lg">{agentName}</p>
                  </div>

                  {/* Permissions */}
                  <div className="bg-navy-800 rounded-lg border border-white/5 p-5">
                    <p className="text-gray-500 text-xs uppercase tracking-wider mb-3">
                      Permissions
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(permissions).map(([perm, enabled]) =>
                        enabled ? (
                          <span
                            key={perm}
                            className="px-3 py-1.5 bg-gold-500/20 text-gold-300 border border-gold-500/30 rounded-md text-xs font-medium"
                          >
                            {perm}
                          </span>
                        ) : null
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex gap-4 mt-8">
              <button
                onClick={() => {
                  const newStep = Math.max(1, currentStep - 1);
                  setCurrentStep(newStep as 1 | 2 | 3 | 4);
                }}
                disabled={currentStep === 1}
                className="px-6 py-2.5 bg-navy-800 border border-white/10 text-white rounded-lg text-sm font-medium hover:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                Previous
              </button>

              {currentStep === 4 ? (
                <button
                  onClick={handleRegisterAgent}
                  disabled={loading}
                  className="flex-1 px-6 py-2.5 bg-gold-500 hover:bg-gold-600 disabled:opacity-50 text-navy-900 rounded-lg text-sm font-semibold transition"
                >
                  {loading ? "Registering..." : "Register Agent"}
                </button>
              ) : (
                <button
                  onClick={handleStepForward}
                  className="flex-1 px-6 py-2.5 bg-gold-500 hover:bg-gold-600 text-navy-900 rounded-lg text-sm font-semibold transition"
                >
                  Continue
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function parseMetaplexMetadata(base64Data: string): {
  name: string;
  symbol: string;
  uri: string;
} | null {
  try {
    const raw = atob(base64Data);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

    let offset = 1 + 32 + 32;

    const nameLen =
      bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24);
    offset += 4;
    const name = new TextDecoder()
      .decode(bytes.slice(offset, offset + Math.min(nameLen, 32)))
      .replace(/\0/g, "")
      .trim();
    offset += nameLen;

    const symLen =
      bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24);
    offset += 4;
    const symbol = new TextDecoder()
      .decode(bytes.slice(offset, offset + Math.min(symLen, 10)))
      .replace(/\0/g, "")
      .trim();
    offset += symLen;

    const uriLen =
      bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24);
    offset += 4;
    const uri = new TextDecoder()
      .decode(bytes.slice(offset, offset + Math.min(uriLen, 200)))
      .replace(/\0/g, "")
      .trim();

    return { name, symbol, uri };
  } catch {
    return null;
  }
}
