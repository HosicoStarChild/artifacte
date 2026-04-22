export type TermsBlock =
  | {
      readonly type: "paragraph";
      readonly text: string;
    }
  | {
      readonly type: "list";
      readonly intro?: string;
      readonly items: readonly string[];
    }
  | {
      readonly type: "callout";
      readonly title: string;
      readonly text: string;
      readonly tone: "accent";
    }
  | {
      readonly type: "emphasis";
      readonly text: string;
    }
  | {
      readonly type: "externalLink";
      readonly text: string;
      readonly href: string;
      readonly label: string;
      readonly suffix?: string;
    };

export interface TermsSection {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly blocks: readonly TermsBlock[];
}

export const TERMS_LAST_UPDATED = "April 14, 2026";

export const TERMS_HIGHLIGHTS = [
  "Wallet-based access",
  "2% platform fee",
  "Beta platform",
] as const;

export const TERMS_SECTIONS = [
  {
    id: "acceptance-of-terms",
    number: 1,
    title: "Acceptance of Terms",
    blocks: [
      {
        type: "paragraph",
        text: "By accessing or using Artifacte (the Platform), you agree to be bound by these Terms of Service. If you do not agree, do not use the Platform.",
      },
    ],
  },
  {
    id: "platform-description",
    number: 2,
    title: "Platform Description",
    blocks: [
      {
        type: "paragraph",
        text: "Artifacte is a marketplace for real-world assets (RWAs) tokenized as NFTs on the Solana blockchain. The Platform facilitates the listing, discovery, and trading of authenticated collectibles including trading cards, sealed products, spirits, watches, and digital art.",
      },
      {
        type: "callout",
        title: "Beta Notice",
        text: "Artifacte is currently in beta. Features may change, and some functionality may be limited or unavailable. Use the Platform at your own discretion.",
        tone: "accent",
      },
    ],
  },
  {
    id: "eligibility",
    number: 3,
    title: "Eligibility",
    blocks: [
      {
        type: "paragraph",
        text: "You must be at least 18 years old and capable of forming a binding contract to use the Platform. By using Artifacte, you represent that you meet these requirements.",
      },
    ],
  },
  {
    id: "wallet-connection",
    number: 4,
    title: "Wallet Connection",
    blocks: [
      {
        type: "list",
        intro:
          "To interact with the Platform, you must connect a compatible Solana wallet such as Phantom or Solflare. You are solely responsible for:",
        items: [
          "Maintaining the security of your wallet and private keys.",
          "All transactions made through your connected wallet.",
          "Any fees associated with blockchain transactions.",
        ],
      },
      {
        type: "emphasis",
        text: "We never ask for your seed phrase or private keys.",
      },
    ],
  },
  {
    id: "nfts-and-real-world-assets",
    number: 5,
    title: "NFTs and Real-World Assets",
    blocks: [
      {
        type: "list",
        intro:
          "NFTs on Artifacte may represent ownership claims on physical items stored in third-party custody. Important considerations include:",
        items: [
          "Ownership of an NFT represents a claim on the underlying physical asset.",
          "Physical items are stored by authorized vault providers such as PSA Vault and PWCC.",
          "Redemption of physical items is subject to the vault provider's terms.",
          "Market values displayed are estimates from our oracle and may not reflect exact sale prices.",
        ],
      },
    ],
  },
  {
    id: "fees",
    number: 6,
    title: "Fees",
    blocks: [
      {
        type: "paragraph",
        text: "Artifacte charges a 2% platform fee on completed sales. NFTs minted by Artifacte carry a 2% royalty on secondary sales, enforced at the protocol level. Additional blockchain transaction fees apply to all on-chain operations.",
      },
    ],
  },
  {
    id: "prohibited-activities",
    number: 7,
    title: "Prohibited Activities",
    blocks: [
      {
        type: "list",
        intro: "You agree not to:",
        items: [
          "Use the Platform for money laundering or illegal activities.",
          "Manipulate prices through wash trading or shill bidding.",
          "Attempt to exploit smart contract vulnerabilities.",
          "Misrepresent the authenticity or condition of listed items.",
          "Interfere with the Platform's infrastructure or other users.",
        ],
      },
    ],
  },
  {
    id: "disclaimers",
    number: 8,
    title: "Disclaimers",
    blocks: [
      {
        type: "list",
        intro:
          "The Platform is provided as is without warranties of any kind. We do not guarantee:",
        items: [
          "Accuracy of price oracle data or market valuations.",
          "Availability or uptime of the Platform.",
          "That smart contracts are free from bugs or vulnerabilities.",
          "The authenticity of third-party listed items, including Collector Crypt and other external sources.",
        ],
      },
    ],
  },
  {
    id: "limitation-of-liability",
    number: 9,
    title: "Limitation of Liability",
    blocks: [
      {
        type: "paragraph",
        text: "To the maximum extent permitted by law, Artifacte shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Platform, including but not limited to loss of funds, NFTs, or data.",
      },
    ],
  },
  {
    id: "intellectual-property",
    number: 10,
    title: "Intellectual Property",
    blocks: [
      {
        type: "paragraph",
        text: "The Artifacte brand, logo, and platform design are our property. NFT metadata and images belong to their respective creators and rights holders.",
      },
    ],
  },
  {
    id: "changes-to-terms",
    number: 11,
    title: "Changes to Terms",
    blocks: [
      {
        type: "paragraph",
        text: "We reserve the right to modify these Terms at any time. Continued use of the Platform constitutes acceptance of updated Terms.",
      },
    ],
  },
  {
    id: "contact",
    number: 12,
    title: "Contact",
    blocks: [
      {
        type: "externalLink",
        text: "Questions about these Terms? Reach out on",
        href: "https://x.com/Artifacte_io",
        label: "X (@Artifacte_io)",
        suffix: ".",
      },
    ],
  },
] as const satisfies readonly TermsSection[];