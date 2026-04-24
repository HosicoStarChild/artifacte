"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import { ALLOWLIST_QUERY_KEY, fetchAllowlist } from "@/lib/allowlist";

export function getAllowlistQueryOptions() {
  return queryOptions({
    queryKey: ALLOWLIST_QUERY_KEY,
    queryFn: fetchAllowlist,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
}

export function useAllowlist() {
  return useQuery(getAllowlistQueryOptions());
}