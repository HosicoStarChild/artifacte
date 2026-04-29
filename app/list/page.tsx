"use client";

import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { showToast } from "@/components/ToastContainer";
import { buttonVariants } from "@/components/ui/button";
import { useAllowlist } from "@/hooks/useAllowlist";
import { LIST_PAGE_RESET_EVENT } from "@/lib/list-page-reset";
import { useWalletCapabilities } from "@/hooks/useWalletCapabilities";
import { cn } from "@/lib/utils";

import { ListAssetSection } from "./_components/list-asset-section";
import {
  ListPageDisconnectedState,
  ListPageEmptyState,
  ListPageErrorBanner,
  ListPageErrorState,
  ListPageLoadingState,
  ListPageSubmittedState,
} from "./_components/list-page-states";
import { ListingForm } from "./_components/listing-form";
import {
  buildAssetSections,
  createAllowlistNameMap,
  getAllowedCollectionNames,
  getAssetSelectionListingMode,
  getEligibleAssetsCount,
  toAssetCardModel,
} from "./_lib/assets";
import {
  getListPageAssetsQueryKey,
  getListPageAssetsQueryOptions,
  getListPageRoyaltyQueryOptions,
  removeListPageAssetByMint,
} from "./_lib/queries";
import { submitListPageListing } from "./_lib/submit-listing";
import type { ListPageAsset, ListPageAssetCardModel, ListPageListingMode } from "./_lib/types";

type ListPageStateSetters = {
  setAuctionDuration: Dispatch<SetStateAction<string>>;
  setListingType: Dispatch<SetStateAction<ListPageListingMode>>;
  setPrice: Dispatch<SetStateAction<string>>;
  setSelectedAsset: Dispatch<SetStateAction<ListPageAsset | null>>;
  setSubmitted: Dispatch<SetStateAction<boolean>>;
  setSubmissionError: Dispatch<SetStateAction<string>>;
};

type ListingNotifyResponse = {
  added?: boolean;
  error?: string;
  message?: string;
  ok?: boolean;
  reason?: string;
  skipped?: boolean;
};

