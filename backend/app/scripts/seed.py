"""Seed a demo tenant with a realistic catalog and ~90 days of sales history.

    python -m app.scripts.seed            # create the demo org if it doesn't exist
    python -m app.scripts.seed --reset    # delete and recreate it

Demand is simulated per SKU (base rate x weekday seasonality x trend + noise) so the
dashboard and the demand-forecasting module have meaningful history to work with.
The ledger stays consistent: initial stock + every sale movement == current on_hand.
"""

import argparse
import asyncio
import random
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import SessionLocal, engine
from app.core.security import hash_password
from app.models import (
    Category,
    Location,
    MovementReason,
    Organization,
    Product,
    ProductVariant,
    Role,
    SalesOrder,
    SalesOrderLine,
    StockLevel,
    StockMovement,
    User,
)

DEMO_EMAIL = "demo@stockpilot.app"
DEMO_PASSWORD = "demo-password"
DAYS = 90
WEEKDAY_FACTOR = [0.8, 0.85, 0.9, 1.0, 1.25, 1.5, 1.2]  # Mon..Sun

# (category, product, [(variant, sku, price, cost, daily_demand, reorder_point)])
CATALOG: list[tuple[str, str, list[tuple[str, str, int, int, float, int]]]] = [
    ("Beverages", "Cold Brew Coffee 250ml", [("Default", "BEV-CB-250", 120, 55, 6.0, 20)]),
    ("Beverages", "Green Tea (25 bags)", [("Default", "BEV-GT-25", 180, 90, 2.5, 10)]),
    ("Beverages", "Sparkling Water 500ml", [("Default", "BEV-SW-500", 40, 15, 9.0, 30)]),
    ("Beverages", "Orange Juice 1L", [("Default", "BEV-OJ-1L", 110, 60, 4.0, 15)]),
    (
        "Snacks",
        "Sea Salt Chips",
        [("Small", "SNK-CH-S", 30, 12, 7.0, 25), ("Large", "SNK-CH-L", 60, 26, 3.5, 12)],
    ),
    ("Snacks", "Dark Chocolate 70%", [("Default", "SNK-DC-70", 150, 70, 3.0, 10)]),
    ("Snacks", "Trail Mix 200g", [("Default", "SNK-TM-200", 220, 120, 1.8, 8)]),
    (
        "Snacks",
        "Protein Bar",
        [("Peanut", "SNK-PB-PN", 90, 45, 4.5, 15), ("Chocolate", "SNK-PB-CH", 90, 45, 5.0, 15)],
    ),
    ("Household", "Dish Soap 500ml", [("Default", "HH-DS-500", 95, 50, 2.2, 8)]),
    ("Household", "Paper Towels (2 rolls)", [("Default", "HH-PT-2", 140, 80, 2.0, 8)]),
    ("Household", "Laundry Detergent 1kg", [("Default", "HH-LD-1K", 260, 160, 1.4, 6)]),
    ("Household", "Trash Bags (30 pack)", [("Default", "HH-TB-30", 120, 60, 1.2, 5)]),
    ("Personal Care", "Toothpaste 100g", [("Default", "PC-TP-100", 85, 40, 2.6, 10)]),
    (
        "Personal Care",
        "Shampoo 340ml",
        [("Normal", "PC-SH-N", 240, 130, 1.3, 5), ("Anti-dandruff", "PC-SH-AD", 270, 150, 1.0, 5)],
    ),
    ("Personal Care", "Hand Sanitizer 100ml", [("Default", "PC-HS-100", 60, 25, 2.0, 8)]),
    ("Dairy", "Whole Milk 1L", [("Default", "DY-WM-1L", 68, 52, 12.0, 40)]),
    (
        "Dairy",
        "Greek Yogurt 400g",
        [("Plain", "DY-GY-PL", 95, 60, 3.0, 10), ("Honey", "DY-GY-HN", 110, 68, 2.4, 10)],
    ),
    ("Dairy", "Cheddar Cheese 200g", [("Default", "DY-CC-200", 210, 140, 1.6, 6)]),
    ("Bakery", "Sourdough Loaf", [("Default", "BK-SD-1", 160, 70, 3.5, 10)]),
    ("Bakery", "Butter Croissant", [("Default", "BK-CR-1", 70, 28, 6.5, 20)]),
    ("Stationery", "Gel Pen (Blue)", [("Default", "ST-GP-BL", 25, 9, 2.0, 15)]),
    (
        "Stationery",
        "A5 Notebook",
        [("Ruled", "ST-NB-R", 120, 55, 0.9, 5), ("Dotted", "ST-NB-D", 130, 60, 0.6, 5)],
    ),
]


def poisson(rng: random.Random, lam: float) -> int:
    # Knuth's algorithm; fine for the small rates used here.
    threshold, k, p = pow(2.718281828, -lam), 0, 1.0
    while True:
        p *= rng.random()
        if p <= threshold:
            return k
        k += 1


async def _reset(db: AsyncSession) -> None:
    org_id = await db.scalar(select(User.org_id).where(User.email == DEMO_EMAIL))
    if org_id is None:
        return
    # The ledger is append-only by trigger; lift it only for this demo-data reset.
    await db.execute(
        text("ALTER TABLE stock_movements DISABLE TRIGGER stock_movements_append_only")
    )
    await db.execute(delete(Organization).where(Organization.id == org_id))
    await db.execute(text("ALTER TABLE stock_movements ENABLE TRIGGER stock_movements_append_only"))
    await db.commit()


