import Image from "next/image"
import Link from "next/link"

import { ArrowLeft, ArrowRight } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

import { aboutHeroContent, aboutHeroHighlights } from "../about-content"

export function AboutHero() {
  return (
    <section aria-labelledby="about-hero-title" className="pb-16">
      <Card className="overflow-hidden border border-white/8 bg-dark-800/85 py-0 text-white shadow-[0_28px_90px_rgba(0,0,0,0.38)] backdrop-blur-sm">
        <div className="grid lg:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]">
          <div className="flex flex-col justify-center px-6 py-10 sm:px-10 sm:py-12 lg:px-12">
            <Badge
              variant="outline"
              className="mb-6 w-fit border-gold-500/25 bg-gold-500/10 px-3 py-1 text-[0.72rem] uppercase tracking-[0.24em] text-gold-400"
            >
              {aboutHeroContent.eyebrow}
            </Badge>

            <h1
              id="about-hero-title"
              className="max-w-3xl font-serif text-4xl leading-tight text-white sm:text-5xl lg:text-6xl"
            >
              {aboutHeroContent.title}
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-8 text-gray-300 sm:text-lg">
              {aboutHeroContent.description}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={aboutHeroContent.backLink.href}
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "border-gold-500/30 bg-transparent px-6 text-gold-400 hover:bg-gold-500/10 hover:text-gold-300 dark:border-gold-500/30 dark:bg-transparent dark:hover:bg-gold-500/10"
                )}
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                {aboutHeroContent.backLink.label}
              </Link>
              <Link
                href={aboutHeroContent.primaryCta.href}
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "bg-gold-500 px-6 text-dark-900 hover:bg-gold-400"
                )}
              >
                {aboutHeroContent.primaryCta.label}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </div>

          <div className="relative min-h-[360px] border-t border-white/5 lg:min-h-full lg:border-l lg:border-t-0">
            <Image
              src={aboutHeroContent.image.src}
              alt={aboutHeroContent.image.alt}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 42vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-linear-to-t from-dark-900 via-dark-900/50 to-transparent" />

            <Card className="absolute inset-x-4 bottom-4 border border-white/10 bg-dark-900/80 py-0 shadow-none backdrop-blur md:inset-x-6 md:bottom-6">
              <CardContent className="grid gap-4 px-5 py-5 sm:grid-cols-3">
                {aboutHeroHighlights.map((highlight) => (
                  <div key={highlight.id} className="space-y-2">
                    <p className="text-xs font-semibold tracking-[0.24em] uppercase text-gold-400">
                      {highlight.label}
                    </p>
                    <p className="text-sm leading-6 text-gray-300">{highlight.description}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </Card>
    </section>
  )
}