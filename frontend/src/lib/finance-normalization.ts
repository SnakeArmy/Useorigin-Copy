import {
  buildHouseholdOwner,
  createAiSuggestionAudit,
  createDefaultCategories,
  createDefaultCategoryGroups,
  createDefaultRules,
  createDefaultTags,
  createUserCorrectionAudit,
  enrichTransactions,
  inferDirection,
  normalizeMerchant,
} from "@/lib/categorization";
import type {
  AccountBalanceSnapshot,
  AccountKind,
  AccountRecord,
  BackendAccount,
  BackendAsset,
  BackendCategory,
  BackendCategoryGroup,
  BackendRule,
  BackendTransaction,
  BackendUser,
  BackendWorkspacePayload,
  CategoryGroup,
  CategoryRecord,
  FinanceSourceData,
  HouseholdMember,
  ManualAssetRecord,
  TagRecord,
  TransactionRecord,
  WorkspaceMeta,
} from "@/lib/finance-types";

const MEMBER_TINTS = ["var(--accent-jade)", "var(--accent-amber)", "var(--accent-sky)"];

const CATEGORY_ALIASES: Record<string, string> = {
  "dining-out": "dining",
  "gas-transport": "transportation",
  "gas-transportation": "transportation",
  "healthcare": "health-medical",
  "newborn-expenses": "kids-family",
  "rent-mortgage": "rent",
  "rent-mortgage-payment": "rent",
  mortgage: "rent",
  "credit-card-payment": "transfers",
  "credit-card-autopay": "transfers",
};

function toKey(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toCanonicalCategoryId(value: string | null | undefined) {
  const key = toKey(value);
  return (CATEGORY_ALIASES[key] ?? key) || null;
}

function inferAccountType(account: BackendAccount): AccountKind {
  const subtype = String(account.subtype || "").toLowerCase();
  const type = String(account.type || "").toLowerCase();

  if (type === "credit") return subtype.includes("mortgage") ? "mortgage" : "credit";
  if (subtype.includes("savings")) return "savings";
  if (subtype.includes("investment") || subtype.includes("brokerage") || subtype.includes("retirement")) {
    return "investment";
  }
  if (subtype.includes("loan")) return "loan";
  return "checking";
}

function createMembers(users: BackendUser[]) {
  const members: HouseholdMember[] = users.map((user, index) => ({
    id: index === 0 ? "me" : index === 1 ? "partner" : `member_${index + 1}`,
    sourceUserId: user.id,
    name: user.name,
    role: index === 0 ? "primary" : index === 1 ? "partner" : "viewer",
    email: user.email,
    initials: user.name
      .split(" ")
      .map((part) => part[0] || "")
      .join("")
      .slice(0, 2)
      .toUpperCase(),
    tint: MEMBER_TINTS[index % MEMBER_TINTS.length],
  }));

  const userToMemberId = new Map(members.map((member) => [member.sourceUserId, member.id]));
  return { members, userToMemberId };
}

function mapAccount(account: BackendAccount, userToMemberId: Map<string, string>): AccountRecord {
  const type = inferAccountType(account);
  const memberId = userToMemberId.get(account.user_id) || "me";

  return {
    id: account.id,
    memberId,
    sourceUserId: account.user_id,
    institution: account.institution_name || "Linked institution",
    name: account.name,
    type,
    subtype: account.subtype || account.type,
    mask: account.last_four || "0000",
    balance: Number(account.current_balance || 0),
    availableBalance:
      account.available_balance === null ? undefined : Number(account.available_balance || 0),
    lastUpdated: account.updated_at,
    color:
      type === "credit"
        ? "#43a5ff"
        : type === "investment"
          ? "#7c8cf8"
          : type === "mortgage" || type === "loan"
            ? "#f59e0b"
            : "#25e7aa",
    synced: account.status !== "closed",
  };
}

function mergeCategoryGroups(groups: BackendCategoryGroup[]): CategoryGroup[] {
  const baseGroups = createDefaultCategoryGroups();
  const merged = new Map<string, CategoryGroup>(baseGroups.map((group) => [group.id, group]));

  for (const group of groups) {
    merged.set(group.group_key, {
      id: group.group_key,
      name: group.name,
      description: group.description,
      color: group.color,
      source: "user",
    });
  }

  return Array.from(merged.values());
}

function mergeCategories(categories: BackendCategory[], groups: CategoryGroup[]): CategoryRecord[] {
  const groupIds = new Set(groups.map((group) => group.id));
  const baseCategories = createDefaultCategories();
  const merged = new Map<string, CategoryRecord>(baseCategories.map((category) => [category.id, category]));

  for (const category of categories) {
    const categoryId = toCanonicalCategoryId(category.category_key || category.name);
    if (!categoryId) continue;

    const existing = merged.get(categoryId);
    const groupId =
      category.group_key && groupIds.has(category.group_key)
        ? category.group_key
        : existing?.groupId || "grp_admin";

    merged.set(categoryId, {
      id: categoryId,
      name: category.name,
      groupId,
      parentId: toCanonicalCategoryId(category.parent_category_key) || existing?.parentId || null,
      budget:
        category.monthly_budget === null
          ? existing?.budget
          : Number(category.monthly_budget || 0),
      icon: category.icon || existing?.icon || "Layers3",
      color: category.color || existing?.color,
      source: "user",
    });
  }

  return Array.from(merged.values());
}

function mergeTags(transactions: BackendTransaction[]): TagRecord[] {
  const baseTags = createDefaultTags();
  const merged = new Map(baseTags.map((tag) => [tag.id, tag]));

  for (const transaction of transactions) {
    for (const tagKey of transaction.tag_keys || []) {
      if (merged.has(tagKey)) continue;
      merged.set(tagKey, {
        id: tagKey,
        name: tagKey.replace(/^tag_/, "").replace(/-/g, " "),
        color: "#94a3b8",
      });
    }
  }

  return Array.from(merged.values());
}

function mergeRules(rules: BackendRule[]) {
  return [
    ...createDefaultRules(),
    ...rules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      description: rule.description,
      criteria: rule.criteria,
      actions: rule.actions,
      enabled: rule.enabled,
      source: rule.source,
    })),
  ];
}

