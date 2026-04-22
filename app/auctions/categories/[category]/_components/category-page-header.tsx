import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CategoryPageHeaderProps = {
  categoryName: string;
  emoji: string;
};

export function CategoryPageHeader({ categoryName, emoji }: CategoryPageHeaderProps) {
  return (
    <div className="space-y-6">
      <Link
        href="/"
        className={cn(
          buttonVariants({ size: "sm", variant: "ghost" }),
          "inline-flex px-0 text-gold-400 hover:bg-transparent hover:text-gold-300",
        )}
      >
        ← Back to Home
      </Link>

      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="flex size-20 items-center justify-center rounded-3xl border border-white/8 bg-dark-800/80 text-5xl shadow-[0_20px_50px_rgba(0,0,0,0.25)]">
          {emoji}
        </div>

        <div className="space-y-4">
          <Badge className="border-gold-500/25 bg-gold-500/10 px-3 text-[11px] font-semibold tracking-[0.24em] uppercase text-gold-300">
            Category
          </Badge>
          <div className="space-y-3">
            <h1 className="font-serif text-4xl text-white sm:text-5xl">{categoryName}</h1>
            <p className="max-w-2xl text-sm leading-6 text-white/60 sm:text-base">
              Discover authenticated {categoryName.toLowerCase()} tokenized on Solana. Browse fixed-price listings,
              refine by market signals, and track live auctions where they are available.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}