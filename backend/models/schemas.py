"""Pydantic v2 models — mirrored by TS interfaces in frontend/src/lib/types.ts."""

import uuid
from datetime import datetime, timezone

from pydantic import BaseModel, EmailStr, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str
    company: str = ""


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class GoogleSessionIn(BaseModel):
    session_id: str


class User(BaseModel):
    id: str
    email: str
    name: str
    company: str = ""
    plan: str = "trial"
    role: str = "owner"
    account_id: str | None = None
    theme: str = "readout"
    page_credits: int = 0
    picture: str = ""
    auth_provider: str = "password"
    created_at: datetime


class TeamMember(BaseModel):
    id: str
    email: str
    name: str
    role: str
    is_you: bool = False
    created_at: datetime
    temp_password: str | None = None


class MemberInviteIn(BaseModel):
    email: EmailStr
    name: str
    role: str = "estimator"
    temp_password: str | None = None


class MemberRoleIn(BaseModel):
    role: str


class LeadIn(BaseModel):
    name: str
    email: EmailStr
    company: str = ""
    phone: str = ""
    crew_size: str = ""
    message: str = ""
    interest: str = "demo"  # demo | enterprise


class Lead(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: str
    company: str = ""
    phone: str = ""
    crew_size: str = ""
    message: str = ""
    interest: str = "demo"
    created_at: datetime = Field(default_factory=_now)


class JobCosting(BaseModel):
    job_id: str
    job_name: str
    quoted_total: float
    quoted_material: float
    quoted_labor: float
    actual_expenses: float
    invoiced_total: float
    collected: float
    variance: float
    margin_pct: float
    expense_count: int


class Settings(BaseModel):
    user_id: str
    country: str = "United States"
    region: str = ""
    tax_label: str = "Sales Tax"
    tax_rate: float = 6.0
    currency: str = "USD"
    labor_rate: float = 58.0
    company_name: str = ""
    company_email: str = ""
    pdf_template: str = "contractor_clean"
    default_scope: str = "supply_install"


class SettingsIn(BaseModel):
    country: str
    region: str = ""
    tax_label: str
    tax_rate: float
    currency: str = "USD"
    labor_rate: float = 58.0
    company_name: str = ""
    company_email: str = ""
    pdf_template: str = "contractor_clean"
    default_scope: str = "supply_install"


class TaxDetect(BaseModel):
    tax_label: str
    tax_rate: float


class JobIn(BaseModel):
    name: str
    client_name: str = ""
    client_email: str = ""
    address: str = ""


class Job(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    name: str
    client_name: str = ""
    client_email: str = ""
    address: str = ""
    status: str = "draft"  # draft | reading | takeoff | quoted | accepted | invoiced | paid
    filename: str = ""
    pages: int = 0
    pages_read: int = 0
    engine: str = ""
    scale: str | None = None
    project_type: str = ""
    buildings: int = 0
    units: int = 0
    bedrooms: int = 0
    bathrooms: int = 0
    stated_total_sqft: float | None = None
    cross_check_note: str | None = None
    brief: str = ""
    flags: list[str] = []
    specs: list[dict] = []
    spec_filename: str = ""
    spec_brief: str = ""
    doors: int = 0
    steps: int = 0
    cove_base_lf: float = 0.0
    index_stated: dict = {}
    index_variance: str = ""
    created_at: datetime = Field(default_factory=_now)


class TakeoffLine(BaseModel):
    id: str
    job_id: str
    building: str
    unit: str
    room: str
    scope: str = "supply_install"  # supply_install | install_only | supply_only | misc | accessory
    floor_type: str
    product: str = ""
    product_alt: str = ""
    spec_note: str = ""
    qty: float = 0.0
    unit_price: float = 0.0
    sqft: float
    waste_pct: float
    adhesive: str
    adhesive_gallons: float
    material_cost_per_sqft: float
    labor_hours: float
    labor_rate: float
    flat_cost: float = 0.0
    needs_review: bool = False
    review_note: str | None = None
    source: str | None = None
    approved: bool = False
    cost: float = 0.0


class LineUpdate(BaseModel):
    building: str | None = None
    product_alt: str | None = None
    qty: float | None = None
    unit_price: float | None = None
    unit: str | None = None
    room: str | None = None
    scope: str | None = None
    floor_type: str | None = None
    product: str | None = None
    sqft: float | None = None
    waste_pct: float | None = None
    adhesive: str | None = None
    material_cost_per_sqft: float | None = None
    labor_hours: float | None = None
    labor_rate: float | None = None
    flat_cost: float | None = None
    needs_review: bool | None = None
    approved: bool | None = None


class LineCreate(BaseModel):
    building: str = "Building A"
    unit: str = "Main"
    room: str = "New Room"
    scope: str = "supply_install"
    floor_type: str = "Luxury Vinyl Plank"
    sqft: float = 0.0
    flat_cost: float = 0.0
    qty: float = 0.0
    unit_price: float = 0.0


class SpecEntry(BaseModel):
    room_pattern: str = ""
    surface: str = "floor"
    floor_type: str = ""
    product: str = ""
    alternative: str = ""
    price_per_sqft: float | None = None
    use_alternative: bool = False
    adhesive: str | None = None
    unit_type: str | None = None
    note: str | None = None


class SpecPriceItem(BaseModel):
    index: int
    price_per_sqft: float | None = None
    use_alternative: bool = False


class SpecPricingIn(BaseModel):
    items: list[SpecPriceItem] = []
    apply_to_lines: bool = True


class SpecReadResult(BaseModel):
    specs: list[SpecEntry] = []
    flags: list[str] = []
    brief: str = ""
    engine: str = ""
    pages: int = 0
    applied_to_lines: int = 0


class UnitTemplateLine(BaseModel):
    room: str
    scope: str = "supply_install"
    floor_type: str = "Luxury Vinyl Plank"
    product: str = ""
    sqft: float = 0.0
    waste_pct: float | None = None
    flat_cost: float = 0.0


class UnitTemplate(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    name: str
    source_job_id: str | None = None
    lines: list[UnitTemplateLine] = []
    created_at: datetime = Field(default_factory=_now)


class UnitTemplateSaveIn(BaseModel):
    name: str
    building: str
    unit: str


class UnitTemplateApplyIn(BaseModel):
    job_id: str
    building: str
    units: list[str]
    replace_existing: bool = False


class DiffLine(BaseModel):
    key: str
    room: str
    building: str
    unit: str
    change: str  # added | removed | changed | unchanged
    old_cost: float = 0.0
    new_cost: float = 0.0
    fields: list[str] = []


class QuoteDiff(BaseModel):
    from_number: str
    to_number: str
    from_revision: int
    to_revision: int
    from_total: float
    to_total: float
    delta: float
    lines: list[DiffLine]


class QuoteIn(BaseModel):
    discount_pct: float = 0.0
    tax_rate: float | None = None
    tax_label: str | None = None
    notes: str = ""


class DocLineUpdate(BaseModel):
    """Retyping a line on a quote or invoice that is already out the door."""
    room: str | None = None
    product: str | None = None
    sqft: float | None = None
    qty: float | None = None
    unit_price: float | None = None
    material_cost_per_sqft: float | None = None
    labor_hours: float | None = None
    labor_rate: float | None = None
    flat_cost: float | None = None


class Quote(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    job_id: str
    user_id: str
    number: str
    revision: int = 1
    parent_id: str | None = None
    status: str = "draft"  # draft | sent | accepted | superseded
    discount_pct: float = 0.0
    tax_label: str = "Sales Tax"
    tax_rate: float = 0.0
    subtotal: float = 0.0
    discount_amount: float = 0.0
    tax_amount: float = 0.0
    total: float = 0.0
    notes: str = ""
    lines: list[dict] = []
    created_at: datetime = Field(default_factory=_now)


class Invoice(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    job_id: str
    job_name: str = ""
    quote_id: str
    number: str
    client_name: str = ""
    client_email: str = ""
    status: str = "unpaid"  # unpaid | sent | paid
    subtotal: float = 0.0
    discount_amount: float = 0.0
    tax_label: str = "Sales Tax"
    tax_amount: float = 0.0
    total: float = 0.0
    lines: list[dict] = []
    pay_token: str = ""
    payment_ref: str = ""
    sent_at: datetime | None = None
    paid_at: datetime | None = None
    created_at: datetime = Field(default_factory=_now)


class PayIntent(BaseModel):
    checkout_url: str
    invoice_number: str
    amount: float
    mocked: bool = True


class PublicInvoice(BaseModel):
    number: str
    job_name: str = ""
    company_name: str = ""
    client_name: str = ""
    status: str
    subtotal: float
    discount_amount: float
    tax_label: str
    tax_amount: float
    total: float


class PayCardIn(BaseModel):
    card_number: str = "4242424242424242"
    name_on_card: str = ""


class ExpenseIn(BaseModel):
    date: str
    category: str
    vendor: str = ""
    amount: float
    job_id: str | None = None
    note: str = ""


class Expense(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    date: str
    category: str
    vendor: str = ""
    amount: float
    job_id: str | None = None
    note: str = ""


class MonthSummary(BaseModel):
    month: str
    revenue: float
    expenses: float
    profit: float


class ProfitSummary(BaseModel):
    months: list[MonthSummary]
    total_revenue: float
    total_expenses: float
    total_profit: float


class DashboardStats(BaseModel):
    jobs: int
    open_quotes: int
    unpaid_total: float
    paid_this_month: float
    sqft_measured: float


class Plan(BaseModel):
    id: str
    name: str
    price: float           # headline (annual-rate) price
    monthly_price: float = 0.0   # month-to-month rate; 0 for one-off plans
    cadence: str
    kind: str = "subscription"   # subscription | one_time | contact
    seats: str = "1 seat"
    blurb: str
    features: list[str]
    highlight: bool = False
    badge: str = ""


class CheckoutIn(BaseModel):
    plan_id: str


class CheckoutOut(BaseModel):
    ok: bool
    plan: str
    message: str
    mocked: bool = True


class SendOut(BaseModel):
    ok: bool
    to: str
    subject: str
    message: str
    mocked: bool = True
