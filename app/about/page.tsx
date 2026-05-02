import type { Metadata } from "next"
import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

import {
  aboutProcessSteps,
  aboutSectionContent,
  aboutValuePillars,
  missionPoints,
} from "./about-content"
import { AboutHero } from "./_components/about-hero"
import {
  AboutSection,
  MissionPointsCard,
  ProcessGrid,
  ValuePillarsGrid,
} from "./_components/about-sections"

export const metadata: Metadata = {
  title: "About | Artifacte",
  description:
    "Learn how Artifacte curates, verifies, and auctions tokenized real-world assets with transparent ownership records.",
}

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-background pb-20 pt-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <AboutHero />

        <div className="space-y-12">
          <AboutSection
            id="mission"
            eyebrow={aboutSectionContent.mission.eyebrow}
            title={aboutSectionContent.mission.title}
            description={aboutSectionContent.mission.description}
          >
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)] lg:items-start">
              <div className="space-y-6 text-base leading-8 text-gray-300 sm:text-lg">
                {aboutSectionContent.mission.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>

              <MissionPointsCard
                title={aboutSectionContent.mission.cardTitle}
                description={aboutSectionContent.mission.cardDescription}
                points={missionPoints}
              />
            </div>
          </AboutSection>

          <Separator className="bg-linear-to-r from-transparent via-white/10 to-transparent" />

          <AboutSection
            id="process"
            eyebrow={aboutSectionContent.process.eyebrow}
            title={aboutSectionContent.process.title}
            description={aboutSectionContent.process.description}
          >
            <ProcessGrid steps={aboutProcessSteps} />
          </AboutSection>

          <Separator className="bg-linear-to-r from-transparent via-white/10 to-transparent" />

          <AboutSection
            id="values"
            eyebrow={aboutSectionContent.values.eyebrow}
            title={aboutSectionContent.values.title}
            description={aboutSectionContent.values.description}
          >
            <ValuePillarsGrid pillars={aboutValuePillars} />
          </AboutSection>

        </div>
      </div>
    </main>
  )
}
