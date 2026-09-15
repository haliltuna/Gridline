import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, APIRouter, Request
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List
import uuid
from datetime import datetime

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
from lib.db import client, db, ensure_indexes
from lib.config import check_config
from lib.limiter import limiter


# Startup runs before the yield, shutdown after it. Add your own setup/teardown here.
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Say plainly at boot what is missing from backend/.env and which feature it turns off,
    # instead of letting it surface as a confusing error on the first upload or checkout.
    app.state.config = check_config()
    app.state.index_task = asyncio.create_task(ensure_indexes())  # background: a big index build must not block boot
    yield
    client.close()


# Create the main app without a prefix
app = FastAPI(lifespan=lifespan)

# Rate limiting: the limiter object lives in lib/limiter.py; routers add per-route limits.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class StatusCheckCreate(BaseModel):
    client_name: str


# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}


@api_router.get("/health")
async def health(request: Request):
    """Liveness plus a redacted view of what configuration is missing (no values, ever)."""
    cfg = getattr(request.app.state, "config", {"missing": [], "degraded": []})
    return {
        "status": "error" if cfg["missing"] else "ok",
        "missing_required": cfg["missing"],
        "missing_optional": cfg["degraded"],
        "hint": "See backend/.env.example for what each key does." if (cfg["missing"] or cfg["degraded"]) else "",
    }


@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.model_dump())
    return status_obj


@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]


from routers.auth import router as auth_router
from routers.google_auth import router as google_auth_router  # noqa: E402
from routers.finance import router as finance_router
from routers.payments import router as payments_router  # noqa: E402
from routers.jobs import router as jobs_router  # noqa: E402
from routers.team import router as team_router  # noqa: E402
from routers.products import router as products_router
from routers.approvals import router as approvals_router
from routers.tools import router as tools_router  # noqa: E402
from routers.wizard import router as wizard_router
# CORS must be registered BEFORE the routers are mounted, and with an exact origin
# match (no wildcard) because allow_credentials=True is required for the session cookie.
cors_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
if not cors_origins:
    cors_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

api_router.include_router(auth_router)
api_router.include_router(google_auth_router)
api_router.include_router(jobs_router)
api_router.include_router(tools_router)
api_router.include_router(products_router)
api_router.include_router(approvals_router)
api_router.include_router(team_router)
api_router.include_router(finance_router)
api_router.include_router(payments_router)
api_router.include_router(wizard_router)
app.include_router(api_router)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)