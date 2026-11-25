"use client";

import { useRouter } from "next/navigation";
import { useId, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

type Area = { slug: string; name: string; type: string };

/**
 * Area filter. Changing the selection does not navigate by itself (WCAG
 * 3.2.2); the Show button does. Without JavaScript it submits as a GET form.
 */
export function LocationSelector({ areas, value }: { areas: Area[]; value: string }) {
  const router = useRouter();
  const id = useId();
  const [isPending, startTransition] = useTransition();

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const slug = new FormData(event.currentTarget).get("location");
    if (typeof slug !== "string") return;
    startTransition(() => router.push(`/dashboard?location=${encodeURIComponent(slug)}`));
  };

  return (
    <form action="/dashboard" method="get" onSubmit={onSubmit} className="flex flex-wrap items-center gap-3">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        Area
      </label>
      <div className="relative">
        <Icon
          name="pin"
          size={16}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-primary"
        />
        <select
          key={value}
          id={id}
          name="location"
          defaultValue={value}
          className="h-10 appearance-none rounded-lg border border-line-control bg-surface pr-9 pl-9 text-sm font-medium text-ink shadow-sm"
        >
          {areas.map((area) => (
            <option key={area.slug} value={area.slug}>
              {area.name}
            </option>
          ))}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-subtle"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
      <Button type="submit" variant="secondary" disabled={isPending}>
        Show
      </Button>
      <span role="status" aria-live="polite" className="text-xs text-ink-subtle">
        {isPending ? "Loading area…" : ""}
      </span>
    </form>
  );
}
