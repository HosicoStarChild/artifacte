import {
  BadgeCheck,
  FileCheck2,
  Gem,
  Globe2,
  Gavel,
  Scale,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react"

export type AboutHeroHighlight = Readonly<{
  id: string
  label: string
  description: string
}>

export type AboutHeroLink = Readonly<{
  href: string
  label: string
}>

export type AboutHeroImage = Readonly<{
  src: string
  alt: string
}>

export type AboutHeroContent = Readonly<{
  eyebrow: string
  title: string
  description: string
  backLink: AboutHeroLink
  primaryCta?: AboutHeroLink
  image: AboutHeroImage
}>

export type MissionPoint = Readonly<{
  id: string
  title: string
  description: string
}>

export type ProcessStep = Readonly<{
  id: string
  number: string
  title: string
  description: string
  icon: LucideIcon
}>

export type ValuePillar = Readonly<{
  id: string
  title: string
  description: string
  icon: LucideIcon
}>

export type PlatformMetric = Readonly<{
  id: string
  value: string
  label: string
  description: string
}>

export const aboutHeroContent: AboutHeroContent = {
  eyebrow: "About Artifacte",
  title: "Curating authenticated assets for transparent digital ownership.",
  description:
    "Artifacte combines rigorous real-world verification with blockchain-native settlement so collectors and institutions can acquire premium assets with clear provenance and open price discovery.",
  backLink: {
    href: "/",
    label: "Back to Home",
  },
  image: {
    src: "/images/digital-collectibles-collage.jpg",
    alt: "Curated collectible assets presented as a premium Artifacte marketplace collage.",
  },
}

export const aboutHeroHighlights: readonly AboutHeroHighlight[] = [
  {
    id: "provenance",
    label: "Verified provenance",
    description: "Documentation, authenticity review, and chain-visible transfer history.",
  },
  {
    id: "auctions",
    label: "Transparent auctions",
    description: "Open bidding mechanics designed for price discovery without hidden negotiation.",
  },
  {
    id: "access",
    label: "Global collector access",
    description: "A digital ownership layer that widens participation beyond local private markets.",
  },
] as const

export const aboutSectionContent = {
  mission: {
    eyebrow: "Our Mission",
    title: "Reshaping ownership through tokenized provenance.",
    description:
      "Artifacte turns high-trust asset transfer into a reviewable digital workflow, preserving provenance, ownership history, and auction transparency in one place.",
    paragraphs: [
      "Artifacte transforms the way the world buys, sells, and owns real-world assets. By pairing asset due diligence with on-chain records, we make premium markets more transparent, portable, and accessible.",
      "Every accepted asset is documented, verified, and prepared for a transparent auction flow that gives buyers confidence in provenance and gives sellers a credible route to global demand.",
    ],
    cardTitle: "Built for trust at every stage",
    cardDescription:
      "Accepted listings follow a deliberate review and auction path instead of a fast, opaque intake funnel.",
  },
  process: {
    eyebrow: "How We Work",
    title: "A deliberate intake and auction workflow.",
    description:
      "From curation to settlement, each step is designed to protect authenticity and make the ownership record legible.",
  },
  values: {
    eyebrow: "Our Values",
    title: "What the platform is designed to preserve.",
    description:
      "Artifacte is opinionated about provenance, market integrity, and access. Those values shape how listings are reviewed and how auctions are run.",
  },
  metrics: {
    eyebrow: "By The Numbers",
    title: "Scale, trust, and participation at a glance.",
    description:
      "A concise view of the market footprint Artifacte is building across curated listings, completed transactions, and active collectors.",
  },
} as const

export const missionPoints: readonly MissionPoint[] = [
  {
    id: "review",
    title: "Curated intake",
    description: "Listings are selected for fit, provenance quality, and market credibility before they reach auction.",
  },
  {
    id: "verification",
    title: "Structured verification",
    description: "Ownership evidence, supporting documentation, and authenticity checks are organized before a sale goes live.",
  },
  {
    id: "settlement",
    title: "Transparent settlement",
    description: "Auction outcomes and ownership transitions are easier to audit than closed, off-platform negotiations.",
  },
] as const

export const aboutProcessSteps: readonly ProcessStep[] = [
  {
    id: "curate",
    number: "01",
    title: "Curate",
    description:
      "We select premium assets from credible sources with the provenance required for serious collectors and institutions.",
    icon: Gem,
  },
  {
    id: "verify",
    number: "02",
    title: "Verify",
    description:
      "Documentation, authenticity signals, and ownership context are reviewed before the listing is prepared for auction.",
    icon: FileCheck2,
  },
  {
    id: "auction",
    number: "03",
    title: "Auction",
    description:
      "Collectors compete in a transparent marketplace where the path from listing to sale remains legible.",
    icon: Gavel,
  },
] as const

export const aboutValuePillars: readonly ValuePillar[] = [
  {
    id: "trust",
    title: "Trust and transparency",
    description:
      "Immutable records and clear market mechanics reduce ambiguity for both buyers and sellers.",
    icon: ShieldCheck,
  },
  {
    id: "authenticity",
    title: "Verified authenticity",
    description:
      "Evidence-backed verification gives each asset a stronger foundation before it reaches bidders.",
    icon: BadgeCheck,
  },
  {
    id: "access",
    title: "Global access",
    description:
      "Digital ownership expands participation in premium asset markets beyond geography and traditional gatekeeping.",
    icon: Globe2,
  },
  {
    id: "fairness",
    title: "Fair auctions",
    description:
      "Open bidding keeps price discovery visible, competitive, and easier to evaluate after the fact.",
    icon: Scale,
  },
] as const

export const aboutMetrics: readonly PlatformMetric[] = [
  {
    id: "asset-value",
    value: "$1B+",
    label: "Asset value",
    description: "Cumulative value represented across curated listings and auctions on the platform.",
  },
  {
    id: "trading-volume",
    value: "$100M+",
    label: "Trading volume",
    description: "Completed transactions and successful auction outcomes across marketplace activity.",
  },
  {
    id: "collectors",
    value: "10K+",
    label: "Active collectors",
    description: "Participants engaging with auctions, ownership transfers, and curated marketplace inventory.",
  },
] as const