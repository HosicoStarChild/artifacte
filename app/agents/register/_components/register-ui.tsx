import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

import {
  REGISTER_STEP_LABELS,
  type RegisterStep,
} from "../_lib/form"

interface RegisterProgressProps {
  step: RegisterStep
}

interface RegisterSelectableCardProps {
  description: string
  label: string
  onToggle: () => void
  selected: boolean
}

interface RegisterStatusMetricProps {
  label: string
  statusLabel: string
  tone: "danger" | "success" | "warning"
}

const TONE_STYLES: Record<RegisterStatusMetricProps["tone"], string> = {
  danger: "border-red-500/20 bg-red-950/30 text-red-100",
  success: "border-emerald-500/20 bg-emerald-950/30 text-emerald-100",
  warning: "border-gold-500/20 bg-gold-500/10 text-gold-100",
}

const TONE_BADGE_STYLES: Record<RegisterStatusMetricProps["tone"], string> = {
  danger: "border-red-500/20 bg-red-500/10 text-red-200",
  success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-200",
  warning: "border-gold-500/20 bg-gold-500/10 text-gold-100",
}

export function RegisterProgress({ step }: RegisterProgressProps) {
  return (
    <Card className="border-white/5 bg-dark-800/80 py-0 text-white">
      <CardContent className="flex flex-wrap items-center gap-3 px-5 py-5">
        {([1, 2, 3, 4, 5] as const).map((stepNumber) => {
          const isActive = stepNumber === step
          const isComplete = stepNumber < step

          return (
            <div className="flex items-center gap-3" key={stepNumber}>
              <div className="flex items-center gap-3 rounded-full border border-white/8 bg-dark-900/65 px-3 py-2">
                <div
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold",
                    isComplete && "border-gold-500/25 bg-gold-500 text-dark-950",
                    isActive && !isComplete && "border-gold-500/35 bg-gold-500/10 text-gold-100",
                    !isActive && !isComplete && "border-white/10 text-white/40"
                  )}
                >
                  {stepNumber}
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35">
                    Step {stepNumber}
                  </p>
                  <p className={cn("text-sm", isActive || isComplete ? "text-white" : "text-white/45")}>
                    {REGISTER_STEP_LABELS[stepNumber]}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

export function RegisterStatusMetric({
  label,
  statusLabel,
  tone,
}: RegisterStatusMetricProps) {
  return (
    <div className={cn("rounded-2xl border px-4 py-4", TONE_STYLES[tone])}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{label}</p>
        <Badge className={TONE_BADGE_STYLES[tone]} variant="outline">
          {statusLabel}
        </Badge>
      </div>
    </div>
  )
}

export function RegisterSelectableCard({
  description,
  label,
  onToggle,
  selected,
}: RegisterSelectableCardProps) {
  return (
    <Button
      className={cn(
        "flex h-auto w-full flex-col items-start gap-2 rounded-2xl border px-4 py-4 text-left shadow-none",
        selected
          ? "border-gold-500/35 bg-gold-500/10 text-white hover:bg-gold-500/15"
          : "border-white/10 bg-dark-900/65 text-white/70 hover:bg-dark-900 hover:text-white"
      )}
      onClick={onToggle}
      type="button"
      variant="outline"
    >
      <div className="flex w-full items-center justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <Badge
          className={cn(
            selected
              ? "border-gold-500/30 bg-gold-500 text-dark-950"
              : "border-white/10 bg-white/5 text-white/45"
          )}
          variant="outline"
        >
          {selected ? "Selected" : "Optional"}
        </Badge>
      </div>

      <p className="text-sm leading-6 text-inherit/80">{description}</p>
    </Button>
  )
}