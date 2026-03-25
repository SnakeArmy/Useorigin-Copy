"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  Bot,
  ChartNoAxesCombined,
  CircleDollarSign,
  Home,
  LayoutDashboard,
  Menu,
  MoonStar,
  Settings2,
  Sparkles,
  SunMedium,
  Target,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useFinanceStore } from "@/lib/finance-store";
import { calculateAccountSummary } from "@/lib/finance-selectors";
import { formatRelativeTime, cn } from "@/lib/utils";
import {
  ModalShell,
  Pill,
  SearchTrigger,
  SurfaceButton,
  fadeUp,
  staggerContainer,
} from "@/components/ui/primitives";

const navItems = [
  { href: "/overview", label: "Overview", icon: Home },
  { href: "/spending", label: "Spending", icon: WalletCards },
  { href: "/investments", label: "Investments", icon: ChartNoAxesCombined },
  { href: "/planning", label: "Planning", icon: Target },
  { href: "/household", label: "Household", icon: Users },
  { href: "/advisor", label: "Advisor", icon: Bot },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

const shellMeta: Record<string, { title: string; description: string }> = {
  "/overview": {
    title: "Money command center",
    description: "A unified operating view across cash, budgets, investing, planning, and household decisions.",
  },
  "/spending": {
    title: "Spending intelligence",
    description: "Fix categorization quickly, convert edits into rules, and keep reporting trustworthy.",
  },
  "/investments": {
    title: "Investment visibility",
    description: "Monitor allocation, performance, watchlists, and benchmark context without leaving the workspace.",
  },
  "/planning": {
    title: "Forecasting and planning",
    description: "Pressure-test long-term scenarios and make tradeoffs visible before you commit.",
  },
  "/household": {
    title: "Shared finances",
    description: "Coordinate money decisions across people, budgets, goals, and permissions in one place.",
  },
  "/advisor": {
    title: "AI advisor",
    description: "Ask connected questions about spending, portfolio shifts, forecasts, and categorization rules.",
  },
  "/settings": {
    title: "Workspace controls",
    description: "Manage institutions, categories, rules, notifications, household access, and appearance.",
  },
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const {
    workspace,
    dateRange,
    selectedMemberId,
    theme,
    commandOpen,
    notificationsOpen,
    reviewQueue,
    setDateRange,
    setSelectedMemberId,
    setTheme,
    setCommandOpen,
    setNotificationsOpen,
    markNotificationRead,
  } = useFinanceStore();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }

      if (event.key === "Escape") {
        setCommandOpen(false);
        setNotificationsOpen(false);
        setMobileNavOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setCommandOpen, setNotificationsOpen]);

  const unreadCount = workspace.notifications.filter((notification) => !notification.read).length;
  const activeMember =
    workspace.members.find((member) => member.id === selectedMemberId) ?? workspace.members[0];
  const page = shellMeta[pathname] ?? shellMeta["/overview"];
  const headerStats = useMemo(
    () => [
      { label: "Linked accounts", value: `${workspace.accounts.length}` },
      { label: "Active rules", value: `${workspace.rules.filter((rule) => rule.enabled).length}` },
      { label: "Needs review", value: `${reviewQueue.length}` },
    ],
    [reviewQueue.length, workspace.accounts.length, workspace.rules],
  );

  return (
    <div className="min-h-screen text-[var(--text-primary)]">
      <div className="pointer-events-none fixed left-[-8rem] top-[6rem] h-[24rem] w-[24rem] rounded-full bg-[rgba(0,242,254,0.15)] blur-[120px] animate-breathing" />
      <div className="pointer-events-none fixed right-[-8rem] top-[-2rem] h-[22rem] w-[22rem] rounded-full bg-[rgba(79,172,254,0.15)] blur-[120px] animate-breathing-delayed" />

      <div className="relative mx-auto flex min-h-screen max-w-[1740px]">
        <aside className="hidden w-[312px] shrink-0 px-5 py-5 xl:block">
          <div className="sticky top-5">
            <SidebarContent pathname={pathname} activeMember={activeMember?.name ?? "Household"} />
          </div>
        </aside>

        <AnimatePresence>
          {mobileNavOpen ? (
            <motion.div
              className="fixed inset-0 z-[70] bg-[rgba(2,6,23,0.78)] xl:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.aside
                className="h-full w-[88vw] max-w-[332px] border-r border-[var(--panel-border)] bg-[var(--panel-strong)] px-5 py-6 shadow-[0_24px_80px_rgba(2,6,23,0.4)]"
                initial={{ x: -32, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -32, opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="mb-6 flex items-center justify-between">
                  <BrandMark />
                  <SurfaceButton
                    variant="ghost"
                    className="h-10 w-10 rounded-full p-0"
                    onClick={() => setMobileNavOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </SurfaceButton>
                </div>
                <SidebarContent pathname={pathname} activeMember={activeMember?.name ?? "Household"} />
              </motion.aside>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="flex min-w-0 flex-1 flex-col px-3 pb-4 pt-3 md:px-5 md:pb-6 md:pt-5">
          <header className="sticky top-3 z-40 mb-8 rounded-[32px] border border-[var(--panel-border)] bg-[rgba(5,11,24,0.68)] px-5 py-5 shadow-[0_20px_60px_rgba(2,6,23,0.34)] backdrop-blur-[40px] xl:px-6">
            <div className="flex flex-col gap-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <SurfaceButton
                    variant="ghost"
                    className="mt-1 h-10 w-10 rounded-full p-0 xl:hidden"
                    onClick={() => setMobileNavOpen(true)}
                  >
                    <Menu className="h-4 w-4" />
                  </SurfaceButton>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="xl:hidden">
                        <BrandMark compact />
                      </div>
                      <Pill tone={workspace.meta.dataSource === "backend" ? "accent" : "warning"}>
                        {workspace.meta.dataSource === "backend" ? "Live data" : "Backend unavailable"}
                      </Pill>
                      <Pill tone="neutral">{page.title}</Pill>
                      {workspace.meta.diagnostics.length ? (
                        <Pill tone="warning">{workspace.meta.diagnostics.length} diagnostics</Pill>
                      ) : null}
                    </div>
                    <h1 className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-[var(--text-primary)] md:text-[2rem]">
                      {page.title}
                    </h1>
                    <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--text-secondary)]">
                      {page.description}
                    </p>
                  </div>
                </div>

                <div className="hidden min-w-[360px] xl:block">
                  <SearchTrigger onClick={() => setCommandOpen(true)} label="Search routes, actions, and insights" />
                </div>
              </div>

              <div className="grid gap-3 xl:grid-cols-[1fr,auto]">
                <div className="grid gap-3 md:grid-cols-3">
                  {headerStats.map((stat) => (
                    <div key={stat.label} className="panel-muted px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
                        {stat.label}
                      </p>
                      <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{stat.value}</p>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
                  <select
                    className="control-surface min-w-[118px] px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none"
                    value={dateRange}
                    onChange={(event) => setDateRange(event.target.value as typeof dateRange)}
                  >
                    <option className="bg-slate-950 text-white" value="30d">
                      30 days
                    </option>
                    <option className="bg-slate-950 text-white" value="90d">
                      90 days
                    </option>
                    <option className="bg-slate-950 text-white" value="180d">
                      180 days
                    </option>
                    <option className="bg-slate-950 text-white" value="365d">
                      365 days
                    </option>
                  </select>

                  <select
                    className="control-surface min-w-[180px] px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none"
                    value={selectedMemberId}
                    onChange={(event) => setSelectedMemberId(event.target.value)}
                  >
                    {workspace.members.map((member) => (
                      <option className="bg-slate-950 text-white" key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </select>

                  <SurfaceButton
                    variant="ghost"
                    className="h-11 w-11 rounded-full p-0"
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  >
                    {theme === "dark" ? (
                      <SunMedium className="h-4 w-4" />
                    ) : (
                      <MoonStar className="h-4 w-4" />
                    )}
                  </SurfaceButton>

                  <SurfaceButton
                    variant="ghost"
                    className="relative h-11 w-11 rounded-full p-0"
                    onClick={() => setNotificationsOpen(!notificationsOpen)}
                  >
                    <Bell className="h-4 w-4" />
                    {unreadCount ? (
                      <span className="absolute right-2 top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent-amber)] px-1 text-[10px] font-bold text-slate-950">
                        {unreadCount}
                      </span>
                    ) : null}
                  </SurfaceButton>

                  <div className="control-surface flex items-center gap-3 px-3 py-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-[18px] bg-[var(--accent-gradient)] text-sm font-bold text-slate-950 shadow-[0_16px_34px_rgba(37,231,170,0.18)]">
                      {activeMember?.initials ?? "NS"}
                    </div>
                    <div className="hidden min-w-0 text-sm md:block">
                      <p className="truncate font-semibold text-[var(--text-primary)]">
                        {activeMember?.name ?? "Northstar"}
                      </p>
                      <p className="truncate text-xs text-[var(--text-muted)]">
                        {activeMember?.email ?? workspace.brand.tagline}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="xl:hidden">
                <SearchTrigger onClick={() => setCommandOpen(true)} label="Search, jump, or create" />
              </div>
            </div>
          </header>

          <main className="mx-auto flex w-full max-w-[1510px] flex-1 flex-col">{children}</main>

          <Link
            href="/advisor"
            className="control-surface group fixed bottom-8 right-8 z-30 inline-flex items-center gap-3 px-3 py-3 backdrop-blur-xl animate-float-pulse"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-gradient)] text-slate-950">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="hidden md:block">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
                Ask {workspace.brand.assistantName}
              </p>
              <p className="text-sm font-medium text-[var(--text-primary)]">
                Explain changes or create rules
              </p>
            </div>
          </Link>
        </div>
      </div>

      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
      <NotificationsTray
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        onMarkRead={markNotificationRead}
      />
    </div>
  );
}

function SidebarContent({
  pathname,
  activeMember,
}: {
  pathname: string;
  activeMember: string;
}) {
  const { workspace, reviewQueue } = useFinanceStore();
  const accountSummary = calculateAccountSummary(workspace);

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="panel-surface flex h-[calc(100vh-2.5rem)] flex-col border-[var(--panel-border-strong)] bg-[rgba(6,13,27,0.72)] p-5"
    >
      <motion.div variants={fadeUp} className="mb-6 flex items-center justify-between">
        <BrandMark />
        <Pill tone={workspace.meta.dataSource === "backend" ? "positive" : "warning"}>
          {workspace.meta.dataSource === "backend" ? "Synced" : "No backend"}
        </Pill>
      </motion.div>

      <motion.div variants={fadeUp} className="panel-muted mb-5 p-4">
        <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--text-muted)]">Live context</p>
        <h3 className="mt-3 text-lg font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
          {activeMember}
        </h3>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
          Cash flow, budgeting, investments, and household coordination in one calibrated workspace.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-[20px] border border-[var(--control-border)] bg-white/5 px-3 py-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">Net cash</p>
            <p className="mt-1 text-base font-semibold text-[var(--text-primary)]">
              {Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD",
                notation: "compact",
                maximumFractionDigits: 1,
              }).format(accountSummary.liquid)}
            </p>
          </div>
          <div className="rounded-[20px] border border-[var(--control-border)] bg-white/5 px-3 py-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">Review</p>
            <p className="mt-1 text-base font-semibold text-[var(--text-primary)]">{reviewQueue.length}</p>
          </div>
        </div>
      </motion.div>

      <motion.div variants={fadeUp} className="mb-3 flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--text-muted)]">Navigate</p>
        <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">7 views</p>
      </motion.div>

      <nav className="space-y-1.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <motion.div key={href} variants={fadeUp}>
              <Link
                href={href}
                className={cn(
                  "group relative flex items-center gap-3 overflow-hidden rounded-[22px] px-4 py-3.5 text-sm font-medium transition duration-300 ease-[var(--ease-premium)]",
                  active
                    ? "border border-[var(--panel-border-strong)] bg-[rgba(79,172,254,0.12)] text-[var(--text-primary)] shadow-[0_16px_34px_rgba(79,172,254,0.14),0_0_0_1px_rgba(255,255,255,0.06)_inset]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--control-bg-hover)] hover:text-[var(--text-primary)] hover:border-[var(--control-border-strong)] hover:-translate-y-[1px]",
                )}
              >
                {active ? (
                  <span className="absolute inset-y-3 left-0 w-1 rounded-full bg-[var(--accent-sky)] shadow-[0_0_8px_var(--accent-sky)]" />
                ) : null}
                <Icon className={cn("h-4 w-4", active && "text-sky-100")} />
                <span>{label}</span>
              </Link>
            </motion.div>
          );
        })}
      </nav>

      <motion.div variants={fadeUp} className="mt-auto space-y-4">
        <div className="hairline-divider" />
        <div className="panel-muted p-4">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[18px] bg-[rgba(37,231,170,0.16)] text-[var(--accent-jade)]">
              <CircleDollarSign className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">Categorization focus</p>
              <p className="text-xs text-[var(--text-secondary)]">
                Low-confidence imports and reusable rule suggestions
              </p>
            </div>
          </div>
          <Link
            href="/spending"
            className="inline-flex items-center gap-2 text-sm font-medium text-[var(--accent-jade)] transition hover:text-white"
          >
            Open review workspace
          </Link>
        </div>
      </motion.div>
    </motion.div>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex h-11 w-11 items-center justify-center rounded-[18px] bg-[var(--accent-gradient)] text-slate-950 shadow-[0_18px_40px_rgba(37,231,170,0.22)]">
        <div className="absolute inset-[1px] rounded-[17px] border border-white/30" />
        <LayoutDashboard className="relative h-5 w-5" />
      </div>
      {!compact ? (
        <div>
          <p className="text-[11px] uppercase tracking-[0.34em] text-[var(--text-muted)]">Northstar</p>
          <p className="text-lg font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
            Household OS
          </p>
        </div>
      ) : null}
    </div>
  );
}

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { workspace } = useFinanceStore();
  const quickActions = [
    { href: "/overview", label: "Open overview", detail: "Daily money command center" },
    {
      href: "/spending",
      label: "Review uncategorized transactions",
      detail: "Fix imports and create rules",
    },
    {
      href: "/advisor",
      label: `Ask ${workspace.brand.assistantName}`,
      detail: "Explain spending, portfolio, or forecasts",
    },
    {
      href: "/settings",
      label: "Manage categories and rules",
      detail: "Tune taxonomy, tags, and preferences",
    },
  ];

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Command palette"
      subtitle="Jump quickly, trigger workflow shortcuts, and keep the high-frequency actions close to the keyboard."
    >
      <div className="space-y-3">
        <div className="panel-muted px-4 py-3 text-sm leading-6 text-[var(--text-secondary)]">
          Search routes and workflows. Try &quot;review queue&quot;, &quot;portfolio&quot;, or &quot;new rule&quot;.
        </div>
        <div className="space-y-2">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              onClick={onClose}
              className="control-surface flex items-center justify-between gap-4 px-4 py-3 transition hover:-translate-y-0.5"
            >
              <div>
                <p className="font-medium text-[var(--text-primary)]">{action.label}</p>
                <p className="text-sm text-[var(--text-secondary)]">{action.detail}</p>
              </div>
              <Pill tone="accent">Go</Pill>
            </Link>
          ))}
        </div>
      </div>
    </ModalShell>
  );
}

