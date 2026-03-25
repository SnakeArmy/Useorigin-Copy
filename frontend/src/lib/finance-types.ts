export type ThemeMode = "dark" | "light";
export type DateRangeKey = "30d" | "90d" | "180d" | "365d";
export type DataSourceMode = "backend" | "mock" | "empty";
export type TransactionDirection = "expense" | "income" | "transfer";
export type ConfidenceStatus =
  | "high-confidence"
  | "needs-review"
  | "rule-applied"
  | "user-corrected";
export type TransactionBadge =
  | "recurring"
  | "subscription"
  | "transfer"
  | "split"
  | "hidden"
  | "reimbursable";
export type HouseholdOwner = "me" | "partner" | "shared";
export type AccountKind =
  | "checking"
  | "savings"
  | "credit"
  | "investment"
  | "loan"
  | "mortgage";

export interface DataCoverage {
  accountHistory: boolean;
  manualAssets: boolean;
  recurringBills: boolean;
  investmentHoldings: boolean;
  goals: boolean;
}

export interface DiagnosticIssue {
  id: string;
  level: "warning" | "error";
  title: string;
  detail: string;
}

export interface WorkspaceMeta {
  dataSource: DataSourceMode;
  loadedAt: string | null;
  primaryUserId: string | null;
  taxonomyUserId: string | null;
  coverage: DataCoverage;
  diagnostics: DiagnosticIssue[];
}

export interface HouseholdMember {
  id: string;
  sourceUserId: string;
  name: string;
  role: "primary" | "partner" | "viewer";
  email: string;
  initials: string;
  tint: string;
}

export interface AccountRecord {
  id: string;
  memberId: string;
  sourceUserId: string;
  institution: string;
  name: string;
  type: AccountKind;
  subtype: string;
  mask: string;
  balance: number;
  availableBalance?: number;
  lastUpdated: string;
  color: string;
  synced: boolean;
}

export interface ManualAssetRecord {
  id: string;
  memberId: string;
  sourceUserId: string;
  name: string;
  type: "property" | "vehicle" | "investment" | "crypto" | "other";
  value: number;
  notes?: string | null;
  asOfDate: string;
}

export interface AccountBalanceSnapshot {
  accountId: string;
  memberId: string;
  sourceUserId: string;
  capturedOn: string;
  balance: number;
}

export interface CategoryGroup {
  id: string;
  name: string;
  description: string;
  color: string;
  source: "system" | "user";
}

export interface CategoryRecord {
  id: string;
  name: string;
  groupId: string;
  parentId: string | null;
  budget?: number;
  icon: string;
  color?: string;
  source: "system" | "user";
}

export interface TagRecord {
  id: string;
  name: string;
  color: string;
}

export type RuleCriterion =
  | { type: "merchant_contains"; value: string }
  | { type: "merchant_equals"; value: string }
  | { type: "account"; value: string }
  | { type: "amount_equals"; value: number }
  | { type: "amount_greater_than"; value: number }
  | { type: "amount_less_than"; value: number }
  | { type: "amount_range"; min: number; max: number }
  | { type: "direction"; value: TransactionDirection }
  | { type: "recurring"; value: boolean }
  | { type: "current_category"; value: string };

export type RuleAction =
  | { type: "set_category"; categoryId: string }
  | { type: "set_transaction_type"; direction: TransactionDirection }
  | { type: "add_tag"; tagId: string }
  | { type: "remove_tag"; tagId: string }
  | { type: "hide_from_budget"; value: boolean }
  | { type: "mark_recurring"; value: boolean };

export interface CategorizationRule {
  id: string;
  name: string;
  description: string;
  criteria: RuleCriterion[];
  actions: RuleAction[];
  enabled: boolean;
  source: "system" | "user" | "ai";
}

export interface SplitAllocation {
  id: string;
  categoryId: string;
  amount: number;
  note?: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: "system" | "user" | "ai";
  event: string;
  detail: string;
}

export interface TransactionRecord {
  id: string;
  accountId: string;
  memberId: string;
  sourceUserId: string;
  postedAt: string;
  description: string;
  merchantRaw: string;
  merchantNormalized: string;
  displayMerchant: string;
  amount: number;
  direction: TransactionDirection;
  status: "posted" | "pending";
  categoryId: string | null;
  sourceCategoryId?: string | null;
  suggestedCategoryId: string | null;
  confidenceScore: number;
  confidenceStatus: ConfidenceStatus;
  confidenceReason: string;
  tags: string[];
  badges: TransactionBadge[];
  recurring: boolean;
  subscription: boolean;
  hiddenFromBudget: boolean;
  householdOwner: HouseholdOwner;
  typeLabel: string;
  notes?: string;
  mccHint?: string | null;
  splits?: SplitAllocation[];
  ruleId?: string | null;
  audit: AuditEntry[];
}

export interface CategoryPerformance {
  categoryId: string;
  spent: number;
  budget: number;
  delta: number;
}

export interface NetWorthPoint {
  month: string;
  netWorth: number;
  liquid: number;
  debt: number;
}

export interface CashFlowPoint {
  month: string;
  income: number;
  expenses: number;
  savings: number;
}

export interface InvestmentHolding {
  id: string;
  ticker: string;
  name: string;
  quantity: number;
  price: number;
  dayChange: number;
  allocation: number;
  costBasis: number;
  sector: string;
}

