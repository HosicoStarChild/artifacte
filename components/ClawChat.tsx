'use client';

import { useState, useEffect, useRef } from 'react';

// Message type definition
interface ChatMessage {
  id: string;
  sender: string; // wallet address
  text: string;
  timestamp: Date;
  type: 'chat' | 'pull'; // 'pull' = auto-generated pull announcement
  value?: number; // card value for pull messages
}

// Chat context type
interface ChatContextType {
  messages: ChatMessage[];
  onlineUsers: number;
  sendMessage: (text: string) => void;
  subscribeToMessages: (callback: (message: ChatMessage) => void) => void;
  connectChat: (wallet: string) => void;
  isConnected: boolean;
}

// Mock initial messages
const MOCK_MESSAGES: ChatMessage[] = [
  {
    id: '1',
    sender: '0x3e...7b',
    text: 'Just pulled my first PSA 10! 🔥',
    timestamp: new Date(Date.now() - 25 * 60000),
    type: 'chat',
  },
  {
    id: '2',
    sender: '0x4f...2a',
    text: '✨ 0x4f...2a just pulled PSA 10 Zoro Alt Art ($642) from Gold Claw!',
    timestamp: new Date(Date.now() - 20 * 60000),
    type: 'pull',
    value: 642,
  },
  {
    id: '3',
    sender: '0x7e...5c',
    text: 'no way that was a PSA 10 😱',
    timestamp: new Date(Date.now() - 18 * 60000),
    type: 'chat',
  },
  {
    id: '4',
    sender: '0x2b...9a',
    text: 'bro gold claw is cracked',
    timestamp: new Date(Date.now() - 15 * 60000),
    type: 'chat',
  },
  {
    id: '5',
    sender: '0x9d...1e',
    text: '🌟 0x9d...1e just pulled PSA 10 Ace Manga Alt Art ($5,058) from Diamond Claw!',
    timestamp: new Date(Date.now() - 12 * 60000),
    type: 'pull',
    value: 5058,
  },
  {
    id: '6',
    sender: '0x1c...3f',
    text: 'i need that kind of luck lol',
    timestamp: new Date(Date.now() - 10 * 60000),
    type: 'chat',
  },
  {
    id: '7',
    sender: '0x5d...8e',
    text: 'just pulled my 3rd common in a row 💀',
    timestamp: new Date(Date.now() - 8 * 60000),
    type: 'chat',
  },
  {
    id: '8',
    sender: '0x3e...7b',
    text: 'F in chat for our friend',
    timestamp: new Date(Date.now() - 6 * 60000),
    type: 'chat',
  },
  {
    id: '9',
    sender: '0x6a...2c',
    text: '🔥 0x6a...2c just pulled PSA 9 Sanji Alt Art ($892) from Gold Claw!',
    timestamp: new Date(Date.now() - 4 * 60000),
    type: 'pull',
    value: 892,
  },
  {
    id: '10',
    sender: '0x2b...9a',
    text: 'dude how many times are you pulling gold claw',
    timestamp: new Date(Date.now() - 2 * 60000),
    type: 'chat',
  },
];

// Create context for chat (will be integrated with XMTP later)
export const ChatContext = ({ 
  children, 
  connectedWallet 
}: { 
  children: React.ReactNode;
  connectedWallet?: string;
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(MOCK_MESSAGES);
  const [isConnected, setIsConnected] = useState(!!connectedWallet);

  useEffect(() => {
    setIsConnected(!!connectedWallet);
  }, [connectedWallet]);

  const sendMessage = (text: string) => {
    // TODO: XMTP integration - send message via XMTP
    if (!connectedWallet) return;
    
    const newMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: connectedWallet,
      text,
      timestamp: new Date(),
      type: 'chat',
    };

    setMessages((prev) => [...prev.slice(-99), newMessage]);
  };

  const subscribeToMessages = (callback: (message: ChatMessage) => void) => {
    // TODO: XMTP integration - subscribe to incoming messages
    // For now, this is a stub that will be implemented with real XMTP SDK
  };

  const connectChat = (wallet: string) => {
    // TODO: XMTP integration - initialize XMTP client with wallet
    setIsConnected(true);
  };

  const value = {
    messages,
    onlineUsers: 47,
    sendMessage,
    subscribeToMessages,
    connectChat,
    isConnected,
  };

  return (
    <div>
      {children}
    </div>
  );
};

// Chat Component
interface ClawChatProps {
  connectedWallet?: string;
}

