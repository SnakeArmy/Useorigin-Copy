import {
  createUserCorrectionAudit,
  enrichTransactions,
  getCategoryBudget,
  getCategoryLabel,
  mapAccountDirection,
} from "@/lib/categorization";
import type {
  AdvisorMessage,
  BillRecord,
  CashFlowPoint,
  CategoryPerformance,
  CategoryRecord,
  DateRangeKey,
  DiagnosticIssue,
  FinanceSourceData,
  FinanceWorkspace,
  GoalRecord,
  HouseholdActivity,
  HouseholdBudget,
  HouseholdMember,
  NetWorthPoint,
  NotificationRecord,
  ProjectionPoint,
  ScenarioRecord,
  TransactionRecord,
} from "@/lib/finance-types";
import { formatCurrency, generateId, sum } from "@/lib/utils";

const DATE_RANGE_DAYS: Record<DateRangeKey, number> = {
  "30d": 30,
  "90d": 90,
  "180d": 180,
  "365d": 365,
};

interface ExpenseAllocation {
  categoryId: string;
  amount: number;
}

function startOfWindow(dateRange: DateRangeKey, now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - DATE_RANGE_DAYS[dateRange] + 1);
  return start;
}

function endOfWindow(now = new Date()) {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return end;
}

function isInRange(isoDate: string, dateRange: DateRangeKey, now = new Date()) {
  const value = new Date(isoDate);
  return value >= startOfWindow(dateRange, now) && value <= endOfWindow(now);
}

function toMonthKey(isoDate: string) {
  const date = new Date(isoDate);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function toMonthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: year === new Date().getFullYear() ? undefined : "2-digit",
  }).format(new Date(year, month - 1, 1));
}

function isTransfer(transaction: TransactionRecord) {
  return (
    transaction.direction === "transfer" ||
    transaction.categoryId === "transfers" ||
    transaction.badges.includes("transfer")
  );
}

function isExpense(transaction: TransactionRecord) {
  return transaction.direction === "expense" && !isTransfer(transaction) && !transaction.hiddenFromBudget;
}

function isIncome(transaction: TransactionRecord) {
  return transaction.direction === "income" && !isTransfer(transaction);
}

function getSignedAccountBalance(transactionSafeBalance: number, direction: number) {
  if (direction < 0) return -Math.abs(transactionSafeBalance);
  return transactionSafeBalance;
}

function getExpenseAllocations(transaction: TransactionRecord): ExpenseAllocation[] {
  if (!isExpense(transaction)) return [];

  const total = Math.abs(transaction.amount);
  if (!transaction.splits?.length) {
    return [{ categoryId: transaction.categoryId || "miscellaneous", amount: total }];
  }

  const splitTotal = sum(transaction.splits.map((split) => Math.abs(split.amount)));
  const allocations = transaction.splits.map((split) => ({
    categoryId: split.categoryId,
    amount: Math.abs(split.amount),
  }));

  if (splitTotal < total) {
    allocations.push({
      categoryId: transaction.categoryId || "miscellaneous",
      amount: total - splitTotal,
    });
  }

  return allocations;
}

function previousWindowTransactions(transactions: TransactionRecord[], dateRange: DateRangeKey, now = new Date()) {
  const currentStart = startOfWindow(dateRange, now);
  const rangeDays = DATE_RANGE_DAYS[dateRange];
  const prevEnd = new Date(currentStart);
  prevEnd.setDate(prevEnd.getDate() - 1);
  prevEnd.setHours(23, 59, 59, 999);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - rangeDays + 1);
  prevStart.setHours(0, 0, 0, 0);

  return transactions.filter((transaction) => {
    const postedAt = new Date(transaction.postedAt);
    return postedAt >= prevStart && postedAt <= prevEnd;
  });
}

function uniqueMonths(keys: string[]) {
  return Array.from(new Set(keys)).sort();
}

function monthEndFromKey(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month, 0, 23, 59, 59, 999);
}

export function getTransactionsInRange(
  transactions: TransactionRecord[],
  dateRange: DateRangeKey,
  now = new Date(),
) {
  return transactions.filter((transaction) => isInRange(transaction.postedAt, dateRange, now));
}

export function calculateReviewQueue(transactions: TransactionRecord[]) {
  return transactions
    .filter((transaction) => transaction.confidenceStatus === "needs-review")
    .sort((left, right) => left.confidenceScore - right.confidenceScore);
}

