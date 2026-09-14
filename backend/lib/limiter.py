"""Single shared rate limiter — imported by routers so every limit lives in one place."""
import os

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[],
    storage_uri=os.environ.get("REDIS_URL", "memory://"),
)