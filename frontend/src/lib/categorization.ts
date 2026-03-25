import type {
  AccountRecord,
  AuditEntry,
  CategorizationRule,
  CategoryGroup,
  CategoryRecord,
  HouseholdMember,
  RuleAction,
  RuleCriterion,
  TagRecord,
  TransactionBadge,
  TransactionDirection,
  TransactionRecord,
} from "@/lib/finance-types";
import { generateId, groupBy, titleCase } from "@/lib/utils";

const IGNORE_PREFIXES = [
  "pos debit ",
  "pos purchase ",
  "tst*",
  "sq *",
  "sq * ",
  "awl*",
  "py *",
  "py ",
  "phys pr payment ppd id:",
];

const CANONICAL_MERCHANTS: Array<[RegExp, string]> = [
  [/amazon/i, "Amazon"],
  [/uber/i, "Uber"],
  [/netflix/i, "Netflix"],
  [/spotify/i, "Spotify"],
  [/pse&g|pseng|pseg/i, "PSE&G"],
  [/chase credit crd autopay|credit crd autopay/i, "Chase Credit Card Autopay"],
  [/whole foods/i, "Whole Foods"],
  [/cava/i, "Cava"],
  [/costco/i, "Costco"],
  [/halal food cart/i, "Halal Food Cart"],
  [/delta/i, "Delta"],
  [/airbnb/i, "Airbnb"],
  [/vanguard/i, "Vanguard"],
  [/shoprite/i, "ShopRite"],
  [/walmart/i, "Walmart"],
  [/wingstop/i, "Wingstop"],
];

const CATEGORY_PATTERNS: Array<{
  match: RegExp;
  category: string;
  direction?: TransactionDirection;
  confidence: number;
  tags?: string[];
  badges?: TransactionBadge[];
}> = [
  {
    match: /credit crd autopay|payment to chase|loan servicer|internal transfer/i,
    category: "transfers",
    direction: "transfer",
    confidence: 0.96,
    badges: ["transfer"],
  },
  {
    match: /netflix|spotify|apple.com\/bill|hbo max|notion/i,
    category: "subscriptions",
    confidence: 0.95,
    badges: ["subscription", "recurring"],
  },
  {
    match: /uber trip|lyft|nj transit|mta/i,
    category: "transportation",
    confidence: 0.88,
  },
  {
    match: /shell|exxon|bp |fuel|speedway/i,
    category: "gas-fuel",
    confidence: 0.91,
  },
  {
    match: /whole foods|shoprite|costco|trader joe|walmart|amazon fresh/i,
    category: "groceries",
    confidence: 0.9,
  },
  {
    match: /cava|wingstop|sweetgreen|starbucks|halal food cart/i,
    category: "dining",
    confidence: 0.91,
  },
  {
    match: /pse&g|verizon|comcast|at&t|water authority/i,
    category: "utilities",
    confidence: 0.92,
    badges: ["recurring"],
  },
  {
    match: /amazon|nike|target|best buy|bjs membership/i,
    category: "shopping",
    confidence: 0.82,
  },
  {
    match: /playstation|ticketmaster|movie|concert/i,
    category: "entertainment",
    confidence: 0.84,
  },
  {
    match: /delta|airbnb|marriott|hilton/i,
    category: "travel",
    confidence: 0.91,
  },
  {
    match: /cvs|walgreens|medical|dental|hospital/i,
    category: "health-medical",
    confidence: 0.89,
  },
  {
    match: /zelle payment from|payroll|stripe transfer|direct deposit/i,
    category: "income",
    direction: "income",
    confidence: 0.95,
  },
  {
    match: /vanguard|roth ira|brokerage/i,
    category: "investments",
    confidence: 0.9,
  },
  {
    match: /daycare|school|pearson education/i,
    category: "education",
    confidence: 0.85,
  },
];

export function createDefaultCategoryGroups(): CategoryGroup[] {
  return [
    {
      id: "grp_core",
      name: "Core spend",
      description: "Everyday life and fixed living costs.",
      color: "var(--accent-jade)",
    },
    {
      id: "grp_future",
      name: "Future planning",
      description: "Saving, investing, and long-term obligations.",
      color: "var(--accent-sky)",
    },
    {
      id: "grp_life",
      name: "Lifestyle",
      description: "Choice-based spending and family goals.",
      color: "var(--accent-amber)",
    },
    {
      id: "grp_admin",
      name: "Admin",
      description: "Transfers, taxes, and clean-up categories.",
      color: "var(--accent-rose)",
    },
  ].map((group) => ({ ...group, source: "system" as const }));
}

