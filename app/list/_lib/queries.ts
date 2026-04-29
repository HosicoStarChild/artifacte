"use client";

import { queryOptions } from "@tanstack/react-query";

import { LIST_PAGE_ALLOWED_DAS_METHOD } from "./constants";
import { isListableAsset } from "./assets";
import type {
  ListPageAsset,
  ListPageErrorResponse,
  ListPageHeliusDasResponse,
  ListPageNftApiResponse,
  ListPageRoyaltyMetadata,
} from "./types";

interface ListPageArtifacteProgramListing {
  id: string;
  nftAddress: string;
}

interface ListPageArtifacteProgramListingsResponse {
  listings?: ListPageArtifacteProgramListing[];
}

export function getListPageAssetsQueryKey(walletAddress: string | null) {
  return ["list-page-assets", walletAddress] as const;
}

function getResponseErrorMessage(
  response: Response,
  payload?: ListPageErrorResponse,
  fallback = "Request failed"
): string {
  if (payload?.error) {
    return payload.error;
  }

  return `${fallback}: ${response.status}`;
}

export async function fetchListPageAssets(walletAddress: string): Promise<ListPageAsset[]> {
  if (!walletAddress) {
    return [];
  }

  const listedArtifacteMintSetPromise = fetch(
    `/api/artifacte-program-listings?seller=${encodeURIComponent(walletAddress)}&perPage=100&sort=price-desc`,
    {
      cache: "no-store",
    }
  )
    .then(async (response) => {
      const payload = (await response.json()) as ListPageArtifacteProgramListingsResponse & ListPageErrorResponse;

      if (!response.ok) {
        throw new Error(getResponseErrorMessage(response, payload, "Failed to load active Artifacte listings"));
      }

      const listedMints = new Set<string>();

      for (const listing of payload.listings ?? []) {
        listedMints.add(listing.nftAddress || listing.id);
      }

      return listedMints;
    })
    .catch(() => new Set<string>());

  const response = await fetch("/api/helius-das", {
    body: JSON.stringify({
      method: LIST_PAGE_ALLOWED_DAS_METHOD,
      params: {
        displayOptions: {
          showFungible: false,
        },
        limit: 1000,
        ownerAddress: walletAddress,
        page: 1,
      },
    }),
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    method: "POST",
  });

  const payload = (await response.json()) as ListPageHeliusDasResponse & ListPageErrorResponse;

  if (!response.ok) {
    throw new Error(getResponseErrorMessage(response, payload, "Failed to load wallet assets"));
  }

  const listedArtifacteMintSet = await listedArtifacteMintSetPromise;

  return (payload.result?.items ?? []).filter((asset) => {
    if (!isListableAsset(asset)) {
      return false;
    }

    const mintAddress = asset.nftAddress || asset.id;
    return !listedArtifacteMintSet.has(mintAddress);
  });
}

export function removeListPageAssetByMint(
  assets: ListPageAsset[] | undefined,
  mintAddress: string
): ListPageAsset[] | undefined {
  if (!assets) {
    return assets;
  }

  return assets.filter((asset) => (asset.nftAddress || asset.id) !== mintAddress);
}

export function getListPageAssetsQueryOptions(walletAddress: string | null) {
  return queryOptions({
    enabled: Boolean(walletAddress),
    gcTime: 0,
    queryFn: () => fetchListPageAssets(walletAddress ?? ""),
    queryKey: getListPageAssetsQueryKey(walletAddress),
    refetchOnMount: "always",
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

export async function fetchListPageRoyaltyMetadata(mintAddress: string): Promise<ListPageRoyaltyMetadata> {
  if (!mintAddress) {
    return {
      creators: [],
      mintExtensions: null,
      royalty: {},
    };
  }

  const response = await fetch(`/api/nft?mint=${encodeURIComponent(mintAddress)}`);
  const payload = (await response.json()) as ListPageNftApiResponse & ListPageErrorResponse;

  if (!response.ok) {
    throw new Error(getResponseErrorMessage(response, payload, "Failed to load royalty metadata"));
  }

  return {
    creators: payload.nft.creators ?? [],
    mintExtensions: payload.nft.mint_extensions ?? null,
    royalty: payload.nft.royalty ?? {},
    ruleSetAddress: payload.result?.programmable_config?.rule_set,
  };
}

export function getListPageRoyaltyQueryOptions(mintAddress: string | null) {
  return queryOptions({
    enabled: Boolean(mintAddress),
    gcTime: 10 * 60_000,
    queryFn: () => fetchListPageRoyaltyMetadata(mintAddress ?? ""),
    queryKey: ["list-page-royalty", mintAddress],
    staleTime: 5 * 60_000,
  });
}