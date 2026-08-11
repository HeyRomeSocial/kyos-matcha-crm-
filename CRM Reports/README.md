# Kyos Matcha — B2B CRM Reporting

## How it works (live, no manual export needed)

Reports now pull directly from the live **Kyos Matcha CRM** Google Sheet via the
connected Google Drive account — no manual export/upload step required from Rome.

- Sheet: `Kyos Matcha CRM`
- File ID: `1aYCpSFABWz7x0gCw956e3ER1jvTN-ubkc4vALTVo_KI`
- URL: https://docs.google.com/spreadsheets/d/1aYCpSFABWz7x0gCw956e3ER1jvTN-ubkc4vALTVo_KI/edit

Tabs used:
- **Weekly Log** — one row per week (Week Starting, Total/Paid/Unpaid Invoices, Paid
  Revenue, Outstanding, KG Sold, New Accounts, Samples Sent). Authoritative headline
  numbers for the weekly snapshot — no recomputation needed.
- **Monthly Report** — one row per month (Partners Added, Samples Sent, First Orders,
  Paid Revenue, Outstanding, KG Sold, AOV, Conversion %, Revenue Growth %, KG Growth %).
  Authoritative headline + derived numbers for the monthly report.
- **Raw: Orders** — per-invoice detail (date, partner, status, revenue, KG). Used to
  build the "top cafés by revenue" leaderboard and to cross-check new-account detection
  for any period.
- **Raw Partners** — per-partner detail including Hist Orders (pre-CRM order count),
  CRM Paid/Unpaid Orders, Sample Sent Date, Last Order Date, Added to CRM date. Used to
  confirm which specific cafés are genuinely new this period (Hist Orders = 0 AND no
  orders before the period start).

### Weekly flow (previous Mon–Sun)
1. Read the live sheet (Drive `read_file_content` on the file ID above).
2. Pull the matching **Weekly Log** row for headline numbers (revenue/orders/kg —
   don't recompute these, the row is authoritative).
3. Filter **Raw: Orders** to the period for the top-5-by-revenue table, and to the
   current calendar month-to-date for the top-cafés-this-month table and MTD kg.
4. Cross-check **Raw Partners** Hist Orders for every active partner this week to
   confirm new accounts — **never trust the Weekly Log's "New Accounts" column
   directly**, see "Known data-quality issues" below.
5. Compute the 21+ day follow-up list from **Raw: Orders** (most recent order date
   per partner), not from Raw Partners' Last Order Date column — see below.
6. For every candidate new account, check Added to CRM against the period start —
   a first invoice does not automatically mean "new café" (see "New vs. reactivated"
   below).
7. Compute the monthly kg growth trajectory (verified past actuals + current
   month-to-date + future targets, see "Monthly kg goal" below) — no chart.
8. Build `metrics.json` matching the shape `kyos_report_engine.py`'s
   `compute_full_weekly_report()` produces, run
   `node build_weekly.js metrics.json Output.pptx`, save to `CRM Reports/generated/`.
   The deck now runs up to 9 slides: Title, KPI grid, Active Cafés + New Cafés +
   Reactivated Cafés, Highlights (top cafés this month, outstanding, focus),
   Monthly Kg Goal (growth trajectory + vision, no chart), No Order in 21+ Days,
   Insights & How to Improve, and Matcha Inventory (last two optional, only if the
   JSON includes `insights` / `inventory`).

### Monthly flow (1st of the month, previous calendar month)
1. Read the live sheet.
2. Pull the current + prior month rows from **Monthly Report** for the headline/derived
   metrics tables.
3. Write fresh narrative (performance statement, "what the numbers tell us",
   recommendations) based on that month's actual numbers — matching the analytical,
   non-fluffy tone of Ellis's original May/June reports. Reference the locked
   definitions below.
4. Build a `report_data.json` matching `monthly_report_data_june2026.json`'s shape, run
   `node build_monthly.js report_data.json Output.pptx`, save to `CRM Reports/generated/`.

## Files

- `kyos_report_engine.py` — also still works standalone on a downloaded `.xlsx` or the
  older Partner Hub CSV export, for one-off runs or as a fallback if Drive access is
  ever unavailable. Run: `python3 kyos_report_engine.py <file.xlsx|csv> --start
  YYYY-MM-DD --end YYYY-MM-DD --json out.json`
- `build_weekly.js` — turns a metrics JSON into the up-to-9-slide weekly report deck
  (brand green palette, real Kyo's Matcha logo, title-slide stat teasers, KPI grid
  with week-over-week ▲/▼ deltas on revenue/orders/kg, active + new + reactivated
  cafés, highlights, monthly kg goal with a growth trajectory (past actuals + current
  progress + future targets, no chart) + vision, 21+ day follow-up list with a
  healthy-partner-ratio context stat, insights, optional inventory). Run:
  `node build_weekly.js metrics.json Output.pptx`
- `build_monthly.js` — turns a report-data JSON into the full 8-slide monthly deck
  (Headline Metrics, Derived Metrics, Performance Statement, What the Numbers Tell Us,
  KPI Dashboard, Data to Capture, Definitions, Recommendations to Grow the Brand).
  Run: `node build_monthly.js report_data.json Output.pptx`
- `Kyo_s_Logo.png` — real brand logo, used on both decks' title slides.
- Both scripts need Node globals installed once per sandbox session:
  `mkdir -p ~/.npm-global && npm config set prefix ~/.npm-global && export
  PATH=~/.npm-global/bin:$PATH && npm install -g pptxgenjs react-icons react react-dom
  sharp`, then `export NODE_PATH=$(npm root -g)` before running the node scripts.

## Definitions (locked — carried from Ellis's May/June reports)

- **Revenue**: net of VAT and refunds; counted on order date within the period.
- **Order**: one distinct paid transaction from a café.
- **Active account (week)**: a café that placed ≥1 invoice in the reporting week.
- **Active account (month)**: a café that placed ≥1 invoice so far in the current
  calendar month — shown on every weekly report alongside the week's own number, not
  just at month-end.
- **Onboarded / new account**: first-ever invoice fell within the period (Hist Orders
  = 0 and no CRM orders before the period start) AND Added to CRM is within ~14 days
  of the period start — a genuinely brand-new contact. See "Known data-quality issues"
  below — never trust the sheet's own "New Accounts" column for this.
- **Reactivated account**: first-ever *paid* invoice fell within the period, but
  Added to CRM predates the period start by more than 14 days — Kyo's already had a
  relationship with this café (sampled, added to the CRM, then went quiet) before
  they placed a paid order. Reported separately from new accounts and never called
  "new" — confirmed real case: Strutt Bakehouse (Derby) and The Salad Lab, added to
  the CRM in early June, placed their first invoice in July.
- **No order in 21+ days**: an active café whose most recent order (per Raw: Orders)
  is 21+ days before the report date. A follow-up nudge, not a churn verdict.
- **Volume**: total kg of matcha shipped/invoiced in the period (available directly
  per-invoice in Raw: Orders — "Matcha KG" column).
- **Monthly kg goal**: cumulative kg shipped this calendar month vs. a DYNAMIC
  target = last calendar month's ACTUAL kg shipped + 58kg (Ellis's growth target).
  Not a fixed pre-typed table — confirmed anchor: June 2026 actually ended at
  150.5kg, so July's real target is 208.5kg, not a flat "208". Always pass the
  prior month's verified actual (`--prior-month-kg` / `--prior-month-label` on
  `kyos_report_engine.py`, or `prior_month_kg=` on `compute_full_weekly_report()`)
  so the target self-corrects instead of drifting from reality.
  `DEFAULT_TARGET_LADDER` is only a fallback for when the prior month's actual
  isn't known yet. A "stretch goal" (target × 1.15) is also computed — the +58kg
  number is the floor, not the ceiling; insights should call out ways to beat it,
  not just hit it.
