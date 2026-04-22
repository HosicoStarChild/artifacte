import { Badge } from "@/components/ui/badge";

import type { ListPageAssetCardModel, ListPageAssetSection } from "../_lib/types";
import { ListAssetCard } from "./list-asset-card";

interface ListAssetSectionProps {
  onSelect: (card: ListPageAssetCardModel) => void;
  section: ListPageAssetSection;
}

export function ListAssetSection({ onSelect, section }: ListAssetSectionProps) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-serif text-xl text-white">
          <span className={section.accentClassName}>{section.title}</span>
        </h2>
        <Badge className="border-white/10 bg-dark-900/80 text-xs text-white/60" variant="outline">
          {section.items.length} items
        </Badge>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {section.items.map((card) => (
          <ListAssetCard card={card} key={card.id} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}