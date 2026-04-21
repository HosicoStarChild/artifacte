import { FeaturedListingSection } from "@/components/home/FeaturedListingSection";
import { HomeCollectionsSection } from "@/components/home/HomeCollectionsSection";
import { HomeHowItWorksSection } from "@/components/home/HomeHowItWorksSection";
import { HomeLiveAuctionsSection } from "@/components/home/HomeLiveAuctionsSection";
import { HomeSpiritsSection } from "@/components/home/HomeSpiritsSection";
import { HomeTCGSection } from "@/components/HomeTCGSection";
import {
  getFeaturedListing,
  getSpiritsCarousel,
  getVisibleHomeCategoryCards,
} from "@/lib/server/homepage";

export default async function Home() {
  const [heroListing, spiritsCarousel] = await Promise.all([
    getFeaturedListing(),
    getSpiritsCarousel(),
  ]);
  const showSpirits = spiritsCarousel.length > 0;
  const visibleCategoryCards = getVisibleHomeCategoryCards(showSpirits);

  return (
    <div>
      <section className="pt-24 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <FeaturedListingSection listing={heroListing} />
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
