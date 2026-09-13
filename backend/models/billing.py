"""Pydantic models for billing, usage, payments, costing and the lead inbox."""

from pydantic import BaseModel


class CheckoutIn(BaseModel):
    plan_id: str
    period: str = "annual"   # annual | monthly
    origin_url: str


class CheckoutSession(BaseModel):
    checkout_url: str
    session_id: str
    amount: float
    mocked: bool = False


class PaymentStatus(BaseModel):
    session_id: str
    status: str
    payment_status: str
    kind: str = ""
    amount: float = 0.0


class PlanTier(BaseModel):
    id: str
    name: str
    price: float
    monthly_price: float
    cadence: str
    kind: str
    seats: str
    seat_count: int
    badge: str
    blurb: str
    features: list[str]
    capabilities: list[str]
    pages_included: int
    jobs_included: int
    max_file_mb: int
    overage_per_page: float
    highlight: bool


class CostLine(BaseModel):
    item: str
    detail: str
    cost: float


class CompetitorRow(BaseModel):
    name: str
    price: str
    note: str


class CostModel(BaseModel):
    page_cost: float
    target_margin: float
    overage_per_page: float
    breakdown: list[CostLine]
    competitors: list[CompetitorRow]


class Usage(BaseModel):
    plan_id: str
    plan_name: str
    period: str
    pages_included: int
    pages_used: int
    jobs_included: int
    jobs_used: int
    max_file_mb: int
    overage_pages: int
    overage_cost: float
    capabilities: list[str]
    seat_count: int
    seats_used: int


class CostingRow(BaseModel):
    job_id: str
    job_name: str
    client_name: str
    status: str
    quoted_total: float
    actual_expenses: float
    invoiced_total: float
    collected: float
    variance: float
    margin_pct: float
    expense_count: int


class CostingOverview(BaseModel):
    rows: list[CostingRow]
    quoted_total: float
    actual_total: float
    collected_total: float
    variance_total: float
    margin_pct: float
