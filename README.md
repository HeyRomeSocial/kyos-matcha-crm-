# Kyos Matcha CRM

A live, multi-user CRM for Kyos Matcha — managing wholesale cafe partners, tracking orders, generating branded invoices, and predicting reorder dates.

**Stack:** React + Vite + Tailwind CSS · Supabase (Auth, PostgreSQL, Storage) · Vercel · jsPDF

---

## Setup Guide

### 1. Prerequisites

- [Node.js 18+](https://nodejs.org) installed
- A [Supabase](https://supabase.com) account (free tier is fine)
- A [Vercel](https://vercel.com) account for deployment

---

### 2. Clone & Install

```bash
cd "Kyos Matcha"
npm install
```

---

### 3. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Note your **Project URL** and **anon public key** from:
   `Settings → API → Project URL / Project API keys`

---

### 4. Run Database Schema

1. In your Supabase project, open the **SQL Editor**.
2. Copy the contents of `supabase/schema.sql` and run it.

This creates:
- `partners` table
- `orders` table  
- `invoice_sequence` table (starts at 166, so first invoice is KM-167)
- Row Level Security policies (authenticated team members only)
- Realtime enabled on `orders`
- Indexes for performance

---

### 5. Create Storage Bucket

1. Go to **Storage** in your Supabase project.
2. Click **New bucket**.
3. Name it exactly: `invoices`
4. Set it to **Public** (so invoice PDFs are downloadable via URL).

---

### 6. Enable Email Auth

1. Go to **Authentication → Providers**.
2. Ensure **Email** is enabled (it is by default).
3. Disable "Confirm email" if you want instant access for invited users (optional).

---

### 7. Configure Environment Variables

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

---

### 8. Run Locally

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

### 9. Invite Team Members

1. Go to Supabase → **Authentication → Users**.
2. Click **Invite user**.
3. Enter the team member's email — they'll receive a magic link to set their password.

> There is **no public signup**. Only invited users can log in.

---

### 10. Deploy to Vercel

1. Push this project to a GitHub repository.
2. Go to [vercel.com](https://vercel.com) → **New Project** → Import the repo.
3. In **Environment Variables**, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy — Vercel auto-detects Vite.

---

## Features

| Page | Description |
|------|-------------|
| **Dashboard** | KPI cards, 6-month revenue chart, upcoming reorders (14 days), recent orders |
| **Partners** | Full partner table with status filter, add/edit modal, reorder urgency highlights |
| **Partner Detail** | Individual partner info, order history, stats |
| **Invoice Generator** | Two-panel layout with live preview, auto-populated line items, PDF generation + upload |
| **Orders Log** | All invoices with paid/unpaid/overdue status, mark-paid toggle, realtime sync |
| **Settings** | Account info, invoice defaults, Supabase dashboard link |

---

## Invoice PDF

- Generated from the live preview using `jsPDF` + `html2canvas`
- Uploaded to Supabase Storage as `invoices/KM-XXX.pdf`
- Public URL stored in `orders.invoice_pdf_url`
- A4 portrait, Inter font, Kyos Matcha branding

---

## Reorder Urgency Colours

| State | Colour |
|-------|--------|
| Overdue (past due date) | 🔴 Red |
| Due within 7 days | 🟡 Amber |
| Due within 8–14 days | shown on Dashboard |

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon/public API key |
