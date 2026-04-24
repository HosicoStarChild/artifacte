import type { PortfolioSection as PortfolioSectionData } from "@/lib/portfolio";

import { PortfolioAssetCard } from "./portfolio-asset-card";

interface PortfolioSectionProps {
  section: PortfolioSectionData;
}

function getGridClasses(sectionId: PortfolioSectionData["id"]): string {
  if (sectionId === "digital-collectibles") {
    return "grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4";
  }

  return "grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4";
}

export function PortfolioSection({ section }: PortfolioSectionProps) {
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h2 className="font-serif text-2xl text-white">{section.title}</h2>
        <p className="max-w-3xl text-sm text-white/55">{section.description}</p>
      </div>
      <div className={getGridClasses(section.id)}>
        {section.items.map((asset) => (
          <PortfolioAssetCard key={asset.id} asset={asset} />
        ))}
      </div>
    </section>
  );
}