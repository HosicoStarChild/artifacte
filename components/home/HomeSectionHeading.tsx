import type { ReactNode } from "react";

type HomeSectionHeadingProps = {
  eyebrow: string;
  title: string;
  action?: ReactNode;
  className?: string;
};

export function HomeSectionHeading({
  eyebrow,
  title,
  action,
  className,
}: HomeSectionHeadingProps) {
  return (
    <div className={className ?? "mb-12 flex items-center justify-between"}>
      <div>
        <p className="mb-2 text-xs font-semibold tracking-widest uppercase text-gold-500">{eyebrow}</p>
        <h2 className="font-serif text-3xl text-white md:text-4xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}