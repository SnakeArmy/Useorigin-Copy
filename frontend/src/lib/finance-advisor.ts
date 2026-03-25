import { getCategoryLabel } from "@/lib/categorization";
import {
  calculateAccountSummary,
  calculateBills,
  calculateCategoryPerformance,
  calculateReviewQueue,
} from "@/lib/finance-selectors";
import type {
  CategoryPerformance,
  ChatCardPayload,
  FinanceSourceData,
  FinanceWorkspace,
  TransactionRecord,
} from "@/lib/finance-types";
import { formatCurrency, titleCase } from "@/lib/utils";

interface AdvisorReply {
  content: string;
  cards: ChatCardPayload[];
}

function toWindow(transactions: TransactionRecord[], start: Date, end: Date) {
  return transactions.filter((transaction) => {
    const postedAt = new Date(transaction.postedAt);
    return postedAt >= start && postedAt <= end;
  });
}

function previous30DayCategoryPerformance(source: FinanceSourceData) {
  const today = new Date();
  const currentStart = new Date(today);
  currentStart.setHours(0, 0, 0, 0);
  currentStart.setDate(currentStart.getDate() - 29);
  const previousEnd = new Date(currentStart);
  previousEnd.setDate(previousEnd.getDate() - 1);
  previousEnd.setHours(23, 59, 59, 999);
  const previousStart = new Date(previousEnd);
  previousStart.setDate(previousStart.getDate() - 29);
  previousStart.setHours(0, 0, 0, 0);

  return calculateCategoryPerformance(
    toWindow(source.transactions, previousStart, previousEnd),
    source.categories,
  );
}

function topCategoriesText(categories: CategoryPerformance[], source: FinanceSourceData) {
  if (!categories.length) {
    return "No categorized spending is available in the current range.";
  }

  return categories
    .slice(0, 5)
    .map(
      (category, index) =>
        `${index + 1}. ${getCategoryLabel(source.categories, category.categoryId)}: ${formatCurrency(category.spent)}`,
    )
    .join("\n");
}

function findTransactionFromPrompt(workspace: FinanceWorkspace, prompt: string) {
  const normalizedPrompt = prompt.toLowerCase();
  return workspace.transactions.find(
    (transaction) =>
      normalizedPrompt.includes(transaction.displayMerchant.toLowerCase()) ||
      normalizedPrompt.includes(transaction.merchantNormalized.toLowerCase()),
  );
}

function buildTransactionExplanation(transaction: TransactionRecord, workspace: FinanceWorkspace): AdvisorReply {
  const explanation = [
    `${transaction.displayMerchant} is currently categorized as ${getCategoryLabel(workspace.categories, transaction.categoryId)}.`,
    `Direction: ${transaction.direction}. Amount: ${formatCurrency(Math.abs(transaction.amount))}.`,
    `Reason: ${transaction.confidenceReason}`,
  ];

  if (transaction.ruleId) {
    const matchingRule = workspace.rules.find((rule) => rule.id === transaction.ruleId);
    if (matchingRule) {
      explanation.push(`A saved rule matched this transaction: ${matchingRule.name}.`);
    }
  }

  if (transaction.badges.length) {
    explanation.push(`Badges: ${transaction.badges.join(", ")}.`);
  }

  if (transaction.tags.length) {
    explanation.push(
      `Tags: ${transaction.tags
        .map((tagId) => workspace.tags.find((tag) => tag.id === tagId)?.name || tagId)
        .join(", ")}.`,
    );
  }

  return {
    content: explanation.join("\n"),
    cards: [
      {
        type: "insight",
        title: transaction.displayMerchant,
        metric: formatCurrency(Math.abs(transaction.amount)),
        supporting: transaction.confidenceReason,
      },
    ],
  };
}

