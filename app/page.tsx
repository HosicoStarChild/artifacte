import { HomeCollectionsSection } from "@/components/home/HomeCollectionsSection";
import { HomeHowItWorksSection } from "@/components/home/HomeHowItWorksSection";
import { HomeSpiritsSection } from "@/components/home/HomeSpiritsSection";
import { HomeTCGSection } from "@/components/HomeTCGSection";
import {
  getSpiritsCarousel,
  getVisibleHomeCategoryCards,
} from "@/lib/server/homepage";

const PROJECT_TITLE = "Artifacte";
const PROJECT_DESCRIPTION =
  "The premier RWA protocol on Solana for authenticated collectibles. We provide verified on-chain provenance for trading cards, rare spirits, sealed products, and beyond.";

export default async function Home() {
  const spiritsCarousel = await getSpiritsCarousel();
  const showSpirits = spiritsCarousel.length > 0;
  const visibleCategoryCards = getVisibleHomeCategoryCards();

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

      <HomeHowItWorksSection />
    </div>
  );
}
