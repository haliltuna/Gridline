// Hand-written mirrors of backend/models/schemas.py — keep the pair in sync in one edit.

export interface User {
  id: string;
  email: string;
  name: string;
  company: string;
  plan: string;
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
  floor_type: string;
  sqft: number;
  waste_pct: number;
  adhesive: string;
  adhesive_gallons: number;
  material_cost_per_sqft: number;
  labor_hours: number;
  labor_rate: number;
  needs_review: boolean;
  review_note: string | null;
  source: string | null;
  approved: boolean;
  cost: number;
}

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
  cadence: string;
  blurb: string;
  features: string[];
  highlight: boolean;
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
