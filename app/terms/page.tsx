export default function TermsPage() {
  return (
    <main className="min-h-screen bg-dark-900 pt-32 pb-20">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="font-serif text-4xl text-white mb-8">Terms of Service</h1>
        <div className="prose prose-invert prose-gold max-w-none space-y-6 text-gray-300 text-sm leading-relaxed">
          <p className="text-gray-400 text-xs">Last updated: April 14, 2026</p>

          <h2 className="font-serif text-xl text-white mt-8">1. Acceptance of Terms</h2>
          <p>By accessing or using Artifacte (&quot;the Platform&quot;), you agree to be bound by these Terms of Service. If you do not agree, do not use the Platform.</p>

          <h2 className="font-serif text-xl text-white mt-8">2. Platform Description</h2>
          <p>Artifacte is a marketplace for real-world assets (RWAs) tokenized as NFTs on the Solana blockchain. The Platform facilitates the listing, discovery, and trading of authenticated collectibles including trading cards, sealed products, spirits, watches, and digital art.</p>
          <p className="bg-gold-500/10 border border-gold-500/30 rounded-lg p-4 text-gold-400"><strong>Beta Notice:</strong> Artifacte is currently in beta. Features may change, and some functionality may be limited or unavailable. Use at your own discretion.</p>

          <h2 className="font-serif text-xl text-white mt-8">3. Eligibility</h2>
          <p>You must be at least 18 years old and capable of forming a binding contract to use the Platform. By using Artifacte, you represent that you meet these requirements.</p>

          <h2 className="font-serif text-xl text-white mt-8">4. Wallet Connection</h2>
          <p>To interact with the Platform, you must connect a compatible Solana wallet (e.g., Phantom, Solflare). You are solely responsible for:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Maintaining the security of your wallet and private keys</li>
            <li>All transactions made through your connected wallet</li>
            <li>Any fees associated with blockchain transactions</li>
          </ul>
          <p><strong className="text-white">We never ask for your seed phrase or private keys.</strong></p>

          <h2 className="font-serif text-xl text-white mt-8">5. NFTs and Real-World Assets</h2>
          <p>NFTs on Artifacte may represent ownership claims on physical items stored in third-party custody (vaults). Important considerations:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Ownership of an NFT represents a claim on the underlying physical asset</li>
            <li>Physical items are stored by authorized vault providers (PSA Vault, PWCC, etc.)</li>
            <li>Redemption of physical items is subject to the vault provider&apos;s terms</li>
            <li>Market values displayed are estimates from our oracle and may not reflect exact sale prices</li>
          </ul>

          <h2 className="font-serif text-xl text-white mt-8">6. Fees</h2>
          <p>Artifacte charges a <strong className="text-white">2% platform fee</strong> on completed sales. NFTs minted by Artifacte carry a <strong className="text-white">2% royalty</strong> on secondary sales, enforced at the protocol level. Additional blockchain transaction fees (gas) apply to all on-chain operations.</p>

          <h2 className="font-serif text-xl text-white mt-8">7. Prohibited Activities</h2>
          <p>You agree not to:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Use the Platform for money laundering or illegal activities</li>
            <li>Manipulate prices through wash trading or shill bidding</li>
            <li>Attempt to exploit smart contract vulnerabilities</li>
            <li>Misrepresent the authenticity or condition of listed items</li>
            <li>Interfere with the Platform&apos;s infrastructure or other users</li>
          </ul>

          <h2 className="font-serif text-xl text-white mt-8">8. Disclaimers</h2>
          <p>The Platform is provided &quot;as is&quot; without warranties of any kind. We do not guarantee:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Accuracy of price oracle data or market valuations</li>
            <li>Availability or uptime of the Platform</li>
            <li>That smart contracts are free from bugs or vulnerabilities</li>
            <li>The authenticity of third-party listed items (Collector Crypt and other external sources)</li>
          </ul>

          <h2 className="font-serif text-xl text-white mt-8">9. Limitation of Liability</h2>
          <p>To the maximum extent permitted by law, Artifacte shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Platform, including but not limited to loss of funds, NFTs, or data.</p>

          <h2 className="font-serif text-xl text-white mt-8">10. Intellectual Property</h2>
          <p>The Artifacte brand, logo, and platform design are our property. NFT metadata and images belong to their respective creators and rights holders.</p>

          <h2 className="font-serif text-xl text-white mt-8">11. Changes to Terms</h2>
          <p>We reserve the right to modify these Terms at any time. Continued use of the Platform constitutes acceptance of updated Terms.</p>

          <h2 className="font-serif text-xl text-white mt-8">12. Contact</h2>
          <p>Questions about these Terms? Reach out on <a href="https://x.com/Artifacte_io" target="_blank" rel="noopener noreferrer" className="text-gold-500 hover:text-gold-400">X (@Artifacte_io)</a>.</p>
        </div>
      </div>
    </main>
  );
}