export function calculateCategoryPerformance(
  transactions: TransactionRecord[],
  categories: CategoryRecord[],
): CategoryPerformance[] {
  const totals = new Map<string, number>();

  for (const transaction of transactions) {
    for (const allocation of getExpenseAllocations(transaction)) {
      totals.set(allocation.categoryId, (totals.get(allocation.categoryId) || 0) + allocation.amount);
    }
  }

  return Array.from(totals.entries())
    .map(([categoryId, spent]) => ({
      categoryId,
      spent,
      budget: getCategoryBudget(categories, categoryId),
      delta: getCategoryBudget(categories, categoryId) - spent,
    }))
    .sort((left, right) => right.spent - left.spent);
}

export function calculateSpendingMetrics(
  transactions: TransactionRecord[],
  memberId: string,
) {
  const scoped = transactions.filter(
    (transaction) => transaction.memberId === memberId || transaction.householdOwner === "shared",
  );
  const expenses = scoped.filter(isExpense);
  const inflows = scoped.filter(isIncome);

  return {
    totalSpent: sum(expenses.map((transaction) => sum(getExpenseAllocations(transaction).map((item) => item.amount)))),
    totalIncome: sum(inflows.map((transaction) => Math.abs(transaction.amount))),
    averageExpense: expenses.length
      ? sum(expenses.map((transaction) => Math.abs(transaction.amount))) / expenses.length
      : 0,
    transactionCount: scoped.length,
  };
}

export function getMemberAccounts(accounts: FinanceSourceData["accounts"], memberId: string) {
  return accounts.filter((account) => account.memberId === memberId);
}

export function calculateAccountSummary(source: FinanceSourceData) {
  const assetAccounts = source.accounts.filter((account) => mapAccountDirection(account) > 0);
  const liabilityAccounts = source.accounts.filter((account) => mapAccountDirection(account) < 0);
  const liquidAccounts = assetAccounts.filter(
    (account) => account.type === "checking" || account.type === "savings",
  );
  const investmentAccounts = assetAccounts.filter((account) => account.type === "investment");

  const manualInvestmentAssets = source.assets.filter(
    (asset) => asset.type === "investment" || asset.type === "crypto",
  );
  const manualOtherAssets = source.assets.filter(
    (asset) => asset.type !== "investment" && asset.type !== "crypto",
  );

  const liquid = sum(liquidAccounts.map((account) => Math.max(0, account.balance)));
  const invested =
    sum(investmentAccounts.map((account) => Math.max(0, account.balance))) +
    sum(manualInvestmentAssets.map((asset) => asset.value));
  const otherAssets = sum(manualOtherAssets.map((asset) => asset.value));
  const liabilities = sum(
    liabilityAccounts.map((account) => Math.abs(getSignedAccountBalance(account.balance, mapAccountDirection(account)))),
  );
  const netWorth = liquid + invested + otherAssets - liabilities;

  return {
    liquid,
    invested,
    otherAssets,
    liabilities,
    netWorth,
    assetAccounts,
    liabilityAccounts,
  };
}

export function calculateCashFlowHistory(
  transactions: TransactionRecord[],
): CashFlowPoint[] {
  const grouped = new Map<string, { income: number; expenses: number }>();

  for (const transaction of transactions) {
    const key = toMonthKey(transaction.postedAt);
    const bucket = grouped.get(key) || { income: 0, expenses: 0 };

    if (isIncome(transaction)) {
      bucket.income += Math.abs(transaction.amount);
    }

    if (isExpense(transaction)) {
      bucket.expenses += sum(getExpenseAllocations(transaction).map((item) => item.amount));
    }

    grouped.set(key, bucket);
  }

  return uniqueMonths(Array.from(grouped.keys()))
    .slice(-6)
    .map((key) => {
      const bucket = grouped.get(key) || { income: 0, expenses: 0 };
      return {
        month: toMonthLabel(key),
        income: bucket.income,
        expenses: bucket.expenses,
        savings: bucket.income - bucket.expenses,
      };
    });
}

