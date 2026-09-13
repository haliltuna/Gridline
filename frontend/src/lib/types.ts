// Hand-written mirrors of backend/models/schemas.py — keep the pair in sync in one edit.

export interface User {
  id: string;
  email: string;
  name: string;
  company: string;
  plan: string;
  role: string;
  account_id: string | null;
  created_at: string;
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
  spec_note: string;
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
  adhesive: string | null;
  unit_type: string | null;
  note: string | null;
}

export interface SpecReadResult {
  specs: SpecEntry[];
  flags: string[];
  brief: string;
  engine: string;
  pages: number;
  applied_to_lines: number;
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

export interface DiffLine {
  key: string;
  room: string;
  building: string;
  unit: string;
  change: string;
  old_cost: number;
  new_cost: number;
  fields: string[];
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
};

export const SCOPE_SHORT: Record<string, string> = {
  supply_install: "S&I",
  install_only: "Install",
  supply_only: "Supply",
  misc: "Misc",
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
  pages_used: number;
  jobs_included: number;
  jobs_used: number;
  max_file_mb: number;
  overage_pages: number;
  overage_cost: number;
  capabilities: string[];
  seat_count: number;
  seats_used: number;
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
