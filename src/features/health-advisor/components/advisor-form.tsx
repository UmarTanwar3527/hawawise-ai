"use client";

import { useRouter } from "next/navigation";
import { useId, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils/cn";

import { ACTIVITIES, ACTIVITY_IDS, PROFILES, PROFILE_IDS } from "../constants";
import { advisorHref, advisorRequestFromSearchParams, type AdvisorRequest } from "../schemas/advisor-request";

type Area = { slug: string; name: string };

const chip = cn(
  "flex min-h-10 cursor-pointer items-center justify-center rounded-lg border border-line-control bg-surface px-3 py-1.5 text-center text-sm font-medium text-ink",
  "has-checked:border-primary has-checked:bg-primary-soft has-checked:text-primary-strong",
  "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary",
);

/** Choices only: nothing is stored, and no medical details are asked for. */
export function AdvisorForm({ areas, value }: { areas: Area[]; value: AdvisorRequest }) {
  const router = useRouter();
  const id = useId();
  const [isPending, startTransition] = useTransition();

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parsed = advisorRequestFromSearchParams(
      Object.fromEntries([...data.entries()].map(([key, v]) => [key, typeof v === "string" ? v : undefined])),
    );
    if (parsed.success) startTransition(() => router.push(advisorHref(parsed.data), { scroll: false }));
  };

  return (
    <form key={advisorHref(value)} action="/advisor" method="get" onSubmit={onSubmit} className="flex flex-col gap-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">Who is this for?</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PROFILE_IDS.map((profile) => (
            <label key={profile} className={chip}>
              <input type="radio" name="profile" value={profile} defaultChecked={value.profile === profile} className="sr-only" />
              {PROFILES[profile].label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">Activity</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {ACTIVITY_IDS.map((activity) => (
            <label key={activity} className={chip}>
              <input type="radio" name="activity" value={activity} defaultChecked={value.activity === activity} className="sr-only" />
              {ACTIVITIES[activity].label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-56 flex-col gap-1.5">
          <label htmlFor={`${id}-area`} className="text-sm font-medium text-ink">
            Area
          </label>
          <select
            id={`${id}-area`}
            name="location"
            defaultValue={value.location}
            className="h-10 rounded-lg border border-line-control bg-surface px-3 text-sm font-medium text-ink shadow-sm"
          >
            {areas.map((area) => (
              <option key={area.slug} value={area.slug}>
                {area.name}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={isPending}>
          <Icon name="shield" size={16} />
          {isPending ? "Updating…" : "Get advice"}
        </Button>
        <p className="text-xs text-ink-subtle">Nothing you choose here is stored.</p>
      </div>
    </form>
  );
}
