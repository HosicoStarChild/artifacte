import type { CardDetailActionState } from "../_lib/card-action-state";
import type { CardDetail } from "../_lib/card-detail";

type CardDetailActionPanelProps = {
  actionState: CardDetailActionState;
  buying: boolean;
  buyLabel: string;
  card: CardDetail;
  marketplaceLabel: string;
  onBuy: () => void;
  onCloseStaleListing: () => void;
  onUnlist: () => void;
  unlisting: boolean;
};

function getBuyButtonLabel(actionState: CardDetailActionState, card: CardDetail, buying: boolean, buyLabel: string): string {
  if (card.sold) {
    return "✅ Sold";
  }

  if (buying) {
    return "Processing...";
  }

  if (actionState.action.type === "buy" && actionState.action.requiresConnection) {
    return card.auctionListing?.listingType === "auction"
      ? "Connect Wallet to Bid"
      : "Connect Wallet to Buy";
  }

  return buyLabel;
}

export function CardDetailActionPanel({
  actionState,
  buying,
  buyLabel,
  card,
  marketplaceLabel,
  onBuy,
  onCloseStaleListing,
  onUnlist,
  unlisting,
}: CardDetailActionPanelProps) {
  return (
    <>
      {actionState.canCloseStaleListing ? (
        <button
          type="button"
          onClick={onCloseStaleListing}
          disabled={unlisting}
          className={`w-full px-6 py-3 rounded-lg text-sm font-semibold transition ${
            unlisting
              ? "bg-gray-600/50 cursor-not-allowed text-gray-400"
              : "bg-dark-700 border border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/10"
          }`}
        >
          {unlisting ? "Closing..." : "Close Stale Listing (reclaim rent)"}
        </button>
      ) : null}

      {actionState.action.type === "owner-listed" ? (
        <div className="space-y-3">
          <div className="w-full px-6 py-3 rounded-lg text-sm font-semibold bg-dark-700 border border-gold-500/30 text-gold-500 text-center">
            Your Listing
          </div>
          <button
            type="button"
            onClick={onUnlist}
            disabled={unlisting}
            className={`w-full px-6 py-3.5 rounded-lg text-base font-semibold transition ${
              unlisting
                ? "bg-gray-600/50 cursor-not-allowed text-gray-400"
                : "bg-red-600 hover:bg-red-700 text-white"
            }`}
          >
            {unlisting ? "Unlisting..." : "Unlist Item"}
          </button>
        </div>
      ) : null}

      {actionState.action.type === "buy" ? (
        <button
          type="button"
          onClick={actionState.action.requiresConnection ? undefined : onBuy}
          disabled={actionState.action.requiresConnection || buying || card.sold}
          className={`w-full px-6 py-3.5 rounded-lg text-base font-semibold transition ${
            actionState.action.requiresConnection || buying || card.sold
              ? "bg-gray-600/50 cursor-not-allowed text-gray-400"
              : "bg-gold-500 hover:bg-gold-600 text-dark-900"
          }`}
        >
          {getBuyButtonLabel(actionState, card, buying, buyLabel)}
        </button>
      ) : null}

      {actionState.showNotListedMessage ? (
        <p className="text-gray-500 text-sm">This item is not currently listed for sale</p>
      ) : null}

      {actionState.showMarketplaceLabel ? (
        <p className="text-gray-600 text-xs mt-2">{marketplaceLabel}</p>
      ) : null}
    </>
  );
}