async def seed(reset: bool) -> None:
    rng = random.Random(42)
    async with SessionLocal() as db:
        if reset:
            await _reset(db)
        if await db.scalar(select(User.id).where(User.email == DEMO_EMAIL)):
            print(f"Demo tenant already exists ({DEMO_EMAIL}). Use --reset to recreate.")
            return

        org = Organization(name="Demo Mart", slug=f"demo-mart-{uuid4().hex[:6]}")
        db.add(org)
        await db.flush()
        owner = User(
            org_id=org.id,
            email=DEMO_EMAIL,
            full_name="Demo Owner",
            hashed_password=hash_password(DEMO_PASSWORD),
            role=Role.OWNER,
        )
        store = Location(org_id=org.id, name="Main Store", code="MAIN", address="12 Market Road")
        warehouse = Location(org_id=org.id, name="Back Warehouse", code="WH1")
        db.add_all([owner, store, warehouse])

        categories: dict[str, Category] = {}
        variants: list[tuple[ProductVariant, str, float]] = []  # (variant, label, demand)
        for cat_name, product_name, variant_specs in CATALOG:
            if cat_name not in categories:
                categories[cat_name] = Category(org_id=org.id, name=cat_name)
                db.add(categories[cat_name])
            product = Product(org_id=org.id, name=product_name, category=categories[cat_name])
            for vname, sku, price, cost, demand, reorder in variant_specs:
                v = ProductVariant(
                    org_id=org.id,
                    name=vname,
                    sku=sku,
                    barcode=f"890{rng.randrange(10**9, 10**10)}",
                    price=Decimal(price),
                    cost=Decimal(cost),
                    reorder_point=reorder,
                )
                product.variants.append(v)
                label = product_name if vname == "Default" else f"{product_name} - {vname}"
                variants.append((v, label, demand))
            db.add(product)
        await db.flush()

        now = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
        start = now - timedelta(days=DAYS)
        sold: dict[UUID, int] = defaultdict(int)
        movements: list[StockMovement] = []
        orders = 0

        for day in range(DAYS):
            date = start + timedelta(days=day)
            trend = 0.85 + 0.3 * day / DAYS  # business growing ~30% over the period
            for v, label, demand in variants:
                qty_today = poisson(rng, demand * WEEKDAY_FACTOR[date.weekday()] * trend)
                # Split the day's demand into a few customer orders across opening hours.
                while qty_today > 0:
                    qty = min(qty_today, rng.choice([1, 1, 1, 2, 3]))
                    qty_today -= qty
                    at = date + timedelta(hours=rng.randint(9, 20), minutes=rng.randint(0, 59))
                    total = (v.price * qty).quantize(Decimal("0.01"))
                    order = SalesOrder(
                        id=uuid4(),
                        org_id=org.id,
                        number=orders + 1,
                        location_id=store.id,
                        subtotal=total,
                        discount=Decimal("0"),
                        total=total,
                        created_by=owner.id,
                        created_at=at,
                        updated_at=at,
                        lines=[
                            SalesOrderLine(
                                variant_id=v.id,
                                sku=v.sku,
                                name=label,
                                quantity=qty,
                                unit_price=v.price,
                                unit_cost=v.cost,
                                line_total=total,
                            )
                        ],
                    )
                    db.add(order)
                    movements.append(
                        StockMovement(
                            org_id=org.id,
                            variant_id=v.id,
                            location_id=store.id,
                            quantity=-qty,
                            reason=MovementReason.SALE,
                            reference_type="sales_order",
                            reference_id=order.id,
                            created_by=owner.id,
                            created_at=at,
                        )
                    )
                    sold[v.id] += qty
                    orders += 1
            await db.flush()

        # Opening stock = everything sold + a closing balance. Some SKUs end below their
        # reorder point so the low-stock alerts and reorder suggestions have something to show.
        opening = start - timedelta(hours=1)
        for i, (v, _, demand) in enumerate(variants):
            closing = (
                rng.randint(0, v.reorder_point) if i % 4 == 0 else int(demand * rng.uniform(8, 20))
            )
            db.add(
                StockLevel(org_id=org.id, variant_id=v.id, location_id=store.id, on_hand=closing)
            )
            movements.insert(
                0,
                StockMovement(
                    org_id=org.id,
                    variant_id=v.id,
                    location_id=store.id,
                    quantity=sold[v.id] + closing,
                    reason=MovementReason.INITIAL,
                    reference_type="seed",
                    note="Opening stock",
                    created_by=owner.id,
                    created_at=opening,
                ),
            )
            backroom = 0 if i % 4 == 0 else int(demand * rng.uniform(5, 15))
            if backroom:
                db.add(
                    StockLevel(
                        org_id=org.id, variant_id=v.id, location_id=warehouse.id, on_hand=backroom
                    )
                )
                movements.append(
                    StockMovement(
                        org_id=org.id,
                        variant_id=v.id,
                        location_id=warehouse.id,
                        quantity=backroom,
                        reason=MovementReason.INITIAL,
                        reference_type="seed",
                        note="Opening stock",
                        created_by=owner.id,
                        created_at=opening,
                    )
                )
        db.add_all(movements)
        org.order_seq = orders
        await db.commit()
        print(
            f"Seeded '{org.name}': {len(variants)} SKUs, {orders} orders over {DAYS} days.\n"
            f"Login: {DEMO_EMAIL} / {DEMO_PASSWORD}"
        )
    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--reset", action="store_true", help="delete and recreate the demo tenant")
    asyncio.run(seed(parser.parse_args().reset))


if __name__ == "__main__":
    main()
