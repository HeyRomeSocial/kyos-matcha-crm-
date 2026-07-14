# Kyos Matcha — B2B CRM Reporting

## How it works

1. **You export.** In the Partner Hub app, click the "Download Report" button on the
   Dashboard. This downloads a CSV like `kyos-crm-report-YYYY-MM-DD.csv` containing
   two sections: PARTNERS (current status/totals per café) and INVOICES (dated,
   per-order history).
2. **Drop it in `CRM Reports/exports/`.** Just save/move the file into this folder —
   keep the original filename (with its date) so Claude can always find the freshest one.
3. **Claude generates the report on schedule.** A weekly task (Monday mornings) and a
   monthly task (1st of the month) look for the newest export in this folder, compute
   the period's numbers, and build a slide deck into `CRM Reports/generated/`.
4. **If no fresh export is found**, the scheduled run will flag it in chat and ask you
   to export and drop a new CSV rather than silently reporting stale numbers.

## Files

- `kyos_report_engine.py` — parses an export CSV and computes revenue, orders, active
  cafés, new cafés onboarded (first-ever paid order in the period), and paid/unpaid/
  overdue split for any date range. Run: `python3 kyos_report_engine.py <csv> --start
  YYYY-MM-DD --end YYYY-MM-DD [--prior-csv <older export>] --json out.json`
- `build_weekly.js` — turns a metrics JSON (from the engine) into a 3-slide weekly
  snapshot deck. Run: `node build_weekly.js metrics.json Output.pptx`
- `build_monthly.js` — turns a report-data JSON into the full 7-slide monthly deck
  (Headline Metrics, Derived Metrics, Performance Statement, What the Numbers Tell Us,
  KPI Dashboard, Data to Capture, Definitions) — the same structure Ellis used for the
  May/June reports. Run: `node build_monthly.js report_data.json Output.pptx`
  See `monthly_report_data_june2026.json` for the exact shape expected — the monthly
  narrative fields (performance_statement, net_summary, insights) are written fresh
  each month based on that month's numbers.

## Definitions (locked — carried from Ellis's May/June reports)

- **Revenue**: net of VAT and refunds; counted on order date within the period.
- **Order**: one distinct paid transaction from a café.
- **Active account**: a café that placed ≥1 invoice in the period.
- **Onboarded / new account**: first-ever invoice fell within the period.
- **Volume**: total kg of matcha shipped/invoiced (not yet in the CSV export — see gap below).

## Known gaps in the current export

- No per-invoice **kg/volume** — the CSV has revenue but not weight per order, so
  "Volume sold" can't be auto-computed yet. Either add kg to the invoice export or
  keep tracking it manually until the export is extended.
- **Samples sent this period** can only be measured by diffing against the *previous*
  period's export (new sample_sent partners that weren't there before), so this
  number stays blank on the very first run and fills in from the second report onward.
- No **gross margin** or **cost per kg** data yet, same gap Ellis flagged for July.
