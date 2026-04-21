import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const popularLinks = [
  { href: "/auctions", label: "Auctions" },
  { href: "/digital-art", label: "Digital Art" },
  { href: "/about", label: "About" },
  { href: "/portfolio", label: "Portfolio" },
];

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0e27] px-4 py-16 sm:py-24">
      <Card className="w-full max-w-3xl border border-white/10 bg-dark-900/85 py-0 text-center shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-sm">
        <CardHeader className="items-center gap-4 border-b border-white/5 px-6 py-8 sm:px-10 sm:py-10">
          <Badge
            variant="outline"
            className="border-gold-500/30 bg-gold-500/10 text-[0.65rem] uppercase tracking-[0.24em] text-gold-500"
          >
            Error 404
          </Badge>
          <span className="inline-block bg-linear-to-r from-gold-400 to-gold-500 bg-clip-text font-serif text-7xl font-bold text-transparent md:text-9xl">
            404
          </span>
          <CardTitle className="font-serif text-4xl font-bold text-white md:text-5xl">
            Page Not Found
          </CardTitle>
          <CardDescription className="max-w-2xl text-base leading-relaxed text-gray-400 sm:text-lg">
            The page you&apos;re looking for doesn&apos;t exist or has been moved. Let&apos;s get you back to exploring authenticated real-world assets on Solana.
          </CardDescription>
        </CardHeader>

        <CardContent className="px-6 py-8 sm:px-10">
          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              href="/"
              className={cn(
                buttonVariants({ size: "lg" }),
                "bg-gold-500 px-8 text-dark-900 hover:bg-gold-600"
              )}
            >
              Back to Home
            </Link>
            <Link
              href="/auctions"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "border-gold-500/30 bg-transparent px-8 text-gold-500 hover:bg-gold-500/10 hover:text-gold-400 dark:border-gold-500/30 dark:bg-transparent dark:hover:bg-gold-500/10"
              )}
            >
              Browse Marketplace
            </Link>
          </div>

          <div className="mt-10">
            <Separator className="bg-linear-to-r from-transparent via-gold-500/30 to-transparent" />
          </div>

          <div className="mt-8">
            <p className="mb-4 text-sm text-gray-500">Or explore these popular sections:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {popularLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "sm" }),
                    "text-gold-500 hover:bg-gold-500/10 hover:text-gold-400"
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </CardContent>

        <CardFooter className="justify-center border-t border-white/5 bg-white/3 text-xs text-gray-600">
          <p>© Artifacte. Real-world asset tokenization on Solana.</p>
        </CardFooter>
      </Card>
    </div>
  );
}
