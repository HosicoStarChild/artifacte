import { AlertTriangle, CheckCircle2, Link2, Loader2, PackageSearch } from "lucide-react";

import { NavbarWalletButton } from "@/components/NavbarWalletButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface ListPageErrorBannerProps {
  message: string;
}

interface ListPageActionStateProps {
  onRetry?: () => void;
}

interface ListPageEmptyStateProps extends ListPageActionStateProps {
  allowedCollectionNames: string[];
}

interface ListPageErrorStateProps extends ListPageActionStateProps {
  errorMessage: string;
}

export function ListPageErrorBanner({ message }: ListPageErrorBannerProps) {
  return (
    <div className="rounded-xl border border-red-500/20 bg-red-950/30 px-4 py-3 text-sm text-red-100">
      {message}
    </div>
  );
}

export function ListPageDisconnectedState() {
  return (
    <Card className="border-white/5 bg-dark-800/85 py-0 text-white">
      <CardContent className="flex flex-col items-center gap-6 px-6 py-14 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-dark-900 text-white/40">
          <Link2 className="size-9" />
        </div>
        <div className="space-y-2">
          <h2 className="font-serif text-2xl text-white">Connect your wallet</h2>
          <p className="max-w-md text-sm text-white/55">
            Connect your Solana wallet to load supported assets and create a listing on Artifacte.
          </p>
        </div>
        <NavbarWalletButton />
      </CardContent>
    </Card>
  );
}

export function ListPageLoadingState() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 text-sm text-white/55">
        <Loader2 className="size-4 animate-spin text-gold-300" />
        Loading your wallet assets...
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Card key={index} className="overflow-hidden border-white/5 bg-dark-800/80 py-0">
            <Skeleton className="aspect-square rounded-none bg-white/8" />
            <CardContent className="space-y-3 px-4 py-4">
              <Skeleton className="h-4 w-2/3 bg-white/8" />
              <Skeleton className="h-3 w-1/2 bg-white/8" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function ListPageEmptyState({ allowedCollectionNames, onRetry }: ListPageEmptyStateProps) {
  return (
    <Card className="border-white/5 bg-dark-800/85 py-0 text-white">
      <CardContent className="flex flex-col items-center gap-5 px-6 py-14 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-dark-900 text-white/40">
          <PackageSearch className="size-9" />
        </div>
        <div className="space-y-2">
          <h2 className="font-serif text-2xl text-white">No eligible items found</h2>
          <p className="max-w-xl text-sm text-white/55">
            You need assets from an approved collection to list on Artifacte. Currently approved: {allowedCollectionNames.join(", ") || "None"}.
          </p>
        </div>
        {onRetry ? (
          <Button onClick={onRetry} size="lg" variant="secondary">
            Refresh wallet assets
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ListPageErrorState({ errorMessage, onRetry }: ListPageErrorStateProps) {
  return (
    <Card className="border-red-500/20 bg-dark-800/85 py-0 text-white">
      <CardContent className="flex flex-col items-center gap-5 px-6 py-14 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-red-500/25 bg-red-950/30 text-red-200">
          <AlertTriangle className="size-9" />
        </div>
        <div className="space-y-2">
          <h2 className="font-serif text-2xl text-white">Unable to load assets</h2>
          <p className="max-w-xl text-sm text-red-100/80">{errorMessage}</p>
        </div>
        {onRetry ? (
          <Button onClick={onRetry} size="lg" variant="secondary">
            Try again
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ListPageSubmittedState({ onRetry }: ListPageActionStateProps) {
  return (
    <Card className="border-white/5 bg-dark-800/85 py-0 text-white">
      <CardHeader className="items-center px-8 pt-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
          <CheckCircle2 className="size-8" />
        </div>
        <CardTitle className="text-2xl text-white">Listed successfully</CardTitle>
        <CardDescription className="max-w-md text-sm leading-6 text-white/55">
          Your asset is now listed. If it routed through Tensor, the indexer notification is sent after confirmation.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-8 pb-8 text-center">
        {onRetry ? (
          <Button className="w-full" onClick={onRetry} size="lg" variant="secondary">
            List another asset
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}