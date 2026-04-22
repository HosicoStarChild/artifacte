export type LegalBlock =
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
      readonly tone: "accent" | "neutral";
    }
  | {
      readonly type: "emphasis";
      readonly text: string;
    }
  | {
      readonly type: "labeledParagraph";
      readonly label: string;
      readonly text: string;
    }
  | {
      readonly type: "externalLink";
      readonly text: string;
      readonly href: string;
      readonly label: string;
      readonly suffix?: string;
    };

export interface LegalSection {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly blocks: readonly LegalBlock[];
}

export interface LegalPageLink {
  readonly href: string;
  readonly label: string;
}

export interface LegalPageContent {
  readonly title: string;
  readonly summary: string;
  readonly highlights: readonly string[];
  readonly lastUpdated: string;
  readonly overviewTitle: string;
  readonly overviewDescription: string;
  readonly sectionsNavLabel: string;
  readonly sectionsNavDescription: string;
  readonly companionLink: LegalPageLink;
  readonly footerNote: string;
  readonly sections: readonly LegalSection[];
}