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


class User(BaseModel):
    id: str
    email: str
    name: str
    company: str = ""
    plan: str = "trial"
    created_at: datetime


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


class SettingsIn(BaseModel):
    country: str
    region: str = ""
    tax_label: str
    tax_rate: float
    currency: str = "USD"
    labor_rate: float = 58.0
    company_name: str = ""
    company_email: str = ""


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
    created_at: datetime = Field(default_factory=_now)


class TakeoffLine(BaseModel):
    id: str
    job_id: str
    building: str
    unit: str
    room: str
    floor_type: str
    sqft: float
    waste_pct: float
    adhesive: str
    adhesive_gallons: float
    material_cost_per_sqft: float
    labor_hours: float
    labor_rate: float
    needs_review: bool = False
    review_note: str | None = None
    source: str | None = None
    approved: bool = False
    cost: float = 0.0


class LineUpdate(BaseModel):
    building: str | None = None
    unit: str | None = None
    room: str | None = None
    floor_type: str | None = None
    sqft: float | None = None
    waste_pct: float | None = None
    adhesive: str | None = None
    material_cost_per_sqft: float | None = None
    labor_hours: float | None = None
    labor_rate: float | None = None
    needs_review: bool | None = None
    approved: bool | None = None


class LineCreate(BaseModel):
    building: str = "Building A"
    unit: str = "Main"
    room: str = "New Room"
    floor_type: str = "Luxury Vinyl Plank"
    sqft: float = 0.0


class QuoteIn(BaseModel):
    discount_pct: float = 0.0
    tax_rate: float | None = None
    tax_label: str | None = None
    notes: str = ""


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
    sent_at: datetime | None = None
    paid_at: datetime | None = None
    created_at: datetime = Field(default_factory=_now)


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
    price: float
    cadence: str
    blurb: str
    features: list[str]
    highlight: bool = False


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
