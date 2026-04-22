import Link from "next/link";
import { ArrowLeft, RefreshCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MyListingsHeaderProps {
  isRefreshing: boolean;
  onRefresh?: () => void;
  refreshDisabled?: boolean;
  walletLabel: string;
}

export function MyListingsHeader({
  isRefreshing,
  onRefresh,
  refreshDisabled = false,
  walletLabel,
}: MyListingsHeaderProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          className={cn(
            buttonVariants({ size: "sm", variant: "ghost" }),
            "inline-flex px-0 text-gold-400 hover:bg-transparent hover:text-gold-300",
          )}
          href="/"
        >
          <ArrowLeft className="mr-2 size-4" />
          Back to Home
        </Link>

        {onRefresh ? (
          <Button
            disabled={refreshDisabled}
            onClick={onRefresh}
            size="sm"
            variant="outline"
          >
            <RefreshCcw
              className={cn("mr-2 size-4", isRefreshing ? "animate-spin" : undefined)}
            />
            Refresh
          </Button>
        ) : null}
      </div>

      <div className="space-y-2">
        <Badge className="border-gold-500/30 bg-gold-500/10 text-[10px] font-semibold tracking-[0.24em] uppercase text-gold-300">
          Marketplace Dashboard
        </Badge>
        <h1 className="font-serif text-3xl text-white md:text-4xl">My Listings</h1>
        <p className="text-sm text-white/55 md:text-base">{walletLabel}</p>
      </div>
    </div>
  );
}