async function notifyOracleListing(mintAddress: string): Promise<void> {
  const response = await fetch("/api/listing-notify", {
    body: JSON.stringify({ mint: mintAddress }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  const payload = (await response.json().catch(() => null)) as ListingNotifyResponse | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? payload?.message ?? "Failed to notify oracle.");
  }

  if (payload?.skipped) {
    throw new Error(payload.error ?? "Oracle sync is disabled on this deployment.");
  }

  if (payload?.added === false && payload.reason !== "already exists") {
    throw new Error(payload.reason ?? "Oracle listing push did not add the mint.");
  }
}

function resetListPageState({
  setAuctionDuration,
  setListingType,
  setPrice,
  setSelectedAsset,
  setSubmitted,
  setSubmissionError,
}: ListPageStateSetters) {
  setSelectedAsset(null);
  setPrice("");
  setSubmissionError("");
  setSubmitted(false);
  setListingType("fixed");
  setAuctionDuration("72");
}

export default function ListNFTPage() {
  const queryClient = useQueryClient();
  const {
    anchorWallet,
    connected,
    connection,
    publicKey,
    sendTransaction,
    signTransaction,
  } = useWalletCapabilities();
  const { data: allowlist = [] } = useAllowlist();
  const [selectedAsset, setSelectedAsset] = useState<ListPageAsset | null>(null);
  const [price, setPrice] = useState("");
  const [listingType, setListingType] = useState<ListPageListingMode>("fixed");
  const [auctionDuration, setAuctionDuration] = useState("72");
  const [submitted, setSubmitted] = useState(false);
  const [submissionError, setSubmissionError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const walletAddress = connected && publicKey ? publicKey.toBase58() : null;
  const allowlistNameMap = useMemo(() => createAllowlistNameMap(allowlist), [allowlist]);
  const allowedCollectionNames = useMemo(() => getAllowedCollectionNames(allowlist), [allowlist]);
  const assetsQueryKey = getListPageAssetsQueryKey(walletAddress);

  const assetsQuery = useQuery(getListPageAssetsQueryOptions(walletAddress));

  const sections = useMemo(
    () => buildAssetSections(assetsQuery.data ?? [], allowlistNameMap),
    [allowlistNameMap, assetsQuery.data]
  );

  const selectedAssetCard = useMemo(
    () => (selectedAsset ? toAssetCardModel(selectedAsset, allowlistNameMap) : null),
    [allowlistNameMap, selectedAsset]
  );

  const selectedMintAddress = selectedAssetCard?.mintAddress ?? null;
  const royaltyQuery = useQuery(getListPageRoyaltyQueryOptions(selectedMintAddress));

  const eligibleAssetsCount = useMemo(() => getEligibleAssetsCount(sections), [sections]);
  const hiddenAssetsCount = (assetsQuery.data?.length ?? 0) - eligibleAssetsCount;

  useEffect(() => {
    const handleListPageReset = () => {
      resetListPageState({
        setAuctionDuration,
        setListingType,
        setPrice,
        setSelectedAsset,
        setSubmitted,
        setSubmissionError,
      });
    };

    window.addEventListener(LIST_PAGE_RESET_EVENT, handleListPageReset);

    return () => {
      window.removeEventListener(LIST_PAGE_RESET_EVENT, handleListPageReset);
    };
  }, [setAuctionDuration, setListingType, setPrice, setSelectedAsset, setSubmitted, setSubmissionError]);

  const handleSelectAsset = (card: ListPageAssetCardModel) => {
    setSelectedAsset(card.asset);
    setPrice("");
    setSubmissionError("");
    setSubmitted(false);
    setListingType(getAssetSelectionListingMode(card.asset));
  };

  const handleResetSelection = () => {
    resetListPageState({
      setAuctionDuration,
      setListingType,
      setPrice,
      setSelectedAsset,
      setSubmitted,
      setSubmissionError,
    });
  };

  const refreshAvailableAssets = async (listedMintAddress?: string) => {
    if (listedMintAddress) {
      queryClient.setQueryData<ListPageAsset[] | undefined>(assetsQueryKey, (currentAssets) =>
        removeListPageAssetByMint(currentAssets, listedMintAddress)
      );
    }

    await assetsQuery.refetch();
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmissionError("");

    try {
      const result = await submitListPageListing({
        anchorWallet,
        auctionDuration,
        connection,
        listingType,
        notifier: showToast,
        price,
        publicKey,
        royaltyMetadata: royaltyQuery.data,
        selectedAsset,
        sendTransaction,
        signTransaction,
      });

      let notifyWarning: string | null = null;

      if (result.shouldNotifyOracle && result.oracleNotifyDelayMs === 0) {
        try {
          await notifyOracleListing(result.mintAddress);
        } catch (error) {
          notifyWarning = error instanceof Error ? error.message : "Failed to notify oracle.";
        }
      }

      showToast.success("NFT listed successfully!");
      setSubmitted(true);
      void refreshAvailableAssets(result.mintAddress).catch(() => {
        showToast.info("Your listing is live. Refreshing the available NFT inventory may take a moment.");
      });

      if (notifyWarning) {
        showToast.info(`${notifyWarning} The listing is live on-chain, but category feeds may take a moment to refresh.`);
      }

      if (result.shouldNotifyOracle && result.oracleNotifyDelayMs > 0) {
        window.setTimeout(() => {
          notifyOracleListing(result.mintAddress).catch(() => undefined);
        }, result.oracleNotifyDelayMs);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Listing failed.";
      setSubmissionError(message);
      showToast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!walletAddress) {
    return (
      <main className="min-h-screen bg-dark-900 pt-24 pb-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="space-y-8">
            <header className="space-y-3">
              <Link
                className={cn(buttonVariants({ size: "sm", variant: "ghost" }), "inline-flex px-0 text-gold-400 hover:bg-transparent hover:text-gold-300")}
                href="/"
              >
                <ArrowLeft className="mr-2 size-4" />
                Back to Home
              </Link>
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gold-300">List Item</p>
                <h1 className="font-serif text-4xl text-white">List Your Item</h1>
                <p className="max-w-2xl text-sm text-white/55">
                  Select an eligible asset from your wallet and choose whether to list it on Artifacte or Tensor.
                </p>
              </div>
            </header>
            <ListPageDisconnectedState />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-dark-900 pt-24 pb-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="space-y-8">
          <header className="space-y-3">
            <Link
              className={cn(buttonVariants({ size: "sm", variant: "ghost" }), "inline-flex px-0 text-gold-400 hover:bg-transparent hover:text-gold-300")}
              href="/"
            >
              <ArrowLeft className="mr-2 size-4" />
              Back to Home
            </Link>
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gold-300">List Item</p>
              <h1 className="font-serif text-4xl text-white">List Your Item</h1>
              <p className="max-w-2xl text-sm text-white/55">
                Select an eligible asset from your wallet and set the listing terms.
              </p>
            </div>
          </header>

          {submissionError ? <ListPageErrorBanner message={submissionError} /> : null}

          {submitted ? (
            <ListPageSubmittedState onRetry={handleResetSelection} />
          ) : assetsQuery.isPending ? (
            <ListPageLoadingState />
          ) : assetsQuery.isError ? (
            <ListPageErrorState
              errorMessage={assetsQuery.error.message}
              onRetry={() => {
                void refreshAvailableAssets();
              }}
            />
          ) : !selectedAssetCard ? (
            sections.length === 0 ? (
              <ListPageEmptyState
                allowedCollectionNames={allowedCollectionNames}
                onRetry={() => {
                  void refreshAvailableAssets();
                }}
              />
            ) : (
              <div className="space-y-10">
                {sections.map((section) => (
                  <ListAssetSection key={section.id} onSelect={handleSelectAsset} section={section} />
                ))}
                {hiddenAssetsCount > 0 ? (
                  <p className="text-center text-xs text-white/35">
                    {hiddenAssetsCount} assets hidden because they are not from approved collections.
                  </p>
                ) : null}
              </div>
            )
          ) : (
            <ListingForm
              assetCard={selectedAssetCard}
              auctionDuration={auctionDuration}
              listingType={listingType}
              onAuctionDurationChange={setAuctionDuration}
              onBack={handleResetSelection}
              onListingTypeChange={setListingType}
              onPriceChange={setPrice}
              onSubmit={handleSubmit}
              price={price}
              submitting={submitting}
            />
          )}
        </div>
      </div>
    </main>
  );
}