function buildSpendingChangeReply(source: FinanceSourceData, workspace: FinanceWorkspace): AdvisorReply {
  const current = calculateCategoryPerformance(workspace.transactions, workspace.categories);
  const previous = previous30DayCategoryPerformance(source);
  const deltas = current
    .map((category) => ({
      ...category,
      previous: previous.find((item) => item.categoryId === category.categoryId)?.spent || 0,
    }))
    .map((category) => ({
      ...category,
      delta: category.spent - category.previous,
    }))
    .sort((left, right) => right.delta - left.delta);

  const positiveDrivers = deltas.filter((item) => item.delta > 0).slice(0, 3);
  const content = positiveDrivers.length
    ? [
        "Spending increased most in these categories:",
        ...positiveDrivers.map(
          (item) =>
            `- ${getCategoryLabel(source.categories, item.categoryId)}: ${formatCurrency(item.spent)} now vs ${formatCurrency(item.previous)} before (${formatCurrency(item.delta)} higher).`,
        ),
      ].join("\n")
    : "I do not see a category-level spending increase versus the prior 30-day window.";

  return {
    content,
    cards: positiveDrivers.slice(0, 2).map((item) => ({
      type: "budget",
      title: getCategoryLabel(source.categories, item.categoryId),
      metric: formatCurrency(item.spent),
      supporting: `${formatCurrency(item.delta)} above the prior period.`,
    })),
  };
}

function buildNetWorthReply(source: FinanceSourceData, workspace: FinanceWorkspace): AdvisorReply {
  const summary = calculateAccountSummary(source);
  const previous = workspace.netWorthHistory.at(-2);
  const current = workspace.netWorthHistory.at(-1);
  const delta = previous && current ? current.netWorth - previous.netWorth : null;

  const lines = [
    `Current net worth: ${formatCurrency(summary.netWorth)}.`,
    `Liquid assets: ${formatCurrency(summary.liquid)}.`,
    `Invested assets and manual investment assets: ${formatCurrency(summary.invested)}.`,
    `Other manual assets: ${formatCurrency(summary.otherAssets)}.`,
    `Liabilities: ${formatCurrency(summary.liabilities)}.`,
  ];

  if (delta !== null) {
    lines.push(`Change since ${previous?.month}: ${formatCurrency(delta)}.`);
  } else {
    lines.push("I can explain the current breakdown, but there are not enough balance snapshots yet for a trustworthy net worth trend.");
  }

  return {
    content: lines.join("\n"),
    cards: [
      {
        type: "portfolio",
        title: "Net worth",
        metric: formatCurrency(summary.netWorth),
        supporting:
          delta === null ? "Current balances only" : `${formatCurrency(delta)} vs previous snapshot month`,
      },
    ],
  };
}

function buildSubscriptionReply(source: FinanceSourceData): AdvisorReply {
  const bills = calculateBills(source).filter((bill) => bill.categoryId === "subscriptions");
  if (!bills.length) {
    return {
      content: "No subscription-like recurring merchants are clearly identified in the connected transaction history yet.",
      cards: [],
    };
  }

  return {
    content: [
      "Detected subscription merchants:",
      ...bills.map((bill) => `- ${bill.merchant}: ${formatCurrency(bill.amount)} expected ${bill.frequency}.`),
    ].join("\n"),
    cards: bills.slice(0, 2).map((bill) => ({
      type: "budget",
      title: bill.merchant,
      metric: formatCurrency(bill.amount),
      supporting: `Expected ${bill.frequency} charge.`,
    })),
  };
}

function buildLargestCategoriesReply(source: FinanceSourceData, workspace: FinanceWorkspace): AdvisorReply {
  const categories = calculateCategoryPerformance(workspace.transactions, source.categories);
  return {
    content: `Largest spending categories in the active range:\n${topCategoriesText(categories, source)}`,
    cards: categories.slice(0, 2).map((category) => ({
      type: "budget",
      title: getCategoryLabel(source.categories, category.categoryId),
      metric: formatCurrency(category.spent),
      supporting: `Budget ${formatCurrency(category.budget)}.`,
    })),
  };
}

