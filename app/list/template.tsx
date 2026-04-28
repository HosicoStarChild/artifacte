import type { ReactNode } from "react";

type ListTemplateProps = {
  children: ReactNode;
};

export default function ListTemplate({ children }: ListTemplateProps) {
  return children;
}