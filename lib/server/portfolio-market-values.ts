import {
  fetchTcgPlayerProductPrice,
  resolveTcgPlayerPriceValue,
  type TcgPlayerProductPrice,
} from "./tcgplayer-price.ts";

export interface PortfolioMarketLookupEntry {
  name: string;
  nftAddress: string;
  priceSourceId?: string;
}

export interface PortfolioMarketValue {
  price: number;
  source: string;
}

export type PortfolioMarketValueMap = Record<string, PortfolioMarketValue>;

interface ResolvePortfolioRwaMarketValueMapOptions {
  fetchOracleMarketValueMap: (
    entries: PortfolioMarketLookupEntry[]
  ) => Promise<PortfolioMarketValueMap>;
  fetchTcgPlayerProductPrice?: (productId: string) => Promise<TcgPlayerProductPrice>;
  liveTcgplayerConcurrency?: number;
}

async function mapWithConcurrency<T, TResult>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<TResult>
): Promise<TResult[]> {
  const results = new Array<TResult>(values.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(values[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(concurrency, values.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}

async function fetchLiveTcgplayerPortfolioMarketValueMap(
  entries: PortfolioMarketLookupEntry[],
  {
    fetchTcgPlayerProductPrice: fetchPrice = fetchTcgPlayerProductPrice,
    liveTcgplayerConcurrency = 6,
  }: Pick<
    ResolvePortfolioRwaMarketValueMapOptions,
    "fetchTcgPlayerProductPrice" | "liveTcgplayerConcurrency"
  > = {}
): Promise<PortfolioMarketValueMap> {
  const tcgplayerEntries = entries.filter((entry) => Boolean(entry.priceSourceId?.trim()));

  if (!tcgplayerEntries.length) {
    return {};
  }

  const liveEntries = await mapWithConcurrency(
    tcgplayerEntries,
    liveTcgplayerConcurrency,
    async (entry) => {
      const productId = entry.priceSourceId?.trim();

      if (!productId) {
        return null;
      }

      try {
        const price = await fetchPrice(productId);
        const resolvedValue = resolveTcgPlayerPriceValue(price);

        if (resolvedValue === null) {
          return null;
        }

        return [entry.nftAddress, { price: resolvedValue, source: "tcgplayer_live" }] as const;
      } catch {
        return null;
      }
    }
  );

  return Object.fromEntries(
    liveEntries.filter(
      (entry): entry is readonly [string, PortfolioMarketValue] => Boolean(entry)
    )
  );
}

export async function resolvePortfolioRwaMarketValueMap(
  entries: PortfolioMarketLookupEntry[],
  {
    fetchOracleMarketValueMap,
    fetchTcgPlayerProductPrice: fetchPrice = fetchTcgPlayerProductPrice,
    liveTcgplayerConcurrency = 6,
  }: ResolvePortfolioRwaMarketValueMapOptions
): Promise<PortfolioMarketValueMap> {
  if (!entries.length) {
    return {};
  }

  const [oracleValues, liveTcgplayerValues] = await Promise.all([
    fetchOracleMarketValueMap(entries),
    fetchLiveTcgplayerPortfolioMarketValueMap(entries, {
      fetchTcgPlayerProductPrice: fetchPrice,
      liveTcgplayerConcurrency,
    }),
  ]);

  return {
    ...oracleValues,
    ...liveTcgplayerValues,
  };
}