"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRight,
  Bot,
  FolderCog,
  RefreshCcw,
  Repeat,
  Search,
  ShieldCheck,
  Sparkles,
  Tag,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useFinanceStore } from "@/lib/finance-store";
import { getCategoryLabel } from "@/lib/categorization";
import type { CategorizationRule, TransactionRecord } from "@/lib/finance-types";
import { formatCurrency, formatDate, groupBy, sum, titleCase } from "@/lib/utils";
import { ClientChart } from "@/components/ui/client-chart";
import {
  EmptyState,
  FieldShell,
  ModalShell,
  Panel,
  PanelHeader,
  Pill,
  SectionHeading,
  SurfaceButton,
  fadeUp,
  staggerContainer,
} from "@/components/ui/primitives";

const COLORS = ["#25e7aa", "#43a5ff", "#f7b500", "#7c8cf8", "#fb7185", "#14b8a6"];

export function SpendingScreen() {
  const router = useRouter();
  const {
    workspace,
    categoryPerformance,
    reviewQueue,
    spendingSearch,
    deferredSpendingSearch,
    setSpendingSearch,
    updateTransaction,
    bulkUpdateTransactions,
    addRule,
    askAdvisor,
  } = useFinanceStore();
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [ruleTransactionId, setRuleTransactionId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<"all" | "expense" | "income" | "transfer">("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "needs-review" | "rule-applied" | "user-corrected" | "high-confidence"
  >("all");
  const [selectedTag, setSelectedTag] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [reviewIndex, setReviewIndex] = useState(0);

  const rootCategories = workspace.categories.filter((category) => !category.parentId);
  const tagMap = Object.fromEntries(workspace.tags.map((tag) => [tag.id, tag.name]));

  const filteredTransactions = useMemo(
    () =>
      workspace.transactions.filter((transaction) => {
        const query = deferredSpendingSearch.toLowerCase();
        const haystack = `${transaction.displayMerchant} ${transaction.description} ${transaction.merchantRaw}`.toLowerCase();
        return (
          (!query || haystack.includes(query)) &&
          (typeFilter === "all" || transaction.direction === typeFilter) &&
          (statusFilter === "all" || transaction.confidenceStatus === statusFilter) &&
          (selectedTag === "all" || transaction.tags.includes(selectedTag)) &&
          (selectedCategory === "all" || transaction.categoryId === selectedCategory)
        );
      }),
    [deferredSpendingSearch, selectedCategory, selectedTag, statusFilter, typeFilter, workspace.transactions],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!reviewQueue.length) return;
      const tag = (event.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const transaction = reviewQueue[reviewIndex];
      if (!transaction) return;
      if (event.key.toLowerCase() === "a") {
        event.preventDefault();
        updateTransaction(transaction.id, {
          categoryId: transaction.suggestedCategoryId || transaction.categoryId,
        });
      }
      if (event.key.toLowerCase() === "e") {
        event.preventDefault();
        setSelectedTransactionId(transaction.id);
      }
      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        setReviewIndex((current) => (current + 1) % reviewQueue.length);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [reviewIndex, reviewQueue, updateTransaction]);

  const merchantTotals = Object.entries(
    groupBy(
      workspace.transactions.filter((transaction) => transaction.direction === "expense"),
      (transaction) => transaction.displayMerchant,
    ),
  )
    .map(([merchant, transactions]) => ({
      merchant,
      total: transactions.reduce((acc, transaction) => acc + Math.abs(transaction.amount), 0),
      count: transactions.length,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const subscriptions = workspace.transactions
    .filter((transaction) => transaction.badges.includes("subscription"))
    .slice(0, 4);
  const ruleAppliedCount = workspace.transactions.filter(
    (transaction) => transaction.confidenceStatus === "rule-applied",
  ).length;
  const correctedCount = workspace.transactions.filter(
    (transaction) => transaction.confidenceStatus === "user-corrected",
  ).length;
  const reviewAmount = sum(reviewQueue.map((transaction) => Math.abs(transaction.amount)));
  const reviewFocused = reviewQueue[reviewIndex] ?? reviewQueue[0] ?? null;

  const selectedTransaction =
    workspace.transactions.find((transaction) => transaction.id === selectedTransactionId) ?? null;
  const ruleTransaction =
    workspace.transactions.find((transaction) => transaction.id === ruleTransactionId) ?? null;

  function resetView() {
    setTypeFilter("all");
    setStatusFilter("all");
    setSelectedTag("all");
    setSelectedCategory("all");
    setSpendingSearch("");
    setSelectedRows([]);
  }

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="space-y-10"
    >
      <SectionHeading
        eyebrow="Spending intelligence"
        title="Categorize quickly, then turn corrections into rules"
        description="This workspace connects transaction review, recurring detection, budgeting, reporting, and AI-guided categorization into one focused flow."
        action={
          <div className="flex flex-wrap gap-2">
            <SurfaceButton variant="ghost" onClick={resetView}>
              <RefreshCcw className="h-4 w-4" />
              Reset view
            </SurfaceButton>
            <SurfaceButton
              variant="accent"
              onClick={() => setRuleTransactionId((reviewFocused ?? workspace.transactions[0])?.id ?? null)}
            >
              <FolderCog className="h-4 w-4" />
              New rule
            </SurfaceButton>
          </div>
        }
      />

      <motion.section variants={fadeUp} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Needs review" value={`${reviewQueue.length}`} detail={`${formatCurrency(reviewAmount)} waiting for confirmation`} tone="warning" />
        <SummaryCard label="Rules applied" value={`${ruleAppliedCount}`} detail="Automatic matches are flowing into reporting" tone="accent" />
        <SummaryCard label="User corrected" value={`${correctedCount}`} detail="Past corrections are reinforcing future confidence" tone="positive" />
        <SummaryCard label="Subscriptions found" value={`${subscriptions.length}`} detail="Recurring spend surfaced for budget planning" tone="accent" />
      </motion.section>

      <motion.section variants={fadeUp} className="grid gap-6 xl:grid-cols-[1.35fr,1fr]">
        <Panel interactive className="p-6">
          <PanelHeader
            eyebrow="Category analytics"
            title="Budget vs actual"
            description="Budget variance and category weight stay visible while you work through transaction cleanup."
            action={
              <Pill tone="accent">
                {formatCurrency(categoryPerformance.reduce((acc, item) => acc + item.spent, 0))}
              </Pill>
            }
          />
          <div className="grid gap-4 lg:grid-cols-[1.02fr,0.98fr]">
            <div className="panel-muted h-[340px] p-4">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-medium text-[var(--text-primary)]">Top category spend</p>
                <Pill tone="neutral">Monthly</Pill>
              </div>
              <ClientChart>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={categoryPerformance.slice(0, 6).map((item) => ({
                      name: getCategoryLabel(workspace.categories, item.categoryId),
                      spent: item.spent,
                      budget: item.budget,
                    }))}
                  >
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{
                        background: "rgba(9,18,34,0.96)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 18,
                      }}
                      formatter={(value) => formatCurrency(Number(value ?? 0))}
                    />
                    <Bar dataKey="spent" radius={[12, 12, 0, 0]} fill="#43a5ff" />
                    <Bar dataKey="budget" radius={[12, 12, 0, 0]} fill="#25e7aa" opacity={0.55} />
                  </BarChart>
                </ResponsiveContainer>
              </ClientChart>
            </div>

            <div className="space-y-4">
              <div className="panel-muted h-[220px] p-4">
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm font-medium text-[var(--text-primary)]">Share of spend</p>
                  <Pill tone="neutral">Top 6</Pill>
                </div>
                <ClientChart>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryPerformance.slice(0, 6).map((item) => ({
                          name: getCategoryLabel(workspace.categories, item.categoryId),
                          value: item.spent,
                        }))}
                        dataKey="value"
                        innerRadius={62}
                        outerRadius={92}
                        paddingAngle={2}
                        stroke="none"
                      >
                        {categoryPerformance.slice(0, 6).map((item, index) => (
                          <Cell key={item.categoryId} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "rgba(9,18,34,0.96)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: 18,
                        }}
                        formatter={(value) => formatCurrency(Number(value ?? 0))}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </ClientChart>
              </div>

              <div className="space-y-2">
                {categoryPerformance.slice(0, 4).map((item, index) => {
                  const ratio = item.budget ? Math.min(100, (item.spent / item.budget) * 100) : 100;
                  return (
                    <div key={item.categoryId} className="panel-muted px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          />
                          <div>
                            <p className="text-sm font-medium text-[var(--text-primary)]">
                              {getCategoryLabel(workspace.categories, item.categoryId)}
                            </p>
                            <p className="text-xs text-[var(--text-secondary)]">
                              {formatCurrency(item.spent)} vs {formatCurrency(item.budget)}
                            </p>
                          </div>
                        </div>
                        <Pill tone={item.delta < 0 ? "warning" : "positive"}>{ratio.toFixed(0)}%</Pill>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Panel>

        <Panel interactive className="p-6">
          <PanelHeader
            eyebrow="Review queue"
            title="Low-confidence transactions"
            description="The fastest correction path is surfaced first, with keyboard shortcuts and rule actions kept close."
            action={<Pill tone="warning">{reviewQueue.length} pending</Pill>}
          />
          {reviewQueue.length ? (
            <div className="space-y-4">
              {reviewQueue.slice(0, 3).map((transaction, index) => (
                <div
                  key={transaction.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setReviewIndex(index)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setReviewIndex(index);
                    }
                  }}
                  className={cnReviewCard(reviewIndex === index)}
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{transaction.displayMerchant}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{transaction.merchantRaw}</p>
                    </div>
                    <Pill tone="warning">{Math.round(transaction.confidenceScore * 100)}%</Pill>
                  </div>
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <Pill tone="neutral">{titleCase(transaction.householdOwner)}</Pill>
                    {transaction.suggestedCategoryId ? (
                      <Pill tone="accent">
                        Suggested {getCategoryLabel(workspace.categories, transaction.suggestedCategoryId)}
                      </Pill>
                    ) : null}
                  </div>
                  <p className="mb-4 text-sm leading-6 text-[var(--text-secondary)]">
                    {transaction.confidenceReason}
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-lg font-semibold text-[var(--text-primary)]">
                      {formatCurrency(Math.abs(transaction.amount))}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <SurfaceButton
                        variant="accent"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          updateTransaction(transaction.id, {
                            categoryId: transaction.suggestedCategoryId || transaction.categoryId,
                          });
                        }}
                      >
                        Approve
                      </SurfaceButton>
                      <SurfaceButton
                        variant="ghost"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedTransactionId(transaction.id);
                        }}
                      >
                        Edit
                      </SurfaceButton>
                      <SurfaceButton
                        variant="ghost"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          setRuleTransactionId(transaction.id);
                        }}
                      >
                        Rule
                      </SurfaceButton>
                    </div>
                  </div>
                </div>
              ))}

              <div className="panel-muted flex items-center justify-between gap-3 px-4 py-3">
                <p className="text-sm text-[var(--text-secondary)]">
                  Keyboard flow: <span className="text-[var(--text-primary)]">A</span> approve, <span className="text-[var(--text-primary)]">E</span> edit, <span className="text-[var(--text-primary)]">N</span> next
                </p>
                <Repeat className="h-4 w-4 text-[var(--text-muted)]" />
              </div>
            </div>
          ) : (
            <EmptyState
              icon={ShieldCheck}
              title="Queue is clear"
              description="Every imported transaction is either rule-backed or user-confirmed."
            />
          )}
        </Panel>
      </motion.section>

      <motion.section variants={fadeUp} className="grid gap-6 xl:grid-cols-[1fr,1fr,1fr]">
        <MetricPanel
          eyebrow="Recurring"
          title="Detected subscriptions"
          icon={<Repeat className="h-4 w-4 text-[var(--text-muted)]" />}
          items={subscriptions.map((transaction) => ({
            title: transaction.displayMerchant,
            detail: formatDate(transaction.postedAt),
            value: formatCurrency(Math.abs(transaction.amount)),
          }))}
          emptyCopy="No subscriptions have been surfaced yet."
        />
        <MetricPanel
          eyebrow="Top merchants"
          title="Merchant drill-down"
          icon={<Tag className="h-4 w-4 text-[var(--text-muted)]" />}
          items={merchantTotals.map((merchant) => ({
            title: merchant.merchant,
            detail: `${merchant.count} transactions`,
            value: formatCurrency(merchant.total),
          }))}
          emptyCopy="Merchant clusters will appear as transactions accumulate."
        />
        <Panel interactive className="p-6">
          <PanelHeader
            eyebrow="AI categorization layer"
            title="Decision support"
            description="The system explains confidence, proposes rules from repeated fixes, and helps clean merchant families."
            action={<Bot className="h-4 w-4 text-[var(--text-muted)]" />}
          />
          <div className="space-y-3">
            <div className="panel-muted px-4 py-4 text-sm leading-6 text-[var(--text-secondary)]">
              {reviewQueue.length
                ? `${reviewQueue.length} transactions still need confirmation, so this page will keep getting more accurate as you clear the queue.`
                : "The review queue is clear, so the spending analytics on this page are already based on confirmed or rule-backed transactions."}
            </div>
            <div className="panel-muted px-4 py-4 text-sm leading-6 text-[var(--text-secondary)]">
              {categoryPerformance[0]
                ? `${getCategoryLabel(workspace.categories, categoryPerformance[0].categoryId)} is currently the largest category at ${formatCurrency(categoryPerformance[0].spent)}.`
                : "Category analytics will populate once expense transactions appear in the active date range."}
            </div>
            <div className="panel-muted px-4 py-4 text-sm leading-6 text-[var(--text-secondary)]">
              Rules, tags, recurring flags, and hidden-from-budget decisions are persisted instead of living only in visual state.
            </div>
          </div>
          <SurfaceButton
            variant="ghost"
            className="mt-4 w-full"
            onClick={async () => {
              await askAdvisor("What should I review in my categorization queue first?");
              router.push("/advisor");
            }}
          >
            <Sparkles className="h-4 w-4" />
            Open AI advisor
          </SurfaceButton>
        </Panel>
      </motion.section>

      <motion.section variants={fadeUp}>
        <Panel interactive className="p-6">
          <PanelHeader
            eyebrow="Transaction feed"
            title="Inline categorization, tags, and bulk actions"
            description="Search, filter, review, and correct transactions without leaving the table. The goal is speed, not modal dependency."
          />

          <div className="panel-muted mb-5 p-3">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <FieldShell icon={<Search className="h-4 w-4 text-[var(--text-muted)]" />}>
                <input
                  value={spendingSearch}
                  onChange={(event) => setSpendingSearch(event.target.value)}
                  placeholder="Search merchant or import string"
                  className="w-full bg-transparent text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                />
              </FieldShell>
              <FilterSelect value={typeFilter} onChange={(value) => setTypeFilter(value as typeof typeFilter)} options={["all", "expense", "income", "transfer"]} />
              <FilterSelect value={statusFilter} onChange={(value) => setStatusFilter(value as typeof statusFilter)} options={["all", "needs-review", "rule-applied", "user-corrected", "high-confidence"]} />
              <FilterSelect value={selectedTag} onChange={setSelectedTag} options={["all", ...workspace.tags.map((tag) => tag.id)]} labelMap={tagMap} />
              <FilterSelect value={selectedCategory} onChange={setSelectedCategory} options={["all", ...rootCategories.map((category) => category.id)]} labelMap={Object.fromEntries(workspace.categories.map((category) => [category.id, category.name]))} />
            </div>
          </div>

          {selectedRows.length ? (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[24px] border border-sky-400/20 bg-sky-400/10 px-4 py-3">
              <Pill tone="accent">{selectedRows.length} selected</Pill>
              <select
                defaultValue=""
                onChange={(event) => {
                  if (!event.target.value) return;
                  bulkUpdateTransactions(selectedRows, { categoryId: event.target.value });
                  event.currentTarget.value = "";
                }}
                className="control-surface px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
              >
                <option className="bg-slate-950" value="">
                  Set category
                </option>
                {rootCategories.map((category) => (
                  <option className="bg-slate-950" key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <SurfaceButton variant="ghost" onClick={() => setSelectedRows([])}>
                Clear selection
              </SurfaceButton>
            </div>
          ) : null}

          <TransactionsTable
            transactions={filteredTransactions}
            selectedRows={selectedRows}
            onToggleRow={(id) =>
              setSelectedRows((current) =>
                current.includes(id) ? current.filter((row) => row !== id) : [...current, id],
              )
            }
            onToggleAll={(checked) =>
              setSelectedRows(checked ? filteredTransactions.map((transaction) => transaction.id) : [])
            }
            onEdit={setSelectedTransactionId}
            onRule={setRuleTransactionId}
          />
        </Panel>
      </motion.section>

      <TransactionModal
        transaction={selectedTransaction}
        onClose={() => setSelectedTransactionId(null)}
        onOpenRule={() => selectedTransaction && setRuleTransactionId(selectedTransaction.id)}
        onExplain={async (transaction) => {
          await askAdvisor(`Why was ${transaction.displayMerchant} categorized this way?`);
          router.push("/advisor");
        }}
        onMarkSubscription={async (transaction) => {
          await updateTransaction(
            transaction.id,
            {
              categoryId: "subscriptions",
              recurring: true,
            },
            { createRule: true },
          );
        }}
      />
      <RuleModal
        key={ruleTransaction?.id ?? "rule-modal"}
        transaction={ruleTransaction}
        onClose={() => setRuleTransactionId(null)}
        onCreate={(rule) => addRule(rule)}
      />
    </motion.div>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "accent" | "positive" | "warning";
}) {
  return (
    <Panel interactive className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-[-0.06em] text-[var(--text-primary)]">{value}</p>
        </div>
        <Pill tone={tone}>{label}</Pill>
      </div>
      <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{detail}</p>
    </Panel>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
  labelMap = {},
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  labelMap?: Record<string, string>;
}) {
  return (
    <FieldShell>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full bg-transparent text-[var(--text-primary)] outline-none"
      >
        {options.map((option) => (
          <option className="bg-slate-950" key={option} value={option}>
            {labelMap[option] || titleCase(option.replace(/-/g, " "))}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

function MetricPanel({
  eyebrow,
  title,
  items,
  icon,
  emptyCopy,
}: {
  eyebrow: string;
  title: string;
  items: { title: string; detail: string; value: string }[];
  icon?: React.ReactNode;
  emptyCopy: string;
}) {
  return (
    <Panel interactive className="p-6">
      <PanelHeader eyebrow={eyebrow} title={title} action={icon} />
      <div className="space-y-3">
        {items.length ? (
          items.map((item) => (
            <div key={`${item.title}-${item.detail}`} className="panel-muted px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{item.title}</p>
                  <p className="text-xs text-[var(--text-secondary)]">{item.detail}</p>
                </div>
                <Pill tone="accent">{item.value}</Pill>
              </div>
            </div>
          ))
        ) : (
          <div className="panel-muted px-4 py-4 text-sm leading-6 text-[var(--text-secondary)]">
            {emptyCopy}
          </div>
        )}
      </div>
    </Panel>
  );
}

function TransactionsTable({
  transactions,
  selectedRows,
  onToggleRow,
  onToggleAll,
  onEdit,
  onRule,
}: {
  transactions: TransactionRecord[];
  selectedRows: string[];
  onToggleRow: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  onEdit: (id: string) => void;
  onRule: (id: string) => void;
}) {
  const { workspace, updateTransaction } = useFinanceStore();

  return (
    <div className="overflow-hidden rounded-[28px] border border-[var(--control-border)]">
      <div className="overflow-x-auto">
        <table className="min-w-[1240px] w-full text-left">
          <thead className="bg-[rgba(4,10,24,0.58)] text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">
            <tr>
              <th className="px-4 py-4">
                <input
                  type="checkbox"
                  checked={selectedRows.length === transactions.length && transactions.length > 0}
                  onChange={(event) => onToggleAll(event.target.checked)}
                />
              </th>
              <th className="px-4 py-4">Merchant</th>
              <th className="px-4 py-4">Type</th>
              <th className="px-4 py-4">Categorization</th>
              <th className="px-4 py-4">Confidence</th>
              <th className="px-4 py-4 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/8 bg-[rgba(4,10,24,0.22)]">
            {transactions.length ? (
              transactions.map((transaction) => (
                <tr
                  key={transaction.id}
                  className={selectedRows.includes(transaction.id) ? "bg-sky-400/6" : "transition hover:bg-white/4"}
                >
                  <td className="px-4 py-4 align-top">
                    <input
                      type="checkbox"
                      checked={selectedRows.includes(transaction.id)}
                      onChange={() => onToggleRow(transaction.id)}
                    />
                  </td>
                  <td className="px-4 py-4 align-top">
                    <button type="button" onClick={() => onEdit(transaction.id)} className="text-left">
                      <p className="text-sm font-medium text-[var(--text-primary)]">{transaction.displayMerchant}</p>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        {formatDate(transaction.postedAt)} | {titleCase(transaction.householdOwner)} | {transaction.merchantRaw}
                      </p>
                    </button>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <select
                      value={transaction.direction}
                      onChange={(event) =>
                        updateTransaction(transaction.id, {
                          direction: event.target.value as TransactionRecord["direction"],
                        })
                      }
                      className="control-surface min-w-[130px] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                    >
                      <option className="bg-slate-950" value="expense">
                        Expense
                      </option>
                      <option className="bg-slate-950" value="income">
                        Income
                      </option>
                      <option className="bg-slate-950" value="transfer">
                        Transfer
                      </option>
                    </select>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <select
                          value={transaction.categoryId || ""}
                          onChange={(event) =>
                            updateTransaction(transaction.id, { categoryId: event.target.value || null })
                          }
                          className="control-surface min-w-[180px] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                        >
                          <option className="bg-slate-950" value="">
                            Unassigned
                          </option>
                          {workspace.categories
                            .filter((category) => !category.parentId)
                            .map((category) => (
                              <option className="bg-slate-950" key={category.id} value={category.id}>
                                {category.name}
                              </option>
                            ))}
                        </select>
                        <SurfaceButton variant="ghost" size="sm" onClick={() => onRule(transaction.id)}>
                          Rule
                        </SurfaceButton>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {transaction.tags.map((tagId) => (
                          <button
                            type="button"
                            key={tagId}
                            onClick={() =>
                              updateTransaction(transaction.id, {
                                tags: transaction.tags.filter((item) => item !== tagId),
                              })
                            }
                          >
                            <Pill tone="neutral">{workspace.tags.find((tag) => tag.id === tagId)?.name ?? tagId}</Pill>
                          </button>
                        ))}
                        <select
                          defaultValue=""
                          onChange={(event) => {
                            const nextTag = event.target.value;
                            if (!nextTag || transaction.tags.includes(nextTag)) return;
                            updateTransaction(transaction.id, {
                              tags: [...transaction.tags, nextTag],
                            });
                            event.currentTarget.value = "";
                          }}
                          className="control-surface px-3 py-1.5 text-xs text-[var(--text-primary)] outline-none"
                        >
                          <option className="bg-slate-950" value="">
                            Add tag
                          </option>
                          {workspace.tags.map((tag) => (
                            <option className="bg-slate-950" key={tag.id} value={tag.id}>
                              {tag.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="space-y-2">
                      <Pill tone={toneForConfidence(transaction.confidenceStatus)}>
                        {titleCase(transaction.confidenceStatus.replace(/-/g, " "))}
                      </Pill>
                      <p className="max-w-[220px] text-xs leading-5 text-[var(--text-secondary)]">
                        {transaction.confidenceReason}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top text-right">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {formatCurrency(Math.abs(transaction.amount))}
                    </p>
                    <div className="mt-2 flex flex-wrap justify-end gap-1">
                      {transaction.badges.slice(0, 3).map((badge) => (
                        <Pill key={badge} tone={toneForBadge(badge)}>
                          {badge}
                        </Pill>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => onEdit(transaction.id)}
                      className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
                    >
                      Open detail
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-6 py-12">
                  <div className="panel-muted flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
                    <p className="text-lg font-semibold text-[var(--text-primary)]">No transactions match these filters</p>
                    <p className="max-w-lg text-sm leading-6 text-[var(--text-secondary)]">
                      Relax the filter set or clear the search query to bring transactions back into the feed.
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TransactionModal({
  transaction,
  onClose,
  onOpenRule,
  onExplain,
  onMarkSubscription,
}: {
  transaction: TransactionRecord | null;
  onClose: () => void;
  onOpenRule: () => void;
  onExplain: (transaction: TransactionRecord) => Promise<void>;
  onMarkSubscription: (transaction: TransactionRecord) => Promise<void>;
}) {
  const { workspace } = useFinanceStore();
  if (!transaction) return null;

  return (
    <ModalShell
      open={Boolean(transaction)}
      onClose={onClose}
      title={transaction.displayMerchant}
      subtitle="Inspect source data, normalized merchant logic, and the audit history behind each categorization decision."
    >
      <div className="grid gap-4 lg:grid-cols-[1fr,0.95fr]">
        <div className="space-y-4">
          <div className="panel-muted p-4">
            <p className="mb-3 text-sm font-medium text-[var(--text-primary)]">Import context</p>
            <InfoRow label="Original" value={transaction.merchantRaw} />
            <InfoRow label="Normalized" value={transaction.merchantNormalized} />
            <InfoRow label="Category" value={getCategoryLabel(workspace.categories, transaction.categoryId)} />
            <InfoRow label="Confidence" value={`${Math.round(transaction.confidenceScore * 100)}%`} />
            <InfoRow label="Owner" value={titleCase(transaction.householdOwner)} />
          </div>

          <div className="panel-muted p-4">
            <p className="mb-3 text-sm font-medium text-[var(--text-primary)]">Labels and badges</p>
            <div className="flex flex-wrap gap-2">
              {transaction.tags.map((tagId) => (
                <Pill key={tagId} tone="neutral">
                  {workspace.tags.find((tag) => tag.id === tagId)?.name ?? tagId}
                </Pill>
              ))}
              {transaction.badges.map((badge) => (
                <Pill key={badge} tone={toneForBadge(badge)}>
                  {badge}
                </Pill>
              ))}
              {!transaction.tags.length && !transaction.badges.length ? (
                <p className="text-sm text-[var(--text-secondary)]">No extra labels applied.</p>
              ) : null}
            </div>
          </div>

          <div className="panel-muted p-4">
            <p className="mb-3 text-sm font-medium text-[var(--text-primary)]">AI actions</p>
            {[
              "Why was this marked here?",
              "Create a rule for this merchant",
              "Mark similar transactions as subscriptions",
            ].map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  if (label.includes("rule")) {
                    onOpenRule();
                    return;
                  }
                  if (label.includes("subscriptions")) {
                    void onMarkSubscription(transaction);
                    return;
                  }
                  void onExplain(transaction);
                }}
                className="mb-2 flex w-full items-center justify-between rounded-[20px] border border-[var(--control-border)] bg-white/5 px-4 py-3 text-sm text-[var(--text-primary)] transition hover:bg-white/8"
              >
                {label}
                <ArrowRight className="h-4 w-4 text-[var(--text-muted)]" />
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {transaction.splits?.length ? (
            <div className="panel-muted p-4">
              <p className="mb-3 text-sm font-medium text-[var(--text-primary)]">Split details</p>
              {transaction.splits.map((split) => (
                <div key={split.id} className="mb-2 flex items-center justify-between rounded-[20px] border border-[var(--control-border)] bg-white/5 px-3 py-3">
                  <div>
                    <p className="text-sm text-[var(--text-primary)]">{getCategoryLabel(workspace.categories, split.categoryId)}</p>
                    <p className="text-xs text-[var(--text-secondary)]">{split.note}</p>
                  </div>
                  <Pill tone="accent">{formatCurrency(split.amount)}</Pill>
                </div>
              ))}
            </div>
          ) : null}

          <div className="panel-muted p-4">
            <p className="mb-3 text-sm font-medium text-[var(--text-primary)]">Audit history</p>
            <div className="space-y-2">
              {transaction.audit.map((entry) => (
                <div key={entry.id} className="rounded-[20px] border border-[var(--control-border)] bg-white/5 px-3 py-3">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <p className="text-sm text-[var(--text-primary)]">{titleCase(entry.event.replace(/_/g, " "))}</p>
                    <Pill tone={entry.actor === "user" ? "positive" : entry.actor === "ai" ? "accent" : "neutral"}>
                      {entry.actor}
                    </Pill>
                  </div>
                  <p className="text-sm leading-6 text-[var(--text-secondary)]">{entry.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

function RuleModal({
  transaction,
  onClose,
  onCreate,
}: {
  transaction: TransactionRecord | null;
  onClose: () => void;
  onCreate: (rule: Omit<CategorizationRule, "id" | "enabled">) => void;
}) {
  const { workspace } = useFinanceStore();
  const [categoryId, setCategoryId] = useState(
    transaction?.categoryId || transaction?.suggestedCategoryId || "shopping",
  );
  const [markRecurring, setMarkRecurring] = useState(Boolean(transaction?.recurring));

  if (!transaction) return null;

  return (
    <ModalShell
      open={Boolean(transaction)}
      onClose={onClose}
      title="Create rule"
      subtitle="Convert this correction into a repeatable decision for past and future imports."
    >
      <div className="space-y-4">
        <div className="panel-muted p-4">
          <p className="text-sm font-medium text-[var(--text-primary)]">{transaction.displayMerchant}</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{transaction.merchantRaw}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="panel-muted p-4">
            <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">Criteria</p>
            <InfoRow label="Merchant contains" value={transaction.merchantNormalized} />
            <InfoRow label="Direction" value={transaction.direction} />
          </div>
          <div className="panel-muted p-4">
            <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">Actions</p>
            <select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className="control-surface mb-3 w-full px-4 py-3 text-sm text-[var(--text-primary)] outline-none"
            >
              {workspace.categories
                .filter((category) => !category.parentId)
                .map((category) => (
                  <option className="bg-slate-950" key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </select>
            <label className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={markRecurring}
                onChange={(event) => setMarkRecurring(event.target.checked)}
              />
              Mark similar transactions as recurring
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <SurfaceButton variant="ghost" onClick={onClose}>
            Cancel
          </SurfaceButton>
          <SurfaceButton
            variant="accent"
            onClick={() => {
              onCreate({
                source: "user",
                name: `${transaction.displayMerchant} auto-category`,
                description: `Auto-apply ${getCategoryLabel(workspace.categories, categoryId)} to ${transaction.displayMerchant}.`,
                criteria: [
                  { type: "merchant_contains", value: transaction.merchantNormalized },
                  { type: "direction", value: transaction.direction },
                ],
                actions: [
                  { type: "set_category", categoryId },
                  ...(markRecurring ? [{ type: "mark_recurring", value: true } as const] : []),
                ],
              });
              onClose();
            }}
          >
            Save rule
          </SurfaceButton>
        </div>
      </div>
    </ModalShell>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-2 flex items-start justify-between gap-4 rounded-[20px] border border-[var(--control-border)] bg-white/5 px-3 py-3">
      <span className="text-sm text-[var(--text-secondary)]">{label}</span>
      <span className="max-w-[58%] text-right text-sm text-[var(--text-primary)]">{value}</span>
    </div>
  );
}

function toneForConfidence(status: TransactionRecord["confidenceStatus"]) {
  if (status === "needs-review") return "warning";
  if (status === "user-corrected") return "positive";
  return "accent";
}

function toneForBadge(badge: string) {
  if (badge === "subscription") return "accent";
  if (badge === "hidden") return "danger";
  if (badge === "recurring") return "positive";
  return "neutral";
}

function cnReviewCard(active: boolean) {
  return active
    ? "rounded-[26px] border border-sky-400/26 bg-sky-400/10 p-4 shadow-[0_18px_38px_rgba(67,165,255,0.12)] transition"
    : "rounded-[26px] border border-[var(--control-border)] bg-[var(--control-bg)] p-4 transition hover:border-[var(--control-border-strong)] hover:bg-[var(--control-bg-hover)]";
}