export function calculateNetWorthHistory(source: FinanceSourceData, dateRange: DateRangeKey): NetWorthPoint[] {
  if (!source.accountSnapshots.length) return [];

  const assetHistory = new Map<string, Array<{ asOfDate: string; value: number }>>();

  for (const asset of source.assets) {
    const entries = assetHistory.get(asset.id) || [];
    entries.push({ asOfDate: asset.asOfDate, value: asset.value });
    assetHistory.set(asset.id, entries.sort((left, right) => left.asOfDate.localeCompare(right.asOfDate)));
  }

  const snapshotsByAccount = new Map<string, Array<{ capturedOn: string; balance: number }>>();
  for (const snapshot of source.accountSnapshots) {
    const existing = snapshotsByAccount.get(snapshot.accountId) || [];
    existing.push({ capturedOn: snapshot.capturedOn, balance: snapshot.balance });
    existing.sort((left, right) => left.capturedOn.localeCompare(right.capturedOn));
    snapshotsByAccount.set(snapshot.accountId, existing);
  }

  const months = uniqueMonths(
    source.accountSnapshots
      .filter((snapshot) => isInRange(snapshot.capturedOn, dateRange))
      .map((snapshot) => toMonthKey(snapshot.capturedOn)),
  ).slice(-6);

  return months.map((monthKey) => {
    const monthEnd = monthEndFromKey(monthKey);
    let assetSide = 0;
    let debt = 0;

    for (const account of source.accounts) {
      const history = snapshotsByAccount.get(account.id) || [];
      const latest = [...history].reverse().find((entry) => new Date(entry.capturedOn) <= monthEnd);
      const fallbackBalance = latest ? latest.balance : account.balance;
      const signedBalance = getSignedAccountBalance(fallbackBalance, mapAccountDirection(account));
      if (signedBalance >= 0) {
        assetSide += signedBalance;
      } else {
        debt += Math.abs(signedBalance);
      }
    }

    for (const asset of source.assets) {
      const history = assetHistory.get(asset.id) || [];
      const latest = [...history].reverse().find((entry) => new Date(entry.asOfDate) <= monthEnd);
      assetSide += latest?.value || 0;
    }

    return {
      month: toMonthLabel(monthKey),
      netWorth: assetSide - debt,
      liquid: assetSide,
      debt,
    };
  });
}

export function calculateBudgetSummaries(
  source: FinanceSourceData,
  categoryPerformance: CategoryPerformance[],
): HouseholdBudget[] {
  const spendingByCategory = new Map(categoryPerformance.map((item) => [item.categoryId, item.spent]));

  return source.categoryGroups.map((group) => {
    const groupCategories = source.categories.filter((category) => category.groupId === group.id);
    const spent = sum(groupCategories.map((category) => spendingByCategory.get(category.id) || 0));
    const budget = sum(groupCategories.map((category) => category.budget || 0));

    return {
      id: `budget_${group.id}`,
      name: group.name,
      owners: group.id === "grp_life" ? ["me", "partner"] : ["shared"],
      spent,
      budget,
    };
  });
}

export function calculateBills(source: FinanceSourceData): BillRecord[] {
  const merchantGroups = new Map<string, TransactionRecord[]>();

  for (const transaction of source.transactions) {
    if (!isExpense(transaction)) continue;
    const key = transaction.merchantNormalized;
    const group = merchantGroups.get(key) || [];
    group.push(transaction);
    merchantGroups.set(key, group);
  }

  const bills: BillRecord[] = [];

  for (const transactions of merchantGroups.values()) {
    const ordered = [...transactions].sort((left, right) => left.postedAt.localeCompare(right.postedAt));
    const latest = ordered.at(-1);
    if (!latest) continue;

    const dayDiffs = ordered.slice(1).map((transaction, index) => {
      const previous = new Date(ordered[index].postedAt).getTime();
      const current = new Date(transaction.postedAt).getTime();
      return Math.round((current - previous) / (1000 * 60 * 60 * 24));
    });

    const averageInterval = dayDiffs.length
      ? sum(dayDiffs) / dayDiffs.length
      : latest.recurring || latest.subscription
        ? 30
        : 0;

    const looksRecurring =
      latest.recurring ||
      latest.subscription ||
      (dayDiffs.length > 0 && averageInterval >= 20 && averageInterval <= 40);

    if (!looksRecurring) continue;

    const dueDate = new Date(latest.postedAt);
    dueDate.setDate(dueDate.getDate() + Math.max(28, Math.round(averageInterval || 30)));

    bills.push({
      id: `bill_${latest.merchantNormalized}`,
      merchant: latest.displayMerchant,
      dueDate: dueDate.toISOString(),
      amount: Math.abs(latest.amount),
      frequency: "monthly",
      categoryId: latest.categoryId || "miscellaneous",
      autopay: latest.typeLabel.toLowerCase().includes("autopay") || latest.badges.includes("transfer"),
    });
  }

  return bills.sort((left, right) => left.dueDate.localeCompare(right.dueDate)).slice(0, 6);
}

