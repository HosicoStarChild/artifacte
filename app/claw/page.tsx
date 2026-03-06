'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import Navbar from '@/components/Navbar';
import ClawChat from '@/components/ClawChat';

// Mock data for claw machines
const machines = [
  {
    id: 1,
    name: 'Gold Claw',
    tier: '🥇',
    price: 50,
    itemsRemaining: 89,
    odds: [
      { rarity: 'Ultra Rare', percent: 40 },
      { rarity: 'Secret Rare', percent: 35 },
      { rarity: 'Alt Art', percent: 20 },
      { rarity: 'Manga Alt', percent: 5 },
    ],
    description: 'Ultra Rare-Secret Rare, Alt Arts & Manga variants',
  },
  {
    id: 2,
    name: 'High Rollers',
    tier: '💎',
    price: 150,
    itemsRemaining: 23,
    odds: [
      { rarity: 'PSA 9+', percent: 100 },
    ],
    description: 'Guaranteed graded PSA 9+, chase cards only',
  },
];

// Mock cards for pulls
const mockCards = [
  {
    id: 1,
    name: 'Roronoa Zoro Alt Art',
    code: 'OP05-119',
    grade: 10,
    value: 642,
    rarity: 'Secret Rare',
    image: 'https://images.unsplash.com/photo-1579546957867-dfc1b6e2f4b1?w=200&h=280&fit=crop',
    user: '0x4f...2a',
  },
  {
    id: 2,
    name: 'Portgas D. Ace Manga Alt Art',
    code: 'OP09-119',
    grade: 10,
    value: 5058,
    rarity: 'Manga Alt Art',
    image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=200&h=280&fit=crop',
    user: '0x7e...5c',
  },
  {
    id: 3,
    name: 'Roronoa Zoro Leader',
    code: 'OP01-024',
    grade: 10,
    value: 89,
    rarity: 'Rare',
    image: 'https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?w=200&h=280&fit=crop',
    user: '0x3b...8f',
  },
  {
    id: 4,
    name: 'Monkey D. Luffy',
    code: 'ST01-012',
    grade: 10,
    value: 45,
    rarity: 'Ultra Rare',
    image: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=200&h=280&fit=crop',
    user: '0x9d...1e',
  },
  {
    id: 5,
    name: 'Nami Alt Art',
    code: 'OP02-120',
    grade: 9,
    value: 320,
    rarity: 'Alt Art',
    image: 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=200&h=280&fit=crop',
    user: '0x2c...7a',
  },
];

// Recent pulls data
const recentPulls = [
  { user: '0x4f...2a', card: 'PSA 10 Luffy Gear 5 Alt Art', machine: 'Gold Claw', emoji: '🔥', value: 1250 },
  { user: '0x7e...5c', card: 'PSA 9 Zoro Leader', machine: 'Gold Claw', emoji: '✨', value: 89 },
  { user: '0x3b...8f', card: 'PSA 10 Ace Manga Alt Art', machine: 'High Rollers', emoji: '🌟', value: 5058 },
  { user: '0x9d...1e', card: 'PSA 10 Nami Alt Art', machine: 'Gold Claw', emoji: '💎', value: 320 },
  { user: '0x2c...7a', card: 'PSA 10 Sanji Alt Art', machine: 'Gold Claw', emoji: '🔥', value: 892 },
];

