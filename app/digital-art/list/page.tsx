"use client";

import { Suspense } from "react";
import ListPageContent from "./content";

export default function ListPage() {
  return (
    <Suspense fallback={<div className="pt-24 pb-20">Loading...</div>}>
      <ListPageContent />
    </Suspense>
  );
}
