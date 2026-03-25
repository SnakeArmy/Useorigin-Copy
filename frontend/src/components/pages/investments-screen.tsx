"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BriefcaseBusiness, CandlestickChart, Newspaper, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFinanceStore } from "@/lib/finance-store";
import { calculateAccountSummary } from "@/lib/finance-selectors";
import { formatCurrency } from "@/lib/utils";
import { ClientChart } from "@/components/ui/client-chart";
import { ModalShell, Panel, Pill, SectionHeading, SurfaceButton } from "@/components/ui/primitives";

const COLORS = ["#25e7aa", "#43a5ff", "#f7b500", "#7c8cf8", "#fb7185"];

type InvestmentSource =
  | { id: string; type: "account"; name: string; value: number; detail: string; lastUpdated: string }
  | { id: string; type: "asset"; name: string; value: number; detail: string; lastUpdated: string };

export function InvestmentsScreen() {
  const router = useRouter();
  const { workspace } = useFinanceStore();
  const [selectedItem, setSelectedItem] = useState<InvestmentSource | null>(null);
  const accountSummary = calculateAccountSummary(workspace);

  const investmentAccounts = workspace.accounts.filter((account) => account.type === "investment");
  const investmentAssets = workspace.assets.filter(
    (asset) => asset.type === "investment" || asset.type === "crypto",
  );
  const sources = useMemo<InvestmentSource[]>(
    () => [
      ...investmentAccounts.map((account) => ({
        id: account.id,
        type: "account" as const,
        name: account.name,
        value: Math.max(0, account.balance),
        detail: `${account.institution} | ${account.subtype}`,
        lastUpdated: account.lastUpdated,
      })),
      ...investmentAssets.map((asset) => ({
        id: asset.id,
        type: "asset" as const,
        name: asset.name,
        value: asset.value,
        detail: `Manual ${asset.type} asset`,
        lastUpdated: asset.asOfDate,
      })),
    ].sort((left, right) => right.value - left.value),
    [investmentAccounts, investmentAssets],
  );

  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow="Investments"
        title="Investment visibility without fabricated holdings"
        description="This page now reflects only connected investment accounts and manual investment assets. If security-level holdings are unavailable, the interface says so instead of inventing tickers."
        action={<SurfaceButton variant="accent" onClick={() => router.push("/planning")}>Rebalance scenarios</SurfaceButton>}
      />

      <div className="grid gap-6 xl:grid-cols-[1.5fr,1fr]">
        <Panel className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.26em] text-[var(--text-muted)]">Invested total</p>
              <h2 className="mt-1 text-xl font-semibold text-white">{formatCurrency(accountSummary.invested)}</h2>
            </div>
            <div className="text-right">
              <Pill tone={sources.length ? "positive" : "warning"}>{sources.length} sources</Pill>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                {investmentAccounts.length} connected accounts | {investmentAssets.length} manual assets
              </p>
            </div>
          </div>

          {sources.length ? (
            <div className="h-[320px]">
              <ClientChart>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sources.map((source) => ({ name: source.name, value: source.value }))}>
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{ background: "rgba(9,18,34,0.96)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18 }}
                      formatter={(value) => formatCurrency(Number(value ?? 0))}
                    />
                    <Bar dataKey="value" radius={[12, 12, 0, 0]}>
                      {sources.map((source, index) => (
                        <Cell key={source.id} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ClientChart>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-10 text-center text-sm leading-6 text-[var(--text-secondary)]">
              No investment accounts or manual investment assets are connected yet.
            </div>
          )}
        </Panel>

        <Panel className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.26em] text-[var(--text-muted)]">Allocation</p>
              <h2 className="mt-1 text-xl font-semibold text-white">Current mix</h2>
            </div>
            <CandlestickChart className="h-4 w-4 text-[var(--text-muted)]" />
          </div>
          {sources.length ? (
            <>
              <div className="h-[260px]">
                <ClientChart>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={sources.map((source) => ({ name: source.name, value: source.value }))} dataKey="value" innerRadius={70} outerRadius={106} stroke="none">
                        {sources.map((source, index) => (
                          <Cell key={source.id} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: "rgba(9,18,34,0.96)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18 }} formatter={(value) => formatCurrency(Number(value ?? 0))} />
                    </PieChart>
                  </ResponsiveContainer>
                </ClientChart>
              </div>
              <div className="space-y-2">
                {sources.map((source, index) => (
                  <div key={source.id} className="flex items-center justify-between rounded-2xl bg-white/5 px-3 py-3">
                    <div className="flex items-center gap-3">
                      <span className="h-3 w-3 rounded-full" style={{ background: COLORS[index % COLORS.length] }} />
                      <div>
                        <p className="text-sm text-white">{source.name}</p>
                        <p className="text-xs text-[var(--text-secondary)]">{source.detail}</p>
                      </div>
                    </div>
                    <Pill tone="accent">{formatCurrency(source.value)}</Pill>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-10 text-center text-sm leading-6 text-[var(--text-secondary)]">
              Allocation becomes available when invested balances exist.
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr,1fr]">
        <Panel className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.26em] text-[var(--text-muted)]">Investment sources</p>
              <h2 className="mt-1 text-xl font-semibold text-white">Connected accounts and manual assets</h2>
            </div>
            <Pill tone="positive">{sources.length} tracked</Pill>
          </div>
          <div className="overflow-hidden rounded-[28px] border border-white/8">
            <table className="min-w-full text-left">
              <thead className="bg-[rgba(4,10,24,0.65)] text-xs uppercase tracking-[0.26em] text-[var(--text-muted)]">
                <tr>
                  <th className="px-4 py-4">Source</th>
                  <th className="px-4 py-4">Type</th>
                  <th className="px-4 py-4">Value</th>
                  <th className="px-4 py-4">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8 bg-[rgba(4,10,24,0.2)]">
                {sources.length ? (
                  sources.map((source) => (
                    <tr key={source.id} className="transition hover:bg-white/4">
                      <td className="px-4 py-4">
                        <button type="button" onClick={() => setSelectedItem(source)} className="text-left">
                          <p className="text-sm font-medium text-white">{source.name}</p>
                          <p className="text-xs text-[var(--text-secondary)]">{source.detail}</p>
                        </button>
                      </td>
                      <td className="px-4 py-4 text-sm text-white">{source.type === "account" ? "Connected account" : "Manual asset"}</td>
                      <td className="px-4 py-4 text-sm text-white">{formatCurrency(source.value)}</td>
                      <td className="px-4 py-4 text-sm text-white">{source.lastUpdated.slice(0, 10)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-6 py-12">
                      <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-10 text-center text-sm leading-6 text-[var(--text-secondary)]">
                        There are no real investment sources to list yet.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="space-y-6">
          <MetricCard eyebrow="Coverage" title="Holdings data" detail={workspace.meta.coverage.investmentHoldings ? "Security-level holdings are connected." : "Security-level holdings are not connected, so this page stays at account and asset level."} icon={<TrendingUp className="h-4 w-4 text-[var(--accent-jade)]" />} />
          <MetricCard eyebrow="Manual assets" title="Editable outside this UI" detail={investmentAssets.length ? `${investmentAssets.length} manual investment assets are already included in the invested total.` : "No manual investment assets are currently connected."} icon={<BriefcaseBusiness className="h-4 w-4 text-[var(--accent-sky)]" />} />
          <MetricCard eyebrow="Narrative" title="Reality check" detail="This page does not fabricate benchmark returns, ticker-level gains, or market news when that data source is absent." icon={<Newspaper className="h-4 w-4 text-[var(--accent-amber)]" />} />
        </div>
      </div>

      <SourceModal item={selectedItem} onClose={() => setSelectedItem(null)} />
    </div>
  );
}

function MetricCard({
  eyebrow,
  title,
  detail,
  icon,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <Panel className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.26em] text-[var(--text-muted)]">{eyebrow}</p>
          <h2 className="mt-1 text-xl font-semibold text-white">{title}</h2>
        </div>
        {icon}
      </div>
      <p className="text-sm leading-7 text-[var(--text-secondary)]">{detail}</p>
    </Panel>
  );
}

function SourceModal({ item, onClose }: { item: InvestmentSource | null; onClose: () => void }) {
  if (!item) return null;

  return (
    <ModalShell open={Boolean(item)} onClose={onClose} title={item.name} subtitle="Actual connected investment source detail.">
      <div className="grid gap-4 md:grid-cols-2">
        <DetailRow label="Type" value={item.type === "account" ? "Connected account" : "Manual asset"} />
        <DetailRow label="Value" value={formatCurrency(item.value)} />
        <DetailRow label="Detail" value={item.detail} />
        <DetailRow label="Updated" value={item.lastUpdated.slice(0, 10)} />
      </div>
    </ModalShell>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.22em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}