export function createDefaultCategories(): CategoryRecord[] {
  return [
    { id: "income", name: "Income", groupId: "grp_admin", parentId: null, icon: "ArrowDownLeft" },
    { id: "transfers", name: "Transfers", groupId: "grp_admin", parentId: null, icon: "Repeat2" },
    { id: "housing", name: "Housing", groupId: "grp_core", parentId: null, icon: "House", budget: 2500 },
    { id: "rent", name: "Rent / Mortgage", groupId: "grp_core", parentId: "housing", icon: "Building2" },
    { id: "utilities", name: "Utilities", groupId: "grp_core", parentId: null, icon: "PlugZap", budget: 420 },
    { id: "groceries", name: "Groceries", groupId: "grp_core", parentId: null, icon: "ShoppingBasket", budget: 950 },
    { id: "dining", name: "Dining", groupId: "grp_life", parentId: null, icon: "UtensilsCrossed", budget: 450 },
    { id: "transportation", name: "Transportation", groupId: "grp_core", parentId: null, icon: "CarFront", budget: 260 },
    { id: "gas-fuel", name: "Gas / Fuel", groupId: "grp_core", parentId: "transportation", icon: "Fuel", budget: 180 },
    { id: "shopping", name: "Shopping", groupId: "grp_life", parentId: null, icon: "ShoppingBag", budget: 320 },
    { id: "entertainment", name: "Entertainment", groupId: "grp_life", parentId: null, icon: "Clapperboard", budget: 180 },
    { id: "travel", name: "Travel", groupId: "grp_life", parentId: null, icon: "Plane", budget: 350 },
    { id: "health-medical", name: "Health / Medical", groupId: "grp_core", parentId: null, icon: "HeartPulse", budget: 220 },
    { id: "insurance", name: "Insurance", groupId: "grp_future", parentId: null, icon: "ShieldCheck", budget: 180 },
    { id: "debt-loans", name: "Debt / Loans", groupId: "grp_future", parentId: null, icon: "BadgeDollarSign", budget: 260 },
    { id: "savings", name: "Savings", groupId: "grp_future", parentId: null, icon: "PiggyBank" },
    { id: "investments", name: "Investments", groupId: "grp_future", parentId: null, icon: "CandlestickChart" },
    { id: "kids-family", name: "Kids / Family", groupId: "grp_life", parentId: null, icon: "Baby", budget: 300 },
    { id: "pets", name: "Pets", groupId: "grp_life", parentId: null, icon: "PawPrint", budget: 90 },
    { id: "education", name: "Education", groupId: "grp_future", parentId: null, icon: "GraduationCap", budget: 180 },
    { id: "gifts-donations", name: "Gifts / Donations", groupId: "grp_life", parentId: null, icon: "Gift", budget: 120 },
    { id: "fees", name: "Fees", groupId: "grp_admin", parentId: null, icon: "ReceiptText", budget: 50 },
    { id: "taxes", name: "Taxes", groupId: "grp_admin", parentId: null, icon: "Landmark", budget: 200 },
    { id: "subscriptions", name: "Subscriptions", groupId: "grp_life", parentId: null, icon: "TvMinimalPlay", budget: 120 },
    { id: "miscellaneous", name: "Miscellaneous", groupId: "grp_admin", parentId: null, icon: "Package2", budget: 120 },
  ].map((category) => ({ ...category, source: "system" as const }));
}

export function createDefaultTags(): TagRecord[] {
  return [
    { id: "tag_household", name: "Household", color: "#5eead4" },
    { id: "tag_reimbursable", name: "Reimbursable", color: "#fbbf24" },
    { id: "tag_tax", name: "Tax related", color: "#f97316" },
    { id: "tag_trip", name: "Trip", color: "#38bdf8" },
    { id: "tag_partner", name: "Partner", color: "#f472b6" },
  ];
}

export function createDefaultRules(): CategorizationRule[] {
  return [
    {
      id: "rule_autopay_transfer",
      name: "Credit card autopay transfer",
      description: "Hide internal card payments from spend analytics.",
      enabled: true,
      source: "system",
      criteria: [
        { type: "merchant_contains", value: "chase credit card autopay" },
      ],
      actions: [
        { type: "set_category", categoryId: "transfers" },
        { type: "set_transaction_type", direction: "transfer" },
        { type: "hide_from_budget", value: true },
        { type: "mark_recurring", value: true },
      ],
    },
    {
      id: "rule_pseg_utilities",
      name: "Utilities for PSE&G",
      description: "Utility bills route to Utilities and recurring.",
      enabled: true,
      source: "system",
      criteria: [{ type: "merchant_contains", value: "pse&g" }],
      actions: [
        { type: "set_category", categoryId: "utilities" },
        { type: "mark_recurring", value: true },
      ],
    },
    {
      id: "rule_uber_transport",
      name: "Transport for rideshare",
      description: "Uber and Lyft map to Transportation.",
      enabled: true,
      source: "system",
      criteria: [{ type: "merchant_contains", value: "uber" }],
      actions: [{ type: "set_category", categoryId: "transportation" }],
    },
    {
      id: "rule_netflix_subscription",
      name: "Streaming subscriptions",
      description: "Streaming merchants count as subscriptions.",
      enabled: true,
      source: "system",
      criteria: [{ type: "merchant_contains", value: "netflix" }],
      actions: [
        { type: "set_category", categoryId: "subscriptions" },
        { type: "mark_recurring", value: true },
      ],
    },
  ];
}

