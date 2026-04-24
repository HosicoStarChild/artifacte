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

  const response = await fetch("/api/helius-das", {
    body: JSON.stringify({
      method: LIST_PAGE_ALLOWED_DAS_METHOD,
      params: {
        displayOptions: {
          showFungible: false,
          showNativeBalance: false,
        },
        limit: 1000,
        ownerAddress: walletAddress,
        page: 1,
      },
    }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  const payload = (await response.json()) as ListPageHeliusDasResponse & ListPageErrorResponse;

  if (!response.ok) {
    throw new Error(getResponseErrorMessage(response, payload, "Failed to load wallet assets"));
  }

  return (payload.result?.items ?? []).filter(isListableAsset);
}

export function getListPageAssetsQueryOptions(walletAddress: string | null) {
  return queryOptions({
    enabled: Boolean(walletAddress),
    gcTime: 10 * 60_000,
    queryFn: () => fetchListPageAssets(walletAddress ?? ""),
    queryKey: ["list-page-assets", walletAddress],
    staleTime: 60_000,
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