function calculateInsights(
  source: FinanceSourceData,
  dateRange: DateRangeKey,
  transactionsInRange: TransactionRecord[],
  categoryPerformance: CategoryPerformance[],
  budgets: HouseholdBudget[],
  reviewQueue: TransactionRecord[],
  netWorthHistory: NetWorthPoint[],
): FinanceWorkspace["insights"] {
  const insights: FinanceWorkspace["insights"] = [];
  const previousTransactions = previousWindowTransactions(source.transactions, dateRange);
  const currentSpend = sum(categoryPerformance.map((item) => item.spent));
  const topCategory = categoryPerformance[0];
  const pressuredBudget = budgets
    .filter((budget) => budget.budget > 0)
    .sort((left, right) => right.spent / Math.max(right.budget, 1) - left.spent / Math.max(left.budget, 1))[0];

  if (topCategory) {
    const previousCategory = calculateCategoryPerformance(previousTransactions, source.categories).find(
      (item) => item.categoryId === topCategory.categoryId,
    );
    const delta = topCategory.spent - (previousCategory?.spent || 0);

    insights.push({
      id: "insight_spending",
      title: delta > 0 ? "Spending climbed in a few categories" : "Spending is holding steady",
      body:
        delta > 0
          ? `${getCategoryLabel(source.categories, topCategory.categoryId)} increased by ${formatCurrency(delta)} versus the prior period.`
          : `${getCategoryLabel(source.categories, topCategory.categoryId)} remains your largest category at ${formatCurrency(topCategory.spent)}.`,
      sentiment: delta > 0 ? "watch" : "positive",
      action: `Why did ${getCategoryLabel(source.categories, topCategory.categoryId)} change in the last ${DATE_RANGE_DAYS[dateRange]} days?`,
    });
  }

  if (pressuredBudget && pressuredBudget.budget > 0) {
    const ratio = pressuredBudget.spent / pressuredBudget.budget;
    insights.push({
      id: "insight_budget",
      title: ratio > 1 ? "One budget is already over plan" : "Budget pressure is concentrated",
      body: `${pressuredBudget.name} has used ${formatCurrency(pressuredBudget.spent)} of ${formatCurrency(pressuredBudget.budget)}.`,
      sentiment: ratio > 1 ? "watch" : "neutral",
      action: `Show me what is driving ${pressuredBudget.name} budget pressure.`,
    });
  }

  if (reviewQueue.length) {
    insights.push({
      id: "insight_review",
      title: "A few transactions still need categorization",
      body: `${reviewQueue.length} transactions remain in the review queue, which can distort category totals until they are confirmed.`,
      sentiment: "watch",
      action: "What should I review in my categorization queue first?",
    });
  }

  if (netWorthHistory.length >= 2) {
    const previous = netWorthHistory.at(-2);
    const current = netWorthHistory.at(-1);
    if (previous && current) {
      const delta = current.netWorth - previous.netWorth;
      insights.push({
        id: "insight_net_worth",
        title: delta >= 0 ? "Net worth moved higher" : "Net worth pulled back",
        body: `Net worth changed by ${formatCurrency(delta)} between ${previous.month} and ${current.month}.`,
        sentiment: delta >= 0 ? "positive" : "watch",
        action: "What changed in my net worth recently?",
      });
    }
  }

  if (!insights.length && transactionsInRange.length) {
    insights.push({
      id: "insight_default",
      title: "Data is connected, but there are few strong signals yet",
      body: `The current range includes ${transactionsInRange.length} transactions and ${formatCurrency(currentSpend)} of expenses.`,
      sentiment: "neutral",
      action: "Show me my largest spending categories.",
    });
  }

  return insights.slice(0, 3);
}