function mapTransaction(
  transaction: BackendTransaction,
  members: HouseholdMember[],
  userToMemberId: Map<string, string>,
): TransactionRecord {
  const merchantRaw = transaction.counterparty_name || transaction.description;
  const normalizedMerchant = normalizeMerchant(merchantRaw);
  const amount = Number(transaction.amount || 0);
  const memberId = userToMemberId.get(transaction.user_id) || "me";
  const sourceCategoryId = toCanonicalCategoryId(transaction.category);
  const customCategoryId = toCanonicalCategoryId(transaction.custom_category);
  const categoryId = customCategoryId || sourceCategoryId;
  const customDirection = transaction.custom_direction as TransactionRecord["direction"] | null;
  const direction = customDirection || inferDirection(amount, merchantRaw);
  const touchedByUser =
    Boolean(customCategoryId) ||
    Boolean(customDirection) ||
    Boolean(transaction.hidden_from_budget) ||
    Boolean(transaction.recurring) ||
    Boolean(transaction.notes) ||
    Boolean(transaction.tag_keys?.length);

  return {
    id: transaction.id,
    accountId: transaction.account_id,
    memberId,
    sourceUserId: transaction.user_id,
    postedAt: transaction.date,
    description: transaction.description,
    merchantRaw,
    merchantNormalized: normalizedMerchant.normalized,
    displayMerchant: normalizedMerchant.display,
    amount,
    direction,
    status: transaction.status === "pending" ? "pending" : "posted",
    categoryId,
    sourceCategoryId,
    suggestedCategoryId: categoryId,
    confidenceScore: touchedByUser ? 1 : sourceCategoryId ? 0.86 : 0.52,
    confidenceStatus: touchedByUser
      ? "user-corrected"
      : sourceCategoryId
        ? "high-confidence"
        : "needs-review",
    confidenceReason: touchedByUser
      ? "Saved user preferences are applied to this transaction."
      : sourceCategoryId
        ? "Imported with a source category."
        : "No reliable source category was provided.",
    tags: transaction.tag_keys || [],
    badges: [],
    recurring: Boolean(transaction.recurring),
    subscription: categoryId === "subscriptions",
    hiddenFromBudget: Boolean(transaction.hidden_from_budget),
    householdOwner:
      memberId === "partner"
        ? "partner"
        : buildHouseholdOwner(normalizedMerchant.normalized, members),
    typeLabel: transaction.type || "Imported transaction",
    notes: transaction.notes || undefined,
    mccHint: transaction.counterparty_type,
    audit: [
      createAiSuggestionAudit("Imported from a linked account record."),
      ...(touchedByUser
        ? [createUserCorrectionAudit("Loaded persisted transaction preferences.")]
        : []),
    ],
  };
}

