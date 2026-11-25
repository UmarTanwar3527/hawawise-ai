"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Icon } from "@/components/ui/icon";

type Area = { slug: string; name: string; type: string };

export function LocationSelector({ areas, value }: { areas: Area[]; value: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor="location" className="text-sm font-medium text-ink">
        Area
      </label>
      <div className="relative">
        <Icon
          name="pin"
          size={16}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-primary"
        />
        <select
          id="location"
          value={value}
          onChange={(event) => {
            const slug = event.target.value;
            startTransition(() => router.push(`/dashboard?location=${encodeURIComponent(slug)}`));
          }}
          className="h-10 appearance-none rounded-lg border border-line-strong bg-surface pr-9 pl-9 text-sm font-medium text-ink shadow-sm"
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
      <span role="status" aria-live="polite" className="text-xs text-ink-subtle">
        {isPending ? "Loading area…" : ""}
      </span>
    </div>
  );
}
