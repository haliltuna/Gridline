"""API coverage for the cross-site-iframe login bug fix.

Verifies: (1) login sets a SameSite=None; Secure cookie (required for cross-site
iframe delivery), (2) that cookie authenticates GET /api/auth/me, (3) wrong
password is rejected with 401 and no cookie, (4) logout destroys the session so
a subsequent /api/auth/me 401s.
"""

import httpx
import pytest

from .conftest import api_url

DEMO_EMAIL = "demo@gridline.app"
DEMO_PASSWORD = "gridline123"


def test_login_sets_cross_site_cookie_and_authenticates():
    with httpx.Client(timeout=30.0) as c:
        resp = c.post(api_url("/auth/login"), json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
        assert resp.status_code == 200, resp.text
        set_cookie = resp.headers.get("set-cookie", "")
        assert "gl_session=" in set_cookie
        assert "samesite=none" in set_cookie.lower(), f"cookie must be SameSite=None for iframe delivery: {set_cookie}"
        assert "secure" in set_cookie.lower(), f"cookie must be Secure to pair with SameSite=None: {set_cookie}"

        cookie_val = resp.cookies.get("gl_session")
        assert cookie_val

        me = c.get(api_url("/auth/me"), cookies={"gl_session": cookie_val})
        assert me.status_code == 200, me.text
        body = me.json()
        assert body["email"] == DEMO_EMAIL


def test_wrong_password_rejected_no_cookie():
    with httpx.Client(timeout=30.0) as c:
        resp = c.post(api_url("/auth/login"), json={"email": DEMO_EMAIL, "password": "not-the-password"})
        assert resp.status_code in (400, 401), resp.text
        assert "gl_session" not in resp.headers.get("set-cookie", "")


def test_logout_destroys_session():
    with httpx.Client(timeout=30.0) as c:
        login = c.post(api_url("/auth/login"), json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
        assert login.status_code == 200
        cookie_val = login.cookies.get("gl_session")
        assert cookie_val

        me_before = c.get(api_url("/auth/me"), cookies={"gl_session": cookie_val})
        assert me_before.status_code == 200

        logout = c.post(api_url("/auth/logout"), cookies={"gl_session": cookie_val})
        assert logout.status_code in (200, 204), logout.text

        me_after = c.get(api_url("/auth/me"), cookies={"gl_session": cookie_val})
        assert me_after.status_code == 401, "session should be destroyed after logout"