function mapAsset(
  asset: BackendAsset,
  userToMemberId: Map<string, string>,
): ManualAssetRecord {
  return {
    id: asset.id,
    memberId: userToMemberId.get(asset.user_id) || "me",
    sourceUserId: asset.user_id,
    name: asset.name,
    type: asset.type,
    value: Number(asset.value || 0),
    notes: asset.notes,
    asOfDate: asset.as_of_date,
  };
}

function mapAccountSnapshots(
  payload: BackendWorkspacePayload,
  userToMemberId: Map<string, string>,
): AccountBalanceSnapshot[] {
  return payload.account_snapshots.map((snapshot) => ({
    accountId: snapshot.account_id,
    memberId: userToMemberId.get(snapshot.user_id) || "me",
    sourceUserId: snapshot.user_id,
    capturedOn: snapshot.captured_on,
    balance: Number(snapshot.current_balance || 0),
  }));
}

function buildMeta(payload: BackendWorkspacePayload): WorkspaceMeta {
  const distinctSnapshotDates = new Set(payload.account_snapshots.map((snapshot) => snapshot.captured_on));

  return {
    dataSource: "backend",
    loadedAt: payload.meta.generated_at,
    primaryUserId: payload.meta.primary_user_id,
    taxonomyUserId: payload.meta.primary_user_id,
    coverage: {
      accountHistory: distinctSnapshotDates.size > 1,
      manualAssets: payload.assets.length > 0,
      recurringBills: payload.transactions.length > 0,
      investmentHoldings: false,
      goals: false,
    },
    diagnostics: [],
  };
}

export function createEmptySourceData(): FinanceSourceData {
  const categoryGroups = createDefaultCategoryGroups();
  const categories = createDefaultCategories();

  return {
    brand: {
      name: "Northstar",
      tagline: "Your household money command center",
      assistantName: "Atlas",
    },
    meta: {
      dataSource: "empty",
      loadedAt: null,
      primaryUserId: null,
      taxonomyUserId: null,
      coverage: {
        accountHistory: false,
        manualAssets: false,
        recurringBills: false,
        investmentHoldings: false,
        goals: false,
      },
      diagnostics: [],
    },
    members: [],
    accounts: [],
    assets: [],
    accountSnapshots: [],
    categories,
    categoryGroups,
    tags: createDefaultTags(),
    rules: createDefaultRules(),
    transactions: [],
  };
}

export function normalizeBackendWorkspace(payload: BackendWorkspacePayload): FinanceSourceData {
  const { members, userToMemberId } = createMembers(payload.users);
  const categoryGroups = mergeCategoryGroups(payload.category_groups);
  const categories = mergeCategories(payload.categories, categoryGroups);
  const rules = mergeRules(payload.rules);
  const transactions = enrichTransactions(
    payload.transactions.map((transaction) => mapTransaction(transaction, members, userToMemberId)),
    rules,
    categories,
  ).sort((left, right) => right.postedAt.localeCompare(left.postedAt));

  return {
    brand: {
      name: "Northstar",
      tagline: "Your household money command center",
      assistantName: "Atlas",
    },
    meta: buildMeta(payload),
    members,
    accounts: payload.accounts.map((account) => mapAccount(account, userToMemberId)),
    assets: payload.assets.map((asset) => mapAsset(asset, userToMemberId)),
    accountSnapshots: mapAccountSnapshots(payload, userToMemberId),
    categories,
    categoryGroups,
    tags: mergeTags(payload.transactions),
    rules,
    transactions,
  };
}