export interface WatchlistItem {
  id: string;
  symbol: string;
  price: number;
  change: number;
  note: string;
}

export interface GoalRecord {
  id: string;
  name: string;
  target: number;
  current: number;
  dueDate: string;
  monthlyContribution: number;
}

export interface BillRecord {
  id: string;
  merchant: string;
  dueDate: string;
  amount: number;
  frequency: "monthly" | "quarterly" | "annual";
  categoryId: string;
  autopay: boolean;
}

export interface NotificationRecord {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
  type: "insight" | "review" | "security" | "household";
  read: boolean;
}

export interface InsightRecord {
  id: string;
  title: string;
  body: string;
  sentiment: "positive" | "neutral" | "watch";
  action: string;
}

export interface HouseholdBudget {
  id: string;
  name: string;
  owners: HouseholdOwner[];
  spent: number;
  budget: number;
}

export interface HouseholdActivity {
  id: string;
  memberId: string;
  event: string;
  detail: string;
  timestamp: string;
}

export interface ScenarioRecord {
  id: string;
  name: string;
  monthlySavings: number;
  marketReturn: number;
  retirementAge: number;
  targetHomeDownPayment: number;
}

export interface ProjectionPoint {
  year: string;
  base: number;
  stretch: number;
  cautious: number;
}

export interface ChatCardPayload {
  type: "insight" | "budget" | "portfolio" | "forecast";
  title: string;
  metric: string;
  supporting: string;
}

export interface AdvisorMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  cards?: ChatCardPayload[];
  createdAt: string;
}

export interface FinanceWorkspace {
  brand: {
    name: string;
    tagline: string;
    assistantName: string;
  };
  meta: WorkspaceMeta;
  members: HouseholdMember[];
  accounts: AccountRecord[];
  assets: ManualAssetRecord[];
  accountSnapshots: AccountBalanceSnapshot[];
  categories: CategoryRecord[];
  categoryGroups: CategoryGroup[];
  tags: TagRecord[];
  rules: CategorizationRule[];
  transactions: TransactionRecord[];
  netWorthHistory: NetWorthPoint[];
  cashFlowHistory: CashFlowPoint[];
  investments: InvestmentHolding[];
  watchlist: WatchlistItem[];
  goals: GoalRecord[];
  bills: BillRecord[];
  notifications: NotificationRecord[];
  insights: InsightRecord[];
  budgets: HouseholdBudget[];
  householdActivity: HouseholdActivity[];
  scenarios: ScenarioRecord[];
  projection: ProjectionPoint[];
  advisorMessages: AdvisorMessage[];
}

export interface FinanceSourceData {
  brand: FinanceWorkspace["brand"];
  meta: WorkspaceMeta;
  members: HouseholdMember[];
  accounts: AccountRecord[];
  assets: ManualAssetRecord[];
  accountSnapshots: AccountBalanceSnapshot[];
  categories: CategoryRecord[];
  categoryGroups: CategoryGroup[];
  tags: TagRecord[];
  rules: CategorizationRule[];
  transactions: TransactionRecord[];
}

export interface BackendUser {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

export interface BackendAccount {
  id: string;
  user_id: string;
  name: string;
  type: string;
  subtype: string | null;
  last_four: string | null;
  current_balance: string;
  available_balance: string | null;
  institution_name: string | null;
  updated_at: string;
  status: string;
}

export interface BackendTransaction {
  id: string;
  user_id: string;
  amount: string;
  date: string;
  description: string;
  category: string | null;
  custom_category: string | null;
  counterparty_name: string | null;
  counterparty_type: string | null;
  status: string;
  type: string | null;
  custom_direction: string | null;
  hidden_from_budget: boolean;
  recurring: boolean;
  notes: string | null;
  account_name: string;
  account_type: string;
  account_subtype: string | null;
  account_last_four: string | null;
  account_id: string;
  tag_keys: string[];
}

export interface BackendCategory {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  icon: string | null;
  monthly_budget: string | null;
  category_key: string | null;
  group_key: string | null;
  parent_category_key: string | null;
}

export interface BackendCategoryGroup {
  id: string;
  user_id: string;
  group_key: string;
  name: string;
  description: string;
  color: string;
}

export interface BackendRule {
  id: string;
  user_id: string;
  name: string;
  description: string;
  criteria: RuleCriterion[];
  actions: RuleAction[];
  enabled: boolean;
  source: "system" | "user" | "ai";
}

export interface BackendAsset {
  id: string;
  user_id: string;
  name: string;
  type: "property" | "vehicle" | "investment" | "crypto" | "other";
  value: string;
  notes: string | null;
  as_of_date: string;
}

export interface BackendAccountSnapshot {
  account_id: string;
  user_id: string;
  captured_on: string;
  current_balance: string;
}

export interface BackendWorkspacePayload {
  meta: {
    generated_at: string;
    primary_user_id: string | null;
    days: number;
  };
  users: BackendUser[];
  accounts: BackendAccount[];
  transactions: BackendTransaction[];
  categories: BackendCategory[];
  category_groups: BackendCategoryGroup[];
  rules: BackendRule[];
  assets: BackendAsset[];
  account_snapshots: BackendAccountSnapshot[];
}
