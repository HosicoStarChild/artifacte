import type { CardDetail } from "./card-detail";

type CardDetailAction =
  | { type: "none" }
  | { type: "owner-listed" }
  | { type: "buy"; requiresConnection: boolean };

export type CardDetailActionState = {
  action: CardDetailAction;
  canCloseStaleListing: boolean;
  isListed: boolean;
  isOwner: boolean;
  showMarketplaceLabel: boolean;
  showNotListedMessage: boolean;
};

type ResolveCardDetailActionStateInput = {
  card: CardDetail;
  connected: boolean;
  viewerPublicKey?: string | null;
};

export function resolveCardDetailActionState({
  card,
  connected,
  viewerPublicKey,
}: ResolveCardDetailActionStateInput): CardDetailActionState {
  const isListed = Boolean(card.price);
  const isOwner = Boolean(
    connected
      && viewerPublicKey
      && (
        (card.owner && viewerPublicKey === card.owner)
        || (card.seller && viewerPublicKey === card.seller)
      ),
  );
  const canCloseStaleListing = Boolean(!isListed && card.auctionListing?.stale && isOwner);

  if (!isListed) {
    return {
      action: { type: "none" },
      canCloseStaleListing,
      isListed,
      isOwner,
      showMarketplaceLabel: false,
      showNotListedMessage: true,
    };
  }

  if (isOwner) {
    return {
      action: { type: "owner-listed" },
      canCloseStaleListing,
      isListed,
      isOwner,
      showMarketplaceLabel: true,
      showNotListedMessage: false,
    };
  }

  return {
    action: { type: "buy", requiresConnection: !connected },
    canCloseStaleListing,
    isListed,
    isOwner,
    showMarketplaceLabel: true,
    showNotListedMessage: false,
  };
}