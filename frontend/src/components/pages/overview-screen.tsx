"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowUpRight,
  Bot,
  BriefcaseBusiness,
  Clock3,
  Landmark,
  PiggyBank,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useFinanceStore, useSpendingMetrics } from "@/lib/finance-store";
import { calculateAccountSummary } from "@/lib/finance-selectors";
import { formatCurrency, sum } from "@/lib/utils";
import {
  MetricLink,
  ModalShell,
  Panel,
  PanelHeader,
  Pill,
  SectionHeading,
  StatCard,
  SurfaceButton,
  fadeUp,
  staggerContainer,
} from "@/components/ui/primitives";
import { ClientChart } from "@/components/ui/client-chart";

export function OverviewScreen() {
  const router = useRouter();
  const { workspace, selectedMemberId, askAdvisor, reviewQueue } = useFinanceStore();
  const spending = useSpendingMetrics(selectedMemberId);
  const [prompt, setPrompt] = useState("");
  const [netWorthOpen, setNetWorthOpen] = useState(false);

  const accountSummary = calculateAccountSummary(workspace);
  const recentTransactions = workspace.transactions.slice(0, 6);
  const budgetAtRisk = workspace.budgets.filter(
    (budget) => budget.budget > 0 && budget.spent / budget.budget >= 0.85,
  ).length;
  const monthlyBills = sum(workspace.bills.map((bill) => bill.amount));
  const netWorthDelta =
    workspace.netWorthHistory.length >= 2
      ? workspace.netWorthHistory.at(-1)!.netWorth - workspace.netWorthHistory.at(-2)!.netWorth
      : null;
  const cashLeft = spending.totalIncome - spending.totalSpent;

  const heroSignals = useMemo(
    () => [
      { label: "Review queue", value: `${reviewQueue.length}`, detail: "Transactions still need confirmation" },
      { label: "Recurring bills", value: `${workspace.bills.length}`, detail: "Derived from recurring merchants" },
      { label: "Members", value: `${workspace.members.length}`, detail: "Household profiles connected" },
    ],
    [reviewQueue.length, workspace.bills.length, workspace.members.length],
  );

  async function handleAsk() {
    if (!prompt.trim()) return;
    await askAdvisor(prompt);
    setPrompt("");
    router.push("/advisor");
  }

  return (
    <>
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-10">
        <SectionHeading
          eyebrow="Overview"
          title="A premium operating system for your money"
          description="Every number on this page now traces back to connected balances, normalized transactions, saved rules, or an explicit missing-data state."
          action={
            <div className="flex flex-wrap gap-2">
              <SurfaceButton variant="ghost" onClick={() => setNetWorthOpen(true)}>
                Drill into net worth
              </SurfaceButton>
              <SurfaceButton variant="ghost" onClick={() => router.push("/spending")}>
                Review queue
              </SurfaceButton>
              <SurfaceButton variant="accent" onClick={() => router.push("/advisor")}>
                Ask Atlas
              </SurfaceButton>
            </div>
          }
        />

        <motion.section variants={fadeUp} className="grid gap-6 xl:grid-cols-[1.65fr,0.95fr]">
          <Panel interactive className="relative p-6 md:p-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(37,231,170,0.16),transparent_24%),radial-gradient(circle_at_82%_18%,rgba(67,165,255,0.14),transparent_28%)]" />
            <div className="grid gap-8 xl:grid-cols-[1.08fr,0.92fr]">
              <div className="space-y-7">
                <div className="flex flex-wrap items-center gap-3">
                  <Pill tone="accent">Net worth pulse</Pill>
                  <Pill tone={workspace.meta.coverage.accountHistory ? "positive" : "warning"}>
                    {workspace.meta.coverage.accountHistory ? "History grounded" : "History building"}
                  </Pill>
                  <Pill tone="neutral">{workspace.accounts.length} linked accounts</Pill>
                </div>

                <div className="space-y-4">
                  <p className="font-display text-5xl tracking-[-0.08em] text-[var(--text-primary)] md:text-7xl">
                    {formatCurrency(accountSummary.netWorth)}
                  </p>
                  <p className="max-w-2xl text-sm leading-7 text-[var(--text-secondary)]">
                    Assets are combined from connected account balances and manual asset entries. Liabilities come from connected credit and loan balances only.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <MetricLink href="/settings" label="Liquid" value={formatCurrency(accountSummary.liquid)} detail="Checking and savings" />
                  <MetricLink href="/investments" label="Invested" value={formatCurrency(accountSummary.invested)} detail="Investment balances and assets" />
                  <MetricLink href="/planning" label="Debt" value={formatCurrency(accountSummary.liabilities)} detail="Credit and loan balances" />
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  {heroSignals.map((signal) => (
                    <div key={signal.label} className="panel-muted px-4 py-4">
                      <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">
                        {signal.label}
                      </p>
                      <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
                        {signal.value}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{signal.detail}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="panel-muted h-[320px] p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">
                        Trajectory
                      </p>
                      <p className="mt-1 text-base font-semibold text-[var(--text-primary)]">
                        Net worth history
                      </p>
                    </div>
                    <Pill tone={netWorthDelta === null ? "warning" : netWorthDelta >= 0 ? "positive" : "warning"}>
                      {netWorthDelta === null ? "1 point" : formatCurrency(netWorthDelta)}
                    </Pill>
                  </div>

                  {workspace.netWorthHistory.length >= 2 ? (
                    <div className="h-[240px]">
                      <ClientChart>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={workspace.netWorthHistory}>
                            <defs>
                              <linearGradient id="netWorthStroke" x1="0%" x2="100%">
                                <stop offset="0%" stopColor="#25e7aa" />
                                <stop offset="100%" stopColor="#43a5ff" />
                              </linearGradient>
                            </defs>
                            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                            <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} />
                            <YAxis hide />
                            <Tooltip
                              contentStyle={{
                                background: "rgba(9, 18, 34, 0.96)",
                                border: "1px solid rgba(255,255,255,0.08)",
                                borderRadius: 18,
                              }}
                              formatter={(value) => formatCurrency(Number(value ?? 0))}
                            />
                            <Line
                              type="monotone"
                              dataKey="netWorth"
                              stroke="url(#netWorthStroke)"
                              strokeWidth={3}
                              dot={false}
                              activeDot={{ r: 5, fill: "#25e7aa" }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </ClientChart>
                    </div>
                  ) : (
                    <div className="flex h-[240px] items-center justify-center text-center text-sm leading-6 text-[var(--text-secondary)]">
                      The current net worth is computed from live balances, but the chart needs more balance snapshots before it can render a trustworthy trend.
                    </div>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="panel-muted p-4">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">Budget watch</p>
                    <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{budgetAtRisk} groups pressured</p>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                      Derived from category budgets and actual expense allocations in the active range.
                    </p>
                  </div>
                  <div className="panel-muted p-4">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">Cash posture</p>
                    <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{formatCurrency(cashLeft)}</p>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                      Income minus non-transfer expenses for {workspace.transactions.length} transactions in range.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Panel>

          <Panel interactive className="flex flex-col gap-5 p-6">
            <PanelHeader
              eyebrow="Ask your finances"
              title="Data-grounded guidance"
              description="Atlas answers from the same normalized data model that powers the dashboard, not from seeded copy."
              action={
                <div className="flex h-10 w-10 items-center justify-center rounded-[18px] bg-[var(--accent-gradient)] text-slate-950">
                  <Sparkles className="h-4 w-4" />
                </div>
              }
            />

            <div className="panel-muted p-4">
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Why did spending increase this month? Which categories are largest? What changed in my net worth?"
                className="min-h-[132px] w-full resize-none bg-transparent text-sm leading-7 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
              />
            </div>

            <div className="grid gap-3">
              {workspace.insights.length ? (
                workspace.insights.map((insight) => (
                  <button
                    type="button"
                    key={insight.id}
                    onClick={() => setPrompt(insight.action)}
                    className="panel-muted text-left transition duration-200 ease-[var(--ease-premium)] hover:-translate-y-0.5 hover:border-[var(--panel-border-strong)]"
                  >
                    <div className="flex items-start justify-between gap-3 px-4 py-4">
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">{insight.title}</p>
                        <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{insight.action}</p>
                      </div>
                      <ArrowUpRight className="mt-0.5 h-4 w-4 text-[var(--text-muted)]" />
                    </div>
                  </button>
                ))
              ) : (
                <div className="panel-muted px-4 py-4 text-sm leading-6 text-[var(--text-secondary)]">
                  There are not enough recent transactions yet to synthesize insights. Atlas will stay explicit rather than inventing a story.
                </div>
              )}
            </div>

            <SurfaceButton variant="accent" size="lg" className="mt-auto w-full" onClick={handleAsk}>
              Launch advisor
            </SurfaceButton>
          </Panel>
        </motion.section>

        <motion.section variants={fadeUp} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Cash flow"
            value={formatCurrency(cashLeft)}
            delta={`${formatCurrency(spending.totalIncome)} inflow`}
            detail={`${spending.transactionCount} tracked transactions`}
            tone={cashLeft >= 0 ? "positive" : "warning"}
            icon={Wallet}
          />
          <StatCard
            title="Average expense"
            value={formatCurrency(spending.averageExpense)}
            delta={`${formatCurrency(spending.totalSpent)} spent`}
            tone="warning"
            detail="Excludes transfers and hidden budget items"
            icon={Landmark}
          />
          <StatCard
            title="Liabilities"
            value={formatCurrency(accountSummary.liabilities)}
            delta={workspace.accounts.filter((account) => account.type === "credit" || account.type === "loan" || account.type === "mortgage").length.toString()}
            detail="Connected debt accounts"
            tone="accent"
            icon={BriefcaseBusiness}
          />
          <StatCard
            title="Recurring bills"
            value={formatCurrency(monthlyBills)}
            delta={`${workspace.bills.length} detected`}
            detail="Estimated from recurring merchants"
            tone="positive"
            icon={PiggyBank}
          />
        </motion.section>

        <motion.section variants={fadeUp} className="grid gap-6 xl:grid-cols-[1.3fr,1fr]">
          <Panel interactive className="p-6">
            <PanelHeader
              eyebrow="Cash flow"
              title="Income vs spending"
              description="This chart is derived entirely from normalized transactions in the active date range."
              action={<Pill tone={cashLeft >= 0 ? "positive" : "warning"}>{formatCurrency(cashLeft)} left over</Pill>}
            />
            {workspace.cashFlowHistory.length ? (
              <div className="h-[280px]">
                <ClientChart>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={workspace.cashFlowHistory}>
                      <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} />
                      <YAxis hide />
                      <Tooltip
                        contentStyle={{
                          background: "rgba(9, 18, 34, 0.96)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: 18,
                        }}
                        formatter={(value) => formatCurrency(Number(value ?? 0))}
                      />
                      <Bar radius={[12, 12, 0, 0]} dataKey="income" fill="#25e7aa" />
                      <Bar radius={[12, 12, 0, 0]} dataKey="expenses" fill="#43a5ff" />
                    </BarChart>
                  </ResponsiveContainer>
                </ClientChart>
              </div>
            ) : (
              <div className="py-14 text-center text-sm leading-6 text-[var(--text-secondary)]">
                No dated income and expense activity is available yet for the selected range.
              </div>
            )}
          </Panel>

          <Panel interactive className="p-6">
            <PanelHeader
              eyebrow="Budget health"
              title="Group pressure"
              description="Group totals are aggregated from category budgets and actual category allocations."
              action={<Pill tone={budgetAtRisk ? "warning" : "positive"}>{budgetAtRisk} at risk</Pill>}
            />
            <div className="space-y-3">
              {workspace.budgets.length ? (
                workspace.budgets.map((budget) => {
                  const usage = budget.budget > 0 ? (budget.spent / budget.budget) * 100 : 0;
                  return (
                    <div key={budget.id} className="panel-muted px-4 py-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-[var(--text-primary)]">{budget.name}</p>
                          <p className="text-xs text-[var(--text-secondary)]">
                            {formatCurrency(budget.spent)} of {formatCurrency(budget.budget)}
                          </p>
                        </div>
                        <Pill tone={usage >= 100 ? "warning" : "positive"}>{usage.toFixed(0)}%</Pill>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/6">
                        <div
                          className={usage >= 100 ? "bg-[var(--accent-amber)]" : "bg-[var(--accent-jade)]"}
                          style={{ width: `${Math.min(100, usage)}%`, height: "100%" }}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="panel-muted px-4 py-4 text-sm leading-6 text-[var(--text-secondary)]">
                  No category budgets are configured yet.
                </div>
              )}
            </div>
          </Panel>
        </motion.section>

        <motion.section variants={fadeUp} className="grid gap-6 xl:grid-cols-[1.1fr,0.92fr,0.92fr]">
          <Panel interactive className="p-6">
            <PanelHeader
              eyebrow="Recent transactions"
              title="What moved recently"
              action={
                <SurfaceButton variant="ghost" onClick={() => router.push("/spending")}>
                  View all
                </SurfaceButton>
              }
            />
            <div className="space-y-3">
              {recentTransactions.length ? (
                recentTransactions.map((transaction, index) => (
                  <motion.div
                    key={transaction.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                    className="panel-muted flex items-center justify-between gap-4 px-4 py-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--text-primary)]">{transaction.displayMerchant}</p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {transaction.postedAt} | {transaction.typeLabel}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        {transaction.amount < 0 ? "-" : "+"}
                        {formatCurrency(Math.abs(transaction.amount))}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)]">{transaction.confidenceReason}</p>
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="panel-muted px-4 py-4 text-sm leading-6 text-[var(--text-secondary)]">
                  No transactions are available for the selected date range.
                </div>
              )}
            </div>
          </Panel>

          <Panel interactive className="p-6">
            <PanelHeader eyebrow="Upcoming bills" title="Near-term obligations" action={<Clock3 className="h-4 w-4 text-[var(--text-muted)]" />} />
            <div className="space-y-3">
              {workspace.bills.length ? (
                workspace.bills.map((bill) => (
                  <div key={bill.id} className="panel-muted px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">{bill.merchant}</p>
                        <p className="text-xs text-[var(--text-secondary)]">
                          Expected around {bill.dueDate.slice(0, 10)} | {bill.frequency}
                        </p>
                      </div>
                      <Pill tone={bill.autopay ? "positive" : "warning"}>{bill.autopay ? "Autopay" : "Manual"}</Pill>
                    </div>
                    <div className="mt-4 flex items-end justify-between">
                      <p className="text-lg font-semibold text-[var(--text-primary)]">{formatCurrency(bill.amount)}</p>
                      <p className="text-xs text-[var(--text-muted)]">Detected recurring spend</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="panel-muted px-4 py-4 text-sm leading-6 text-[var(--text-secondary)]">
                  No recurring merchants were reliable enough to promote into the bills list yet.
                </div>
              )}
            </div>
          </Panel>

          <Panel interactive className="p-6">
            <PanelHeader eyebrow="Household" title="Shared momentum" action={<Users className="h-4 w-4 text-[var(--text-muted)]" />} />
            <div className="space-y-4">
              <div className="panel-muted p-4">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex -space-x-2">
                    {workspace.members.map((member) => (
                      <div
                        key={member.id}
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-950 text-xs font-bold text-slate-950"
                        style={{ background: member.tint }}
                      >
                        {member.initials}
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">Household activity feed</p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Derived from persisted rules and saved transaction edits.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  {workspace.householdActivity.length ? (
                    workspace.householdActivity.slice(0, 4).map((activity) => (
                      <div key={activity.id} className="rounded-[20px] border border-[var(--control-border)] bg-white/5 px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm text-[var(--text-primary)]">{activity.event}</p>
                            <p className="text-xs text-[var(--text-secondary)]">{activity.detail}</p>
                          </div>
                          <ArrowUpRight className="h-4 w-4 text-[var(--text-muted)]" />
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[var(--text-secondary)]">No recent shared activity has been recorded yet.</p>
                  )}
                </div>
              </div>

              <div className="panel-muted p-4">
                <div className="mb-4 flex items-center gap-2">
                  <Bot className="h-4 w-4 text-[var(--accent-jade)]" />
                  <p className="text-sm font-medium text-[var(--text-primary)]">Current insights</p>
                </div>
                <div className="space-y-3">
                  {workspace.insights.length ? (
                    workspace.insights.map((insight) => (
                      <div key={insight.id}>
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm text-[var(--text-primary)]">{insight.title}</p>
                            <p className="text-xs text-[var(--text-secondary)]">{insight.body}</p>
                          </div>
                          <Pill tone={insight.sentiment === "watch" ? "warning" : insight.sentiment === "positive" ? "positive" : "accent"}>
                            {insight.sentiment}
                          </Pill>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[var(--text-secondary)]">Insights will appear once enough account and transaction history is available.</p>
                  )}
                </div>
              </div>
            </div>
          </Panel>
        </motion.section>
      </motion.div>

      <NetWorthModal
        open={netWorthOpen}
        onClose={() => setNetWorthOpen(false)}
        workspace={workspace}
        liquid={accountSummary.liquid}
        invested={accountSummary.invested}
        otherAssets={accountSummary.otherAssets}
        liabilities={accountSummary.liabilities}
        netWorth={accountSummary.netWorth}
      />
    </>
  );
}

function NetWorthModal({
  open,
  onClose,
  workspace,
  liquid,
  invested,
  otherAssets,
  liabilities,
  netWorth,
}: {
  open: boolean;
  onClose: () => void;
  workspace: ReturnType<typeof useFinanceStore>["workspace"];
  liquid: number;
  invested: number;
  otherAssets: number;
  liabilities: number;
  netWorth: number;
}) {
  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Net worth breakdown"
      subtitle="Every component here is derived from connected account balances or manual asset entries."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <BreakdownCard label="Net worth" value={formatCurrency(netWorth)} detail="Assets minus liabilities" />
        <BreakdownCard label="Liquid" value={formatCurrency(liquid)} detail="Checking and savings accounts" />
        <BreakdownCard label="Invested" value={formatCurrency(invested)} detail="Investment balances and investment assets" />
        <BreakdownCard label="Other assets" value={formatCurrency(otherAssets)} detail="Property, vehicles, and other manual assets" />
        <BreakdownCard label="Liabilities" value={formatCurrency(liabilities)} detail="Credit, mortgage, and loan balances" />
        <BreakdownCard
          label="History coverage"
          value={workspace.meta.coverage.accountHistory ? "Grounded" : "Building"}
          detail={
            workspace.meta.coverage.accountHistory
              ? `${workspace.netWorthHistory.length} monthly points available`
              : "More balance snapshots are needed for trend history."
          }
        />
      </div>
    </ModalShell>
  );
}

function BreakdownCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.22em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{value}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{detail}</p>
    </div>
  );
}