export default function ClawPage() {
  const { publicKey } = useWallet();
  const [selectedMachine, setSelectedMachine] = useState<typeof machines[0] | null>(null);
  const [isPulling, setIsPulling] = useState(false);
  const [pulledCard, setPulledCard] = useState<typeof mockCards[0] | null>(null);
  const [showPullModal, setShowPullModal] = useState(false);
  const [swapTimer, setSwapTimer] = useState(900); // 15 minutes in seconds
  const [showConfetti, setShowConfetti] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);

  const handlePull = (machine: typeof machines[0]) => {
    setSelectedMachine(machine);
    setShowPullModal(true);
    setIsPulling(true);

    // Simulate pull animation
    setTimeout(() => {
      const randomCard = mockCards[Math.floor(Math.random() * mockCards.length)];
      setPulledCard(randomCard);
      setIsPulling(false);

      // Show confetti for rare pulls
      if (randomCard.value > 500) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 2000);
      }

      setSwapTimer(900);
    }, 2000);
  };

  const closePullModal = () => {
    setShowPullModal(false);
    setPulledCard(null);
    setSelectedMachine(null);
  };

  return (
    <div className="min-h-screen bg-[#0a0e27] flex flex-col">
      <Navbar />

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h1
              className="font-serif text-5xl md:text-7xl text-white mb-4 tracking-tight"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
            >
              Salon Privé
            </h1>
            <p className="text-gray-300 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">
              Pull rare graded TCG cards. Hold or swap instantly.
            </p>
          </div>
        </div>
      </section>

      {/* Available Machines Section with Chat */}
      <section className="flex-1 py-20 px-4 sm:px-6 lg:px-8 bg-dark-800/30 border-y border-white/5">
        <div className="max-w-7xl mx-auto flex gap-6 h-full">
          {/* Machines Grid - Left side (Desktop: 70%, Mobile: 100%) */}
          <div className="flex-1 lg:flex-none lg:w-2/3 flex flex-col">
            <div className="mb-16">
              <p className="text-gold-500 text-xs font-semibold tracking-widest uppercase mb-3">Machines</p>
              <h2
                className="font-serif text-3xl md:text-4xl text-white"
                style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
              >
                Choose Your Destiny
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
            {machines.map((machine) => (
              <div
                key={machine.id}
                className="relative group"
              >
                {/* Animated glow background */}
                <div className="absolute -inset-0.5 bg-gradient-to-r from-gold-500 to-orange-500 rounded-lg opacity-0 group-hover:opacity-20 blur transition duration-500 animate-pulse" />

                {/* Card */}
                <div className="relative bg-dark-800 rounded-lg border border-white/5 group-hover:border-gold-500/30 p-6 transition-all duration-300 h-full flex flex-col">
                  {/* Tier Icon */}
                  <div className="text-4xl mb-4">{machine.tier}</div>

                  {/* Machine Name */}
                  <h3 className="font-serif text-2xl text-white mb-1">{machine.name}</h3>
                  <p className="text-gray-400 text-xs mb-6">{machine.description}</p>

                  {/* Price */}
                  <div className="mb-6 pb-6 border-b border-white/5">
                    <p className="text-gold-500 text-xs font-semibold tracking-widest uppercase mb-2">Price per Pull</p>
                    <p className="text-white font-serif text-3xl">${machine.price}</p>
                  </div>

                  {/* Inventory */}
                  <div className="mb-6">
                    <p className="text-gray-500 text-xs font-medium mb-2">{machine.itemsRemaining} items remaining</p>
                    <div className="w-full bg-dark-900 rounded-full h-1.5">
                      <div
                        className="bg-gradient-to-r from-gold-500 to-orange-500 h-1.5 rounded-full"
                        style={{ width: `${(machine.itemsRemaining / 342) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Odds */}
                  <div className="mb-8 flex-1">
                    <p className="text-gray-500 text-xs font-medium mb-3">Odds</p>
                    <div className="space-y-2">
                      {machine.odds.map((odd, i) => (
                        <div key={i} className="flex justify-between items-center">
                          <span className="text-gray-400 text-xs">{odd.rarity}</span>
                          <span className="text-gold-500 text-xs font-semibold">{odd.percent}%</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Pull Button */}
                  <button
                    onClick={() => handlePull(machine)}
                    className="w-full bg-gold-500 hover:bg-gold-600 text-dark-900 font-bold py-3 rounded-lg transition-all duration-300 transform hover:scale-105 active:scale-95 uppercase tracking-wider text-sm"
                  >
                    Pull ${machine.price}
                  </button>
                </div>
              </div>
            ))}
            </div>
          </div>

          {/* Chat Panel - Right side (Desktop only: 30%, Mobile: hidden) */}
          <div className="hidden lg:flex lg:w-1/3 lg:flex-col h-full min-h-96">
            <ClawChat connectedWallet={publicKey?.toBase58()} />
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-gold-500 text-xs font-semibold tracking-widest uppercase mb-3">Process</p>
            <h2
              className="font-serif text-3xl md:text-4xl text-white"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
            >
              How It Works
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 max-w-4xl mx-auto">
            {[
              {
                step: '01',
                title: 'Choose & Pay',
                description: 'Select a machine tier and pay with SOL or USD1. Your pull is instant.',
              },
              {
                step: '02',
                title: 'Watch & Reveal',
                description: 'Watch the claw machine animate. Your card appears with grade and market value.',
              },
              {
                step: '03',
                title: 'Hold or Swap',
                description: 'Keep the card in your collection, or swap instantly for cash at oracle market price.',
              },
            ].map((item, i) => (
              <div key={i} className="text-center group">
                <div className="text-5xl font-serif text-gold-500 mb-4 group-hover:scale-110 transition duration-300">
                  {item.step}
                </div>
                <h3 className="font-serif text-xl text-white mb-3">{item.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Recent Pulls Feed */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-dark-800/30 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <div className="mb-12">
            <p className="text-gold-500 text-xs font-semibold tracking-widest uppercase mb-3">Live Feed</p>
            <h2
              className="font-serif text-3xl md:text-4xl text-white"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
            >
              Recent Pulls
            </h2>
          </div>

          <div className="space-y-4 max-h-96 overflow-y-auto scroll-smooth">
            {recentPulls.map((pull, i) => (
              <div
                key={i}
                className="bg-dark-800 rounded-lg border border-white/5 p-4 hover:border-gold-500/30 transition duration-300 group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-white text-sm font-medium">
                      <span className="text-gold-500">{pull.user}</span>
                      {' '}pulled a{' '}
                      <span className="text-orange-400 font-semibold">{pull.card}</span>
                      {' '}from{' '}
                      <span className="text-gold-500">{pull.machine}</span>
                      {' '}
                      <span className="text-xl ml-1">{pull.emoji}</span>
                    </p>
                    <p className="text-gray-500 text-xs mt-1">${pull.value.toLocaleString()} value</p>
                  </div>
                  <div className="ml-4 text-right">
                    <p className="text-gray-500 text-xs">Just now</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Your Collection Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-12">
            <p className="text-gold-500 text-xs font-semibold tracking-widest uppercase mb-3">Inventory</p>
            <h2
              className="font-serif text-3xl md:text-4xl text-white mb-4"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
            >
              Your Collection
            </h2>
          </div>

          <div className="bg-dark-800/50 rounded-lg border border-white/5 p-12 text-center">
            <p className="text-gray-400 text-lg mb-6">Connect your wallet to see your pulled cards and pending swaps.</p>
            <button className="px-8 py-3 bg-gold-500 hover:bg-gold-600 text-dark-900 rounded-lg font-semibold text-sm transition-colors duration-200">
              Connect Wallet
            </button>
          </div>
        </div>
      </section>

      {/* Mobile Chat Toggle Button */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between p-4 bg-gradient-to-t from-[#0a0e27] to-transparent border-t border-white/5">
        <button
          onClick={() => setIsChatOpen(!isChatOpen)}
          className="ml-auto px-6 py-3 bg-gold-500 hover:bg-gold-600 text-dark-900 rounded-lg font-semibold text-sm transition-all duration-200 uppercase tracking-wider flex items-center gap-2"
        >
          💬 Salon Privé
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-dark-900 text-gold-500 text-xs font-bold">
            47
          </span>
        </button>
      </div>

      {/* Mobile Chat Drawer */}
      {isChatOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex flex-col">
          <div className="mt-auto max-h-[85vh] w-full rounded-t-2xl overflow-hidden">
            <div className="bg-[#0d1229] border border-[#1a1f3a] h-[85vh] flex flex-col">
              {/* Drawer handle */}
              <div className="flex justify-center py-2 bg-[#0d1229] border-b border-[#1a1f3a]">
                <div className="w-12 h-1 rounded-full bg-gray-600" />
              </div>
              {/* Chat component */}
              <div className="flex-1 overflow-hidden">
                <ClawChat connectedWallet={publicKey?.toBase58()} />
              </div>
            </div>
          </div>
          {/* Close drawer button */}
          <button
            onClick={() => setIsChatOpen(false)}
            className="px-4 py-3 text-gray-400 hover:text-white transition-colors duration-200 text-sm"
          >
            Close
          </button>
        </div>
      )}

      {/* Pull Modal */}
      {showPullModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-dark-800 rounded-lg border border-gold-500/20 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Claw Animation / Card Reveal */}
            <div className="relative bg-gradient-to-b from-dark-900 to-dark-800 p-8 min-h-96">
              {isPulling ? (
                <div className="flex flex-col items-center justify-center py-16">
                  {/* Claw Animation */}
                  <div className="relative w-32 h-32 mb-8">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-6xl animate-bounce">🪝</div>
                    </div>
                    {/* Capsule */}
                    <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-16 h-20 bg-gradient-to-b from-gold-500 to-orange-600 rounded-full animate-pulse" />
                  </div>
                  <p className="text-white text-lg font-serif mt-8">Pulling your card...</p>
                </div>
              ) : pulledCard ? (
                <div className="space-y-8">
                  {/* Card Display with Flip Animation */}
                  <div className="flex justify-center">
                    <div className="relative w-48 h-64 perspective">
                      <div className="absolute inset-0 bg-gradient-to-br from-gold-500 to-orange-600 rounded-lg shadow-2xl animate-flip flex items-center justify-center overflow-hidden group">
                        {/* Card Front */}
                        <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-dark-900">
                          <img
                            src={pulledCard.image}
                            alt={pulledCard.name}
                            className="w-40 h-52 object-cover rounded mb-2"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card Details */}
                  <div className="text-center space-y-3 border-t border-white/5 pt-6">
                    <div>
                      <p className="text-gray-400 text-xs uppercase tracking-widest mb-1">Card</p>
                      <h3 className="text-white font-serif text-2xl">{pulledCard.name}</h3>
                      <p className="text-gold-500 text-sm">{pulledCard.code}</p>
                    </div>

                    <div className="grid grid-cols-3 gap-4 pt-4">
                      <div>
                        <p className="text-gray-500 text-xs uppercase tracking-widest mb-1">Grade</p>
                        <p className="text-white font-bold text-lg">PSA {pulledCard.grade}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs uppercase tracking-widest mb-1">Rarity</p>
                        <p className="text-orange-400 font-semibold">{pulledCard.rarity}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs uppercase tracking-widest mb-1">Value</p>
                        <p className="text-gold-500 font-bold text-lg">${pulledCard.value.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>

                  {/* Confetti effect for rare pulls */}
                  {showConfetti && (
                    <div className="fixed inset-0 pointer-events-none">
                      {[...Array(30)].map((_, i) => (
                        <div
                          key={i}
                          className="absolute w-1 h-1 bg-gold-500 rounded-full animate-confetti"
                          style={{
                            left: `${Math.random() * 100}%`,
                            top: '-10px',
                            animation: `confetti ${2 + Math.random() * 1}s ease-in forwards`,
                            animationDelay: `${Math.random() * 0.5}s`,
                          }}
                        />
                      ))}
                    </div>
                  )}

                  {/* Swap Timer */}
                  <div className="text-center text-gray-400 text-xs">
                    <p>
                      💰 SWAP expires in{' '}
                      {Math.floor(swapTimer / 60)}:{(swapTimer % 60).toString().padStart(2, '0')}
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-2 gap-4 pt-4">
                    <button className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-sm transition-colors duration-200 uppercase tracking-wider">
                      💎 Hold
                    </button>
                    <button className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold text-sm transition-colors duration-200 uppercase tracking-wider">
                      💰 Swap ${pulledCard.value.toLocaleString()}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Close Button */}
            <div className="border-t border-white/5 p-4">
              <button
                onClick={closePullModal}
                className="w-full px-4 py-2 text-gray-400 hover:text-white transition-colors duration-200 text-sm uppercase tracking-widest"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSS Animations */}
      <style jsx>{`
        @keyframes animate-flip {
          0% {
            transform: rotateY(0deg);
          }
          50% {
            transform: rotateY(90deg);
          }
          100% {
            transform: rotateY(0deg);
          }
        }

        @keyframes confetti {
          to {
            transform: translateY(100vh) rotate(360deg);
            opacity: 0;
          }
        }

        .animate-flip {
          animation: animate-flip 0.8s ease-in-out;
        }

        .animate-confetti {
          animation: confetti 2s ease-in forwards;
        }

        .scroll-smooth {
          scroll-behavior: smooth;
        }

        ::-webkit-scrollbar {
          width: 6px;
        }

        ::-webkit-scrollbar-track {
          background: transparent;
        }

        ::-webkit-scrollbar-thumb {
          background: #d4af37;
          border-radius: 3px;
        }

        ::-webkit-scrollbar-thumb:hover {
          background: #e5c158;
        }
      `}</style>
    </div>
  );
}
