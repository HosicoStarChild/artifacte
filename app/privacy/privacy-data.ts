import type { LegalPageContent, LegalSection } from "@/app/legal/legal-types";

export type PrivacySection = LegalSection;

export const PRIVACY_LAST_UPDATED = "March 27, 2026";

export const PRIVACY_HIGHLIGHTS = [
  "Wallet-first access",
  "Minimal data collection",
  "Public blockchain activity",
] as const;

export const PRIVACY_SECTIONS = [
  {
    id: "introduction",
    number: 1,
    title: "Introduction",
    blocks: [
      {
        type: "paragraph",
        text: 'Artifacte ("we," "our," or "us") operates the artifacte.io website. This Privacy Policy explains how we collect, use, and protect your information when you use our platform.',
      },
    ],
  },
  {
    id: "information-we-collect",
    number: 2,
    title: "Information We Collect",
    blocks: [
      {
        type: "labeledParagraph",
        label: "Wallet Address",
        text: "When you connect your Solana wallet, we receive your public wallet address. We do not have access to your private keys or seed phrases.",
      },
      {
        type: "labeledParagraph",
        label: "Transaction Data",
        text: "Blockchain transactions are public by nature. We may display transaction history related to NFTs listed or purchased on our platform.",
      },
      {
        type: "labeledParagraph",
        label: "Usage Data",
        text: "We collect standard web analytics such as page views, browser type, and device information to improve our service.",
      },
    ],
  },
  {
    id: "how-we-use-information",
    number: 3,
    title: "How We Use Your Information",
    blocks: [
      {
        type: "list",
        items: [
          "Display your NFT portfolio when you connect your wallet.",
          "Process listings, bids, and purchases on our marketplace.",
          "Provide price oracle data and market valuations.",
          "Improve our platform and user experience.",
        ],
      },
    ],
  },
  {
    id: "data-storage-security",
    number: 4,
    title: "Data Storage & Security",
    blocks: [
      {
        type: "paragraph",
        text: "We do not store personal information beyond your public wallet address. All blockchain data is publicly available on the Solana network. We use industry-standard security measures to protect our platform infrastructure.",
      },
      {
        type: "callout",
        title: "Important",
        text: "Wallet addresses and on-chain activity are inherently public on Solana, even when Artifacte stores only minimal account-level data.",
        tone: "accent",
      },
    ],
  },
  {
    id: "third-party-services",
    number: 5,
    title: "Third-Party Services",
    blocks: [
      {
        type: "list",
        intro: "We integrate with the following third-party services:",
        items: [
          "Helius for Solana RPC access and NFT data.",
          "Magic Eden for marketplace data.",
          "Arweave and Irys for decentralized metadata storage.",
          "Vercel for website hosting.",
        ],
      },
      {
        type: "callout",
        title: "Third-party policies",
        text: "Each provider maintains its own privacy practices and policies for the data it receives or processes.",
        tone: "neutral",
      },
    ],
  },
  {
    id: "cookies",
    number: 6,
    title: "Cookies",
    blocks: [
      {
        type: "paragraph",
        text: "We use minimal cookies for session management and preferences. No third-party tracking cookies are used.",
      },
    ],
  },
  {
    id: "your-rights",
    number: 7,
    title: "Your Rights",
    blocks: [
      {
        type: "paragraph",
        text: "You can disconnect your wallet at any time to stop sharing your wallet address with our platform. Blockchain transactions are permanent and cannot be deleted because they exist on a public ledger.",
      },
    ],
  },
  {
    id: "changes-to-policy",
    number: 8,
    title: "Changes to This Policy",
    blocks: [
      {
        type: "paragraph",
        text: "We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated date.",
      },
    ],
  },
  {
    id: "contact",
    number: 9,
    title: "Contact",
    blocks: [
      {
        type: "externalLink",
        text: "For privacy-related questions, reach out on",
        href: "https://x.com/Artifacte_io",
        label: "X (@Artifacte_io)",
        suffix: ".",
      },
    ],
  },
] as const satisfies readonly PrivacySection[];

export const PRIVACY_PAGE_CONTENT = {
  title: "Privacy Policy",
  summary:
    "Understand what Artifacte collects, how wallet-linked activity is handled, and where third-party infrastructure participates in operating the platform.",
  highlights: PRIVACY_HIGHLIGHTS,
  lastUpdated: PRIVACY_LAST_UPDATED,
  overviewTitle: "Data Handling Overview",
  overviewDescription:
    "This policy covers wallet address visibility, analytics collection, public blockchain activity, and the third-party services involved in running Artifacte.",
  sectionsNavLabel: "Privacy policy sections",
  sectionsNavDescription: "Jump directly to a section of the privacy policy.",
  companionLink: {
    href: "/terms",
    label: "Terms of Service",
  },
  footerNote:
    "Continuing to use Artifacte after policy updates means you accept the revised privacy terms as posted here.",
  sections: PRIVACY_SECTIONS,
} as const satisfies LegalPageContent;