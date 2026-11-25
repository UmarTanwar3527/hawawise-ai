"use client";

import { useRef, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { siteConfig } from "@/config/site";

import { Logo } from "./logo";
import { SidebarNav } from "./sidebar-nav";

function SidebarFooter() {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3.5">
      <p className="flex items-center gap-2 text-xs font-semibold text-white">
        <Icon name="pin" size={14} className="text-blue-300" />
        {siteConfig.pilotCity.name} pilot
      </p>
      <p className="mt-1.5 text-xs leading-5 text-slate-300">
        Development preview. Environmental data sources are not connected yet.
      </p>
    </div>
  );
}

/**
 * Responsive application frame: fixed navy sidebar on large screens and a
 * native <dialog> drawer on smaller screens. The browser provides focus
 * containment, Escape-to-close, an inert background and focus restoration.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const drawerRef = useRef<HTMLDialogElement>(null);

  const openDrawer = () => drawerRef.current?.showModal();
  const closeDrawer = () => drawerRef.current?.close();

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-8 bg-navy px-3 py-5 lg:flex">
        <div className="px-2">
          <Logo tone="light" />
        </div>
        <SidebarNav />
        <SidebarFooter />
      </aside>

      {/* Mobile and tablet drawer */}
      <dialog
        ref={drawerRef}
        aria-label="Navigation"
        onClick={(event) => {
          // A click on the dialog element itself is a click on the backdrop.
          if (event.target === event.currentTarget) closeDrawer();
        }}
        className="m-0 h-dvh max-h-none w-72 max-w-[85vw] bg-navy p-0 text-white backdrop:bg-navy/60 backdrop:backdrop-blur-sm lg:hidden"
      >
        <div className="flex h-full flex-col gap-8 px-3 py-5">
          <div className="flex items-center justify-between px-2">
            <Logo tone="light" />
            <button
              type="button"
              onClick={closeDrawer}
              aria-label="Close navigation"
              className="grid size-9 place-items-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white"
            >
              <Icon name="close" />
            </button>
          </div>
          <SidebarNav onNavigate={closeDrawer} />
          <SidebarFooter />
        </div>
      </dialog>

      <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={openDrawer}
            aria-label="Open navigation"
            className="-ml-1 grid size-10 place-items-center rounded-lg text-ink hover:bg-ink/5 lg:hidden"
          >
            <Icon name="menu" />
          </button>
          <Logo className="lg:hidden" />

          <p className="hidden items-center gap-2 text-sm font-medium text-ink lg:flex">
            <Icon name="pin" size={16} className="text-primary" />
            {siteConfig.pilotCity.name}, {siteConfig.pilotCity.state}
            <span className="font-normal text-ink-subtle">· Pilot city</span>
          </p>

          <div className="ml-auto flex items-center gap-2">
            {/* Visibility lives on a wrapper: Badge's own display class would win. */}
            <span className="hidden sm:block">
              <Badge tone="neutral" dot>
                Live data not connected
              </Badge>
            </span>
            <Badge tone="placeholder">Dev preview</Badge>
          </div>
        </div>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-7xl px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8"
      >
        {children}
      </main>
    </div>
  );
}
