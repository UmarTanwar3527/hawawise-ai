"use client";

import { useRouter } from "next/navigation";
import { useId, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils/cn";

import { ACTIVITIES, ACTIVITY_IDS, DURATION_OPTIONS } from "../constants";
import { planRequestFromSearchParams, planRequestToSearchParams, type PlanRequest } from "../schemas/plan-request";

type Area = { slug: string; name: string };

const HOURS = Array.from({ length: 25 }, (_, hour) => hour);
const hourLabel = (hour: number) =>
  hour === 0 || hour === 24 ? "12 am" : hour === 12 ? "12 pm" : hour < 12 ? `${hour} am` : `${hour - 12} pm`;
const durationLabel = (minutes: number) =>
  minutes < 60 ? `${minutes} min` : minutes % 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes / 60} h`;

const selectClass =
  "h-10 w-full appearance-none rounded-lg border border-line-control bg-surface px-3 text-sm font-medium text-ink shadow-sm";

/**
 * Planner choices. Submits as a GET form (works without JavaScript and makes
 * every plan a shareable URL); with JavaScript it navigates in a transition.
 */
export function PlannerForm({ areas, value }: { areas: Area[]; value: PlanRequest }) {
  const router = useRouter();
  const id = useId();
  const [isPending, startTransition] = useTransition();

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parsed = planRequestFromSearchParams(
      Object.fromEntries([...data.entries()].map(([key, v]) => [key, typeof v === "string" ? v : undefined])),
    );
    if (!parsed.success) return;
    startTransition(() => router.push(`/planner?${planRequestToSearchParams(parsed.data)}`, { scroll: false }));
  };

  return (
    <form
      key={planRequestToSearchParams(value)}
      action="/planner"
      method="get"
      onSubmit={onSubmit}
      className="flex flex-col gap-5"
      aria-describedby={`${id}-hint`}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-ink">Activity</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ACTIVITY_IDS.map((activity) => (
            <label
              key={activity}
              className={cn(
                "flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-line-control bg-surface px-3 text-center text-sm font-medium text-ink",
                "has-checked:border-primary has-checked:bg-primary-soft has-checked:text-primary-strong",
                "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary",
              )}
            >
              <input
                type="radio"
                name="activity"
                value={activity}
                defaultChecked={value.activity === activity}
                className="sr-only"
              />
              {ACTIVITIES[activity].label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="flex flex-col gap-1.5 lg:col-span-2">
          <label htmlFor={`${id}-area`} className="text-sm font-medium text-ink">
            Area
          </label>
          <select id={`${id}-area`} name="location" defaultValue={value.location} className={selectClass}>
            {areas.map((area) => (
              <option key={area.slug} value={area.slug}>
                {area.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-duration`} className="text-sm font-medium text-ink">
            Duration
          </label>
          <select id={`${id}-duration`} name="duration" defaultValue={value.duration} className={selectClass}>
            {DURATION_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {durationLabel(minutes)}
              </option>
            ))}
          </select>
        </div>
        <fieldset className="flex flex-col gap-1.5 lg:col-span-2">
          <legend className="mb-1.5 text-sm font-medium text-ink">Day</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["today", "tomorrow"] as const).map((day) => (
              <label
                key={day}
                className={cn(
                  "flex h-10 cursor-pointer items-center justify-center rounded-lg border border-line-control bg-surface text-sm font-medium text-ink",
                  "has-checked:border-primary has-checked:bg-primary-soft has-checked:text-primary-strong",
                  "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary",
                )}
              >
                <input type="radio" name="day" value={day} defaultChecked={value.day === day} className="sr-only" />
                {day === "today" ? "Today" : "Tomorrow"}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-from`} className="text-sm font-medium text-ink">
            Earliest start
          </label>
          <select id={`${id}-from`} name="from" defaultValue={value.from} className={selectClass}>
            {HOURS.slice(0, 24).map((hour) => (
              <option key={hour} value={hour}>
                {hourLabel(hour)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-to`} className="text-sm font-medium text-ink">
            Finish by
          </label>
          <select id={`${id}-to`} name="to" defaultValue={value.to} className={selectClass}>
            {HOURS.slice(1).map((hour) => (
              <option key={hour} value={hour}>
                {hour === 24 ? "Midnight" : hourLabel(hour)}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-start gap-3 rounded-lg border border-line bg-canvas p-3 text-sm text-ink sm:col-span-2 lg:col-span-2">
          <input
            type="checkbox"
            name="sensitive"
            value="1"
            defaultChecked={value.sensitive}
            className="mt-0.5 size-4 accent-primary"
          />
          <span>
            <span className="font-medium">I&apos;m in a sensitive group</span>
            <span className="block text-xs text-ink-subtle">
              Heart or lung condition, older adult, child or pregnant. Adds precautions; the ranking is unchanged.
            </span>
          </span>
        </label>
        <div className="flex items-end">
          <Button type="submit" className="w-full" disabled={isPending}>
            <Icon name="calendar" size={16} />
            {isPending ? "Comparing…" : "Compare times"}
          </Button>
        </div>
      </div>
      <p id={`${id}-hint`} className="text-xs text-ink-subtle">
        Times are India Standard Time. The comparison uses a modelled forecast, not station measurements.
      </p>
      <span role="status" aria-live="polite" className="sr-only">
        {isPending ? "Comparing time windows…" : ""}
      </span>
    </form>
  );
}