function calculateNotifications(
  source: FinanceSourceData,
  categoryPerformance: CategoryPerformance[],
  reviewQueue: TransactionRecord[],
  netWorthHistory: NetWorthPoint[],
  readNotificationIds: Set<string>,
): NotificationRecord[] {
  const notifications: NotificationRecord[] = [];
  const now = new Date().toISOString();

  if (reviewQueue.length) {
    notifications.push({
      id: "notif_review_queue",
      title: `${reviewQueue.length} transactions need review`,
      detail: `${formatCurrency(sum(reviewQueue.map((transaction) => Math.abs(transaction.amount))))} of activity is waiting on a confirmed category.`,
      createdAt: now,
      type: "review",
      read: readNotificationIds.has("notif_review_queue"),
    });
  }

  const overBudget = categoryPerformance.find((item) => item.delta < 0);
  if (overBudget) {
    notifications.push({
      id: `notif_budget_${overBudget.categoryId}`,
      title: `${getCategoryLabel(source.categories, overBudget.categoryId)} is over budget`,
      detail: `Current spend is ${formatCurrency(overBudget.spent)} against a ${formatCurrency(overBudget.budget)} plan.`,
      createdAt: now,
      type: "insight",
      read: readNotificationIds.has(`notif_budget_${overBudget.categoryId}`),
    });
  }

  if (!source.meta.coverage.accountHistory) {
    notifications.push({
      id: "notif_missing_history",
      title: "Net worth history needs more balance snapshots",
      detail: "The current net worth is accurate, but the history chart will fill in after more syncs are recorded.",
      createdAt: now,
      type: "security",
      read: readNotificationIds.has("notif_missing_history"),
    });
  }

  if (netWorthHistory.length >= 2) {
    const current = netWorthHistory.at(-1);
    const previous = netWorthHistory.at(-2);
    if (current && previous) {
      notifications.push({
        id: "notif_net_worth",
        title: "Net worth change recorded",
        detail: `${current.month} net worth is ${formatCurrency(current.netWorth)} versus ${formatCurrency(previous.netWorth)} in ${previous.month}.`,
        createdAt: now,
        type: "household",
        read: readNotificationIds.has("notif_net_worth"),
      });
    }
  }

  return notifications.slice(0, 4);
}

function calculateHouseholdActivity(
  source: FinanceSourceData,
  transactionsInRange: TransactionRecord[],
): HouseholdActivity[] {
  const activity: HouseholdActivity[] = [];

  for (const transaction of transactionsInRange) {
    const latestUserAudit = [...transaction.audit]
      .filter((entry) => entry.actor === "user")
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp))[0];

    if (latestUserAudit) {
      activity.push({
        id: `activity_txn_${transaction.id}`,
        memberId: transaction.memberId,
        event: "Reviewed transaction",
        detail: `${transaction.displayMerchant} is currently categorized as ${getCategoryLabel(
          source.categories,
          transaction.categoryId,
        )}.`,
        timestamp: latestUserAudit.timestamp,
      });
    }
  }

  for (const rule of source.rules.filter((item) => item.source === "user").slice(0, 3)) {
    activity.push({
      id: `activity_rule_${rule.id}`,
      memberId: source.members[0]?.id || "me",
      event: "Created rule",
      detail: rule.description || `${rule.name} is active.`,
      timestamp: new Date().toISOString(),
    });
  }

  return activity.sort((left, right) => right.timestamp.localeCompare(left.timestamp)).slice(0, 6);
}

function buildScenarioDefaults(accountSummary: ReturnType<typeof calculateAccountSummary>, cashFlowHistory: CashFlowPoint[]) {
  const currentSavings =
    cashFlowHistory.at(-1)?.savings ||
    Math.max(0, sum(cashFlowHistory.map((point) => point.savings)) / Math.max(cashFlowHistory.length, 1));

  return [
    {
      id: "scenario_base",
      name: "Base plan",
      monthlySavings: Math.max(0, Math.round(currentSavings)),
      marketReturn: 6,
      retirementAge: 60,
      targetHomeDownPayment: 80000,
    },
    {
      id: "scenario_stretch",
      name: "Stretch",
      monthlySavings: Math.max(0, Math.round(currentSavings * 1.2)),
      marketReturn: 6.8,
      retirementAge: 58,
      targetHomeDownPayment: 100000,
    },
    {
      id: "scenario_cautious",
      name: "Cautious",
      monthlySavings: Math.max(0, Math.round(currentSavings * 0.75)),
      marketReturn: 5,
      retirementAge: 62,
      targetHomeDownPayment: 70000,
    },
  ] satisfies ScenarioRecord[];
}

