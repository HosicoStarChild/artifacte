import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { MyListingStatus } from "@/lib/my-listings";
import { MY_LISTING_TABS } from "@/lib/my-listings";
import { cn } from "@/lib/utils";

interface MyListingsTabsProps {
  activeTab: MyListingStatus;
  counts: Record<MyListingStatus, number>;
  onChange: (tab: MyListingStatus) => void;
}

const tabLabels: Record<MyListingStatus, string> = {
  active: "Active",
  cancelled: "Cancelled",
  completed: "Completed",
};

export function MyListingsTabs({
  activeTab,
  counts,
  onChange,
}: MyListingsTabsProps) {
  return (
    <div className="rounded-2xl border border-white/8 bg-dark-800/80 p-2 backdrop-blur-xl">
      <div className="flex flex-wrap gap-2">
        {MY_LISTING_TABS.map((tab) => {
          const isActive = tab === activeTab;

          return (
            <Button
              className={cn(
                "h-10 rounded-xl px-4 text-sm",
                isActive
                  ? "border-gold-500/30 bg-gold-500/12 text-gold-300 hover:bg-gold-500/16"
                  : "border-white/5 bg-transparent text-white/60 hover:bg-white/6 hover:text-white",
              )}
              key={tab}
              onClick={() => onChange(tab)}
              size="sm"
              variant="outline"
            >
              {tabLabels[tab]}
              <Badge
                className={cn(
                  "ml-2 border px-1.5 py-0 text-[10px] font-semibold",
                  isActive
                    ? "border-gold-500/20 bg-gold-500/14 text-gold-200"
                    : "border-white/10 bg-white/6 text-white/70",
                )}
              >
                {counts[tab]}
              </Badge>
            </Button>
          );
        })}
      </div>
    </div>
  );
}