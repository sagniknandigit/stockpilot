"""Morning digest: yesterday's numbers and what needs reordering, per organization."""

import html
from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import Organization
from app.services import analytics, email, forecasting, notifications


def _money(currency: str, value: object) -> str:
    symbol = {"INR": "₹", "USD": "$", "EUR": "€", "GBP": "£"}.get(currency, f"{currency} ")
    return f"{symbol}{float(str(value)):,.2f}"


async def build_and_send(db: AsyncSession, org_id: UUID) -> bool:
    """Returns False when there is nothing worth sending (no sales and nothing to reorder)."""
    org = await db.get(Organization, org_id)
    if org is None:
        return False
    tz = await forecasting.org_timezone(db, org_id)
    yesterday = datetime.now(tz).date() - timedelta(days=1)
    report = await analytics.analytics(db, org_id, yesterday, yesterday)
    reorder = await forecasting.reorder_suggestions(db, org_id)
    critical = [i for i in reorder.items if i.urgency == "critical"]
    totals = report.totals
    if totals.orders == 0 and not critical:
        return False

    money = _money
    summary = (
        f"Yesterday ({yesterday:%a %d %b}): {money(org.currency, totals.revenue)} from "
        f"{totals.orders} orders, gross margin "
        f"{totals.gross_margin_pct if totals.gross_margin_pct is not None else 0}%."
    )
    if totals.revenue_change_pct is not None:
        summary += f" That's {totals.revenue_change_pct:+.1f}% vs the day before."
    top = ", ".join(f"{p.name} ({p.units})" for p in report.products[:3]) or "none"
    lines = [html.escape(summary), f"Best sellers: {html.escape(top)}."]
    if critical:
        items = "".join(
            f"<li>{html.escape(i.product_name)}"
            f"{'' if i.variant_name == 'Default' else ' - ' + html.escape(i.variant_name)}: "
            f"{i.available} left, order {i.suggested_qty}"
            f"{' from ' + html.escape(i.last_supplier_name) if i.last_supplier_name else ''}</li>"
            for i in critical[:8]
        )
        lines.append(
            f"<strong>{len(critical)} products need reordering now:</strong><ul>{items}</ul>"
        )
    else:
        lines.append("Nothing is at risk of running out. 🎉")

    users = await notifications.recipients(db, org_id)
    title = f"Daily summary for {org.name}"
    await notifications.notify(
        db,
        org_id,
        users,
        type="digest",
        title=title,
        body=summary + (f" {len(critical)} products need reordering." if critical else ""),
        link="/",
        data={"key": str(yesterday)},
    )
    await db.commit()
    text_lines = [summary, f"Best sellers: {top}."] + [
        f"- {i.product_name}: {i.available} left, order {i.suggested_qty}" for i in critical[:8]
    ]
    await email.send_email(
        [u.email for u in users],
        f"[StockPilot] {title}",
        email.render(title, lines, ("Open dashboard", settings.app_url)),
        "\n".join(text_lines),
    )
    return True


async def all_org_ids(db: AsyncSession) -> list[UUID]:
    return list(await db.scalars(select(Organization.id)))
