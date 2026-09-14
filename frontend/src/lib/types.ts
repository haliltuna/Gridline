// Hand-written mirrors of backend/models/schemas.py — keep the pair in sync in one edit.

export interface User {
  theme?: string;
  page_credits?: number;
  id: string;
  email: string;
  name: string;
  company: string;
  plan: string;
  role: string;
  account_id: string | null;
  picture?: string;
  auth_provider?: string;
  created_at: string;
}

export interface GoogleSessionIn {
  session_id: string;
}

export interface Settings {
  user_id: string;
  country: string;
  region: string;
  tax_label: string;
  tax_rate: number;
  currency: string;
  labor_rate: number;
  company_name: string;
  company_email: string;
  pdf_template: string;
  default_scope: string;
  acc_transition_price: number;
  acc_nosing_price: number;
  acc_cove_base_price: number;
  acc_tile_profile_price: number;
  logo_data?: string;
  business_number: string;
  tax_number: string;
  waste_overrides: Record<string, number>;
}

export interface TaxDetect {
  tax_label: string;
  tax_rate: number;
}

export interface TaxRegions {
  [country: string]: { label: string; rate: number; regions: string[] };
}

export interface Job {
  id: string;
  user_id: string;
  name: string;
  client_name: string;
  client_email: string;
  address: string;
  status: string;
  specs: SpecEntry[];
  spec_filename: string;
  spec_brief: string;
  filename: string;
  pages: number;
  pages_read: number;
  engine: string;
  scale: string | null;
  project_type: string;
  buildings: number;
  units: number;
  bedrooms: number;
  bathrooms: number;
  stated_total_sqft: number | null;
  cross_check_note: string | null;
  doors: number;
  steps: number;
  cove_base_lf: number;
  tile_profile_lf: number;
  spec_accessories: SpecAccessory[];
  index_stated: { buildings?: number | null; units?: number | null; total_sqft?: number | null; source?: string | null };
  index_variance: string;
  brief: string;
  flags: string[];
  created_at: string;
}

export interface TakeoffLine {
  id: string;
  job_id: string;
  building: string;
  unit: string;
  room: string;
  scope: string;
  floor_type: string;
  product: string;
  product_alt: string;
  spec_note: string;
  qty: number;
  unit_price: number;
  sqft: number;
  waste_pct: number;
  adhesive: string;
  adhesive_gallons: number;
  material_cost_per_sqft: number;
  labor_hours: number;
  labor_rate: number;
  flat_cost: number;
  needs_review: boolean;
  review_note: string | null;
  source: string | null;
  approved: boolean;
  cost: number;
}

export interface SpecEntry {
  room_pattern: string;
  surface: string;
  floor_type: string;
  product: string;
  alternative?: string;
  price_per_sqft?: number | null;
  use_alternative?: boolean;
  adhesive: string | null;
  unit_type: string | null;
  note: string | null;
}

export interface SpecReadResult {
  specs: SpecEntry[];
  accessories: SpecAccessory[];
  flags: string[];
  brief: string;
  engine: string;
  pages: number;
  applied_to_lines: number;
}

export interface SpecPriceItem {
  index: number;
  price_per_sqft: number | null;
  use_alternative: boolean;
}

export interface SpecPricingIn {
  items: SpecPriceItem[];
  apply_to_lines: boolean;
}

export interface UnitTemplateLine {
  room: string;
  scope: string;
  floor_type: string;
  product: string;
  sqft: number;
  waste_pct: number | null;
  flat_cost: number;
}

export interface UnitTemplate {
  id: string;
  user_id: string;
  name: string;
  source_job_id: string | null;
  lines: UnitTemplateLine[];
  created_at: string;
}

export interface Product {
  id: string;
  account_id: string;
  name: string;
  brand: string;
  floor_type: string;
  alternative: string;
  cost_per_sqft: number;
  note: string;
  times_used: number;
  last_used_at: string | null;
  created_at: string;
  kind: string;
  accessory_kind: string;
  unit: string;
  unit_price: number;
  labor_hr_each: number;
}

export interface ProductIn {
  name: string;
  brand: string;
  floor_type: string;
  alternative: string;
  cost_per_sqft: number;
  note: string;
  kind?: string;
  accessory_kind?: string;
  unit?: string;
  unit_price?: number;
  labor_hr_each?: number;
}