function NotificationsTray({
  open,
  onClose,
  onMarkRead,
}: {
  open: boolean;
  onClose: () => void;
  onMarkRead: (id: string) => void;
}) {
  const { workspace } = useFinanceStore();

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[75] bg-[rgba(2,6,23,0.62)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.aside
            className="absolute right-0 top-0 h-full w-full max-w-md border-l border-[var(--panel-border)] bg-[var(--panel-strong)] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_24px_72px_rgba(2,6,23,0.46)]"
            initial={{ x: 28, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 28, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--text-muted)]">
                  Notifications
                </p>
                <h3 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
                  Signal center
                </h3>
              </div>
              <SurfaceButton variant="ghost" className="h-10 w-10 rounded-full p-0" onClick={onClose}>
                <X className="h-4 w-4" />
              </SurfaceButton>
            </div>
            <div className="space-y-3">
              {workspace.notifications.map((notification) => (
                <button
                  type="button"
                  key={notification.id}
                  onClick={() => onMarkRead(notification.id)}
                  className="control-surface flex w-full flex-col gap-2 px-4 py-4 text-left transition hover:-translate-y-0.5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-[var(--text-primary)]">{notification.title}</p>
                    {!notification.read ? <Pill tone="accent">New</Pill> : null}
                  </div>
                  <p className="text-sm leading-6 text-[var(--text-secondary)]">{notification.detail}</p>
                  <p className="text-xs text-[var(--text-muted)]">{formatRelativeTime(notification.createdAt)}</p>
                </button>
              ))}
            </div>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
