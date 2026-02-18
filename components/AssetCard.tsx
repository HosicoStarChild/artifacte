import Link from "next/link";
import { Asset, categoryLabels, categoryColors, formatFullPrice } from "@/lib/data";

export default function AssetCard({ asset }: { asset: Asset }) {
  return (
    <Link href={`/auctions/master-ultra-thin-calendar`} className="card-hover block">
      <div className="bg-navy-800 rounded-xl overflow-hidden border border-white/5 h-full">
        <div className="relative h-48 overflow-hidden">
          <img src={asset.image} alt={asset.name} className="w-full h-full object-cover" />
          {asset.highDemand && (
            <span className="absolute top-3 right-3 bg-gold-500/90 text-navy-900 text-[10px] font-bold px-2 py-0.5 rounded">
              High Demand
            </span>
          )}
          <span className={`absolute top-3 left-3 text-[10px] font-bold tracking-wider ${categoryColors[asset.category]}`}>
            {categoryLabels[asset.category]}
          </span>
        </div>
        <div className="p-4">
          <h3 className="text-white font-medium text-sm mb-1">{asset.name}</h3>
          <p className="text-gray-500 text-xs mb-3">Tokenized RWA on Solana</p>
          <div className="flex items-baseline gap-1">
            <span className="text-gray-500 text-[10px] uppercase tracking-wider">Appraised</span>
          </div>
          <span className="text-white font-semibold text-lg">{formatFullPrice(asset.appraised_value)}</span>
        </div>
      </div>
    </Link>
  );
}
