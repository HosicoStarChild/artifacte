import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CardDetailNotFoundStateProps = {
  backHref: string;
  backLabel: string;
};

export function CardDetailLoadingState() {
  return (
    <div className="pt-24 pb-20 min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <Card className="border-white/5 bg-dark-800/70 py-0">
          <CardContent className="space-y-4 px-6 py-14 text-center">
            <div className="mx-auto inline-block h-8 w-8 animate-spin rounded-full border-2 border-gold-500 border-t-transparent" />
            <p className="text-gray-400">Loading card details...</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function CardDetailNotFoundState({ backHref, backLabel }: CardDetailNotFoundStateProps) {
  return (
    <div className="pt-24 pb-20 min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <Card className="border-white/5 bg-dark-800/70 py-0">
          <CardContent className="space-y-4 px-6 py-14 text-center">
            <h1 className="font-serif text-4xl text-white">Card Not Found</h1>
            <p className="text-gray-400">This listing may have been sold or removed.</p>
            <Link
              href={backHref}
              className={cn(
                buttonVariants({ size: "sm", variant: "ghost" }),
                "inline-flex px-0 text-gold-400 hover:bg-transparent hover:text-gold-300",
              )}
            >
              ← Browse {backLabel}
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}