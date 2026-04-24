import type { Metadata } from "next";

import { TermsContent } from "./terms-content";

export const metadata: Metadata = {
  title: "Terms of Service | Artifacte",
  description:
    "Review the terms governing wallet usage, fees, listings, and tokenized real-world asset activity on Artifacte.",
};

export default function TermsPage() {
  return <TermsContent />;
}
