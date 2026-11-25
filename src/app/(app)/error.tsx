"use client";

import { useEffect } from "react";

import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { ErrorState } from "@/components/ui/states";

export default function ProductError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    // TODO(observability): forward to the error-reporting service once chosen.
    console.error(error);
  }, [error]);

  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String((error as { digest?: unknown }).digest ?? "")
      : "";

  return (
    <Card>
      <ErrorState
        title="This page could not be loaded"
        description={
          <>
            Something went wrong while rendering this module. No data has been
            changed.
            {digest ? (
              <span className="mt-2 block font-mono text-xs">
                Reference: {digest}
              </span>
            ) : null}
          </>
        }
      >
        <Button onClick={() => retry()}>
          <Icon name="refresh" size={16} />
          Try again
        </Button>
        <ButtonLink href="/dashboard" variant="secondary">
          Go to dashboard
        </ButtonLink>
      </ErrorState>
    </Card>
  );
}
