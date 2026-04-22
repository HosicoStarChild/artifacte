import { LegalPage } from "@/app/legal/legal-page";

import { PRIVACY_PAGE_CONTENT } from "./privacy-data";

export function PrivacyContent() {
  return <LegalPage content={PRIVACY_PAGE_CONTENT} />;
}