export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-dark-900 pt-32 pb-20">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="font-serif text-4xl text-white mb-8">Privacy Policy</h1>
        <div className="prose prose-invert prose-gold max-w-none space-y-6 text-gray-300 text-sm leading-relaxed">
          <p className="text-gray-400 text-xs">Last updated: March 27, 2026</p>

          <h2 className="font-serif text-xl text-white mt-8">1. Introduction</h2>
          <p>Artifacte (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) operates the artifacte.io website. This Privacy Policy explains how we collect, use, and protect your information when you use our platform.</p>

          <h2 className="font-serif text-xl text-white mt-8">2. Information We Collect</h2>
          <p><strong className="text-white">Wallet Address:</strong> When you connect your Solana wallet, we receive your public wallet address. We do not have access to your private keys or seed phrases.</p>
          <p><strong className="text-white">Transaction Data:</strong> Blockchain transactions are public by nature. We may display transaction history related to NFTs listed or purchased on our platform.</p>
          <p><strong className="text-white">Usage Data:</strong> We collect standard web analytics (page views, browser type, device info) to improve our service.</p>

          <h2 className="font-serif text-xl text-white mt-8">3. How We Use Your Information</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>Display your NFT portfolio when you connect your wallet</li>
            <li>Process listings, bids, and purchases on our marketplace</li>
            <li>Provide price oracle data and market valuations</li>
            <li>Improve our platform and user experience</li>
          </ul>

          <h2 className="font-serif text-xl text-white mt-8">4. Data Storage & Security</h2>
          <p>We do not store personal information beyond your public wallet address. All blockchain data is publicly available on the Solana network. We use industry-standard security measures to protect our platform infrastructure.</p>

          <h2 className="font-serif text-xl text-white mt-8">5. Third-Party Services</h2>
          <p>We integrate with the following third-party services:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong className="text-white">Helius</strong> — Solana RPC and NFT data</li>
            <li><strong className="text-white">Magic Eden</strong> — NFT marketplace data</li>
            <li><strong className="text-white">Arweave/Irys</strong> — Decentralized metadata storage</li>
            <li><strong className="text-white">Vercel</strong> — Website hosting</li>
          </ul>
          <p>Each service has its own privacy policy governing how they handle data.</p>

          <h2 className="font-serif text-xl text-white mt-8">6. Cookies</h2>
          <p>We use minimal cookies for session management and preferences. No third-party tracking cookies are used.</p>

          <h2 className="font-serif text-xl text-white mt-8">7. Your Rights</h2>
          <p>You can disconnect your wallet at any time to stop sharing your wallet address with our platform. Blockchain transactions are permanent and cannot be deleted as they exist on the public ledger.</p>

          <h2 className="font-serif text-xl text-white mt-8">8. Changes to This Policy</h2>
          <p>We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated date.</p>

          <h2 className="font-serif text-xl text-white mt-8">9. Contact</h2>
          <p>For privacy-related questions, reach out to us on <a href="https://x.com/Artifacte_io" target="_blank" rel="noopener noreferrer" className="text-gold-500 hover:text-gold-400">X (@Artifacte_io)</a>.</p>
        </div>
      </div>
    </main>
  );
}