export default function ClawChat({ connectedWallet }: ClawChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(MOCK_MESSAGES);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const onlineUsers = 47;

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Simulate typing indicator
  useEffect(() => {
    if (isTyping) {
      const timer = setTimeout(() => setIsTyping(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isTyping]);

  // Simulate incoming messages (for demo purposes)
  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() > 0.7) {
        const mockSenders = ['0x3e...7b', '0x2b...9a', '0x1c...3f', '0x5d...8e', '0x7a...4d'];
        const mockTexts = [
          'good pull!',
          'lfg',
          'rip',
          'is gold claw really that good?',
          'anyone else experience cold claw?',
          'swapping instantly or holding?',
          'the odds seem sus ngl',
          'who has the biggest pull so far?',
        ];
        
        if (Math.random() > 0.5) {
          setTypingUser(mockSenders[Math.floor(Math.random() * mockSenders.length)]);
          setTimeout(() => setTypingUser(null), 1500);
        }
      }
    }, 8000);

    return () => clearInterval(interval);
  }, []);

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    if (!connectedWallet) {
      alert('Please connect your wallet to chat');
      return;
    }

    const newMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: connectedWallet,
      text: inputValue,
      timestamp: new Date(),
      type: 'chat',
    };

    setMessages((prev) => [...prev.slice(-99), newMessage]); // Keep max 100 messages
    setInputValue('');
    setIsTyping(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="flex flex-col h-full bg-[#0d1229] border border-[#1a1f3a] rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#0d1229] to-[#1a1f3a] border-b border-[#1a1f3a] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎮</span>
          <h3 className="text-white font-semibold text-sm">Salon Privé</h3>
          <div className="flex items-center gap-1.5 ml-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-gray-400">{onlineUsers} online</span>
          </div>
        </div>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 bg-[#0d1229]">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            No messages yet. Be the first to chat!
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="group">
              {msg.type === 'pull' ? (
                // Pull announcement styling
                <div className="bg-gradient-to-r from-[#1a1f3a] to-[#0d1229] border border-[#d4af37]/30 rounded-lg p-3 hover:border-[#d4af37]/50 transition">
                  <div className="flex items-start gap-2">
                    <span className="text-base mt-0.5">✨</span>
                    <div className="flex-1">
                      <p className="text-xs text-gray-300">
                        <span className="text-[#d4af37] font-mono font-semibold">{msg.sender}</span>
                        <span className="text-gray-400"> just pulled a card from Claw!</span>
                      </p>
                      {msg.value && (
                        <p className="text-xs text-[#d4af37] font-semibold mt-1">
                          ${msg.value.toLocaleString()} value
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">{formatTime(msg.timestamp)}</p>
                    </div>
                  </div>
                </div>
              ) : (
                // Regular message styling
                <div className="rounded-lg px-3 py-2 hover:bg-[#1a1f3a]/50 transition">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs text-[#d4af37] font-mono font-semibold">{msg.sender}</span>
                    <span className="text-xs text-gray-500">{formatTime(msg.timestamp)}</span>
                  </div>
                  <p className="text-sm text-gray-200 mt-1 break-words">{msg.text}</p>
                </div>
              )}
            </div>
          ))
        )}

        {/* Typing indicator */}
        {typingUser && (
          <div className="rounded-lg px-3 py-2">
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-[#d4af37] font-mono font-semibold">{typingUser}</span>
              <span className="text-xs text-gray-500">typing...</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" />
              <div className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '0.1s' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '0.2s' }} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      {!connectedWallet ? (
        <div className="border-t border-[#1a1f3a] bg-[#1a1f3a]/30 px-4 py-3">
          <button className="w-full px-4 py-2 bg-[#d4af37] hover:bg-[#e5c158] text-[#0d1229] rounded-lg font-semibold text-xs transition-colors duration-200 uppercase tracking-wider">
            Connect Wallet to Chat
          </button>
        </div>
      ) : (
        <div className="border-t border-[#1a1f3a] bg-[#0d1229] px-3 py-3 flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Say something..."
            className="flex-1 bg-[#1a1f3a] border border-[#1a1f3a] hover:border-[#d4af37]/30 focus:border-[#d4af37]/50 focus:outline-none text-white text-sm rounded-lg px-3 py-2 placeholder-gray-500 transition-colors duration-200"
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputValue.trim()}
            className="px-3 py-2 bg-[#d4af37] hover:bg-[#e5c158] disabled:opacity-50 disabled:cursor-not-allowed text-[#0d1229] rounded-lg font-semibold text-sm transition-colors duration-200 hover:disabled:bg-[#d4af37]"
          >
            Send
          </button>
        </div>
      )}

      {/* Custom scrollbar styling */}
      <style jsx>{`
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
