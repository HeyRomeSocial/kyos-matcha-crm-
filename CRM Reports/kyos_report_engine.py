"""
Kyos Matcha — B2B CRM Report Engine
====================================
Parses the "Download Report" CSV export from the Partner Hub app
(Dashboard.jsx > export button) and computes weekly/monthly B2B KPIs.

Export format (two sections in one CSV):
  PARTNERS section: Name,Status,Contact,Email,Price/KG,Total Orders,Total KG,Total Spent,Last Order
  INVOICES section: Invoice #,Partner,Date,Subtotal,Total,Status,PDF URL

Definitions (locked, matching Ellis's May/June 2026 reports):
  Revenue            = sum of invoice Total for invoices dated within the period (accrual, all statuses)
  Order               = one invoice
  Active account       = a partner with >=1 invoice dated within the period
  Onboarded/new account = a partner whose FIRST-EVER invoice falls within the period
                          (detected by cross-checking the partner's all-time Total Orders
                          count against how many of their invoices appear across all
                          available exports up to and including this period)
  Samples sent (period) = partners with status 'sample_sent' that were NOT present in the
                          prior snapshot (requires a prior export to diff against)

Usage:
    python3 kyos_report_engine.py <path_to_export.csv> --start 2026-07-03 --end 2026-07-09 \
        [--prior-csv <previous_period_export.csv>] [--json out.json]
"""
import csv
import io
import json
import sys
import argparse
from datetime import datetime, date
from collections import defaultdict


def parse_export(path):
    """Parse a Partner Hub CSV export into partners[] and invoices[] lists."""
    with open(path, newline='', encoding='utf-8-sig') as f:
        raw = f.read()

    lines = raw.splitlines()
    partners_start = next(i for i, l in enumerate(lines) if l.strip() == 'PARTNERS')
    invoices_start = next(i for i, l in enumerate(lines) if l.strip() == 'INVOICES')

    partners_block = '\n'.join(lines[partners_start + 1: invoices_start]).strip()
    invoices_block = '\n'.join(lines[invoices_start + 1:]).strip()

    partners = list(csv.DictReader(io.StringIO(partners_block)))
    invoices = list(csv.DictReader(io.StringIO(invoices_block)))

    def to_float(v, default=0.0):
        try:
            return float(v)
        except (ValueError, TypeError):
            return default

    def to_int(v, default=0):
        try:
            return int(v)
        except (ValueError, TypeError):
            return default

    for p in partners:
        p['Total Orders'] = to_int(p.get('Total Orders'))
        p['Total KG'] = to_float(p.get('Total KG'))
        p['Total Spent'] = to_float(p.get('Total Spent'))
        p['Price/KG'] = to_float(p.get('Price/KG'), None)

    for inv in invoices:
        inv['Subtotal'] = to_float(inv.get('Subtotal'))
        inv['Total'] = to_float(inv.get('Total'))
        try:
            inv['_date'] = datetime.strptime(inv['Date'].strip(), '%Y-%m-%d').date()
        except Exception:
            inv['_date'] = None

    return {'partners': partners, 'invoices': invoices}


def _norm(name):
    return (name or '').strip().lower()


