import Image from "next/image";

import { Card, CardContent } from "@/components/ui/card";

import type { ListPageAssetCardModel } from "../_lib/types";

interface ListAssetCardProps {
  card: ListPageAssetCardModel;
  onSelect: (card: ListPageAssetCardModel) => void;
}

export function ListAssetCard({ card, onSelect }: ListAssetCardProps) {
  return (
    <Card className="overflow-hidden border-white/5 bg-dark-800/85 py-0 text-white transition duration-200 hover:border-white/15 hover:bg-dark-800">
      <button
        className="group block text-left"
        onClick={() => onSelect(card)}
        type="button"
      >
        <div className="relative aspect-square overflow-hidden bg-dark-900">
          <Image
            alt={card.imageAlt}
            className={`transition duration-300 group-hover:scale-[1.02] ${card.imageClassName}`}
            fill
            sizes="(min-width: 1280px) 23vw, (min-width: 768px) 30vw, (min-width: 640px) 45vw, 100vw"
            src={card.imageSrc}
            unoptimized={card.imageSrc.startsWith("/api/")}
          />
        </div>
        <CardContent className="space-y-1 px-4 py-4">
          <h3 className="truncate text-sm font-medium text-white">{card.name}</h3>
          <p className="truncate text-xs text-white/50">{card.collection.name}</p>
        </CardContent>
      </button>
    </Card>
  );
}