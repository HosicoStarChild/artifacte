import { Metadata } from 'next';

const categoryNames: Record<string, string> = {
  'tcg-cards': 'TCG Cards',
  'sports-cards': 'Sports Cards',
  'sealed': 'Sealed Products',
  'merchandise': 'Merchandise',
  'spirits': 'Spirits',
  'digital-art': 'Digital Collectibles',
};

const categoryDescs: Record<string, string> = {
  'tcg-cards': 'Browse PSA & CGC graded Pokemon, One Piece, Dragon Ball and Yu-Gi-Oh cards tokenized on Solana.',
  'sports-cards': 'Browse graded sports cards from Collector Crypt and Phygitals, tokenized on Solana.',
  'sealed': 'Browse sealed Pokemon, One Piece and TCG booster boxes and packs on Solana.',
  'merchandise': 'Browse collectible figurines, blind boxes, stickers and more on Solana.',
  'spirits': 'Browse rare and vintage spirits tokenized on Solana.',
  'digital-art': 'Browse digital collectibles and NFT art on Solana.',
};

export async function generateMetadata(props: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const params = await props.params;
  const name = categoryNames[params.category] || 'Collectibles';
  const desc = categoryDescs[params.category] || 'Browse tokenized collectibles on Solana.';
  return {
    title: `${name} | Artifacte`,
    description: desc,
    openGraph: { title: `${name} | Artifacte`, description: desc },
  };
}

export default function CategoryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
