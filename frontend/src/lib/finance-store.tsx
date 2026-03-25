"use client";

import {
  createContext,
  type ReactNode,
  startTransition,
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api } from "@/lib/api";
import { buildAdvisorReply } from "@/lib/finance-advisor";
import { buildRuleDraftFromTransaction } from "@/lib/categorization";
import { createEmptySourceData, normalizeBackendWorkspace } from "@/lib/finance-normalization";
import {
  buildFinanceWorkspace,
  buildTransactionsWithBulkChange,
  buildTransactionsWithUserChange,
  calculateCategoryPerformance,
  calculateReviewQueue,
  calculateSpendingMetrics,
  getMemberAccounts,
} from "@/lib/finance-selectors";
import type {
  AdvisorMessage,
  BackendWorkspacePayload,
  CategorizationRule,
  CategoryPerformance,
  DateRangeKey,
  FinanceSourceData,
  FinanceWorkspace,
  ThemeMode,
  TransactionRecord,
} from "@/lib/finance-types";
import { generateId } from "@/lib/utils";

interface FinanceStoreValue {
  workspace: FinanceWorkspace;
  isHydrating: boolean;
  dateRange: DateRangeKey;
  selectedMemberId: string;
  selectedAccountId: string | null;
  theme: ThemeMode;
  commandOpen: boolean;
  notificationsOpen: boolean;
  spendingSearch: string;
  deferredSpendingSearch: string;
  setDateRange: (range: DateRangeKey) => void;
  setSelectedMemberId: (memberId: string) => void;
  setSelectedAccountId: (accountId: string | null) => void;
  setTheme: (mode: ThemeMode) => void;
  setCommandOpen: (open: boolean) => void;
  setNotificationsOpen: (open: boolean) => void;
  setSpendingSearch: (query: string) => void;
  updateTransaction: (
    transactionId: string,
    changes: Partial<TransactionRecord>,
    options?: { createRule?: boolean },
  ) => Promise<void>;
  bulkUpdateTransactions: (
    transactionIds: string[],
    changes: Partial<TransactionRecord>,
  ) => Promise<void>;
  addRule: (rule: Omit<CategorizationRule, "id" | "enabled">) => Promise<void>;
  addCategoryGroup: (input: { name: string; description: string; color: string }) => Promise<void>;
  addCategory: (input: { name: string; groupId: string; budget?: number }) => Promise<void>;
  markNotificationRead: (notificationId: string) => void;
  askAdvisor: (prompt: string) => Promise<void>;
  categoryPerformance: CategoryPerformance[];
  reviewQueue: TransactionRecord[];
}

const FinanceStoreContext = createContext<FinanceStoreValue | null>(null);

function toKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function createUnavailableSource(detail: string): FinanceSourceData {
  const source = createEmptySourceData();
  return {
    ...source,
    meta: {
      ...source.meta,
      loadedAt: new Date().toISOString(),
      diagnostics: [
        {
          id: "backend_unavailable",
          level: "warning",
          title: "Backend data is unavailable",
          detail,
        },
      ],
    },
  };
}

function mapTransactionPatch(changes: Partial<TransactionRecord>) {
  const payload: Record<string, unknown> = {};

  if (Object.prototype.hasOwnProperty.call(changes, "categoryId")) {
    payload.custom_category = changes.categoryId || null;
  }
  if (Object.prototype.hasOwnProperty.call(changes, "direction")) {
    payload.custom_direction = changes.direction || null;
  }
  if (Object.prototype.hasOwnProperty.call(changes, "hiddenFromBudget")) {
    payload.hidden_from_budget = Boolean(changes.hiddenFromBudget);
  }
  if (Object.prototype.hasOwnProperty.call(changes, "recurring")) {
    payload.recurring = Boolean(changes.recurring);
  }
  if (Object.prototype.hasOwnProperty.call(changes, "notes")) {
    payload.notes = changes.notes || null;
  }
  if (Object.prototype.hasOwnProperty.call(changes, "tags")) {
    payload.tags = changes.tags || [];
  }

  return payload;
}

