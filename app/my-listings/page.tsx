"use client";

import { startTransition, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Card, CardContent } from "@/components/ui/card";
import { useWalletCapabilities } from "@/hooks/useWalletCapabilities";
import type { MyListingsPageData, MyListingRecord, MyListingStatus } from "@/lib/my-listings";

import { MyListingCard } from "./_components/my-listing-card";
import { MyListingsHeader } from "./_components/my-listings-header";
import {
  MyListingsDisconnectedState,
  MyListingsEmptyState,
  MyListingsErrorState,
  MyListingsLoadingState,
} from "./_components/my-listings-states";
import { MyListingsTabs } from "./_components/my-listings-tabs";
import {
  executeMyListingAction,
  fetchMyListings,
  getMyListingsQueryKey,
  updateCachedListingStatus,
} from "./_lib/client";

const EMPTY_LISTINGS: MyListingRecord[] = [];

const EMPTY_COUNTS: Record<MyListingStatus, number> = {
  active: 0,
  cancelled: 0,
  completed: 0,
};

export default function MyListingsPage() {
  const {
    anchorWallet,
    connected,
    connection,
    publicKey,
    sendTransaction,
    signTransaction,
  } = useWalletCapabilities();
  const queryClient = useQueryClient();

  const walletAddress = publicKey?.toBase58() ?? null;
  const [activeTab, setActiveTab] = useState<MyListingStatus>("active");
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingMint, setPendingMint] = useState<string | null>(null);

  const myListingsQuery = useQuery<MyListingsPageData, Error>({
    enabled: Boolean(connected && walletAddress),
    queryFn: () => fetchMyListings(walletAddress ?? ""),
    queryKey: getMyListingsQueryKey(walletAddress),
    staleTime: 30_000,
  });

  const listings = myListingsQuery.data?.listings ?? EMPTY_LISTINGS;
  const counts = useMemo<Record<MyListingStatus, number>>(() => {
    if (!listings.length) {
      return EMPTY_COUNTS;
    }

    return listings.reduce<Record<MyListingStatus, number>>(
      (allCounts, listing) => ({
        ...allCounts,
        [listing.status]: allCounts[listing.status] + 1,
      }),
      { ...EMPTY_COUNTS },
    );
  }, [listings]);

  const filteredListings = useMemo(
    () => listings.filter((listing) => listing.status === activeTab),
    [activeTab, listings],
  );

  const walletLabel = walletAddress
    ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)} — manage your marketplace positions`
    : "Connect your wallet to manage your active listings";

  const handleRefresh = async (): Promise<void> => {
    setActionError(null);
    await myListingsQuery.refetch();
  };

  const handleListingAction = async (listing: MyListingRecord): Promise<void> => {
    if (!walletAddress) {
      return;
    }

    setActionError(null);
    setPendingMint(listing.nftMint);

    try {
      await executeMyListingAction(listing, {
        anchorWallet,
        connection,
        sendTransaction,
        signTransaction,
        walletAddress,
      });

      startTransition(() => {
        queryClient.setQueryData<MyListingsPageData | undefined>(
          getMyListingsQueryKey(walletAddress),
          (currentData) =>
            currentData
              ? updateCachedListingStatus(currentData, listing.nftMint, "cancelled")
              : currentData,
        );
      });
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to update listing",
      );
    } finally {
      setPendingMint(null);
    }
  };

  return (
    <div className="min-h-screen bg-dark-900 pt-24">
      <div className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="space-y-8">
          <MyListingsHeader
            isRefreshing={myListingsQuery.isFetching}
            onRefresh={connected && walletAddress ? () => { void handleRefresh(); } : undefined}
            refreshDisabled={myListingsQuery.isFetching}
            walletLabel={walletLabel}
          />

          {!connected || !walletAddress ? (
            <MyListingsDisconnectedState />
          ) : myListingsQuery.isPending ? (
            <MyListingsLoadingState />
          ) : myListingsQuery.isError ? (
            <MyListingsErrorState
              errorMessage={myListingsQuery.error.message}
              onRetry={() => { void handleRefresh(); }}
            />
          ) : (
            <div className="space-y-6">
              <MyListingsTabs
                activeTab={activeTab}
                counts={counts}
                onChange={setActiveTab}
              />

              {actionError ? (
                <Card className="border-red-500/20 bg-dark-800/80 py-0">
                  <CardContent className="px-5 py-4 text-sm text-red-200/85">
                    {actionError}
                  </CardContent>
                </Card>
              ) : null}

              {filteredListings.length === 0 ? (
                <MyListingsEmptyState activeTab={activeTab} />
              ) : (
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredListings.map((listing) => (
                    <MyListingCard
                      isPending={pendingMint === listing.nftMint}
                      key={listing.id}
                      listing={listing}
                      onAction={(nextListing) => { void handleListingAction(nextListing); }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
