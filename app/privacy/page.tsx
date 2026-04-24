import type { Metadata } from "next";

import { PrivacyContent } from "./privacy-content";

export const metadata: Metadata = {
  title: "Privacy Policy | Artifacte",
  description:
    "Review how Artifacte handles wallet addresses, public blockchain activity, analytics, and third-party infrastructure.",
};

export default function PrivacyPage() {
  return <PrivacyContent />;
}
