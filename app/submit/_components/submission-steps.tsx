import {
  ClipboardCheck,
  FileText,
  Gavel,
  ShieldCheck,
  Upload,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const submissionSteps = [
  {
    icon: FileText,
    title: "Describe the asset",
    description:
      "Share the asset type, condition, provenance, and anything the review team should verify.",
  },
  {
    icon: Upload,
    title: "Upload proof",
    description:
      "Provide photo URLs for certificates, appraisals, serials, packaging, and ownership evidence.",
  },
  {
    icon: ClipboardCheck,
    title: "Review the intake",
    description:
      "Double-check the details before sending the submission to the Artifacte verification queue.",
  },
  {
    icon: ShieldCheck,
    title: "Verification",
    description:
      "The team validates authenticity, ownership, and legal documentation before approval.",
  },
  {
    icon: Gavel,
    title: "Auction coordination",
    description:
      "Approved assets move into the minting and auction setup flow with the team directly.",
  },
] as const;

export function SubmissionSteps() {
  return (
    <div className="space-y-4">
      {submissionSteps.map((step, index) => {
        const Icon = step.icon;

        return (
          <Card
            key={step.title}
            size="sm"
            className="border-white/10 bg-dark-800/80 text-white shadow-none"
          >
            <CardHeader className="flex flex-row items-start gap-4 space-y-0 px-5 py-5">
              <div className="flex size-11 items-center justify-center rounded-2xl border border-gold-500/20 bg-gold-500/10 text-gold-300">
                <Icon className="size-5" />
              </div>
              <div className="space-y-2">
                <Badge
                  variant="outline"
                  className="border-white/10 bg-white/5 text-gray-300"
                >
                  Step {index + 1}
                </Badge>
                <CardTitle className="text-base text-white">{step.title}</CardTitle>
                <CardDescription className="text-sm leading-6 text-gray-400">
                  {step.description}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="sr-only">{step.description}</CardContent>
          </Card>
        );
      })}
    </div>
  );
}