- **Monthly kg growth trajectory** (slide, not a chart): Rome asked for the old
  8-week bar chart to be removed — she didn't like it as a visual. It's replaced by
  a row of chips across verified past months (real `actual_kg`, tinted green if the
  month beat its own target), the current month ("so far", in progress), and future
  months (target only). `annotate_ladder_with_actuals()` in `kyos_report_engine.py`
  builds this automatically from `target_ladder` + `monthly_actuals`, and will
  back-extrapolate targets for any verified past month that predates the ladder's
  first rung (e.g. adding May 2026 before a ladder that starts at July) so the
  "kg keeps increasing period over period" story is visible, not just future
  targets. A `vision_summary` one-liner projects the trajectory to the ladder's
  final month (e.g. "...reaches 556.0 kg by January 2027 — roughly 4.5x June's
  total.").
- **Goal reached mid-month ≠ done for the month.** `compute_goal()` returns
  `goal_reached` (mtd_kg >= target_kg) and `remaining_to_stretch_kg`. When true,
  `build_weekly.js` shows a "✓ GOAL REACHED — PUSHING FOR MORE" badge, scales the
  progress bar to the stretch goal (not just the floor) with marker lines at both
  the target and stretch positions, and adds a dedicated banner ("don't stop here,
  X kg more gets you to the stretch goal") that always shows regardless of what
  `goal.note` says — per Rome, hitting the floor early shouldn't read as "mission
  accomplished, ease off." The current month's trajectory chip also gets a small
  gold checkmark badge and switches to "beat" styling once it clears its own
  target, even while still in progress.
- **Week-over-week (WoW) deltas**: `compute_wow_deltas()` compares this week's
  revenue/orders/kg/active-accounts to the immediately prior Mon-Sun week and
  returns `{revenue_pct, orders_pct, kg_pct, active_pct}` (plus the `_prior` raw
  values). `build_weekly.js` shows a small ▲/▼ pct badge on the Revenue, Orders,
  and Matcha Shipped KPI cards only — count/state metrics (samples sent, new
  cafés, outstanding) don't get the same treatment since a raw count comparison
  is less meaningful than a trend for those.

## Known data-quality issues (learned the hard way — don't relitigate these)

- **Weekly Log "New Accounts" column overcounts.** Checked twice: claimed 6 new
  accounts one week, 4 the next; only 2 were verifiable via Hist Orders each time.
  Always compute new accounts independently (Hist Orders = 0 AND no prior orders),
  and label anyone whose Raw Partners row couldn't be confirmed as "(pending
  confirmation)" rather than asserting a number.
- **Raw Partners "Last Order Date" can be stale.** Confirmed cases (e.g. Acai Grove,
  Chester and At Belle's) where this field showed an older date than a more recent
  order visible in Raw: Orders. Always compute "days since last order" from Raw:
  Orders directly, not from this column.
- **read_file_content truncates on this sheet.** Raw Partners is sorted A-Z and
  responses often cut off mid-alphabet before reaching the end (commonly somewhere
  around "S"). If a needed partner's row is missing, retry, dispatch a subagent to
  fetch that specific row, or report the figure as unconfirmed — don't guess. A
  targeted subagent fetch (asking for one or two specific partner rows via a full
  XLSX export decode rather than the markdown preview) has worked as a fallback.
- **The "New Accounts" discrepancy and the "Last Order Date" staleness are separate
  bugs** — fixing one doesn't fix the other. Both need independent handling.
- **Insight cards need real space.** More than 5 on one slide caused text to
  overlap and run off the bottom in testing. `build_weekly.js` now caps insight
  cards at 5 per slide and overflows extras onto an "(cont.)" slide automatically
  — keep insight bodies to 1-2 sentences regardless, don't rely on the overflow
  to paper over long copy.
- **Outstanding invoices ≠ automatically bad.** Early versions painted the
  outstanding-invoices card/box red every week, which was misleading — most
  outstanding balances are just recent invoices not yet due. `build_weekly.js`
  now only uses red for a genuine 30+ day overdue amount (`revenue_overdue > 0`);
  a large-but-not-yet-due balance gets amber ("worth a nudge"), and a normal
  balance gets the same neutral green treatment as every other KPI card.
- **A first invoice ≠ automatically a new café.** Confirmed real case: Strutt
  Bakehouse (Derby) and The Salad Lab placed their first CRM invoice in July but
  were Added to CRM back in early June — Rome confirmed they'd already been
  working with Kyo's and had just gone quiet. `compute_period_metrics_xlsx()` now
  checks Added to CRM against `REACTIVATION_GAP_DAYS` (14 days) and splits
  `new_accounts_onboarded` from `reactivated_onboarded` accordingly — always check
  both lists, never assume a first paid order means a brand-new contact.

- **Low stock + hot shipping pace get flagged together.** If `metrics.goal.goal_reached`
  is true, a "low" inventory item's caption on the Matcha Inventory slide
  automatically appends "Shipments are ahead of pace this month — restock soon."
  since a faster-than-usual month draws stock down faster too. Confirmed real case:
  Matcha AAA at 3.5kg (below the 5kg threshold) flagged alongside July running
  15kg+ past its kg target — worth a dedicated insight card (tone "warn") as well
  as the slide callout, not just the slide callout alone.
- **Don't estimate "days of stock left" from the overall shipping pace.** Tried
  this once: `item.kg / (mtd_kg / days_elapsed)` using the combined daily pace
  across ALL matcha grades. For a low-stock grade that's a small fraction of
  total volume (e.g. Matcha AAA against Matcha A's much larger share), this
  systematically understates runway — it showed "~0 days left" on a real test
  case that wasn't actually about to run out. Removed; the inventory slide only
  gives a qualitative pace-aware nudge now ("restock sooner rather than later"),
  not a fabricated countdown. Would need grade-level shipment data (not currently
  tracked) to do a real days-remaining estimate.

## Known gaps (still open, per Ellis's July note)

- No **gross margin** or **cost per kg** data — can't yet confirm growth is profitable.
- No **new vs. returning revenue split** — how much of a month's growth is from brand
  new accounts vs. existing ones reordering more (buildable now from Raw: Orders +
  Raw Partners, just not automated yet).
- **Product mix** (retail pouches, starter kits — both tracked in Raw: Orders but not
  yet surfaced in either report) — worth adding if the founder wants to see full
  contribution across bulk + retail.
- The 21+ day follow-up list is necessarily **partial**, not an exhaustive sweep of
  all active partners, whenever Raw Orders itself is truncated or doesn't reach far
  enough back for a quiet partner's true last order.

## Note on Canva

Shared pptx files sometimes auto-mirror into the connected Canva account, but that sync
has shown itself to be unreliable (leaves stale/mixed content from earlier versions).
Always treat the local `.pptx` in `CRM Reports/generated/` as the source of truth, and
double-check any Canva copy against it before sending — don't trust the Canva mirror
blindly.
