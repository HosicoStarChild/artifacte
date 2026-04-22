"use client";

import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { isOwnerWallet } from "@/lib/admin";
import { cn } from "@/lib/utils";

import { MintFormContent } from "./content";

function AccessCard({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <Card className="border-white/10 bg-black/20 backdrop-blur-sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Link
          className={cn(buttonVariants({ variant: "outline" }), "justify-start")}
          href="/admin"
        >
          Return to admin
        </Link>
      </CardContent>
    </Card>
  );
}

export default function AdminMintPage() {
  const { connected, publicKey } = useWallet();
  const walletAddress = publicKey?.toBase58() ?? null;
  const canAccessMintRoute = isOwnerWallet(walletAddress);

  return (
    <main className="min-h-screen bg-dark-900 bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.12),transparent_35%),linear-gradient(180deg,rgba(10,10,10,0.95),rgba(10,10,10,1))] pt-32 pb-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {!connected ? (
          <AccessCard
            description="Connect the owner wallet to access the standalone mint route."
            title="Owner access required"
          />
        ) : !canAccessMintRoute ? (
          <AccessCard
            description="Only the owner wallet can access the standalone admin mint workflow."
            title="Access denied"
          />
        ) : (
          <div className="space-y-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-200/80">
                  Admin surface
                </p>
                <div className="space-y-2">
                  <h1 className="text-4xl font-semibold tracking-tight text-foreground">
                    Owner Mint Workflow
                  </h1>
                  <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                    Create Core collections, upload metadata, and mint owner-managed assets without leaving the admin surface.
                  </p>
                </div>
              </div>
              <Link
                className={cn(buttonVariants({ variant: "ghost" }), "justify-start self-start")}
                href="/admin"
              >
                Return to admin
              </Link>
            </div>

            <MintFormContent />
          </div>
        )}
      </div>
    </main>
  );
}