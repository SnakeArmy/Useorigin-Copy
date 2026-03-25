"use client";

import { BellRing, KeyRound, SplitSquareVertical, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFinanceStore } from "@/lib/finance-store";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Panel, Pill, SectionHeading, SurfaceButton } from "@/components/ui/primitives";

export function HouseholdScreen() {
  const router = useRouter();
  const { workspace } = useFinanceStore();
  const sharedTransactions = workspace.transactions.filter((transaction) => transaction.householdOwner === "shared");

  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow="Shared finances"
        title="A household layer that reflects actual ownership and shared spending"
        description="Shared budgets, activity, and transaction allocations are now derived from the connected household members, saved edits, and shared transaction ownership."
        action={<SurfaceButton variant="accent" onClick={() => router.push("/settings")}>Manage household settings</SurfaceButton>}
      />

      <div className="grid gap-6 xl:grid-cols-[1.05fr,1fr,0.95fr]">
        <Panel className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.26em] text-[var(--text-muted)]">Household snapshot</p>
              <h2 className="mt-1 text-xl font-semibold text-white">Who owns what</h2>
            </div>
            <UsersRound className="h-4 w-4 text-[var(--text-muted)]" />
          </div>
          <div className="space-y-4">
            {workspace.members.map((member) => {
              const memberTransactions = workspace.transactions.filter((transaction) => transaction.memberId === member.id);
              return (
                <div key={member.id} className="rounded-2xl border border-white/8 bg-white/5 p-4">
                  <div className="mb-2 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-bold text-slate-950" style={{ background: member.tint }}>
                      {member.initials}
                    </div>
                    <div>
                      <p className="font-medium text-white">{member.name}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{member.role}</p>
                    </div>
                  </div>
                  <p className="text-sm leading-6 text-[var(--text-secondary)]">
                    {memberTransactions.length} transactions in range are assigned to this member. Shared ownership is inferred separately for household merchants.
                  </p>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.26em] text-[var(--text-muted)]">Shared budgets</p>
              <h2 className="mt-1 text-xl font-semibold text-white">Group visibility</h2>
            </div>
            <Pill tone="accent">{workspace.budgets.length} tracked groups</Pill>
          </div>
          <div className="space-y-4">
            {workspace.budgets.length ? (
              workspace.budgets.map((budget) => {
                const progress = budget.budget > 0 ? (budget.spent / budget.budget) * 100 : 0;
                return (
                  <div key={budget.id} className="rounded-2xl border border-white/8 bg-white/5 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">{budget.name}</p>
                        <p className="text-xs text-[var(--text-secondary)]">
                          {formatCurrency(budget.spent)} of {formatCurrency(budget.budget)}
                        </p>
                      </div>
                      <Pill tone={progress > 90 ? "warning" : "positive"}>{progress.toFixed(0)}%</Pill>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/6">
                      <div className="h-full bg-[var(--accent-gradient)]" style={{ width: `${Math.min(progress, 100)}%` }} />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-4 text-sm leading-6 text-[var(--text-secondary)]">
                No shared budgets are configured yet because no category budgets exist in the connected taxonomy.
              </div>
            )}
          </div>
        </Panel>

        <Panel className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.26em] text-[var(--text-muted)]">Coverage + access</p>
              <h2 className="mt-1 text-xl font-semibold text-white">What is grounded</h2>
            </div>
            <KeyRound className="h-4 w-4 text-[var(--text-muted)]" />
          </div>
          <div className="space-y-3">
            <CoverageRow label="Connected household members" value={workspace.members.length ? "Available" : "Missing"} tone={workspace.members.length ? "positive" : "warning"} />
            <CoverageRow label="Shared transaction ownership" value={sharedTransactions.length ? "Available" : "Sparse"} tone={sharedTransactions.length ? "positive" : "warning"} />
            <CoverageRow label="Saved household activity" value={workspace.householdActivity.length ? "Available" : "Sparse"} tone={workspace.householdActivity.length ? "positive" : "warning"} />
            <CoverageRow label="Invitation workflow" value="Manage in settings" tone="accent" />
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr,0.95fr]">
        <Panel className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.26em] text-[var(--text-muted)]">Shared activity</p>
              <h2 className="mt-1 text-xl font-semibold text-white">Timeline across the household</h2>
            </div>
            <BellRing className="h-4 w-4 text-[var(--text-muted)]" />
          </div>
          <div className="space-y-3">
            {workspace.householdActivity.length ? (
              workspace.householdActivity.map((activity) => {
                const member = workspace.members.find((item) => item.id === activity.memberId);
                return (
                  <div key={activity.id} className="rounded-2xl border border-white/8 bg-white/5 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-2xl text-xs font-bold text-slate-950" style={{ background: member?.tint || "#fff" }}>
                          {member?.initials || "NS"}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{activity.event}</p>
                          <p className="text-xs text-[var(--text-secondary)]">{member?.name}</p>
                        </div>
                      </div>
                      <p className="text-xs text-[var(--text-muted)]">{formatDate(activity.timestamp)}</p>
                    </div>
                    <p className="text-sm leading-6 text-[var(--text-secondary)]">{activity.detail}</p>
                  </div>
                );
              })
            ) : (
              <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-4 text-sm leading-6 text-[var(--text-secondary)]">
                Household activity will appear after saved transaction edits and rule creation.
              </div>
            )}
          </div>
        </Panel>

        <Panel className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.26em] text-[var(--text-muted)]">Shared transactions</p>
              <h2 className="mt-1 text-xl font-semibold text-white">Household allocations</h2>
            </div>
            <SplitSquareVertical className="h-4 w-4 text-[var(--text-muted)]" />
          </div>
          <div className="space-y-3">
            {sharedTransactions.length ? (
              sharedTransactions.slice(0, 8).map((transaction) => (
                <div key={transaction.id} className="rounded-2xl border border-white/8 bg-white/5 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">{transaction.displayMerchant}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{transaction.merchantRaw}</p>
                    </div>
                    <Pill tone="accent">{formatCurrency(Math.abs(transaction.amount))}</Pill>
                  </div>
                  {transaction.splits?.length ? (
                    <div className="space-y-2">
                      {transaction.splits.map((split) => (
                        <div key={split.id} className="flex items-center justify-between rounded-2xl bg-white/5 px-3 py-3">
                          <p className="text-sm text-white">{split.note || split.categoryId}</p>
                          <p className="text-sm text-[var(--text-secondary)]">{formatCurrency(split.amount)}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm leading-6 text-[var(--text-secondary)]">
                      This transaction is treated as shared household activity based on member ownership and merchant normalization.
                    </p>
                  )}
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-4 text-sm leading-6 text-[var(--text-secondary)]">
                No transactions are currently marked as shared household activity in the active date range.
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function CoverageRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "accent" | "positive" | "warning";
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/5 px-4 py-3">
      <p className="text-sm text-white">{label}</p>
      <Pill tone={tone}>{value}</Pill>
    </div>
  );
}