export interface ApprovalView {
  number: string;
  revision: number;
  job_name: string;
  client_name: string;
  company_name: string;
  status: string;
  total: number;
  previous_total: number;
  delta: number;
  currency: string;
  lines: Record<string, unknown>[];
  signed_by: string;
  signed_at: string;
}

export interface FieldChange {
  field: string;
  before: string;
  after: string;
}

export interface DiffLine {
  key: string;
  room: string;
  building: string;
  unit: string;
  change: string;
  old_cost: number;
  new_cost: number;
  delta: number;
  fields: string[];
  changes: FieldChange[];
}

export interface QuoteDiff {
  from_number: string;
  to_number: string;
  from_revision: number;
  to_revision: number;
  from_total: number;
  to_total: number;
  delta: number;
  lines: DiffLine[];
}

export interface JobCosting {
  job_id: string;
  job_name: string;
  quoted_total: number;
  quoted_material: number;
  quoted_labor: number;
  actual_expenses: number;
  invoiced_total: number;
  collected: number;
  variance: number;
  margin_pct: number;
  expense_count: number;
}

export interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: string;
  is_you: boolean;
  created_at: string;
  temp_password: string | null;
}

export interface RoleOption {
  id: string;
  label: string;
}

export interface Lead {
  id: string;
  name: string;
  email: string;
  company: string;
  phone: string;
  crew_size: string;
  message: string;
  interest: string;
  created_at: string;
}

export interface PayIntent {
  checkout_url: string;
  invoice_number: string;
  amount: number;
  mocked: boolean;
}

export interface PublicInvoice {
  number: string;
  job_name: string;
  company_name: string;
  client_name: string;
  status: string;
  subtotal: number;
  discount_amount: number;
  tax_label: string;
  tax_amount: number;
  total: number;
}

export interface ReferenceOptions {
  scopes: { id: string; label: string }[];
  floor_types: string[];
  misc_presets: string[];
  pdf_templates: { id: string; label: string }[];
}

export const SCOPE_LABELS: Record<string, string> = {
  supply_install: "Supply & Install",
  install_only: "Install Only",
  supply_only: "Supply Only",
  misc: "Miscellaneous",
  accessory: "Accessory (count)",
};

export const SCOPE_SHORT: Record<string, string> = {
  supply_install: "S&I",
  install_only: "Install",
  supply_only: "Supply",
  misc: "Misc",
  accessory: "Count",
};

export interface Quote {
  id: string;
  job_id: string;
  user_id: string;
  number: string;
  revision: number;
  parent_id: string | null;
  status: string;
  discount_pct: number;
  tax_label: string;
  tax_rate: number;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total: number;
  notes: string;
  lines: TakeoffLine[];
  created_at: string;
}

