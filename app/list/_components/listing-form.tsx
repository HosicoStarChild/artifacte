import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

import { LIST_PAGE_DURATION_OPTIONS } from "../_lib/constants";
import {
  getListingCurrencyLabel,
  getListingPriceSymbol,
  getListingTypeHint,
  isAuctionAllowed,
} from "../_lib/assets";
import type { ListPageAssetCardModel, ListPageListingMode } from "../_lib/types";

interface ListingFormProps {
  assetCard: ListPageAssetCardModel;
  auctionDuration: string;
  listingType: ListPageListingMode;
  onAuctionDurationChange: (value: string) => void;
  onBack: () => void;
  onListingTypeChange: (value: ListPageListingMode) => void;
  onPriceChange: (value: string) => void;
  onSubmit: () => void;
  price: string;
  submitting: boolean;
}

function getListingTypeButtonClassName(isActive: boolean, isDisabled = false): string {
  if (isDisabled) {
    return "border-white/5 bg-dark-900/70 text-white/30 opacity-60";
  }

  if (isActive) {
    return "border-gold-500/50 bg-gold-500/10 text-gold-300";
  }

  return "border-white/10 bg-dark-900/60 text-white/65 hover:border-white/20 hover:text-white";
}

export function ListingForm({
  assetCard,
  auctionDuration,
  listingType,
  onAuctionDurationChange,
  onBack,
  onListingTypeChange,
  onPriceChange,
  onSubmit,
  price,
  submitting,
}: ListingFormProps) {
  const currencyLabel = getListingCurrencyLabel(assetCard.asset);
  const priceSymbol = getListingPriceSymbol(assetCard.asset);
  const auctionAllowed = isAuctionAllowed(assetCard.asset);
  const typeHint = getListingTypeHint(assetCard.asset);
  const canSubmit = Number.parseFloat(price) > 0 && !submitting;

  return (
    <div className="max-w-2xl space-y-6">
      <Button className="justify-start px-0 text-white/65 hover:bg-transparent hover:text-white" onClick={onBack} variant="ghost">
        Back to asset selection
      </Button>

      <Card className="border-white/5 bg-dark-800/85 py-0 text-white">
        <CardContent className="space-y-6 px-6 py-6">
          <div className="flex gap-4">
            <div className="relative h-24 w-24 overflow-hidden rounded-xl border border-white/10 bg-dark-900">
              <img
                alt={assetCard.imageAlt}
                className={assetCard.imageClassName}
                sizes="96px"
                src={assetCard.imageSrc}
              />
            </div>
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate font-serif text-2xl text-white">{assetCard.name}</h2>
                <Badge className="border-white/10 bg-dark-900/80 text-xs text-white/65" variant="outline">
                  {assetCard.collection.name}
                </Badge>
              </div>
              <p className="truncate text-xs font-mono text-white/40">{assetCard.mintAddress}</p>
            </div>
          </div>

          <Separator className="bg-white/8" />

          <div className="space-y-3">
            <p className="text-sm font-medium text-white/75">Listing type</p>
            <div className="grid grid-cols-2 gap-3">
              <Button
                className={getListingTypeButtonClassName(listingType === "fixed")}
                onClick={() => onListingTypeChange("fixed")}
                type="button"
                variant="outline"
              >
                Fixed Price
              </Button>
              <Button
                className={getListingTypeButtonClassName(listingType === "auction", !auctionAllowed)}
                disabled={!auctionAllowed}
                onClick={() => onListingTypeChange("auction")}
                title={typeHint ?? undefined}
                type="button"
                variant="outline"
              >
                Auction
              </Button>
            </div>
            {typeHint ? <p className="text-xs text-yellow-300/80">{typeHint}</p> : null}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-white/75" htmlFor="list-price">
              {listingType === "fixed" ? "Price" : "Starting price"} ({currencyLabel})
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/35">
                {priceSymbol}
              </span>
              <Input
                className="h-11 border-white/10 bg-dark-900/70 pl-10 text-white placeholder:text-white/30"
                id="list-price"
                inputMode="decimal"
                min="0.01"
                onChange={(event) => onPriceChange(event.target.value)}
                placeholder="0.00"
                step="0.01"
                type="number"
                value={price}
              />
            </div>
          </div>

          {listingType === "auction" ? (
            <div className="space-y-2">
              <label className="text-sm font-medium text-white/75" htmlFor="list-auction-duration">
                Auction duration
              </label>
              <Select onValueChange={(value) => onAuctionDurationChange(value ?? auctionDuration)} value={auctionDuration}>
                <SelectTrigger className="h-11 w-full border-white/10 bg-dark-900/70 text-white" id="list-auction-duration">
                  <SelectValue placeholder="Select duration" />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-dark-800 text-white">
                  {LIST_PAGE_DURATION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-3">
            <Button className="h-11 w-full bg-gold-500 text-dark-900 hover:bg-gold-600" disabled={!canSubmit} onClick={onSubmit} size="lg" type="button">
              {submitting ? "Listing..." : "List Item"}
            </Button>
            <p className="text-center text-xs text-white/40">
              Your asset stays in your wallet until you approve the listing transaction.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}