function buildReviewQueueReply(workspace: FinanceWorkspace): AdvisorReply {
  const reviewQueue = calculateReviewQueue(workspace.transactions);
  if (!reviewQueue.length) {
    return {
      content: "The review queue is clear. Every transaction in the current range has either a saved rule or a confirmed category.",
      cards: [],
    };
  }

  return {
    content: [
      "These transactions deserve review first:",
      ...reviewQueue.slice(0, 5).map(
        (transaction) =>
          `- ${transaction.displayMerchant}: ${formatCurrency(Math.abs(transaction.amount))} with ${Math.round(transaction.confidenceScore * 100)}% confidence.`,
      ),
    ].join("\n"),
    cards: reviewQueue.slice(0, 2).map((transaction) => ({
      type: "insight",
      title: transaction.displayMerchant,
      metric: `${Math.round(transaction.confidenceScore * 100)}%`,
      supporting: transaction.confidenceReason,
    })),
  };
}

function buildDefaultReply(source: FinanceSourceData, workspace: FinanceWorkspace): AdvisorReply {
  const accountSummary = calculateAccountSummary(source);
  const categoryPerformance = calculateCategoryPerformance(workspace.transactions, source.categories);

  return {
    content: [
      `Current net worth is ${formatCurrency(accountSummary.netWorth)}.`,
      `Top spending categories:\n${topCategoriesText(categoryPerformance, source)}`,
      `Transactions in the current range: ${workspace.transactions.length}.`,
    ].join("\n"),
    cards: [
      {
        type: "insight",
        title: "Net worth",
        metric: formatCurrency(accountSummary.netWorth),
        supporting: "Computed directly from connected accounts and manual assets.",
      },
      ...(categoryPerformance[0]
        ? [
            {
              type: "budget" as const,
              title: getCategoryLabel(source.categories, categoryPerformance[0].categoryId),
              metric: formatCurrency(categoryPerformance[0].spent),
              supporting: "Largest spending category in the active range.",
            },
          ]
        : []),
    ],
  };
}

export function buildAdvisorReply(source: FinanceSourceData, workspace: FinanceWorkspace, prompt: string): AdvisorReply {
  const normalizedPrompt = prompt.toLowerCase();
  const promptTransaction = findTransactionFromPrompt(workspace, normalizedPrompt);

  if (!source.accounts.length && !source.transactions.length) {
    return {
      content:
        "I do not have connected account or transaction data yet. Link accounts or import transactions first, and I will answer from that real data instead of guessing.",
      cards: [],
    };
  }

  if (
    promptTransaction &&
    (normalizedPrompt.includes("why was this") ||
      normalizedPrompt.includes("why did this") ||
      normalizedPrompt.includes("marked"))
  ) {
    return buildTransactionExplanation(promptTransaction, workspace);
  }

  if (normalizedPrompt.includes("spending") && (normalizedPrompt.includes("increase") || normalizedPrompt.includes("change"))) {
    return buildSpendingChangeReply(source, workspace);
  }

  if (normalizedPrompt.includes("net worth")) {
    return buildNetWorthReply(source, workspace);
  }

  if (normalizedPrompt.includes("subscription")) {
    return buildSubscriptionReply(source);
  }

  if (
    normalizedPrompt.includes("largest spending") ||
    normalizedPrompt.includes("largest categories") ||
    normalizedPrompt.includes("top categories")
  ) {
    return buildLargestCategoriesReply(source, workspace);
  }

  if (normalizedPrompt.includes("review") || normalizedPrompt.includes("categorization")) {
    return buildReviewQueueReply(workspace);
  }

  return buildDefaultReply(source, workspace);
}

export function buildRuleDraftExplanation(transaction: TransactionRecord, workspace: FinanceWorkspace) {
  return [
    `${transaction.displayMerchant} is a good rule candidate because it appears as ${titleCase(transaction.direction)} activity.`,
    `Current category: ${getCategoryLabel(workspace.categories, transaction.categoryId)}.`,
    `Current reasoning: ${transaction.confidenceReason}.`,
  ].join("\n");
}
