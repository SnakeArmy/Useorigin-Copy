"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight,
  ChevronRight,
  LoaderCircle,
  Search,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export const staggerContainer = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.07,
      delayChildren: 0.04,
    },
  },
};

export const fadeUp = {
  hidden: { opacity: 0, y: 18, filter: "blur(6px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      duration: 0.45,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  },
};

export const popIn = {
  hidden: { opacity: 0, scale: 0.98, y: 10 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.28,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  },
};

export function Panel({
  className,
  children,
  interactive = false,
}: {
  className?: string;
  children: React.ReactNode;
  interactive?: boolean;
}) {
  return (
    <section className={cn("panel-surface", interactive && "panel-interactive", className)}>
      {children}
    </section>
  );
}

export function SurfaceButton({
  className,
  children,
  variant = "default",
  size = "md",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "ghost" | "accent" | "danger";
  size?: "sm" | "md" | "lg";
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[18px] border font-semibold transition duration-200 ease-[var(--ease-premium)] focus-visible:outline-none focus-visible:ring-0 disabled:pointer-events-none disabled:opacity-60",
        size === "sm" && "px-3 py-2 text-xs",
        size === "md" && "px-4 py-2.5 text-sm",
        size === "lg" && "px-5 py-3 text-sm",
        variant === "default" &&
          "border-[var(--control-border)] bg-[var(--control-bg)] text-[var(--text-primary)] hover:border-[var(--control-border-strong)] hover:bg-[var(--control-bg-hover)]",
        variant === "ghost" &&
          "border-transparent bg-transparent text-[var(--text-secondary)] hover:bg-[var(--control-bg)] hover:text-[var(--text-primary)]",
        variant === "accent" &&
          "border-transparent bg-[var(--accent-gradient)] text-slate-950 shadow-[0_18px_38px_rgba(37,231,170,0.24)] hover:-translate-y-0.5 hover:brightness-105",
        variant === "danger" &&
          "border-[rgba(248,113,113,0.28)] bg-[rgba(127,29,29,0.2)] text-rose-100 hover:bg-[rgba(127,29,29,0.34)]",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Pill({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "positive" | "warning" | "danger" | "accent";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]",
        tone === "neutral" &&
          "border-[var(--control-border)] bg-[var(--control-bg)] text-[var(--text-muted)]",
        tone === "positive" &&
          "border-emerald-400/20 bg-emerald-400/10 text-emerald-100",
        tone === "warning" &&
          "border-amber-400/20 bg-amber-400/10 text-amber-100",
        tone === "danger" &&
          "border-rose-400/20 bg-rose-400/10 text-rose-100",
        tone === "accent" &&
          "border-sky-400/20 bg-sky-400/10 text-sky-100",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between"
    >
      <div className="space-y-3">
        <motion.p variants={fadeUp} className="text-[11px] uppercase tracking-[0.34em] text-[var(--text-muted)]">
          {eyebrow}
        </motion.p>
        <motion.div variants={fadeUp} className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-[-0.05em] text-[var(--text-primary)] md:text-[2.6rem]">
            {title}
          </h1>
          {description ? (
            <p className="max-w-3xl text-sm leading-7 text-[var(--text-secondary)]">
              {description}
            </p>
          ) : null}
        </motion.div>
      </div>
      {action ? <motion.div variants={fadeUp}>{action}</motion.div> : null}
    </motion.div>
  );
}

export function PanelHeader({
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex items-start justify-between gap-4", className)}>
      <div className="space-y-1.5">
        <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--text-muted)]">{eyebrow}</p>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
            {title}
          </h2>
          {description ? (
            <p className="max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {action}
    </div>
  );
}

export function FieldShell({
  className,
  icon,
  children,
}: {
  className?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("control-surface flex items-center gap-2 px-4 py-3 text-sm text-[var(--text-secondary)]", className)}>
      {icon}
      {children}
    </label>
  );
}

export function StatCard({
  title,
  value,
  delta,
  tone = "accent",
  icon: Icon,
  detail,
}: {
  title: string;
  value: string;
  delta?: string;
  tone?: "accent" | "positive" | "warning";
  icon: LucideIcon;
  detail?: string;
}) {
  return (
    <Panel interactive className="flex min-h-[166px] flex-col justify-between gap-7 p-5 md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--text-muted)]">
            {title}
          </p>
          <p className="text-[2rem] font-semibold tracking-[-0.06em] text-[var(--text-primary)]">
            {value}
          </p>
        </div>
        <div
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-[18px] border shadow-[0_16px_34px_rgba(2,6,23,0.16)]",
            tone === "accent" &&
              "border-sky-400/20 bg-sky-400/10 text-sky-100",
            tone === "positive" &&
              "border-emerald-400/20 bg-emerald-400/10 text-emerald-100",
            tone === "warning" &&
              "border-amber-400/20 bg-amber-400/10 text-amber-100",
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="flex items-end justify-between gap-4">
        {delta ? <Pill tone={tone === "warning" ? "warning" : "positive"}>{delta}</Pill> : <span />}
        {detail ? (
          <p className="max-w-[12rem] text-right text-xs leading-5 text-[var(--text-muted)]">
            {detail}
          </p>
        ) : null}
      </div>
    </Panel>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <Panel className="flex min-h-[260px] flex-col items-center justify-center gap-5 p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-[20px] border border-[var(--control-border)] bg-[var(--control-bg)] text-[var(--text-secondary)]">
        <Icon className="h-6 w-6" />
      </div>
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h3>
        <p className="max-w-sm text-sm leading-6 text-[var(--text-secondary)]">{description}</p>
      </div>
      {action}
    </Panel>
  );
}

export function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-[24px] bg-[linear-gradient(120deg,rgba(255,255,255,0.04),rgba(255,255,255,0.08),rgba(255,255,255,0.04))]",
        className,
      )}
    />
  );
}

