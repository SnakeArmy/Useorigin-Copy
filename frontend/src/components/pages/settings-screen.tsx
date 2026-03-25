"use client";

import { useState } from "react";
import { Bell, LockKeyhole, Palette, Plus, Shield, SlidersHorizontal, WalletCards, Users } from "lucide-react";
import { useFinanceStore } from "@/lib/finance-store";
import { formatCurrency } from "@/lib/utils";
import { ModalShell, Panel, Pill, SectionHeading, SurfaceButton } from "@/components/ui/primitives";

export function SettingsScreen() {
  const {
    workspace,
    theme,
    selectedAccountId,
    setSelectedAccountId,
    setTheme,
    addCategory,
    addCategoryGroup,
  } = useFinanceStore();
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [groupId, setGroupId] = useState(workspace.categoryGroups[0]?.id ?? "");
  const [budget, setBudget] = useState("0");

  const institutions = Array.from(
    new Map(workspace.accounts.map((account) => [account.institution, account])).values(),
  );

  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow="Settings"
        title="Control linked accounts, categories, notifications, and the shared experience"
        description="Linked data, taxonomy, and theme preferences now save through the same finance state model that powers the rest of the app."
      />

      <div className="grid gap-6 xl:grid-cols-[1.12fr,0.88fr]">
        <Panel className="p-6">
          <Header eyebrow="Linked institutions" title="Connected accounts" icon={<WalletCards className="h-4 w-4 text-[var(--text-muted)]" />} />
          <div className="grid gap-4 md:grid-cols-2">
            {institutions.map((institution) => {
              const linkedAccounts = workspace.accounts.filter(
                (account) => account.institution === institution.institution,
              );

              return (
                <div key={institution.institution} className="rounded-2xl border border-white/8 bg-white/5 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">{institution.institution}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{linkedAccounts.length} linked accounts</p>
                    </div>
                    <Pill tone="positive">Synced</Pill>
                  </div>
                  <div className="space-y-2">
                    {linkedAccounts.map((account) => (
                      <button
                        type="button"
                        key={account.id}
                        onClick={() => setSelectedAccountId(account.id)}
                        className="flex w-full items-center justify-between rounded-2xl bg-white/5 px-3 py-3 text-left transition hover:bg-white/8"
                      >
                        <div>
                          <p className="text-sm text-white">{account.name}</p>
                          <p className="text-xs text-[var(--text-secondary)]">
                            {account.subtype} | ••{account.mask}
                          </p>
                        </div>
                        <p className="text-sm font-medium text-white">{formatCurrency(account.balance)}</p>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel className="p-6">
          <Header eyebrow="Appearance" title="Theme and density" icon={<Palette className="h-4 w-4 text-[var(--text-muted)]" />} />
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
              <p className="text-sm font-medium text-white">Current mode</p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">Switch between the premium dark workspace and a lighter analytical mode.</p>
              <div className="mt-4 flex gap-2">
                <SurfaceButton variant={theme === "dark" ? "accent" : "ghost"} onClick={() => setTheme("dark")}>Dark</SurfaceButton>
                <SurfaceButton variant={theme === "light" ? "accent" : "ghost"} onClick={() => setTheme("light")}>Light</SurfaceButton>
              </div>
            </div>

            <StackCard icon={<Bell className="h-4 w-4 text-[var(--accent-jade)]" />} title="Notifications" description="Alerts come from real review-queue, budget, and history diagnostics instead of seeded reminders." />
            <StackCard icon={<LockKeyhole className="h-4 w-4 text-[var(--accent-sky)]" />} title="Privacy + security" description="Institution access, account masks, and data-coverage warnings stay visible without inventing backend capabilities that do not exist." />
            <StackCard icon={<Users className="h-4 w-4 text-[var(--accent-amber)]" />} title="Household access" description="Household identity is grounded in connected users and transaction ownership, not placeholder permission states." />
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        <Panel className="p-6">
          <Header eyebrow="Categories + taxonomy" title="Manage category groups" icon={<SlidersHorizontal className="h-4 w-4 text-[var(--text-muted)]" />} />
          <div className="grid gap-6 lg:grid-cols-[1fr,0.95fr]">
            <div className="space-y-3">
              {workspace.categoryGroups.map((group) => (
                <div key={group.id} className="rounded-2xl border border-white/8 bg-white/5 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">{group.name}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{group.description}</p>
                    </div>
                    <span className="h-3 w-3 rounded-full" style={{ background: group.color }} />
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">
                    {workspace.categories.filter((category) => category.groupId === group.id).length} categories
                  </p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
              <p className="text-sm font-medium text-white">Add custom category group</p>
              <div className="mt-4 space-y-3">
                <input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Group name" className="w-full rounded-2xl border border-white/10 bg-[rgba(4,10,24,0.45)] px-4 py-3 text-sm text-white outline-none placeholder:text-[var(--text-muted)]" />
                <textarea value={groupDescription} onChange={(event) => setGroupDescription(event.target.value)} placeholder="Describe how this group should behave in budgeting/reporting" className="min-h-[120px] w-full rounded-2xl border border-white/10 bg-[rgba(4,10,24,0.45)] px-4 py-3 text-sm text-white outline-none placeholder:text-[var(--text-muted)]" />
                <SurfaceButton
                  variant="accent"
                  className="w-full"
                  onClick={async () => {
                    if (!groupName.trim()) return;
                    await addCategoryGroup({
                      name: groupName,
                      description: groupDescription || "Custom budgeting group",
                      color: "#7dd3fc",
                    });
                    setGroupName("");
                    setGroupDescription("");
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Add group
                </SurfaceButton>
              </div>
            </div>
          </div>
        </Panel>

        <Panel className="p-6">
          <Header eyebrow="Categories + rules" title="Add custom category" icon={<Shield className="h-4 w-4 text-[var(--text-muted)]" />} />
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
              <p className="text-sm font-medium text-white">New category</p>
              <div className="mt-4 space-y-3">
                <input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="Category name" className="w-full rounded-2xl border border-white/10 bg-[rgba(4,10,24,0.45)] px-4 py-3 text-sm text-white outline-none placeholder:text-[var(--text-muted)]" />
                <select value={groupId} onChange={(event) => setGroupId(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-[rgba(4,10,24,0.45)] px-4 py-3 text-sm text-white outline-none">
                  {workspace.categoryGroups.map((group) => (
                    <option className="bg-slate-950" key={group.id} value={group.id}>{group.name}</option>
                  ))}
                </select>
                <input value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="Budget" className="w-full rounded-2xl border border-white/10 bg-[rgba(4,10,24,0.45)] px-4 py-3 text-sm text-white outline-none placeholder:text-[var(--text-muted)]" />
                <SurfaceButton
                  variant="accent"
                  className="w-full"
                  onClick={async () => {
                    if (!categoryName.trim()) return;
                    await addCategory({ name: categoryName, groupId, budget: Number(budget) || undefined });
                    setCategoryName("");
                    setBudget("0");
                  }}
                >
                  Save category
                </SurfaceButton>
              </div>
            </div>

            <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
              <p className="mb-3 text-sm font-medium text-white">Rules currently active</p>
              <div className="space-y-2">
                {workspace.rules.slice(0, 5).map((rule) => (
                  <div key={rule.id} className="rounded-2xl bg-white/5 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm text-white">{rule.name}</p>
                        <p className="text-xs text-[var(--text-secondary)]">{rule.description}</p>
                      </div>
                      <Pill tone={rule.source === "user" ? "positive" : "accent"}>{rule.source}</Pill>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <AccountModal accountId={selectedAccountId} onClose={() => setSelectedAccountId(null)} />
    </div>
  );
}

function Header({
  eyebrow,
  title,
  icon,
}: {
  eyebrow: string;
  title: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-center justify-between">
      <div>
        <p className="text-xs uppercase tracking-[0.26em] text-[var(--text-muted)]">{eyebrow}</p>
        <h2 className="mt-1 text-xl font-semibold text-white">{title}</h2>
      </div>
      {icon}
    </div>
  );
}

function StackCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/5">{icon}</div>
        <p className="font-medium text-white">{title}</p>
      </div>
      <p className="text-sm leading-6 text-[var(--text-secondary)]">{description}</p>
    </div>
  );
}

function AccountModal({ accountId, onClose }: { accountId: string | null; onClose: () => void }) {
  const { workspace } = useFinanceStore();
  const account = workspace.accounts.find((item) => item.id === accountId) || null;
  const transactions = workspace.transactions.filter((transaction) => transaction.accountId === accountId).slice(0, 8);

  if (!account) return null;

  return (
    <ModalShell
      open={Boolean(account)}
      onClose={onClose}
      title={account.name}
      subtitle="Connected account details with recent linked transactions for the active date range."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <DetailCard label="Institution" value={account.institution} />
        <DetailCard label="Balance" value={formatCurrency(account.balance)} />
        <DetailCard label="Subtype" value={account.subtype} />
        <DetailCard label="Last sync" value={account.lastUpdated.slice(0, 10)} />
      </div>

      <div className="mt-5 space-y-3">
        <p className="text-sm font-medium text-white">Recent transactions</p>
        {transactions.length ? (
          transactions.map((transaction) => (
            <div key={transaction.id} className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-white">{transaction.displayMerchant}</p>
                  <p className="text-xs text-[var(--text-secondary)]">{transaction.postedAt.slice(0, 10)}</p>
                </div>
                <p className="text-sm font-medium text-white">{formatCurrency(transaction.amount)}</p>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-4 text-sm leading-6 text-[var(--text-secondary)]">
            No transactions for this account fall inside the active date range.
          </div>
        )}
      </div>
    </ModalShell>
  );
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.22em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}
