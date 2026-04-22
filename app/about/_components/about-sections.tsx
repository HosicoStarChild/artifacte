import type { ReactNode } from "react"

import { CheckCircle2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

import type {
  MissionPoint,
  PlatformMetric,
  ProcessStep,
  ValuePillar,
} from "../about-content"

type AboutSectionProps = {
  id: string
  eyebrow: string
  title: string
  description: string
  children: ReactNode
  className?: string
}

type MissionPointsCardProps = {
  title: string
  description: string
  points: readonly MissionPoint[]
}

type ProcessGridProps = {
  steps: readonly ProcessStep[]
}

type ValuePillarsGridProps = {
  pillars: readonly ValuePillar[]
}

type MetricsGridProps = {
  metrics: readonly PlatformMetric[]
}

export function AboutSection({
  id,
  eyebrow,
  title,
  description,
  children,
  className,
}: AboutSectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn("scroll-mt-32 space-y-8", className)}
    >
      <div className="max-w-3xl space-y-4">
        <Badge
          variant="outline"
          className="border-gold-500/20 bg-gold-500/10 px-3 py-1 text-[0.72rem] uppercase tracking-[0.22em] text-gold-400"
        >
          {eyebrow}
        </Badge>
        <div className="space-y-4">
          <h2 id={`${id}-title`} className="font-serif text-3xl text-white sm:text-4xl">
            {title}
          </h2>
          <p className="text-base leading-7 text-gray-400 sm:text-lg">{description}</p>
        </div>
      </div>

      {children}
    </section>
  )
}

export function MissionPointsCard({
  title,
  description,
  points,
}: MissionPointsCardProps) {
  return (
    <Card className="border border-white/8 bg-dark-800/70 py-0 text-white shadow-none">
      <CardHeader className="border-b border-white/5 px-6 py-6">
        <CardTitle className="text-xl text-white">{title}</CardTitle>
        <CardDescription className="text-sm leading-6 text-gray-400">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-6 py-6">
        {points.map((point) => (
          <div
            key={point.id}
            className="flex gap-3 rounded-2xl border border-white/5 bg-white/3 p-4"
          >
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-gold-400" aria-hidden="true" />
            <div className="space-y-1.5">
              <h3 className="text-sm font-semibold text-white">{point.title}</h3>
              <p className="text-sm leading-6 text-gray-400">{point.description}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export function ProcessGrid({ steps }: ProcessGridProps) {
  return (
    <ul className="grid gap-6 md:grid-cols-3">
      {steps.map((step) => {
        const Icon = step.icon

        return (
          <li key={step.id}>
            <Card className="h-full border border-white/8 bg-dark-800/70 py-0 text-white shadow-none transition-colors hover:border-gold-500/20">
              <CardHeader className="space-y-4 px-6 py-6">
                <div className="flex items-center justify-between gap-4">
                  <Badge
                    variant="outline"
                    className="border-white/10 bg-white/5 px-3 py-1 text-[0.72rem] tracking-[0.22em] text-gray-300"
                  >
                    {step.number}
                  </Badge>
                  <div className="flex size-11 items-center justify-center rounded-2xl border border-gold-500/20 bg-gold-500/10 text-gold-400">
                    <Icon className="size-5" aria-hidden="true" />
                  </div>
                </div>
                <div className="space-y-2">
                  <CardTitle className="font-serif text-2xl text-white">{step.title}</CardTitle>
                  <CardDescription className="text-sm leading-7 text-gray-400">
                    {step.description}
                  </CardDescription>
                </div>
              </CardHeader>
            </Card>
          </li>
        )
      })}
    </ul>
  )
}

export function ValuePillarsGrid({ pillars }: ValuePillarsGridProps) {
  return (
    <ul className="grid gap-6 md:grid-cols-2">
      {pillars.map((pillar) => {
        const Icon = pillar.icon

        return (
          <li key={pillar.id}>
            <Card className="h-full border border-white/8 bg-dark-800/70 py-0 text-white shadow-none transition-colors hover:border-gold-500/20">
              <CardHeader className="gap-4 px-6 py-6">
                <div className="flex size-12 items-center justify-center rounded-2xl border border-gold-500/20 bg-gold-500/10 text-gold-400">
                  <Icon className="size-5" aria-hidden="true" />
                </div>
                <div className="space-y-2">
                  <CardTitle className="text-xl text-white">{pillar.title}</CardTitle>
                  <CardDescription className="text-sm leading-7 text-gray-400">
                    {pillar.description}
                  </CardDescription>
                </div>
              </CardHeader>
            </Card>
          </li>
        )
      })}
    </ul>
  )
}

export function MetricsGrid({ metrics }: MetricsGridProps) {
  return (
    <ul className="grid gap-6 md:grid-cols-3">
      {metrics.map((metric) => (
        <li key={metric.id}>
          <Card className="h-full border border-white/8 bg-dark-800/70 py-0 text-white shadow-none">
            <CardContent className="space-y-3 px-6 py-6 text-center sm:px-8 sm:py-8">
              <p className="font-serif text-4xl text-gold-400 sm:text-5xl">{metric.value}</p>
              <div className="space-y-2">
                <h3 className="font-serif text-xl text-white">{metric.label}</h3>
                <p className="text-sm leading-6 text-gray-400">{metric.description}</p>
              </div>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  )
}