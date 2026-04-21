import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { WalletProviderWrapper } from "@/components/WalletProvider";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ToastContainer } from "@/components/ToastContainer";
import { cn } from "@/lib/utils";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const siteName = "Artifacte";
const siteTitle = "Artifacte — RWA Tokenization on Solana";
const siteDescription = "Buy, sell and trade tokenized collectibles on Solana. PSA & CGC graded trading cards, spirits, sealed products and more — verified on-chain.";
const metadataBase = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://artifacte.io");

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark",
  themeColor: "#0a0a0f",
};

export const metadata: Metadata = {
  title: siteTitle,
  description: siteDescription,
  metadataBase,
  applicationName: siteName,
  alternates: {
    canonical: "/",
  },
  category: "collectibles",
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    url: "/",
    siteName,
    images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: "Artifacte — RWA Marketplace" }],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/og-image.jpg"],
  },
  keywords: ["Solana", "NFT", "trading cards", "PSA", "CGC", "graded cards", "RWA", "tokenization", "collectibles", "Pokemon cards", "sports cards"],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn(inter.variable, playfairDisplay.variable, "dark")}
    >
      <body className="bg-background font-sans text-foreground antialiased">
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
