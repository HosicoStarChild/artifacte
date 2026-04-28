import { AlertTriangle, PackageSearch, Store, Wallet2 } from "lucide-react";

import { NavbarWalletButton } from "@/components/NavbarWalletButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { MyListingStatus } from "@/lib/my-listings";

interface MyListingsErrorStateProps {
  errorMessage: string;
  onRetry: () => void;
}

interface MyListingsEmptyStateProps {
  activeTab: MyListingStatus;
}

const emptyStateMessages: Record<MyListingStatus, string> = {
  active: "You do not have any active listings right now.",
  cancelled: "You have not cancelled any listings in this session yet.",
  completed: "No completed sales are available for this wallet.",
};

export function MyListingsDisconnectedState() {
  return (
    <Card className="border-white/5 bg-dark-800/80 py-0">
      <CardContent className="flex flex-col items-center gap-6 px-6 py-14 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-dark-900 text-white/45">
          <Wallet2 className="size-9" />
        </div>
        <div className="space-y-2">
          <h2 className="font-serif text-2xl text-white">Connect your wallet</h2>
          <p className="max-w-md text-sm text-white/55">
            Connect your Solana wallet to review and manage your Artifacte, Core, and Tensor listings.
          </p>
        </div>
        <NavbarWalletButton />
      </CardContent>
    </Card>
  );
}

export function MyListingsLoadingState() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <Card key={index} className="overflow-hidden border-white/5 bg-dark-800/80 py-0">
          <Skeleton className="aspect-square rounded-none bg-white/8" />
          <CardContent className="space-y-4 px-4 py-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-2/3 bg-white/8" />
              <Skeleton className="h-3 w-1/2 bg-white/8" />
            </div>
            <Skeleton className="h-10 w-full bg-white/8" />
            <Skeleton className="h-9 w-full bg-white/8" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function MyListingsErrorState({
  errorMessage,
  onRetry,
}: MyListingsErrorStateProps) {
  return (
    <Card className="border-red-500/20 bg-dark-800/80 py-0">
      <CardContent className="flex flex-col items-center gap-5 px-6 py-14 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/8 text-red-200/80">
          <AlertTriangle className="size-9" />
        </div>
        <div className="space-y-2">
          <h2 className="font-serif text-2xl text-white">Unable to load listings</h2>
          <p className="max-w-md text-sm text-red-200/80">{errorMessage}</p>
        </div>
        <Button onClick={onRetry} size="lg" variant="secondary">
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}

export function MyListingsEmptyState({ activeTab }: MyListingsEmptyStateProps) {
  return (
    <Card className="border-white/5 bg-dark-800/80 py-0">
      <CardContent className="flex flex-col items-center gap-4 px-6 py-14 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-dark-900 text-white/40">
          {activeTab === "completed" ? <Store className="size-9" /> : <PackageSearch className="size-9" />}
        </div>
        <div className="space-y-2">
          <h2 className="font-serif text-2xl text-white">No listings in this view</h2>
          <p className="max-w-md text-sm text-white/55">{emptyStateMessages[activeTab]}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function MyListingsArtifacteSectionEmptyState() {
  return (
    <Card className="border-white/5 bg-dark-800/80 py-0">
      <CardContent className="flex flex-col items-center gap-4 px-6 py-14 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-dark-900 text-white/40">
          <PackageSearch className="size-9" />
        </div>
        <div className="space-y-2">
          <h3 className="font-serif text-2xl text-white">No active Artifacte collection listings</h3>
          <p className="max-w-md text-sm text-white/55">
            Active listings from the Artifacte collection for this wallet will appear here, including NFTs currently held in marketplace escrow.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}