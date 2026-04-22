import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type FooterLink = {
  href: string;
  label: string;
  external?: boolean;
};

type FooterSection = {
  title: string;
  links: FooterLink[];
};

const footerSections: FooterSection[] = [
  {
    title: "Platform",
    links: [
      { href: "/about", label: "About" },
      { href: "/agents", label: "Agents" },
    ],
  },
  {
    title: "Explore",
    links: [
      { href: "/digital-art", label: "Digital Art" },
      {
        href: "https://github.com/HosicoStarChild",
        label: "GitHub",
        external: true,
      },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms of Service" },
    ],
  },
];

const footerLinkClassName = cn(
  buttonVariants({ variant: "ghost", size: "sm" }),
  "h-auto justify-start px-0 text-sm font-normal text-gray-500 transition hover:bg-transparent hover:text-white"
);

export default function Footer() {
  return (
    <footer className="border-t border-white/5 bg-dark-900 py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 pb-12 md:grid-cols-3">
          {/* Brand */}
          <div>
            <Link href="/" className="mb-4 flex w-fit items-center gap-2 transition-opacity hover:opacity-90">
              <div className="w-6 h-6 rounded-md bg-gold-500 flex items-center justify-center">
                <span className="text-dark-900 font-serif font-semibold text-xs">A</span>
              </div>
              <span className="font-serif text-lg font-bold tracking-tight italic" style={{ fontFamily: "'Playfair Display', Georgia, serif", letterSpacing: "-0.02em", color: "#f5f5f0" }}>Artifacte</span>
            </Link>
            <p className="text-xs text-gray-500 leading-relaxed max-w-sm">
              A premium auction platform for real-world assets tokenized on Solana. Discover, bid, and own authenticated pieces with verified provenance.
            </p>
          </div>

          {/* Links */}
          <div className="grid grid-cols-2 gap-8 lg:grid-cols-3">
            {footerSections.map((section) => (
              <div key={section.title}>
                <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-white">{section.title}</p>
                <ul className="space-y-1">
                  {section.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className={footerLinkClassName}
                        target={link.external ? "_blank" : undefined}
                        rel={link.external ? "noopener noreferrer" : undefined}
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Status */}
          <div className="flex flex-col items-start md:items-end">
            <p className="text-xs font-semibold text-white tracking-widest uppercase mb-4">Status</p>
            <p className="text-xs text-gray-500 mb-1">Solana Mainnet</p>
            <Badge
              variant="outline"
              className="border-gold-500/30 bg-gold-500/10 text-[0.65rem] uppercase tracking-[0.2em] text-gold-500"
            >
              Beta
            </Badge>
          </div>
        </div>

        <Separator className="bg-white/5" />

        {/* Bottom */}
        <div className="pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-gray-600">© 2026 Artifacte. All rights reserved.</p>
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-500">A</span>
            <Image
              src="/hosico-labs.jpg"
              alt="Hosico Labs"
              width={128}
              height={64}
              sizes="128px"
              className="h-16 w-auto rounded opacity-80 transition hover:opacity-100"
            />
            <span className="text-sm text-gray-500">project</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