export interface Invoice {
  id: string;
  user_id: string;
  job_id: string;
  job_name: string;
  quote_id: string;
  number: string;
  client_name: string;
  client_email: string;
  status: string;
  subtotal: number;
  discount_amount: number;
  tax_label: string;
  tax_amount: number;
  total: number;
  lines: TakeoffLine[];
  pay_token?: string;
  payment_ref?: string;
  sent_at: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface Expense {
  id: string;
  user_id: string;
  date: string;
  category: string;
  vendor: string;
  amount: number;
  job_id: string | null;
  note: string;
}

export interface MonthSummary {
  month: string;
  revenue: number;
  expenses: number;
  profit: number;
}

export interface ProfitSummary {
  months: MonthSummary[];
  total_revenue: number;
  total_expenses: number;
  total_profit: number;
}

export interface DashboardStats {
  jobs: number;
  open_quotes: number;
  unpaid_total: number;
  paid_this_month: number;
  sqft_measured: number;
}

export interface Plan {
  id: string;
  name: string;
  price: number;
  monthly_price: number;
  cadence: string;
  kind: string;
  seats: string;
  blurb: string;
  features: string[];
  highlight: boolean;
  badge: string;
}

export interface CheckoutOut {
  ok: boolean;
  plan: string;
  message: string;
  mocked: boolean;
}

export interface SendOut {
  ok: boolean;
  to: string;
  subject: string;
  message: string;
  mocked: boolean;
}

export const FLOOR_TYPES = [
  "Carpet Tile",
  "Broadloom Carpet",
  "Luxury Vinyl Plank",
  "Luxury Vinyl Tile",
  "Sheet Vinyl",
  "Ceramic Tile",
  "Porcelain Tile",
  "Natural Stone",
  "Engineered Hardwood",
  "Solid Hardwood",
  "Rubber / Sport",
  "Epoxy / Resinous",
];

export const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export const num = (n: number, d = 0) =>
  n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

// ---- billing, usage & payments (mirrors backend/models/billing.py) ----
export interface PlanTier {
  id: string;
  name: string;
  price: number;
  monthly_price: number;
  cadence: string;
  kind: string;
  seats: string;
  seat_count: number;
  badge: string;
  blurb: string;
  features: string[];
  capabilities: string[];
  pages_included: number;
  jobs_included: number;
  max_file_mb: number;
  overage_per_page: number;
  highlight: boolean;
  annual_total: number;
  annual_saving: number;
  early_exit_per_month: number;
}

export interface BillingTerms {
  default_cadence: string;
  fine_print: string;
  cancellation: string[];
  retention: string;
}

export interface CancelPreview {
  plan_id: string;
  plan_name: string;
  period: string;
  months_billed: number;
  per_month_difference: number;
  exit_fee: number;
  committed: boolean;
  message: string;
}

export interface CancelOut {
  ok: boolean;
  exit_fee: number;
  message: string;
}

export interface ExitFee {
  outstanding: boolean;
  id: string;
  plan_id: string;
  plan_name: string;
  months_billed: number;
  amount: number;
  status: string;
  created_at: string;
}

export interface DowngradeImpact {
  from_plan: string;
  to_plan: string;
  is_downgrade: boolean;
  lost_capabilities: string[];
  warnings: string[];
  open_quotes: number;
  unpaid_invoices: number;
  jobs_with_specs: number;
  message: string;
}

// ---- accessory catalogue (mirrors lib/flooring.ACCESSORIES + routers/products.py) ----
export interface AccessoryCatalogueRow {
  kind: string;
  label: string;
  unit: string;
  default_price: number;
  your_price: number;
  labor_hr_each: number;
  counted_from: string;
}

export interface AccessoryCountRow {
  kind: string;
  label: string;
  unit: string;
  counted: number;
  from_spec: number;
  qty: number;
  unit_price: number;
  spec_product: string;
  source: string;
}

export interface AccessoryCounts {
  job_id: string;
  job_name: string;
  rows: AccessoryCountRow[];
}

export interface SpecAccessory {
  kind: string;
  qty: number;
  unit: string;
  product: string;
  unit_price: number | null;
  note: string | null;
}

export interface CostLine {
  item: string;
  detail: string;
  cost: number;
}

export interface CompetitorRow {
  name: string;
  price: string;
  note: string;
}

export interface CostModel {
  page_cost: number;
  target_margin: number;
  overage_per_page: number;
  breakdown: CostLine[];
  competitors: CompetitorRow[];
}

export interface Usage {
  plan_id: string;
  plan_name: string;
  period: string;
  pages_included: number;
  page_credits: number;
  pages_used: number;
  pages_remaining: number;
  limit_reached: boolean;
  near_limit: boolean;
  jobs_included: number;
  jobs_used: number;
  max_file_mb: number;
  overage_pages: number;
  overage_cost: number;
  capabilities: string[];
  seat_count: number;
  seats_used: number;
  plan_kind: string;
  trial_days_left: number;
  trial_ends_on: string;
}

export interface CheckoutSession {
  checkout_url: string;
  session_id: string;
  amount: number;
  mocked: boolean;
}

export interface PaymentStatus {
  session_id: string;
  status: string;
  payment_status: string;
  kind: string;
  amount: number;
}

export interface CostingRow {
  job_id: string;
  job_name: string;
  client_name: string;
  status: string;
  quoted_total: number;
  actual_expenses: number;
  invoiced_total: number;
  collected: number;
  variance: number;
  margin_pct: number;
  expense_count: number;
}

export interface CostingOverview {
  rows: CostingRow[];
  quoted_total: number;
  actual_total: number;
  collected_total: number;
  variance_total: number;
  margin_pct: number;
}

export interface TopUpPack {
  id: string;
  name: string;
  price: number;
  pages: number;
  blurb: string;
}

export interface PageEstimate {
  filename: string;
  pages: number;
  size_mb: number;
  plan_name: string;
  pages_included: number;
  pages_remaining: number;
  pages_after: number;
  fits: boolean;
  reason: string;
}
