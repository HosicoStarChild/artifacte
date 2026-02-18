import type { Metadata } from "next";
import "./globals.css";
import { WalletProviderWrapper } from "@/components/WalletProvider";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Artifacte — RWA Tokenization on Solana",
  description: "Institutional-grade real world asset tokenization platform on Solana",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <WalletProviderWrapper>
          <Navbar />
          <main className="min-h-screen">{children}</main>
          <Footer />
        </WalletProviderWrapper>
      </body>
    </html>
  );
}