def compute_period_metrics(data, start, end, prior_data=None, all_invoices_extra=None):
    """
    data: result of parse_export() for the CURRENT (most recent) export.
    start, end: date objects, inclusive, defining the reporting period.
    prior_data: optional parse_export() result from the export taken at the
                START of the period (used to detect newly-added sample_sent prospects).
    all_invoices_extra: optional list of invoice dicts from OTHER exports to
                widen the invoice history window when checking whether an
                invoice is a partner's first-ever order (helps when the
                current export's invoice log doesn't reach far enough back).
    """
    invoices = data['invoices']
    partners = data['partners']

    period_invoices = [i for i in invoices if i['_date'] and start <= i['_date'] <= end]

    revenue = sum(i['Total'] for i in period_invoices)
    orders = len(period_invoices)
    paid = sum(i['Total'] for i in period_invoices if i.get('Status') == 'paid')
    unpaid = sum(i['Total'] for i in period_invoices if i.get('Status') == 'unpaid')
    overdue = sum(i['Total'] for i in period_invoices if i.get('Status') == 'overdue')

    active_partner_names = {_norm(i['Partner']) for i in period_invoices}
    active_accounts = len(active_partner_names)

    # Build a combined invoice history (widest view available) to judge "first ever order"
    history = list(invoices)
    if all_invoices_extra:
        seen_keys = {(_norm(i['Partner']), i['_date'], i['Total']) for i in history}
        for i in all_invoices_extra:
            key = (_norm(i['Partner']), i.get('_date'), i.get('Total'))
            if key not in seen_keys:
                history.append(i)
                seen_keys.add(key)

    invoices_by_partner = defaultdict(list)
    for i in history:
        if i['_date']:
            invoices_by_partner[_norm(i['Partner'])].append(i['_date'])

    partner_lookup = {_norm(p['Name']): p for p in partners}

    new_accounts = []
    for name in active_partner_names:
        dates_known = sorted(invoices_by_partner.get(name, []))
        p = partner_lookup.get(name)
        total_orders_alltime = p['Total Orders'] if p else None
        # Confident "new" if: earliest known invoice date falls in this period AND
        # the number of invoices we can see for them equals their all-time total
        # (meaning our history window fully covers their order history).
        if dates_known:
            earliest = dates_known[0]
            covers_full_history = (total_orders_alltime is not None and len(dates_known) >= total_orders_alltime)
            if start <= earliest <= end and covers_full_history:
                new_accounts.append(name)

    # Samples sent this period: diff against prior snapshot if provided
    samples_sent_new = None
    current_sample_names = {_norm(p['Name']) for p in partners if p.get('Status') == 'sample_sent'}
    if prior_data is not None:
        prior_names = {_norm(p['Name']) for p in prior_data['partners']}
        samples_sent_new = sorted(n for n in current_sample_names if n not in prior_names)

    total_active_all = sum(1 for p in partners if p.get('Status') == 'active')
    total_sample_sent_all = sum(1 for p in partners if p.get('Status') == 'sample_sent')

    # Top partners by period revenue
    revenue_by_partner = defaultdict(float)
    for i in period_invoices:
        revenue_by_partner[i['Partner']] += i['Total']
    top_partners = sorted(revenue_by_partner.items(), key=lambda x: -x[1])[:5]

    return {
        'period_start': start.isoformat(),
        'period_end': end.isoformat(),
        'revenue': round(revenue, 2),
        'revenue_paid': round(paid, 2),
        'revenue_unpaid': round(unpaid, 2),
        'revenue_overdue': round(overdue, 2),
        'orders': orders,
        'active_accounts': active_accounts,
        'new_accounts_onboarded': sorted(new_accounts),
        'new_accounts_count': len(new_accounts),
        'samples_sent_new': samples_sent_new,
        'samples_sent_new_count': (len(samples_sent_new) if samples_sent_new is not None else None),
        'total_active_accounts_alltime': total_active_all,
        'total_sample_sent_alltime': total_sample_sent_all,
        'aov': round(revenue / orders, 2) if orders else 0,
        'revenue_per_active_account': round(revenue / active_accounts, 2) if active_accounts else 0,
        'top_partners_by_revenue': [(name, round(amt, 2)) for name, amt in top_partners],
    }


def parse_xlsx(path):
    """
    Parse the richer 'Kyos Matcha CRM.xlsx' workbook (Raw Orders + Raw Partners tabs).
    This is the preferred, authoritative source when available — it includes exact
    KG per order, per-partner historic-vs-CRM order counts, and exact Sample Sent /
    Added to CRM / Last Order dates, so periods can be computed precisely instead of
    heuristically.
    """
    import openpyxl
    wb = openpyxl.load_workbook(path, data_only=True)
    ro = wb['Raw Orders']
    rp = wb['Raw Partners']

    orders = []
    for r in ro.iter_rows(min_row=2, values_only=True):
        if r[0] is None:
            continue
        orders.append({
            'invoice': r[0], 'partner': (r[1] or '').strip(), 'date': r[2].date() if r[2] else None,
            'status': r[3], 'paid_revenue': r[4] or 0, 'outstanding': r[5] or 0, 'total': r[6] or 0,
            'kg': r[7] or 0,
        })

    partners = []
    for r in rp.iter_rows(min_row=2, values_only=True):
        if r[0] is None:
            continue
        partners.append({
            'name': r[0].strip(), 'status': r[1], 'hist_orders': r[5] or 0,
            'crm_paid_orders': r[6] or 0, 'crm_unpaid_orders': r[7] or 0, 'total_orders': r[8] or 0,
            'sample_sent_date': r[16].date() if r[16] else None,
            'last_order_date': r[17].date() if r[17] else None,
            'added_to_crm': r[18].date() if r[18] else None,
        })

    return {'orders': orders, 'partners': partners}


