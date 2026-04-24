import { Card } from "@/components/ui/card";

import { HomeSectionHeading } from "./HomeSectionHeading";

export function HomeLiveAuctionsSection() {
  return (
    <section className="border-t border-white/5 bg-dark-800/30 px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <HomeSectionHeading
          eyebrow="Active Auctions"
          title="Live Now"
          action={<span className="text-sm font-semibold tracking-wide uppercase text-gold-500">Coming Soon</span>}
        />

        <Card className="border border-white/5 bg-transparent py-0 text-center shadow-none">
          <div className="py-16">
            <p className="font-serif text-lg text-gold-500/80">Live auctions are being prepared.</p>
            <p className="mt-2 text-sm text-gray-500">Stay tuned.</p>
          </div>
        </Card>
      </div>
    </section>
  );
}