export function calculateScenarioProjection(
  currentNetWorth: number,
  monthlySavings: number,
  marketReturn: number,
  years = 6,
) {
  const points: number[] = [];
  let value = currentNetWorth;
  const annualRate = marketReturn / 100;

  for (let index = 1; index <= years; index += 1) {
    value = value * (1 + annualRate) + monthlySavings * 12;
    points.push(Math.round(value));
  }

  return points;
}

function buildProjection(
  currentNetWorth: number,
  scenarios: ScenarioRecord[],
): ProjectionPoint[] {
  const baseScenario = scenarios.find((scenario) => scenario.id === "scenario_base") || scenarios[0];
  const stretchScenario = scenarios.find((scenario) => scenario.id === "scenario_stretch") || scenarios[1] || baseScenario;
  const cautiousScenario = scenarios.find((scenario) => scenario.id === "scenario_cautious") || scenarios[2] || baseScenario;
  const currentYear = new Date().getFullYear();
  const basePoints = calculateScenarioProjection(currentNetWorth, baseScenario.monthlySavings, baseScenario.marketReturn);
  const stretchPoints = calculateScenarioProjection(
    currentNetWorth,
    stretchScenario.monthlySavings,
    stretchScenario.marketReturn,
  );
  const cautiousPoints = calculateScenarioProjection(
    currentNetWorth,
    cautiousScenario.monthlySavings,
    cautiousScenario.marketReturn,
  );

  return basePoints.map((base, index) => ({
    year: String(currentYear + index + 1),
    base,
    stretch: stretchPoints[index] || base,
    cautious: cautiousPoints[index] || base,
  }));
}

function runDiagnostics(
  source: FinanceSourceData,
  visibleTransactions: TransactionRecord[],
  categoryPerformance: CategoryPerformance[],
): DiagnosticIssue[] {
  const diagnostics: DiagnosticIssue[] = [];
  const duplicateAccounts = source.accounts.filter(
    (account, index, all) => all.findIndex((candidate) => candidate.id === account.id) !== index,
  );

  if (duplicateAccounts.length) {
    diagnostics.push({
      id: "diag_duplicate_accounts",
      level: "error",
      title: "Duplicate accounts detected",
      detail: `${duplicateAccounts.length} accounts share the same identifier and could be double-counted.`,
    });
  }

  const missingAccountTransactions = visibleTransactions.filter(
    (transaction) => !source.accounts.some((account) => account.id === transaction.accountId),
  );
  if (missingAccountTransactions.length) {
    diagnostics.push({
      id: "diag_orphaned_transactions",
      level: "error",
      title: "Some transactions do not map to a loaded account",
      detail: `${missingAccountTransactions.length} transactions could not be traced back to an account.`,
    });
  }

  const uncategorizedSpend = categoryPerformance.find((item) => item.categoryId === "miscellaneous");
  if (uncategorizedSpend && uncategorizedSpend.spent > 0) {
    diagnostics.push({
      id: "diag_miscellaneous_spend",
      level: "warning",
      title: "Miscellaneous spend is affecting reporting",
      detail: `${formatCurrency(uncategorizedSpend.spent)} is still falling into Miscellaneous.`,
    });
  }

  if (!source.meta.coverage.accountHistory) {
    diagnostics.push({
      id: "diag_missing_net_worth_history",
      level: "warning",
      title: "Net worth history is incomplete",
      detail: "Balance snapshots are needed to render a trustworthy multi-period net worth chart.",
    });
  }

  return diagnostics;
}

