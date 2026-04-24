import { HomeCollectionsSection } from "@/components/home/HomeCollectionsSection";
import { HomeHowItWorksSection } from "@/components/home/HomeHowItWorksSection";
import { HomeLiveAuctionsSection } from "@/components/home/HomeLiveAuctionsSection";
import { HomeSpiritsSection } from "@/components/home/HomeSpiritsSection";
import { HomeTCGSection } from "@/components/HomeTCGSection";
import {
  getSpiritsCarousel,
  getVisibleHomeCategoryCards,
} from "@/lib/server/homepage";

const PROJECT_TITLE = "Artifacte";
const PROJECT_DESCRIPTION =
  "Institutional-grade real world asset tokenization platform built on Solana. Buy, sell, and trade tokenized collectibles with verified on-chain provenance across cards, spirits, sealed products, and more.";

export default async function Home() {
  const spiritsCarousel = await getSpiritsCarousel();
  const showSpirits = spiritsCarousel.length > 0;
  const visibleCategoryCards = getVisibleHomeCategoryCards(showSpirits);

  return (
    <div>
      <section className="pt-24 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <header className="mb-16 max-w-4xl">
            <h1 className="font-serif text-4xl leading-tight text-white sm:text-5xl md:text-6xl">
              {PROJECT_TITLE}
            </h1>
            <p className="mt-6 text-base leading-7 text-white/65 sm:text-lg">
              {PROJECT_DESCRIPTION}
            </p>
          </header>

          <HomeCollectionsSection categoryCards={visibleCategoryCards} />
        </div>
      </section>

      {showSpirits ? <HomeSpiritsSection listings={spiritsCarousel} /> : null}

      <HomeTCGSection />

      <HomeLiveAuctionsSection />
      <HomeHowItWorksSection />
    </div>
  );
}