def compute_period_metrics_xlsx(data, start, end):
    """Compute period KPIs from parse_xlsx() output for the [start, end] date range (inclusive)."""
    orders = data['orders']
    partners = {p['name']: p for p in data['partners']}

    period_orders = [o for o in orders if o['date'] and start <= o['date'] <= end]
    revenue = sum(o['total'] for o in period_orders)
    revenue_paid = sum(o['total'] for o in period_orders if o['status'] == 'paid')
    revenue_unpaid = sum(o['total'] for o in period_orders if o['status'] == 'unpaid')
    kg_sold = sum(o['kg'] for o in period_orders)
    orders_count = len(period_orders)

    orders_in_period_by_partner = defaultdict(int)
    revenue_by_partner = defaultdict(float)
    for o in period_orders:
        orders_in_period_by_partner[o['partner']] += 1
        revenue_by_partner[o['partner']] += o['total']

    active_accounts = len(orders_in_period_by_partner)

    new_accounts = []
    for name, n_in_period in orders_in_period_by_partner.items():
        p = partners.get(name)
        if not p:
            continue
        orders_before = (p['total_orders'] or 0) - n_in_period
        if (p['hist_orders'] or 0) == 0 and orders_before <= 0:
            new_accounts.append(name)

    samples_sent = [p['name'] for p in data['partners'] if p['sample_sent_date'] and start <= p['sample_sent_date'] <= end]

    top_partners = sorted(revenue_by_partner.items(), key=lambda x: -x[1])[:5]

    return {
        'period_start': start.isoformat(), 'period_end': end.isoformat(),
        'revenue': round(revenue, 2), 'revenue_paid': round(revenue_paid, 2),
        'revenue_unpaid': round(revenue_unpaid, 2), 'revenue_overdue': 0,
        'kg_sold': round(kg_sold, 2),
        'orders': orders_count, 'active_accounts': active_accounts,
        'new_accounts_onboarded': sorted(new_accounts), 'new_accounts_count': len(new_accounts),
        'samples_sent_new': sorted(samples_sent), 'samples_sent_new_count': len(samples_sent),
        'total_active_accounts_alltime': sum(1 for p in data['partners'] if p['status'] == 'active'),
        'total_sample_sent_alltime': sum(1 for p in data['partners'] if p['status'] == 'sample_sent'),
        'aov': round(revenue / orders_count, 2) if orders_count else 0,
        'revenue_per_active_account': round(revenue / active_accounts, 2) if active_accounts else 0,
        'top_partners_by_revenue': [(n, round(a, 2)) for n, a in top_partners],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('data_path', help='CSV export (Partner Hub) or .xlsx (Kyos Matcha CRM workbook)')
    ap.add_argument('--start', required=True)
    ap.add_argument('--end', required=True)
    ap.add_argument('--prior-csv', default=None, help='Only used for CSV mode')
    ap.add_argument('--json', default=None)
    args = ap.parse_args()

    start = datetime.strptime(args.start, '%Y-%m-%d').date()
    end = datetime.strptime(args.end, '%Y-%m-%d').date()

    if args.data_path.lower().endswith('.xlsx'):
        data = parse_xlsx(args.data_path)
        metrics = compute_period_metrics_xlsx(data, start, end)
    else:
        data = parse_export(args.data_path)
        prior_data = parse_export(args.prior_csv) if args.prior_csv else None
        metrics = compute_period_metrics(data, start, end, prior_data=prior_data)

    out = json.dumps(metrics, indent=2)
    print(out)
    if args.json:
        with open(args.json, 'w') as f:
            f.write(out)


if __name__ == '__main__':
    main()