export function buildFinanceWorkspace(
  source: FinanceSourceData,
  options: {
    dateRange: DateRangeKey;
    advisorMessages: AdvisorMessage[];
    readNotificationIds: Set<string>;
  },
): FinanceWorkspace {
  const enrichedTransactions = enrichTransactions(
    source.transactions.map((transaction) => structuredClone(transaction)),
    source.rules,
    source.categories,
  ).sort((left, right) => right.postedAt.localeCompare(left.postedAt));
  const transactions = getTransactionsInRange(enrichedTransactions, options.dateRange);
  const categoryPerformance = calculateCategoryPerformance(transactions, source.categories);
  const reviewQueue = calculateReviewQueue(transactions);
  const budgets = calculateBudgetSummaries(source, categoryPerformance);
  const bills = calculateBills(source);
  const netWorthHistory = calculateNetWorthHistory(source, options.dateRange);
  const cashFlowHistory = calculateCashFlowHistory(transactions);
  const accountSummary = calculateAccountSummary(source);
  const scenarios = buildScenarioDefaults(accountSummary, cashFlowHistory);
  const projection = buildProjection(accountSummary.netWorth, scenarios);
  const insights = calculateInsights(
    source,
    options.dateRange,
    transactions,
    categoryPerformance,
    budgets,
    reviewQueue,
    netWorthHistory,
  );
  const notifications = calculateNotifications(
    source,
    categoryPerformance,
    reviewQueue,
    netWorthHistory,
    options.readNotificationIds,
  );
  const diagnostics = runDiagnostics(source, transactions, categoryPerformance);

  return {
    brand: source.brand,
    meta: {
      ...source.meta,
      diagnostics,
    },
    members: source.members,
    accounts: source.accounts,
    assets: source.assets,
    accountSnapshots: source.accountSnapshots,
    categories: source.categories,
    categoryGroups: source.categoryGroups,
    tags: source.tags,
    rules: source.rules,
    transactions,
    netWorthHistory,
    cashFlowHistory,
    investments: [],
    watchlist: [],
    goals: [] satisfies GoalRecord[],
    bills,
    notifications,
    insights,
    budgets,
    householdActivity: calculateHouseholdActivity(source, transactions),
    scenarios,
    projection,
    advisorMessages: options.advisorMessages,
  };
}

export function buildTransactionsWithUserChange(
  transactions: TransactionRecord[],
  transactionId: string,
  changes: Partial<TransactionRecord>,
) {
  return transactions.map((transaction) => {
    if (transaction.id !== transactionId) return transaction;

    const nextCategoryId =
      Object.prototype.hasOwnProperty.call(changes, "categoryId")
        ? changes.categoryId || null
        : transaction.categoryId;

    return {
      ...transaction,
      ...changes,
      categoryId: nextCategoryId,
      suggestedCategoryId: nextCategoryId ?? transaction.suggestedCategoryId,
      subscription:
        nextCategoryId === "subscriptions" ||
        changes.subscription === true ||
        (transaction.subscription && !Object.prototype.hasOwnProperty.call(changes, "categoryId")),
      confidenceStatus: nextCategoryId ? "user-corrected" : transaction.confidenceStatus,
      confidenceScore: nextCategoryId ? 1 : transaction.confidenceScore,
      confidenceReason: nextCategoryId
        ? "Updated directly from the transaction review flow."
        : transaction.confidenceReason,
      badges: Array.from(
        new Set([
          ...transaction.badges.filter((badge) => badge !== "hidden" && badge !== "recurring"),
          ...(nextCategoryId === "subscriptions" ||
          changes.subscription === true ||
          (transaction.subscription && !Object.prototype.hasOwnProperty.call(changes, "categoryId"))
            ? ["subscription"]
            : []),
          ...(changes.hiddenFromBudget ?? transaction.hiddenFromBudget ? ["hidden"] : []),
          ...(changes.recurring ?? transaction.recurring ? ["recurring"] : []),
        ]),
      ) as TransactionRecord["badges"],
      audit: [
        createUserCorrectionAudit("Transaction updated from the review workspace."),
        ...transaction.audit,
      ],
    };
  });
}

export function buildTransactionsWithBulkChange(
  transactions: TransactionRecord[],
  transactionIds: string[],
  changes: Partial<TransactionRecord>,
) {
  return transactionIds.reduce(
    (current, transactionId) => buildTransactionsWithUserChange(current, transactionId, changes),
    transactions,
  );
}

export function buildUserRuleActivity(
  ruleName: string,
  description: string,
  member: HouseholdMember | undefined,
): HouseholdActivity {
  return {
    id: generateId("activity"),
    memberId: member?.id || "me",
    event: "Created rule",
    detail: description || `${ruleName} is now active.`,
    timestamp: new Date().toISOString(),
  };
}
