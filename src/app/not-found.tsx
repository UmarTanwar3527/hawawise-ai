import type { Metadata } from "next";

import { Logo } from "@/components/layout/logo";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4">
      <Logo />
      <main
        id="main-content"
        className="w-full max-w-md rounded-card border border-line bg-surface shadow-card"
      >
        <EmptyState
          headingLevel="h1"
          icon="map"
          title="Page not found"
          description="The page you are looking for does not exist or has moved."
        >
          <ButtonLink href="/">Back to home</ButtonLink>
          <ButtonLink href="/dashboard" variant="secondary">
            Open dashboard
          </ButtonLink>
        </EmptyState>
      </main>
    </div>
  );
}