export function ModalShell({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-[rgba(2,6,23,0.68)] p-4 backdrop-blur-md md:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          onClick={onClose}
        >
          <motion.div
            className="panel-surface w-full max-w-2xl border-[var(--panel-border-strong)] bg-[var(--panel-strong)] p-6 md:p-7"
            initial={{ opacity: 0, y: 24, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.985 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div className="space-y-1.5">
                <h3 className="text-xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
                  {title}
                </h3>
                {subtitle ? (
                  <p className="text-sm leading-6 text-[var(--text-secondary)]">{subtitle}</p>
                ) : null}
              </div>
              <SurfaceButton
                variant="ghost"
                className="h-10 w-10 rounded-full p-0"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </SurfaceButton>
            </div>
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function SearchTrigger({
  onClick,
  label = "Search or jump",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      className="control-surface flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-[var(--text-secondary)]"
      onClick={onClick}
      type="button"
    >
      <Search className="h-4 w-4 text-[var(--text-muted)]" />
      <span className="flex-1">{label}</span>
      <span className="rounded-xl border border-[var(--control-border)] bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
        Ctrl K
      </span>
    </button>
  );
}

export function InsightLink({
  href,
  title,
  detail,
}: {
  href: string;
  title: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="control-surface flex items-center justify-between gap-3 px-4 py-3 transition hover:-translate-y-0.5"
    >
      <div className="space-y-1">
        <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
        <p className="text-xs text-[var(--text-secondary)]">{detail}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
    </Link>
  );
}

export function LoadingOverlay({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[28px] bg-[rgba(4,10,24,0.74)] backdrop-blur-md">
      <div className="flex items-center gap-3 rounded-full border border-[var(--control-border)] bg-[var(--control-bg)] px-4 py-2 text-sm text-[var(--text-primary)] shadow-[0_18px_38px_rgba(2,6,23,0.22)]">
        <LoaderCircle className="h-4 w-4 animate-spin" />
        {label}
      </div>
    </div>
  );
}

export function MetricLink({
  href,
  label,
  value,
  detail,
}: {
  href: string;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="control-surface group flex items-center justify-between gap-3 px-4 py-4 transition hover:-translate-y-0.5"
    >
      <div className="space-y-1.5">
        <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">{label}</p>
        <p className="text-lg font-semibold text-[var(--text-primary)]">{value}</p>
      </div>
      <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <span>{detail}</span>
        <ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}
