import { LegalPage } from "@/app/legal/legal-page";

import { TERMS_PAGE_CONTENT } from "./terms-data";

export function TermsContent() {
  return <LegalPage content={TERMS_PAGE_CONTENT} />;
}