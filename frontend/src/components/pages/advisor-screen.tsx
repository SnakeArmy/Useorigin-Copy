"use client";

import { useState } from "react";
import { ChartNoAxesCombined, MessageSquarePlus, Sparkles, WandSparkles } from "lucide-react";
import { useFinanceStore } from "@/lib/finance-store";
import { formatDateTime } from "@/lib/utils";
import { Panel, Pill, SectionHeading, SurfaceButton } from "@/components/ui/primitives";

const SUGGESTED_PROMPTS = [
  "Explain the change in my spending this month.",
  "What should I review in my categorization queue first?",
  "How is my portfolio drifting from target?",
  "Create a rule for streaming subscriptions.",
  "How does my forecast change if I save $500 more each month?",
];

export function AdvisorScreen() {
  const { workspace, askAdvisor } = useFinanceStore();
  const [prompt, setPrompt] = useState("");

  async function handleSubmit(submitted?: string) {
    const nextPrompt = submitted || prompt;
    if (!nextPrompt.trim()) return;
    await askAdvisor(nextPrompt);
    setPrompt("");
  }

  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow="AI advisor"
        title="Atlas keeps spending, investing, planning, and rules in one conversation"
        description="This is a dedicated advisor experience with context cards, follow-up prompts, and workflows that connect directly to categorization and planning."
      />

      <div className="grid gap-6 xl:grid-cols-[1.3fr,0.92fr]">
        <Panel className="flex min-h-[720px] flex-col p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.26em] text-[var(--text-muted)]">Conversation</p>
              <h2 className="mt-1 text-xl font-semibold text-white">Financial guidance chat</h2>
            </div>
            <Pill tone="positive">Context live</Pill>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            {workspace.advisorMessages.length ? (
              workspace.advisorMessages.map((message) => (
                <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[88%] space-y-3 rounded-[28px] border px-4 py-4 ${message.role === "user" ? "border-transparent bg-[var(--accent-gradient)] text-slate-950" : "border-white/8 bg-white/5 text-white"}`}>
                    <p className="text-sm leading-7">{message.content}</p>
                    {message.cards?.length ? (
                      <div className="grid gap-3">
                        {message.cards.map((card) => (
                          <div key={`${message.id}-${card.title}`} className={`rounded-2xl border px-4 py-3 ${message.role === "user" ? "border-slate-950/10 bg-slate-950/6" : "border-white/8 bg-white/5"}`}>
                            <p className="text-xs uppercase tracking-[0.22em] opacity-70">{card.type}</p>
                            <div className="mt-2 flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-medium">{card.title}</p>
                                <p className="text-xs opacity-75">{card.supporting}</p>
                              </div>
                              <Pill tone={message.role === "user" ? "neutral" : "accent"}>{card.metric}</Pill>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <p className="text-[11px] uppercase tracking-[0.18em] opacity-65">{formatDateTime(message.createdAt)}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[28px] border border-white/8 bg-white/5 px-5 py-5 text-sm leading-7 text-[var(--text-secondary)]">
                Atlas will answer from connected balances, normalized transactions, saved rules, and derived budget metrics. Ask a question or tap one of the workflow prompts.
              </div>
            )}
          </div>

          <div className="mt-5 rounded-[28px] border border-white/8 bg-white/5 p-4">
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Ask about spending changes, portfolio drift, transfers, or creating new rules."
              className="min-h-[120px] w-full resize-none bg-transparent text-sm leading-7 text-white outline-none placeholder:text-[var(--text-muted)]"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTED_PROMPTS.slice(0, 3).map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => handleSubmit(item)}
                  className="rounded-full border border-white/8 bg-white/5 px-3 py-2 text-xs text-[var(--text-secondary)] transition hover:border-white/14 hover:bg-white/8 hover:text-white"
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <SurfaceButton variant="accent" onClick={() => handleSubmit()}>
                <Sparkles className="h-4 w-4" />
                Ask Atlas
              </SurfaceButton>
            </div>
          </div>
        </Panel>

        <div className="space-y-6">
          <AdvisorPanel
            eyebrow="Suggested workflows"
            title="Jump directly into a financial explanation"
            icon={<MessageSquarePlus className="h-4 w-4 text-[var(--accent-jade)]" />}
            items={SUGGESTED_PROMPTS.map((item) => ({
              title: item,
              action: () => handleSubmit(item),
            }))}
          />
          <AdvisorPanel
            eyebrow="Inserted context cards"
            title="Atlas can answer with visuals"
            icon={<ChartNoAxesCombined className="h-4 w-4 text-[var(--accent-sky)]" />}
            items={[
              { title: "Budget drift card", detail: "Summarize which categories are pushing you off plan.", action: () => handleSubmit("Which categories are pushing me off budget?") },
              { title: "Portfolio insight card", detail: "Explain drift, concentration, and benchmark gaps.", action: () => handleSubmit("What changed in my net worth?") },
              { title: "Forecast comparison card", detail: "Show how a savings or retirement assumption changes the plan.", action: () => handleSubmit("How would monthly savings changes affect my forecast?") },
            ]}
          />
          <AdvisorPanel
            eyebrow="Categorization actions"
            title="AI + rules together"
            icon={<WandSparkles className="h-4 w-4 text-[var(--accent-amber)]" />}
            items={[
              { title: "Why was this marked as Dining?", detail: "Explain merchant normalization + confidence logic.", action: () => handleSubmit("Why was this categorized this way?") },
              { title: "Create a rule for all purchases from this merchant.", detail: "Explain whether this merchant is a good rule candidate.", action: () => handleSubmit("Is this merchant a good rule candidate?") },
              { title: "Mark similar transactions as subscriptions.", detail: "Identify merchants that look like subscription candidates.", action: () => handleSubmit("Which merchants look like subscriptions?") },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

function AdvisorPanel({
  eyebrow,
  title,
  icon,
  items,
}: {
  eyebrow: string;
  title: string;
  icon: React.ReactNode;
  items: Array<{ title: string; detail?: string; action?: () => void }>;
}) {
  return (
    <Panel className="p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.26em] text-[var(--text-muted)]">{eyebrow}</p>
          <h2 className="mt-1 text-xl font-semibold text-white">{title}</h2>
        </div>
        {icon}
      </div>
      <div className="space-y-3">
        {items.map((item) =>
          item.action ? (
            <button
              type="button"
              key={item.title}
              onClick={item.action}
              className="w-full rounded-2xl border border-white/8 bg-white/5 px-4 py-4 text-left transition hover:border-white/14 hover:bg-white/8"
            >
              <p className="text-sm font-medium text-white">{item.title}</p>
              {item.detail ? <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{item.detail}</p> : null}
            </button>
          ) : (
            <div key={item.title} className="w-full rounded-2xl border border-white/8 bg-white/5 px-4 py-4 text-left">
              <p className="text-sm font-medium text-white">{item.title}</p>
              {item.detail ? <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{item.detail}</p> : null}
            </div>
          ),
        )}
      </div>
    </Panel>
  );
}
