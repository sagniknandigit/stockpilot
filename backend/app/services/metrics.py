"""Single definition of "a sale" used by every report, forecast and dashboard.

Sales are net of refunds and attributed to the order date. Fully refunded orders don't
count; partially refunded ones count for what the customer kept.
"""

from app.models import OrderStatus, SalesOrder, SalesOrderLine

COUNTED_ORDER = SalesOrder.status.in_([OrderStatus.COMPLETED, OrderStatus.PARTIALLY_REFUNDED])
NET_REVENUE = SalesOrder.total - SalesOrder.refunded_amount
NET_QUANTITY = SalesOrderLine.quantity - SalesOrderLine.refunded_quantity
NET_LINE_TOTAL = (
    SalesOrderLine.line_total - SalesOrderLine.unit_price * SalesOrderLine.refunded_quantity
)
NET_COGS = SalesOrderLine.unit_cost * NET_QUANTITY
