"""Transactional email through Resend, with the quote/invoice PDF attached.

Sends for real when RESEND_API_KEY is set; otherwise returns delivered=False and the app
keeps working (the quote is still marked sent) so a missing key never breaks the flow.
"""

import asyncio
import base64
import logging
import os

logger = logging.getLogger(__name__)


def configured() -> bool:
    return bool(os.environ.get("RESEND_API_KEY"))


def sender() -> str:
    return os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")


def shell(title: str, intro: str, rows: list[tuple[str, str]], cta: tuple[str, str] | None,
          footer: str) -> str:
    """Table-based, inline-CSS HTML — the only layout email clients agree on."""
    row_html = "".join(
        f'<tr><td style="padding:6px 0;color:#64748b;font-size:14px">{k}</td>'
        f'<td style="padding:6px 0;text-align:right;color:#0f172a;font-size:14px;'
        f'font-weight:600">{v}</td></tr>'
        for k, v in rows
    )
    cta_html = ""
    if cta:
        label, url = cta
        cta_html = (
            f'<tr><td style="padding:24px 0"><a href="{url}" '
            f'style="background:#111827;color:#E2F952;text-decoration:none;padding:14px 24px;'
            f'font-weight:700;font-size:15px;border-radius:6px;display:inline-block">{label}</a>'
            f"</td></tr>"
        )
    return f"""<html><body style="margin:0;background:#f1f5f9;font-family:Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:32px">
  <tr><td style="font-size:12px;letter-spacing:2px;color:#64748b;text-transform:uppercase">GRIDLINE</td></tr>
  <tr><td style="padding-top:12px;font-size:24px;font-weight:700;color:#0f172a">{title}</td></tr>
  <tr><td style="padding-top:12px;font-size:15px;line-height:1.6;color:#334155">{intro}</td></tr>
  <tr><td style="padding-top:20px"><table width="100%" cellpadding="0" cellspacing="0">{row_html}</table></td></tr>
  {cta_html}
  <tr><td style="padding-top:24px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8">{footer}</td></tr>
</table>
</td></tr></table></body></html>"""


async def send(to: str, subject: str, html: str,
               attachment: tuple[str, bytes] | None = None) -> dict:
    """Returns {delivered, id, error}. Never raises: email is never the reason a quote fails."""
    if not configured():
        return {"delivered": False, "id": None,
                "error": "RESEND_API_KEY is not set — email was composed but not delivered"}
    try:
        import resend

        resend.api_key = os.environ["RESEND_API_KEY"]
        params: dict = {"from": sender(), "to": [to], "subject": subject, "html": html}
        if attachment:
            filename, data = attachment
            params["attachments"] = [{
                "filename": filename,
                "content": base64.b64encode(data).decode(),
            }]
        # The Resend SDK is synchronous — keep the event loop free.
        result = await asyncio.to_thread(resend.Emails.send, params)
        return {"delivered": True, "id": (result or {}).get("id"), "error": None}
    except Exception as exc:  # noqa: BLE001 — degrade, never break the business flow
        logger.warning("resend send failed: %s", exc)
        return {"delivered": False, "id": None, "error": str(exc)}
