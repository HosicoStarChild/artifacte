"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { showToast } from "@/components/ToastContainer";
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
  updateCachedListingStatus,
} from "./_lib/client";
import { getMyListingsQueryKey } from "./_lib/query-key";

const EMPTY_LISTINGS: MyListingRecord[] = [];

const EMPTY_COUNTS: Record<MyListingStatus, number> = {
  active: 0,
  cancelled: 0,
  completed: 0,
};

const POST_ACTION_SYNC_ATTEMPTS = 6;
const POST_ACTION_SYNC_DELAY_MS = 1_000;

function hasActiveListing(data: MyListingsPageData, listing: MyListingRecord): boolean {
  return data.listings.some(
    (currentListing) =>
      currentListing.nftMint === listing.nftMint
      && currentListing.source === listing.source
      && currentListing.status === "active",
  );
}

function applyOptimisticListingAction(
  data: MyListingsPageData,
  listing: MyListingRecord,
): MyListingsPageData {
  if (listing.source === "artifacte") {
    return updateCachedListingStatus(data, listing.nftMint, "cancelled");
  }

  return {
    ...data,
    listings: data.listings.filter(
      (currentListing) => !(
        currentListing.nftMint === listing.nftMint
        && currentListing.source === listing.source
      ),
    ),
    updatedAt: Date.now(),
  };
}

function getListingActionSuccessMessage(listing: MyListingRecord): string {
  return listing.source === "tensor"
    ? "NFT delisted successfully."
    : "Listing cancelled successfully.";
}

async function waitForListingsSync(
  walletAddress: string,
  listing: MyListingRecord,
): Promise<MyListingsPageData | null> {
  for (let attempt = 0; attempt < POST_ACTION_SYNC_ATTEMPTS; attempt += 1) {
    const freshData = await fetchMyListings(walletAddress);

    if (!hasActiveListing(freshData, listing)) {
      return freshData;
    }

    if (attempt < POST_ACTION_SYNC_ATTEMPTS - 1) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, POST_ACTION_SYNC_DELAY_MS);
      });
    }
  }

  return null;
}

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
    gcTime: 0,
    queryFn: () => fetchMyListings(walletAddress ?? ""),
    queryKey: ["my-listings", walletAddress],
    refetchOnMount: "always",
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    staleTime: 0,
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
    ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)} — manage your marketplace listings, including Artifacte NFTs`
    : "Connect your wallet to manage your marketplace listings, including Artifacte NFTs";

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

      queryClient.setQueryData<MyListingsPageData | undefined>(
        getMyListingsQueryKey(walletAddress),
        (currentData) => (
          currentData
            ? applyOptimisticListingAction(currentData, listing)
            : currentData
        ),
      );

      showToast.success(getListingActionSuccessMessage(listing));

      void waitForListingsSync(walletAddress, listing)
        .then((freshData) => {
          if (freshData) {
            queryClient.setQueryData(getMyListingsQueryKey(walletAddress), freshData);
            return;
          }

          showToast.info("Listing updated on-chain. Refreshing the page may take a few more seconds.");
        })
        .catch(() => {
          showToast.info("Listing updated on-chain. Refreshing the page may take a few more seconds.");
        });
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Failed to update listing";

      showToast.error(message);
      setActionError(message);
    } finally {
      setPendingMint(null);
    }
  };

  const handleRetry = (): void => {
    setActionError(null);
    void handleRefresh();
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
              onRetry={handleRetry}
            />
          ) : (
            <div className="space-y-6">
              <MyListingsTabs
                activeTab={activeTab}
                counts={counts}
                onChange={setActiveTab}
              />

              <p className="text-sm text-white/55">
                All supported marketplace listings appear in this main grid, including Artifacte NFTs.
              </p>

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
