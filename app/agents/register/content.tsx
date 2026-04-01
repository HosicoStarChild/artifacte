"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { useState, useEffect } from "react";
import { ADMIN_WALLET } from "@/lib/data";
import { PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction, SystemProgram } from "@solana/web3.js";
import { createHash } from "crypto";

const SAID_PROGRAM_ID = new PublicKey("5dpw6KEQPn248pnkkaYyWfHwu2nfb3LUMbTucb6LaA8G");

function getSaidDiscriminator(name: string): Buffer {
  const hash = createHash("sha256").update(name).digest();
  return hash.subarray(0, 8);
}

function getAgentPDA(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), owner.toBuffer()],
    SAID_PROGRAM_ID
  );
}

function getTreasuryPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    SAID_PROGRAM_ID
  );
}

interface SAIDStatus {
  isRegistered: boolean;
  isVerified: boolean;
  hasPassport: boolean;
  name?: string;
  description?: string;
}

interface ArtifactePermissions {
  categories: string[];
  spendingLimit: number;
  autoBuy: boolean;
  apiKey?: string;
}

export function AgentRegistrationContent() {
  const { publicKey, connected, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [saidStatus, setSaidStatus] = useState<SAIDStatus>({
    isRegistered: false,
    isVerified: false,
    hasPassport: false,
  });
  
  // SAID registration form
  const [agentName, setAgentName] = useState("");
  const [agentDescription, setAgentDescription] = useState("");
  
  // Artifacte permissions
  const [permissions, setPermissions] = useState<ArtifactePermissions>({
    categories: [],
    spendingLimit: 100,
    autoBuy: false,
  });
  
  const [showApiKey, setShowApiKey] = useState(false);
  const [generatedApiKey, setGeneratedApiKey] = useState("");

  const categoryOptions = [
    "TCG Cards",
    "Sports Cards", 
    "Sealed Product",

    "Spirits",
    "Digital Art",
    "Merchandise"
  ];

  // Check SAID status when wallet connects
  useEffect(() => {
    if (connected && publicKey) {
      checkSaidStatus();
    }
  }, [connected, publicKey]);

  async function checkSaidStatus() {
    if (!publicKey) return;
    
    setLoading(true);
    try {
      const walletAddress = publicKey.toBase58();
      
      // Check registration status
      const statusRes = await fetch(`/api/agents/said?action=status&wallet=${walletAddress}`);
      const statusData = await statusRes.json();
      
      // Check passport
      const passportRes = await fetch(`/api/agents/said?action=passport&wallet=${walletAddress}`);
      const passportData = await passportRes.json();
      
      setSaidStatus({
        isRegistered: !!statusData.registered,
        isVerified: !!statusData.verified,
        hasPassport: !!passportData.passport,
        name: passportData.passport?.name || statusData.name,
        description: passportData.passport?.description || statusData.description,
      });
      
      // Move to appropriate step
      if (statusData.registered) {
        setStep(4); // Skip to Artifacte permissions
      } else {
        setStep(2); // Show SAID registration
      }
      setError(""); // Clear any previous errors
    } catch (err: any) {
      // Don't show error for status check — just default to registration step
      setStep(2);
    } finally {
      setLoading(false);
    }
  }

  async function registerOnSaid() {
    if (!publicKey || !agentName.trim() || !agentDescription.trim()) {
      setError("Please provide agent name and description");
      return;
    }
    
    setLoading(true);
    setError("");
    
    try {
      const res = await fetch("/api/agents/said", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register",
          wallet: publicKey.toBase58(),
          name: agentName,
          description: agentDescription,
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Registration failed");
      }
      
      // Update status and move to next step
      setSaidStatus(prev => ({
        ...prev,
        isRegistered: true,
        name: agentName,
        description: agentDescription,
      }));
      
      setStep(4);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function registerOnChain() {
    if (!publicKey || !signTransaction) {
      setError("Wallet not connected or doesn't support signing");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const wallet = publicKey.toBase58();
      const metadataUri = `https://api.saidprotocol.com/api/cards/${wallet}.json`;
      const discriminator = getSaidDiscriminator("global:register_agent");
      const uriBytes = Buffer.from(metadataUri, "utf8");
      const lenBuf = Buffer.alloc(4);
      lenBuf.writeUInt32LE(uriBytes.length, 0);
      const data = Buffer.concat([discriminator, lenBuf, uriBytes]);
      const [agentPDA] = getAgentPDA(publicKey);

      const ix = new TransactionInstruction({
        programId: SAID_PROGRAM_ID,
        keys: [
          { pubkey: agentPDA, isSigner: false, isWritable: true },
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data,
      });

      const { blockhash } = await connection.getLatestBlockhash();
      const message = new TransactionMessage({
        payerKey: publicKey,
        recentBlockhash: blockhash,
        instructions: [ix],
      }).compileToV0Message();

      const tx = new VersionedTransaction(message);
      const signed = await signTransaction(tx);
      const sig = await connection.sendTransaction(signed, { skipPreflight: false });
      const { blockhash: bh2, lastValidBlockHeight } = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature: sig, blockhash: bh2, lastValidBlockHeight }, "confirmed");
      
      setSaidStatus(prev => ({ ...prev, isRegistered: true }));
    } catch (err: any) {
      setError("On-chain registration failed: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function verifyOnChain() {
    if (!publicKey || !signTransaction) {
      setError("Wallet not connected or doesn't support signing");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [agentPDA] = getAgentPDA(publicKey);
      const [treasuryPDA] = getTreasuryPDA();
      const discriminator = getSaidDiscriminator("global:get_verified");

      const ix = new TransactionInstruction({
        programId: SAID_PROGRAM_ID,
        keys: [
          { pubkey: agentPDA, isSigner: false, isWritable: true },
          { pubkey: treasuryPDA, isSigner: false, isWritable: true },
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: discriminator,
      });

      const { blockhash } = await connection.getLatestBlockhash();
      const message = new TransactionMessage({
        payerKey: publicKey,
        recentBlockhash: blockhash,
        instructions: [ix],
      }).compileToV0Message();

      const tx = new VersionedTransaction(message);
      const signed = await signTransaction(tx);
      const sig = await connection.sendTransaction(signed, { skipPreflight: false });
      const { blockhash: bh2, lastValidBlockHeight } = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature: sig, blockhash: bh2, lastValidBlockHeight }, "confirmed");
      
      setSaidStatus(prev => ({ ...prev, isVerified: true }));
    } catch (err: any) {
      setError("Verification failed: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function generateApiKey() {
    if (!publicKey) return;
    
    setLoading(true);
    try {
      // In a real implementation, this would call an API to generate a key
      const key = `ak_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
      setGeneratedApiKey(key);
      setPermissions(prev => ({ ...prev, apiKey: key }));
      setShowApiKey(true);
      setStep(5);
    } catch (err: any) {
      setError("Failed to generate API key");
    } finally {
      setLoading(false);
    }
  }

  function toggleCategory(category: string) {
    setPermissions(prev => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter(c => c !== category)
        : [...prev.categories, category]
    }));
  }

  if (!connected) {
    return (
      <main className="min-h-screen bg-dark-900 pt-32 pb-20">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-dark-800 border border-white/10 rounded-xl p-12 text-center">
            <h2 className="font-serif text-2xl font-bold text-white mb-4">
              Connect Your Wallet
            </h2>
            <p className="text-gray-400">
              Please connect your wallet to register your AI agent.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-dark-900 pt-32 pb-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-12 text-center">
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-white mb-4">
            Agent Registration
          </h1>
          <p className="text-gray-400 text-lg">
            Register your AI agent with SAID Protocol and configure Artifacte trading permissions
          </p>
        </div>

        {/* Progress Steps */}
        <div className="mb-12">
          <div className="flex items-center justify-center space-x-4 md:space-x-8">
            {[1, 2, 3, 4, 5].map((stepNum) => (
              <div key={stepNum} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                    stepNum <= step
                      ? "bg-gold-500 text-dark-900"
                      : stepNum === step + 1 && step < 5
                      ? "border-2 border-gold-500 text-gold-500"
                      : "border-2 border-white/20 text-gray-500"
                  }`}
                >
                  {stepNum}
                </div>
                {stepNum < 5 && (
                  <div
                    className={`w-8 md:w-16 h-0.5 ${
                      stepNum < step ? "bg-gold-500" : "bg-white/20"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 text-center">
            <p className="text-gray-400 text-sm">
              {step === 1 && "Connect Wallet"}
              {step === 2 && "Check SAID Status"}
              {step === 3 && "Register on SAID"}
              {step === 4 && "Configure Permissions"}
              {step === 5 && "Complete Setup"}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 bg-red-900/20 border border-red-700 rounded-lg p-4 text-red-400">
            {error}
          </div>
        )}

        {/* Step Content */}
        <div className="bg-dark-800 border border-white/10 rounded-xl p-8">
          {/* Step 1: Wallet Connected */}
          {step >= 1 && (
            <div className="mb-8">
              <h3 className="font-serif text-xl font-bold text-white mb-4">
                ✓ Wallet Connected
              </h3>
              <div className="bg-dark-700 rounded-lg p-4">
                <p className="text-sm text-gray-400">Connected Wallet:</p>
                <p className="font-mono text-white text-sm break-all">
                  {publicKey?.toBase58()}
                </p>
              </div>
            </div>
          )}

          {/* Step 2: SAID Status Check */}
          {step >= 2 && (
            <div className="mb-8">
              <h3 className="font-serif text-xl font-bold text-white mb-4">
                SAID Protocol Status
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-dark-700 rounded-lg p-4 text-center">
                  <div className={`text-2xl mb-2 ${saidStatus.isRegistered ? 'text-green-400' : 'text-red-400'}`}>
                    {saidStatus.isRegistered ? '✓' : '✗'}
                  </div>
                  <p className="text-sm text-gray-400">Registered</p>
                </div>
                <div className="bg-dark-700 rounded-lg p-4 text-center">
                  <div className={`text-2xl mb-2 ${saidStatus.isVerified ? 'text-green-400' : 'text-yellow-400'}`}>
                    {saidStatus.isVerified ? '✓' : '⚠'}
                  </div>
                  <p className="text-sm text-gray-400">Verified (0.01 SOL)</p>
                </div>
                <div className="bg-dark-700 rounded-lg p-4 text-center">
                  <div className={`text-2xl mb-2 ${saidStatus.hasPassport ? 'text-green-400' : 'text-gray-500'}`}>
                    {saidStatus.hasPassport ? '✓' : '○'}
                  </div>
                  <p className="text-sm text-gray-400">Passport</p>
                </div>
              </div>
              
              {!saidStatus.isRegistered && step === 2 && (
                <div className="mt-6 text-center">
                  <button
                    onClick={() => setStep(3)}
                    className="px-8 py-3 bg-gold-500 hover:bg-gold-600 text-dark-900 font-semibold rounded-lg transition-all"
                  >
                    Register on SAID (Free)
                  </button>
                </div>
              )}
              
              {saidStatus.isRegistered && !saidStatus.isVerified && (
                <div className="mt-6 space-y-3">
                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={registerOnChain}
                      disabled={loading}
                      className="px-6 py-3 bg-dark-700 border border-gold-500/50 text-gold-400 hover:bg-dark-600 font-semibold rounded-lg transition-all disabled:opacity-50"
                    >
                      {loading ? "Processing..." : "1. Register On-Chain (~0.005 SOL)"}
                    </button>
                    <button
                      onClick={verifyOnChain}
                      disabled={loading}
                      className="px-6 py-3 bg-gold-500 hover:bg-gold-600 text-dark-900 font-semibold rounded-lg transition-all disabled:opacity-50"
                    >
                      {loading ? "Processing..." : "2. Get Verified (0.01 SOL)"}
                    </button>
                  </div>
                  <p className="text-gray-500 text-xs text-center">Register on-chain first, then verify. Two separate transactions.</p>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Register on SAID */}
          {step === 3 && (
            <div className="mb-8">
              <h3 className="font-serif text-xl font-bold text-white mb-4">
                Register Your Agent on SAID
              </h3>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm text-gold-400 mb-2 font-medium">
                    Agent Name *
                  </label>
                  <input
                    type="text"
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-gold-500 transition"
                    placeholder="e.g., ArtCollector Bot"
                  />
                </div>
                
                <div>
                  <label className="block text-sm text-gold-400 mb-2 font-medium">
                    Description *
                  </label>
                  <textarea
                    value={agentDescription}
                    onChange={(e) => setAgentDescription(e.target.value)}
                    className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-gold-500 transition resize-none"
                    rows={4}
                    placeholder="Describe your agent's purpose and trading strategy..."
                  />
                </div>
                
                <div className="flex gap-4">
                  <button
                    onClick={registerOnSaid}
                    disabled={loading || !agentName.trim() || !agentDescription.trim()}
                    className="flex-1 px-6 py-3 bg-gold-500 hover:bg-gold-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-dark-900 font-semibold rounded-lg transition-all"
                  >
                    {loading ? "Registering..." : "Register on SAID"}
                  </button>
                  <button
                    onClick={() => setStep(2)}
                    className="px-6 py-3 border border-white/20 hover:border-white/40 text-white rounded-lg transition-all"
                  >
                    Back
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Artifacte Permissions */}
          {step >= 4 && saidStatus.isRegistered && (
            <div className="mb-8">
              <h3 className="font-serif text-xl font-bold text-white mb-4">
                Artifacte Trading Permissions
              </h3>
              
              {saidStatus.name && (
                <div className="mb-6 bg-dark-700 rounded-lg p-4">
                  <p className="text-sm text-gray-400">SAID Agent Identity:</p>
                  <p className="text-white font-semibold">{saidStatus.name}</p>
                  {saidStatus.description && (
                    <p className="text-gray-400 text-sm mt-1">{saidStatus.description}</p>
                  )}
                </div>
              )}
              
              <div className="space-y-6">
                {/* Categories */}
                <div>
                  <label className="block text-sm text-gold-400 mb-3 font-medium">
                    Trading Categories
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {categoryOptions.map((category) => (
                      <label
                        key={category}
                        className="flex items-center space-x-2 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={permissions.categories.includes(category)}
                          onChange={() => toggleCategory(category)}
                          className="rounded border-white/20 bg-dark-900 text-gold-500 focus:ring-gold-500 focus:ring-offset-0"
                        />
                        <span className="text-white text-sm">{category}</span>
                      </label>
                    ))}
                  </div>
                </div>
                
                {/* Spending Limit */}
                <div>
                  <label className="block text-sm text-gold-400 mb-2 font-medium">
                    Per-Transaction Spending Limit (USD)
                  </label>
                  <input
                    type="number"
                    value={permissions.spendingLimit}
                    onChange={(e) => setPermissions(prev => ({ ...prev, spendingLimit: Number(e.target.value) }))}
                    className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-gold-500 transition"
                    min="1"
                    max="100000"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Maximum amount your agent can spend per transaction
                  </p>
                </div>
                
                {/* Auto-buy Toggle */}
                <div>
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={permissions.autoBuy}
                      onChange={(e) => setPermissions(prev => ({ ...prev, autoBuy: e.target.checked }))}
                      className="rounded border-white/20 bg-dark-900 text-gold-500 focus:ring-gold-500 focus:ring-offset-0"
                    />
                    <div>
                      <span className="text-white font-medium">Enable Auto-buy</span>
                      <p className="text-sm text-gray-400">
                        Allow agent to make purchases automatically without manual approval
                      </p>
                    </div>
                  </label>
                </div>

                {step === 4 && (
                  <div className="text-center">
                    <button
                      onClick={generateApiKey}
                      disabled={loading || permissions.categories.length === 0}
                      className="px-8 py-3 bg-gold-500 hover:bg-gold-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-dark-900 font-semibold rounded-lg transition-all"
                    >
                      {loading ? "Generating..." : "Generate API Key"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 5: Complete Setup */}
          {step === 5 && (
            <div>
              <h3 className="font-serif text-xl font-bold text-white mb-4">
                ✓ Setup Complete
              </h3>
              
              <div className="space-y-6">
                {/* SAID Identity */}
                <div className="bg-dark-700 rounded-lg p-6">
                  <h4 className="text-gold-400 font-semibold mb-3">SAID Identity</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Wallet:</span>
                      <span className="text-white font-mono text-sm">
                        {publicKey?.toBase58().slice(0, 8)}...{publicKey?.toBase58().slice(-8)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Name:</span>
                      <span className="text-white">{saidStatus.name || agentName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Verified:</span>
                      <span className={saidStatus.isVerified ? "text-green-400" : "text-yellow-400"}>
                        {saidStatus.isVerified ? "Yes" : "Pending"}
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Artifacte Permissions */}
                <div className="bg-dark-700 rounded-lg p-6">
                  <h4 className="text-gold-400 font-semibold mb-3">Trading Permissions</h4>
                  <div className="space-y-2">
                    <div>
                      <span className="text-gray-400">Categories:</span>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {permissions.categories.map((cat) => (
                          <span key={cat} className="px-2 py-1 bg-gold-500/20 text-gold-400 rounded text-xs">
                            {cat}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Spending Limit:</span>
                      <span className="text-white">${permissions.spendingLimit.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Auto-buy:</span>
                      <span className={permissions.autoBuy ? "text-green-400" : "text-gray-400"}>
                        {permissions.autoBuy ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* API Key */}
                {showApiKey && generatedApiKey && (
                  <div className="bg-dark-700 rounded-lg p-6">
                    <h4 className="text-gold-400 font-semibold mb-3">API Key</h4>
                    <div className="bg-dark-800 rounded p-3 mb-3">
                      <p className="font-mono text-sm text-white break-all">
                        {generatedApiKey}
                      </p>
                    </div>
                    <p className="text-xs text-red-400">
                      ⚠️ Save this key securely. It won't be shown again.
                    </p>
                  </div>
                )}
                
                {/* Actions */}
                <div className="flex gap-4">
                  <a
                    href="https://directory.saidprotocol.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 px-6 py-3 border border-gold-500 text-gold-500 hover:bg-gold-500/10 font-semibold rounded-lg transition-all text-center"
                  >
                    View on SAID Directory
                  </a>
                  <button
                    onClick={() => {
                      setStep(1);
                      setSaidStatus({
                        isRegistered: false,
                        isVerified: false,
                        hasPassport: false,
                      });
                      setPermissions({
                        categories: [],
                        spendingLimit: 100,
                        autoBuy: false,
                      });
                      setShowApiKey(false);
                      setGeneratedApiKey("");
                    }}
                    className="px-6 py-3 bg-dark-600 hover:bg-dark-500 text-white font-semibold rounded-lg transition-all"
                  >
                    Register Another Agent
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Info Section */}
        <div className="mt-12 bg-dark-800 border border-white/10 rounded-xl p-8">
          <h3 className="font-serif text-xl font-bold text-white mb-4">
            About SAID Protocol
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            <div>
              <h4 className="text-gold-400 font-semibold mb-2">Registration (Free)</h4>
              <p className="text-gray-400">
                Create your agent identity on SAID Protocol with name and description. 
                This is completely free and off-chain.
              </p>
            </div>
            <div>
              <h4 className="text-gold-400 font-semibold mb-2">Verification (0.01 SOL)</h4>
              <p className="text-gray-400">
                Verify your agent by staking 0.01 SOL. This is done using the SAID CLI
                and proves agent authenticity.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}