export function normalizeMerchant(value: string) {
  let normalized = value.trim().toLowerCase();
  IGNORE_PREFIXES.forEach((prefix) => {
    if (normalized.startsWith(prefix)) normalized = normalized.slice(prefix.length);
  });

  normalized = normalized
    .replace(/\d{2}\/\d{2}/g, "")
    .replace(/\d{4,}/g, "")
    .replace(/[^\w& ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const [pattern, canonical] of CANONICAL_MERCHANTS) {
    if (pattern.test(normalized)) {
      return { normalized: canonical.toLowerCase(), display: canonical };
    }
  }

  return {
    normalized,
    display: titleCase(normalized || value),
  };
}

export function inferDirection(amount: number, raw: string) {
  const lower = raw.toLowerCase();
  if (
    lower.includes("transfer") ||
    lower.includes("autopay") ||
    lower.includes("payment to") ||
    lower.includes("payment from")
  ) {
    return "transfer" as const;
  }

  if (amount > 0) return "income" as const;
  return "expense" as const;
}

function matchCriterion(
  criterion: RuleCriterion,
  transaction: TransactionRecord,
) {
  const amount = Math.abs(transaction.amount);

  switch (criterion.type) {
    case "merchant_contains":
      return transaction.merchantNormalized.includes(criterion.value.toLowerCase());
    case "merchant_equals":
      return transaction.merchantNormalized === criterion.value.toLowerCase();
    case "account":
      return transaction.accountId === criterion.value;
    case "amount_equals":
      return amount === criterion.value;
    case "amount_greater_than":
      return amount > criterion.value;
    case "amount_less_than":
      return amount < criterion.value;
    case "amount_range":
      return amount >= criterion.min && amount <= criterion.max;
    case "direction":
      return transaction.direction === criterion.value;
    case "recurring":
      return transaction.recurring === criterion.value;
    case "current_category":
      return transaction.categoryId === criterion.value;
    default:
      return false;
  }
}

function ruleMatches(rule: CategorizationRule, transaction: TransactionRecord) {
  return rule.criteria.every((criterion) => matchCriterion(criterion, transaction));
}

function applyRuleAction(transaction: TransactionRecord, action: RuleAction) {
  switch (action.type) {
    case "set_category":
      transaction.categoryId = action.categoryId;
      transaction.suggestedCategoryId = action.categoryId;
      break;
    case "set_transaction_type":
      transaction.direction = action.direction;
      if (!transaction.badges.includes("transfer") && action.direction === "transfer") {
        transaction.badges.push("transfer");
      }
      break;
    case "add_tag":
      if (!transaction.tags.includes(action.tagId)) transaction.tags.push(action.tagId);
      break;
    case "remove_tag":
      transaction.tags = transaction.tags.filter((tagId) => tagId !== action.tagId);
      break;
    case "hide_from_budget":
      transaction.hiddenFromBudget = action.value;
      if (action.value && !transaction.badges.includes("hidden")) {
        transaction.badges.push("hidden");
      }
      break;
    case "mark_recurring":
      transaction.recurring = action.value;
      if (action.value && !transaction.badges.includes("recurring")) {
        transaction.badges.push("recurring");
      }
      break;
    default:
      break;
  }
}

function isRecurringMerchant(group: TransactionRecord[]) {
  if (group.length < 2) return false;

  const sorted = [...group].sort(
    (a, b) => new Date(a.postedAt).getTime() - new Date(b.postedAt).getTime(),
  );

  const deltas = sorted.slice(1).map((transaction, index) => {
    const prev = sorted[index];
    return Math.abs(
      (new Date(transaction.postedAt).getTime() - new Date(prev.postedAt).getTime()) /
        (1000 * 60 * 60 * 24),
    );
  });

  const averageDelta = deltas.reduce((acc, value) => acc + value, 0) / deltas.length;
  return averageDelta >= 20 && averageDelta <= 40;
}

export function enrichTransactions(
  transactions: TransactionRecord[],
  rules: CategorizationRule[],
  categories: CategoryRecord[],
) {
  const categoryIds = new Set(categories.map((category) => category.id));
  const merchantGroups = groupBy(transactions, (transaction) => transaction.merchantNormalized);

  Object.values(merchantGroups).forEach((group) => {
    if (isRecurringMerchant(group)) {
      group.forEach((transaction) => {
        if (!transaction.badges.includes("recurring")) {
          transaction.recurring = true;
          transaction.badges.push("recurring");
        }
      });
    }
  });

  return transactions.map((original) => {
    const transaction = structuredClone(original);
    const matchingRule = rules.find((rule) => rule.enabled && ruleMatches(rule, transaction));

    if (matchingRule) {
      matchingRule.actions.forEach((action) => applyRuleAction(transaction, action));
      transaction.ruleId = matchingRule.id;
      transaction.confidenceStatus = "rule-applied";
      transaction.confidenceScore = 0.98;
      transaction.confidenceReason = `${matchingRule.name} matched`;
      if (!transaction.audit.some((entry) => entry.event === "rule_applied")) {
        transaction.audit.unshift({
          id: generateId("audit"),
          actor: matchingRule.source === "user" ? "user" : "system",
          event: "rule_applied",
          detail: `${matchingRule.name} set this transaction automatically.`,
          timestamp: new Date().toISOString(),
        });
      }
      return transaction;
    }

    const heuristic = CATEGORY_PATTERNS.find(({ match }) =>
      match.test(`${transaction.merchantNormalized} ${transaction.description}`),
    );

    if (heuristic && categoryIds.has(heuristic.category)) {
      transaction.suggestedCategoryId = heuristic.category;
      transaction.categoryId ??= heuristic.category;
      transaction.direction = heuristic.direction ?? transaction.direction;
      transaction.confidenceScore = heuristic.confidence;
      transaction.confidenceStatus =
        heuristic.confidence > 0.9 ? "high-confidence" : "needs-review";
      transaction.confidenceReason =
        heuristic.confidence > 0.9
          ? "Matched a known merchant pattern"
          : "Likely category based on merchant normalization";
      transaction.tags.push(...(heuristic.tags ?? []));
      transaction.badges.push(...(heuristic.badges ?? []));
    } else if (!transaction.categoryId) {
      transaction.categoryId = "miscellaneous";
      transaction.suggestedCategoryId = "miscellaneous";
      transaction.confidenceScore = 0.54;
      transaction.confidenceStatus = "needs-review";
      transaction.confidenceReason = "No exact merchant pattern match yet";
    }

    if (transaction.categoryId === "subscriptions") {
      transaction.subscription = true;
      if (!transaction.badges.includes("subscription")) {
        transaction.badges.push("subscription");
      }
    }

    if (transaction.hiddenFromBudget && !transaction.badges.includes("hidden")) {
      transaction.badges.push("hidden");
    }

    if (transaction.recurring && !transaction.badges.includes("recurring")) {
      transaction.badges.push("recurring");
    }

    transaction.tags = Array.from(new Set(transaction.tags));
    transaction.badges = Array.from(new Set(transaction.badges));

    return transaction;
  });
}

export function createUserCorrectionAudit(detail: string): AuditEntry {
  return {
    id: generateId("audit"),
    actor: "user",
    event: "manual_edit",
    detail,
    timestamp: new Date().toISOString(),
  };
}

export function createAiSuggestionAudit(detail: string): AuditEntry {
  return {
    id: generateId("audit"),
    actor: "ai",
    event: "ai_suggestion",
    detail,
    timestamp: new Date().toISOString(),
  };
}

export function buildRuleDraftFromTransaction(
  transaction: TransactionRecord,
  categoryId: string,
) {
  return {
    name: `${transaction.displayMerchant} → ${titleCase(categoryId.replace(/-/g, " "))}`,
    description: `Auto-apply ${titleCase(categoryId.replace(/-/g, " "))} for ${transaction.displayMerchant}.`,
    criteria: [{ type: "merchant_contains", value: transaction.merchantNormalized }] as RuleCriterion[],
    actions: [{ type: "set_category", categoryId }] as RuleAction[],
  };
}

export function getCategoryLabel(
  categories: CategoryRecord[],
  categoryId: string | null,
) {
  if (!categoryId) return "Unassigned";
  return categories.find((category) => category.id === categoryId)?.name ?? "Unknown";
}

export function getCategoryBudget(
  categories: CategoryRecord[],
  categoryId: string,
) {
  return categories.find((category) => category.id === categoryId)?.budget ?? 0;
}

export function buildHouseholdOwner(
  merchantNormalized: string,
  members: HouseholdMember[],
) {
  if (/daycare|school|utility|whole foods|shoprite|costco/i.test(merchantNormalized)) {
    return "shared" as const;
  }

  return members[0]?.id ? "me" : "shared";
}

export function mapAccountDirection(account: AccountRecord) {
  return account.type === "credit" || account.type === "loan" || account.type === "mortgage"
    ? -1
    : 1;
}
