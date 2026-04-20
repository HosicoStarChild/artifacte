import type { Metadata, Viewport } from "next";
import "./globals.css";
import { WalletProviderWrapper } from "@/components/WalletProvider";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ToastContainer } from "@/components/ToastContainer";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "Artifacte — RWA Tokenization on Solana",
  description: "Buy, sell and trade tokenized collectibles on Solana. PSA & CGC graded trading cards, spirits, sealed products and more — verified on-chain.",
  metadataBase: new URL("https://artifacte.io"),
  openGraph: {
    title: "Artifacte — RWA Tokenization on Solana",
    description: "Buy, sell and trade tokenized collectibles on Solana. PSA & CGC graded trading cards, spirits, sealed products and more.",
    url: "https://artifacte.io",
    siteName: "Artifacte",
    images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: "Artifacte — RWA Marketplace" }],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Artifacte — RWA Tokenization on Solana",
    description: "Buy, sell and trade tokenized collectibles on Solana.",
    images: ["/og-image.jpg"],
  },
  keywords: ["Solana", "NFT", "trading cards", "PSA", "CGC", "graded cards", "RWA", "tokenization", "collectibles", "Pokemon cards", "sports cards"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased bg-dark-900 text-white">
        <WalletProviderWrapper>
          <Navbar />
          <main className="min-h-screen">{children}</main>
          <Footer />
          <ToastContainer />
        </WalletProviderWrapper>
      </body>
    </html>
  );
}
