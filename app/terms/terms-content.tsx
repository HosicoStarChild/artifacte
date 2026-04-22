import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import {
  TERMS_HIGHLIGHTS,
  TERMS_LAST_UPDATED,
  TERMS_SECTIONS,
  type TermsBlock,
  type TermsSection,
} from "./terms-data";

function formatSectionNumber(value: number): string {
  return value.toString().padStart(2, "0");
}

function TermsBlockContent({ block }: { readonly block: TermsBlock }) {
  switch (block.type) {
    case "paragraph":
      return <p className="text-sm leading-7 text-gray-300 sm:text-[0.95rem]">{block.text}</p>;
    case "list":
      return (
        <div className="space-y-4">
          {block.intro ? (
            <p className="text-sm leading-7 text-gray-300 sm:text-[0.95rem]">{block.intro}</p>
          ) : null}
          <ul className="space-y-3 pl-5 text-sm leading-7 text-gray-300 marker:text-gold-500 sm:text-[0.95rem]">
            {block.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      );
    case "callout":
      return (
        <Card
          size="sm"
          className={cn(
            "border py-0 shadow-none",
            block.tone === "accent"
              ? "border-gold-500/25 bg-gold-500/8 text-gold-100"
              : "border-white/10 bg-dark-900/60 text-gray-200"
          )}
        >
          <CardContent className="space-y-2 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gold-400">{block.title}</p>
            <p className="text-sm leading-7 text-gold-100/90">{block.text}</p>
          </CardContent>
        </Card>
      );
    case "emphasis":
      return (
        <div className="rounded-xl border border-gold-500/20 bg-gold-500/8 px-4 py-3 text-sm font-medium leading-6 text-gold-200">
          {block.text}
        </div>
      );
    case "externalLink":
      return (
        <p className="text-sm leading-7 text-gray-300 sm:text-[0.95rem]">
          {block.text}{" "}
          <Link
            href={block.href}
            target="_blank"
            rel="noreferrer noopener"
            className="font-medium text-gold-400 underline-offset-4 transition-colors hover:text-gold-300 hover:underline"
          >
            {block.label}
          </Link>
          {block.suffix}
        </p>
      );
    default:
      return null;
  }
}

function TermsSectionCard({ section }: { readonly section: TermsSection }) {
  return (
    <section id={section.id} aria-labelledby={`${section.id}-title`} className="scroll-mt-32">
      <div className="flex items-start gap-4 sm:gap-5">
        <Badge
          variant="outline"
          className="mt-1 shrink-0 border-gold-500/30 bg-gold-500/10 px-2.5 py-1 font-mono text-[0.7rem] tracking-[0.2em] text-gold-400"
        >
          {formatSectionNumber(section.number)}
        </Badge>
        <div className="min-w-0 flex-1 space-y-4">
          <h2 id={`${section.id}-title`} className="font-serif text-2xl text-white sm:text-[1.7rem]">
            {section.title}
          </h2>
          {section.blocks.map((block, blockIndex) => (
            <TermsBlockContent key={`${section.id}-${block.type}-${blockIndex}`} block={block} />
          ))}
        </div>
      </div>
    </section>
  );
}

export function TermsContent() {
  return (
    <main className="min-h-screen bg-dark-900 pt-28 pb-20 sm:pt-32">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 sm:px-6 lg:px-8">
        <header className="max-w-3xl space-y-5">
          <Badge
            variant="outline"
            className="border-gold-500/30 bg-gold-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-gold-500"
          >
            Legal
          </Badge>
          <div className="space-y-4">
            <h1 className="font-serif text-4xl text-white sm:text-5xl">Terms of Service</h1>
            <p className="max-w-2xl text-base leading-8 text-gray-400 sm:text-lg">
              Review the terms that govern access to Artifacte, wallet usage, listings, fees, and trading activity across tokenized real-world assets on Solana.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {TERMS_HIGHLIGHTS.map((highlight) => (
              <Badge
                key={highlight}
                variant="secondary"
                className="border border-white/10 bg-white/5 px-3 py-1 text-[0.72rem] uppercase tracking-[0.18em] text-gray-200"
              >
                {highlight}
              </Badge>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400">
            <span>Last updated: {TERMS_LAST_UPDATED}</span>
            <span aria-hidden="true" className="text-gray-600">
              •
            </span>
            <Link
              href="/privacy"
              className="font-medium text-gold-400 underline-offset-4 transition-colors hover:text-gold-300 hover:underline"
            >
              Privacy Policy
            </Link>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
          <Card className="border border-white/8 bg-dark-800/90 py-0 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-sm">
            <CardHeader className="gap-3 border-b border-white/5 px-6 py-8 sm:px-8">
              <CardTitle className="font-serif text-2xl text-white sm:text-3xl">
                Platform Terms
              </CardTitle>
              <CardDescription className="max-w-2xl text-base leading-7 text-gray-400">
                These terms describe your responsibilities when using Artifacte, especially when connecting a wallet, listing or purchasing assets, and relying on marketplace information.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-8 px-6 py-8 sm:px-8">
              {TERMS_SECTIONS.map((section, sectionIndex) => (
                <div key={section.id} className="space-y-8">
                  {sectionIndex > 0 ? (
                    <Separator className="bg-linear-to-r from-transparent via-white/10 to-transparent" />
                  ) : null}
                  <TermsSectionCard section={section} />
                </div>
              ))}
            </CardContent>

            <CardFooter className="flex flex-col items-start justify-between gap-4 border-t border-white/5 bg-white/3 sm:flex-row sm:items-center">
              <p className="max-w-2xl text-xs leading-6 text-gray-500">
                Continued use of Artifacte after terms updates constitutes acceptance of the revised terms.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/privacy"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "border-gold-500/30 bg-transparent text-gold-400 hover:bg-gold-500/10 hover:text-gold-300 dark:border-gold-500/30 dark:bg-transparent dark:hover:bg-gold-500/10"
                  )}
                >
                  Privacy Policy
                </Link>
                <Link
                  href="/"
                  className={cn(
                    buttonVariants({ size: "sm" }),
                    "bg-gold-500 text-dark-900 hover:bg-gold-400"
                  )}
                >
                  Back to Home
                </Link>
              </div>
            </CardFooter>
          </Card>

          <Card
            size="sm"
            className="border border-white/8 bg-dark-800/85 py-0 shadow-[0_20px_60px_rgba(0,0,0,0.28)] lg:sticky lg:top-32"
          >
            <CardHeader className="border-b border-white/5 px-5 py-5">
              <CardTitle className="font-serif text-xl text-white">On this page</CardTitle>
              <CardDescription className="text-sm leading-6 text-gray-400">
                Jump directly to a section of the terms.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-5 py-5">
              <nav aria-label="Terms of service sections">
                <ul className="space-y-2">
                  {TERMS_SECTIONS.map((section) => (
                    <li key={section.id}>
                      <Link
                        href={`#${section.id}`}
                        className="group flex items-start gap-3 rounded-lg border border-transparent px-3 py-2 text-sm text-gray-300 transition-colors hover:border-white/8 hover:bg-white/4 hover:text-white"
                      >
                        <span className="font-mono text-[0.72rem] tracking-[0.18em] text-gold-400">
                          {formatSectionNumber(section.number)}
                        </span>
                        <span className="leading-6">{section.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}