import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { AssetSubmissionForm } from "./_components/asset-submission-form";
import { SubmissionSteps } from "./_components/submission-steps";

export default function SubmitPage() {
  return (
    <div className="min-h-screen bg-dark-900 pb-20 pt-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl space-y-6">
          <Badge
            variant="outline"
            className="border-gold-500/20 bg-gold-500/10 text-gold-300"
          >
            Asset intake
          </Badge>

          <div className="space-y-4">
            <h1 className="font-serif text-4xl leading-tight text-white sm:text-5xl">
              Submit a real-world asset for auction review
            </h1>
            <p className="max-w-2xl text-base leading-7 text-gray-400 sm:text-lg">
              Send the asset details, supporting media, and contact information.
              The review team verifies the submission first, then coordinates any
              minting and auction setup directly with you.
            </p>
          </div>

          <p className="max-w-2xl text-sm leading-6 text-gray-500">
            This page no longer requires a wallet connection. If your submission is
            approved, the next Solana-specific step happens later in the review flow.
          </p>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(360px,460px)] lg:items-start">
          <div className="space-y-8">
            <SubmissionSteps />

            <Card className="border-white/10 bg-dark-800/60 text-white shadow-none">
              <CardHeader className="px-6 pt-6">
                <CardTitle className="text-lg text-white">Prepare before you submit</CardTitle>
                <CardDescription className="text-sm leading-6 text-gray-400">
                  Strong submissions move faster when they include proof and clear
                  provenance from the start.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 px-6 pb-6 text-sm leading-6 text-gray-300">
                <p>Include direct image links for the asset, packaging, certificates, and any serial numbers.</p>
                <p>Explain condition, ownership, and why the asset belongs on Artifacte.</p>
                <p>
                  Review the <Link className="text-gold-300 underline underline-offset-4 hover:text-gold-200" href="/terms">Terms</Link> and <Link className="text-gold-300 underline underline-offset-4 hover:text-gold-200" href="/privacy">Privacy Policy</Link> if you are sharing personal contact details or sensitive documentation.
                </p>
              </CardContent>
            </Card>
          </div>

          <AssetSubmissionForm />
        </div>
      </div>
    </div>
  );
}
