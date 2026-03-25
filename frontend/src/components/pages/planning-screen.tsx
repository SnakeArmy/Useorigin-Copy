"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BrainCircuit, SlidersHorizontal, Target, TimerReset } from "lucide-react";
import { useFinanceStore } from "@/lib/finance-store";
import { calculateAccountSummary, calculateScenarioProjection } from "@/lib/finance-selectors";
import { clamp, formatCurrency } from "@/lib/utils";
import { ClientChart } from "@/components/ui/client-chart";
import { Panel, Pill, SectionHeading } from "@/components/ui/primitives";

export function PlanningScreen() {
  const { workspace } = useFinanceStore();
  const accountSummary = calculateAccountSummary(workspace);
  const [monthlySavings, setMonthlySavings] = useState(workspace.scenarios[0]?.monthlySavings ?? 3200);
  const [marketReturn, setMarketReturn] = useState(workspace.scenarios[0]?.marketReturn ?? 6.5);
  const [retirementAge, setRetirementAge] = useState(workspace.scenarios[0]?.retirementAge ?? 60);

  const scenarioProjection = useMemo(
    () => {
      const currentYear = new Date().getFullYear();
      const plan = calculateScenarioProjection(accountSummary.netWorth, monthlySavings, marketReturn);
      const stretch = calculateScenarioProjection(accountSummary.netWorth, monthlySavings * 1.2, marketReturn + 0.7);
      const cautious = calculateScenarioProjection(accountSummary.netWorth, monthlySavings * 0.75, Math.max(0, marketReturn - 1.1));

      return plan.map((point, index) => ({
        year: String(currentYear + index + 1),
        plan: point,
        stretch: stretch[index] || point,
        cautious: cautious[index] || point,
      }));
    },
    [accountSummary.netWorth, marketReturn, monthlySavings],
  );

  const retirementGap = clamp(65 - retirementAge, 0, 15) * monthlySavings * 12;
  const purchaseScenario = monthlySavings * 18;

  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow="Forecasting + planning"
        title="Scenario planning that connects real cash flow with future decisions"
        description="Adjust assumptions, compare outcomes side by side, and keep the forecast tied to the current net worth baseline and observed savings rate."
      />

      <div className="grid gap-6 xl:grid-cols-[1.25fr,1fr]">
        <Panel className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.26em] text-[var(--text-muted)]">Scenario planner</p>
              <h2 className="mt-1 text-xl font-semibold text-white">Adjust assumptions live</h2>
            </div>
            <SlidersHorizontal className="h-4 w-4 text-[var(--text-muted)]" />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <SliderCard label="Monthly savings" value={monthlySavings} format={(value) => formatCurrency(value)} min={1500} max={5000} step={100} onChange={setMonthlySavings} />
            <SliderCard label="Market return" value={marketReturn} format={(value) => `${value.toFixed(1)}%`} min={4} max={8.5} step={0.1} onChange={setMarketReturn} />
            <SliderCard label="Retirement age" value={retirementAge} format={(value) => `${value}`} min={55} max={67} step={1} onChange={setRetirementAge} />
          </div>

          <div className="mt-6 h-[320px]">
            <ClientChart>
              <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={scenarioProjection}>
                <defs>
                  <linearGradient id="planFill" x1="0%" x2="100%">
                    <stop offset="0%" stopColor="#43a5ff" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#25e7aa" stopOpacity={0.06} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="year" tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} />
                <YAxis hide />
                <Tooltip contentStyle={{ background: "rgba(9,18,34,0.96)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18 }} formatter={(value) => formatCurrency(Number(value ?? 0))} />
                <Area type="monotone" dataKey="plan" stroke="#43a5ff" fill="url(#planFill)" strokeWidth={2.4} />
                <Line type="monotone" dataKey="stretch" stroke="#25e7aa" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="cautious" stroke="#f7b500" dot={false} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
            </ClientChart>
          </div>
        </Panel>

        <div className="space-y-6">
          <MetricPanel eyebrow="Retirement" title="Retirement timing" metric={retirementAge.toString()} detail={`Retiring ${65 - retirementAge > 0 ? `${65 - retirementAge} years earlier` : "on a traditional timeline"} changes the long-run target by about ${formatCurrency(retirementGap)}.`} icon={<TimerReset className="h-4 w-4 text-[var(--accent-jade)]" />} />
          <MetricPanel eyebrow="Major purchase" title="18-month savings capacity" metric={formatCurrency(purchaseScenario)} detail="This is a straight-line projection from the monthly savings input, without inventing unsupported bonuses or returns." icon={<Target className="h-4 w-4 text-[var(--accent-amber)]" />} />
          <MetricPanel eyebrow="AI summary" title="Planning narrative" metric="Atlas readout" detail={`The model starts from ${formatCurrency(accountSummary.netWorth)} of current net worth, then compounds the adjustable savings and market-return assumptions over time.`} icon={<BrainCircuit className="h-4 w-4 text-[var(--accent-sky)]" />} />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr,1fr]">
        <Panel className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.26em] text-[var(--text-muted)]">Goal timeline</p>
              <h2 className="mt-1 text-xl font-semibold text-white">Progress by objective</h2>
            </div>
            <Pill tone="accent">{workspace.goals.length} active goals</Pill>
          </div>
          <div className="space-y-4">
            {workspace.goals.length ? (
              workspace.goals.map((goal) => {
                const progress = (goal.current / goal.target) * 100;
                return (
                  <div key={goal.id} className="rounded-2xl border border-white/8 bg-white/5 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">{goal.name}</p>
                        <p className="text-xs text-[var(--text-secondary)]">{formatCurrency(goal.current)} of {formatCurrency(goal.target)}</p>
                      </div>
                      <Pill tone="accent">{progress.toFixed(0)}%</Pill>
                    </div>
                    <div className="mb-3 h-2 overflow-hidden rounded-full bg-white/6">
                      <div className="h-full bg-[var(--accent-gradient)]" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="text-xs text-[var(--text-secondary)]">{formatCurrency(goal.monthlyContribution)}/month contribution pace</p>
                  </div>
                );
              })
            ) : (
              <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-4 text-sm leading-6 text-[var(--text-secondary)]">
                No goal records are connected yet, so the planning model stays explicit about forecasting only from balances and cash flow.
              </div>
            )}
          </div>
        </Panel>

        <Panel className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.26em] text-[var(--text-muted)]">Scenario comparison</p>
              <h2 className="mt-1 text-xl font-semibold text-white">Base vs stretch vs cautious</h2>
            </div>
            <Pill tone="positive">Side-by-side</Pill>
          </div>
          <div className="space-y-3">
            {[
              { label: "Base", value: formatCurrency(scenarioProjection.at(-1)?.plan ?? 0), tone: "accent" as const },
              { label: "Stretch", value: formatCurrency(scenarioProjection.at(-1)?.stretch ?? 0), tone: "positive" as const },
              { label: "Cautious", value: formatCurrency(scenarioProjection.at(-1)?.cautious ?? 0), tone: "warning" as const },
            ].map((scenario) => (
              <div key={scenario.label} className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/5 px-4 py-4">
                <div>
                  <p className="text-sm font-medium text-white">{scenario.label}</p>
                  <p className="text-xs text-[var(--text-secondary)]">Projected 2031 net worth</p>
                </div>
                <Pill tone={scenario.tone}>{scenario.value}</Pill>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function SliderCard({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.22em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{format(value)}</p>
      <input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} className="mt-5 w-full accent-[var(--accent-jade)]" />
    </div>
  );
}

function MetricPanel({
  eyebrow,
  title,
  metric,
  detail,
  icon,
}: {
  eyebrow: string;
  title: string;
  metric: string;
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
      <p className="text-3xl font-semibold tracking-[-0.05em] text-white">{metric}</p>
      <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">{detail}</p>
    </Panel>
  );
}
