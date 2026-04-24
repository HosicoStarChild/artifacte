import { Card } from "@/components/ui/card";
import { homeProcessSteps } from "@/lib/server/homepage";

export function HomeHowItWorksSection() {
  return (
    <section className="border-t border-white/5 bg-dark-800/20 px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-16 text-center">
          <p className="mb-3 text-xs font-semibold tracking-widest uppercase text-gold-500">Process</p>
          <h2 className="font-serif text-3xl text-white md:text-4xl">How It Works</h2>
        </div>

        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-12 md:grid-cols-3">
          {homeProcessSteps.map((item) => (
            <Card key={item.step} className="gap-0 border border-white/5 bg-transparent py-0 text-center shadow-none">
              <div className="p-6">
                <div className="mb-4 font-serif text-4xl text-gold-500">{item.step}</div>
                <h3 className="mb-3 font-serif text-xl text-white">{item.title}</h3>
                <p className="text-sm leading-relaxed text-gray-400">{item.description}</p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}