export function FinanceStoreProvider({ children }: { children: ReactNode }) {
  const [source, setSource] = useState<FinanceSourceData>(createEmptySourceData);
  const [isHydrating, setIsHydrating] = useState(true);
  const [dateRange, setDateRange] = useState<DateRangeKey>(() => {
    if (typeof window === "undefined") return "90d";
    try {
      const savedRange = window.localStorage.getItem("useorigin-date-range") as DateRangeKey | null;
      if (
        savedRange === "30d" ||
        savedRange === "90d" ||
        savedRange === "180d" ||
        savedRange === "365d"
      ) {
        return savedRange;
      }
    } catch {
      // Local persistence is optional.
    }
    return "90d";
  });
  const [selectedMemberId, setSelectedMemberId] = useState("me");
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "dark";
    try {
      const savedTheme = window.localStorage.getItem("useorigin-theme") as ThemeMode | null;
      if (savedTheme === "dark" || savedTheme === "light") {
        return savedTheme;
      }
    } catch {
      // Local persistence is optional.
    }
    return "dark";
  });
  const [commandOpen, setCommandOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [spendingSearch, setSpendingSearch] = useState("");
  const [advisorMessages, setAdvisorMessages] = useState<AdvisorMessage[]>([]);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([]);
  const deferredSpendingSearch = useDeferredValue(spendingSearch);

  const workspace = useMemo(
    () =>
      buildFinanceWorkspace(source, {
        dateRange,
        advisorMessages,
        readNotificationIds: new Set(readNotificationIds),
      }),
    [advisorMessages, dateRange, readNotificationIds, source],
  );

  const categoryPerformance = useMemo(
    () => calculateCategoryPerformance(workspace.transactions, workspace.categories),
    [workspace.categories, workspace.transactions],
  );
  const reviewQueue = useMemo(
    () => calculateReviewQueue(workspace.transactions),
    [workspace.transactions],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    try {
      window.localStorage.setItem("useorigin-theme", theme);
    } catch {
      // Ignore storage failures.
    }
  }, [theme]);

  useEffect(() => {
    try {
      window.localStorage.setItem("useorigin-date-range", dateRange);
    } catch {
      // Ignore storage failures.
    }
  }, [dateRange]);

  const refreshWorkspace = useCallback(async () => {
    const payload = await api<BackendWorkspacePayload>("/workspace?days=365");
    const normalized = normalizeBackendWorkspace(payload);

    startTransition(() => {
      setSource(normalized);
      setSelectedMemberId((current) =>
        normalized.members.some((member) => member.id === current)
          ? current
          : normalized.members[0]?.id || "me",
      );
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    refreshWorkspace()
      .catch((error) => {
        if (cancelled) return;
        setSource(
          createUnavailableSource(
            error instanceof Error ? error.message : "The finance backend could not be reached.",
          ),
        );
      })
      .finally(() => {
        if (!cancelled) {
          setIsHydrating(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [refreshWorkspace]);

  async function updateTransaction(
    transactionId: string,
    changes: Partial<TransactionRecord>,
    options?: { createRule?: boolean },
  ) {
    const targetTransaction = source.transactions.find((transaction) => transaction.id === transactionId);

    setSource((current) => ({
      ...current,
      transactions: buildTransactionsWithUserChange(current.transactions, transactionId, changes),
    }));

    try {
      await api(`/workspace/transactions/${transactionId}`, {
        method: "PATCH",
        body: JSON.stringify(mapTransactionPatch(changes)),
      });

      if (options?.createRule && changes.categoryId && targetTransaction) {
        const draft = buildRuleDraftFromTransaction(targetTransaction, changes.categoryId);
        await addRule({
          source: "user",
          ...draft,
        });
      }
    } catch (error) {
      console.error("[FinanceStore] Failed to persist transaction update:", error);
      await refreshWorkspace().catch(() => undefined);
    }
  }

  async function bulkUpdateTransactions(
    transactionIds: string[],
    changes: Partial<TransactionRecord>,
  ) {
    if (!transactionIds.length) return;

    setSource((current) => ({
      ...current,
      transactions: buildTransactionsWithBulkChange(current.transactions, transactionIds, changes),
    }));

    try {
      await api("/workspace/transactions/bulk", {
        method: "PATCH",
        body: JSON.stringify({
          ids: transactionIds,
          changes: mapTransactionPatch(changes),
        }),
      });
    } catch (error) {
      console.error("[FinanceStore] Failed to persist bulk transaction update:", error);
      await refreshWorkspace().catch(() => undefined);
    }
  }

  async function addRule(rule: Omit<CategorizationRule, "id" | "enabled">) {
    try {
      await api("/workspace/rules", {
        method: "POST",
        body: JSON.stringify({
          name: rule.name,
          description: rule.description,
          criteria: rule.criteria,
          actions: rule.actions,
          source: rule.source,
          enabled: true,
        }),
      });
      await refreshWorkspace();
    } catch (error) {
      console.error("[FinanceStore] Failed to save rule:", error);
    }
  }

  async function addCategoryGroup(input: { name: string; description: string; color: string }) {
    try {
      await api("/workspace/category-groups", {
        method: "POST",
        body: JSON.stringify({
          name: input.name,
          description: input.description,
          color: input.color,
          group_key: toKey(input.name),
        }),
      });
      await refreshWorkspace();
    } catch (error) {
      console.error("[FinanceStore] Failed to save category group:", error);
    }
  }

  async function addCategory(input: { name: string; groupId: string; budget?: number }) {
    try {
      await api("/workspace/categories", {
        method: "POST",
        body: JSON.stringify({
          name: input.name,
          group_key: input.groupId,
          monthly_budget: input.budget ?? null,
          category_key: toKey(input.name),
        }),
      });
      await refreshWorkspace();
    } catch (error) {
      console.error("[FinanceStore] Failed to save category:", error);
    }
  }

  function markNotificationRead(notificationId: string) {
    setReadNotificationIds((current) =>
      current.includes(notificationId) ? current : [...current, notificationId],
    );
  }

  async function askAdvisor(prompt: string) {
    const nextPrompt = prompt.trim();
    if (!nextPrompt) return;

    const userMessage: AdvisorMessage = {
      id: generateId("msg"),
      role: "user",
      content: nextPrompt,
      createdAt: new Date().toISOString(),
    };

    const reply = buildAdvisorReply(source, workspace, nextPrompt);
    const assistantMessage: AdvisorMessage = {
      id: generateId("msg"),
      role: "assistant",
      content: reply.content,
      cards: reply.cards,
      createdAt: new Date().toISOString(),
    };

    setAdvisorMessages((current) => [...current, userMessage, assistantMessage]);
  }

  return (
    <FinanceStoreContext.Provider
      value={{
        workspace,
        isHydrating,
        dateRange,
        selectedMemberId,
        selectedAccountId,
        theme,
        commandOpen,
        notificationsOpen,
        spendingSearch,
        deferredSpendingSearch,
        setDateRange,
        setSelectedMemberId,
        setSelectedAccountId,
        setTheme,
        setCommandOpen,
        setNotificationsOpen,
        setSpendingSearch,
        updateTransaction,
        bulkUpdateTransactions,
        addRule,
        addCategoryGroup,
        addCategory,
        markNotificationRead,
        askAdvisor,
        categoryPerformance,
        reviewQueue,
      }}
    >
      {children}
    </FinanceStoreContext.Provider>
  );
}

export function useFinanceStore() {
  const context = useContext(FinanceStoreContext);
  if (!context) {
    throw new Error("useFinanceStore must be used inside FinanceStoreProvider");
  }
  return context;
}

export function useMemberAccounts(memberId: string) {
  const { workspace } = useFinanceStore();
  return getMemberAccounts(workspace.accounts, memberId);
}

export function useSpendingMetrics(memberId: string) {
  const { workspace } = useFinanceStore();
  return calculateSpendingMetrics(workspace.transactions, memberId);
}
