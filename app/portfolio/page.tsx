"use client";

import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";
import { ArrowLeft, RefreshCcw, Wallet2 } from "lucide-react";

import { NavbarWalletButton } from "@/components/NavbarWalletButton";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { PortfolioApiResponse, PortfolioPageData } from "@/lib/portfolio";
import { cn } from "@/lib/utils";

import { PortfolioSection } from "./_components/portfolio-section";
import { PortfolioSummary } from "./_components/portfolio-summary";

async function fetchPortfolio(wallet: string): Promise<PortfolioPageData> {
  const response = await fetch(`/api/portfolio?wallet=${encodeURIComponent(wallet)}`);
  const payload = (await response.json()) as PortfolioApiResponse;

  if (!response.ok || !payload.ok) {
    throw new Error(payload.ok ? "Failed to fetch portfolio data" : payload.error);
  }

  return payload;
}

function PortfolioLoadingState() {
  return (
    <div className="space-y-8">
      <Card className="border-white/5 bg-dark-800/80 py-0">
        <CardContent className="space-y-6 px-6 py-6">
          <div className="grid gap-4 md:grid-cols-3">
            <Skeleton className="h-24 bg-white/8" />
            <Skeleton className="h-24 bg-white/8" />
            <Skeleton className="h-24 bg-white/8" />
          </div>
          <Skeleton className="h-40 bg-white/8" />
        </CardContent>
      </Card>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="border-white/5 bg-dark-800/80 py-0">
            <Skeleton className="aspect-square rounded-none bg-white/8" />
            <CardContent className="space-y-3 px-4 py-4">
              <Skeleton className="h-4 w-2/3 bg-white/8" />
              <Skeleton className="h-3 w-1/2 bg-white/8" />
              <Skeleton className="h-6 w-1/3 bg-white/8" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PortfolioDisconnectedState() {
  return (
    <Card className="border-white/5 bg-dark-800/80 py-0">
      <CardContent className="flex flex-col items-center gap-6 px-6 py-14 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-dark-900 text-white/45">
          <Wallet2 className="size-9" />
        </div>
        <div className="space-y-2">
          <h2 className="font-serif text-2xl text-white">Connect your wallet</h2>
          <p className="max-w-md text-sm text-white/55">
            Connect your Solana wallet to view your RWAs and curated digital collectibles.
          </p>
        </div>
        <NavbarWalletButton />
      </CardContent>
    </Card>
  );
}

interface PortfolioErrorStateProps {
  errorMessage: string;
  onRetry: () => Promise<void>;
}

function PortfolioErrorState({ errorMessage, onRetry }: PortfolioErrorStateProps) {
  return (
    <Card className="border-red-500/20 bg-dark-800/80 py-0">
      <CardContent className="flex flex-col items-center gap-5 px-6 py-14 text-center">
        <div className="space-y-2">
          <h2 className="font-serif text-2xl text-white">Unable to load portfolio</h2>
          <p className="max-w-md text-sm text-red-200/80">{errorMessage}</p>
        </div>
        <Button onClick={() => { void onRetry(); }} size="lg" variant="secondary">
          <RefreshCcw className="mr-2 size-4" />
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}

function PortfolioEmptyState() {
  return (
    <Card className="border-white/5 bg-dark-800/80 py-0">
      <CardContent className="flex flex-col items-center gap-4 px-6 py-14 text-center">
        <div className="space-y-2">
          <h2 className="font-serif text-2xl text-white">No assets found</h2>
          <p className="max-w-md text-sm text-white/55">
            This wallet does not currently hold any supported RWAs or curated digital collectibles.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function PortfolioPage() {
  const { publicKey, connected } = useWallet();
  const walletAddress = publicKey?.toBase58() ?? null;
  const walletLabel = walletAddress
    ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)} — RWAs & Digital Collectibles`
    : "Connect your wallet to view your assets";

  const portfolioQuery = useQuery<PortfolioPageData, Error>({
    queryKey: ["portfolio", walletAddress],
    queryFn: () => fetchPortfolio(walletAddress ?? ""),
    enabled: Boolean(walletAddress && connected),
    staleTime: 5 * 60 * 1000,
  });

  const handleRetry = async (): Promise<void> => {
    await portfolioQuery.refetch();
  };

  const portfolioData = portfolioQuery.data;

  return (
    <div className="pt-24 min-h-screen bg-dark-900">
      <div className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="mb-8 space-y-3">
          <Link
            className={cn(buttonVariants({ size: "sm", variant: "ghost" }), "inline-flex px-0 text-gold-400 hover:bg-transparent hover:text-gold-300")}
            href="/"
          >
            <ArrowLeft className="mr-2 size-4" />
            Back to Home
          </Link>
          <div className="space-y-2">
            <Badge className="border-gold-500/30 bg-gold-500/10 text-[10px] font-semibold tracking-[0.24em] uppercase text-gold-300">
              Investor Profile
            </Badge>
            <h1 className="font-serif text-3xl text-white">My Portfolio</h1>
            <p className="text-sm text-white/55">{walletLabel}</p>
          </div>
        </div>

        {!connected || !walletAddress ? (
          <PortfolioDisconnectedState />
        ) : portfolioQuery.isPending ? (
          <PortfolioLoadingState />
        ) : portfolioQuery.isError ? (
          <PortfolioErrorState errorMessage={portfolioQuery.error.message} onRetry={handleRetry} />
        ) : !portfolioData || portfolioData.sections.length === 0 ? (
          <PortfolioEmptyState />
        ) : (
          <div className="space-y-12">
            <PortfolioSummary breakdown={portfolioData.breakdown} summary={portfolioData.summary} />
            <div className="space-y-12">
              {portfolioData.sections.map((section) => (
                <PortfolioSection key={section.id} section={section} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
