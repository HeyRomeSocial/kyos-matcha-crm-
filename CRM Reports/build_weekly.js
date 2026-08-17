const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const {
  FaSterlingSign, FaBoxOpen, FaShop, FaUserPlus, FaFlaskVial, FaTriangleExclamation,
  FaLightbulb, FaLeaf, FaArrowTrendUp, FaArrowTrendDown, FaCircleInfo, FaUsers,
  FaTrophy, FaClock, FaBullseye, FaCommentDots, FaHeart, FaDroplet,
} = require("react-icons/fa6");
const fs = require("fs");
const path = require("path");

const metrics = JSON.parse(fs.readFileSync(process.argv[2] || "weekly_metrics.json", "utf8"));
const LOGO_PATH = path.join(__dirname, "Kyo_s_Logo.png");

// ---- Palette: Kyos Matcha brand (sampled from the logo; "Green, Gray, White" per brand board) ----
const FOREST = "3C6034";      // brand green, sampled from Kyo_s_Logo.png
const MOSS = "93B37F";        // lighter tint of brand green, for small accents on dark bg
const GOLD = "C99A3A";        // functional accent (warnings/highlights), not a brand color
const INK = "20291F";         // near-black text
const MUTE = "6E7568";        // brand gray (green-tinted, per brand board)
const CARDBG = "F4F7F2";      // very light green-white tint (not beige)
const UP = "3C7A3F";
const DOWN = "A6472B";

const INSIGHT_ICONS = {
  up: FaArrowTrendUp, down: FaArrowTrendDown, warn: FaTriangleExclamation,
  users: FaUsers, info: FaCircleInfo, message: FaCommentDots, heart: FaHeart,
  target: FaBullseye, bulb: FaLightbulb,
};
const INSIGHT_TONE_COLOR = { up: UP, down: DOWN, warn: GOLD, users: FOREST, info: MUTE };

function renderIconSvg(IconComponent, color = "#000000", size = 256) {
  return ReactDOMServer.renderToStaticMarkup(
    React.createElement(IconComponent, { color, size: String(size) })
  );
}
async function iconToBase64Png(IconComponent, color, size = 256) {
  const svg = renderIconSvg(IconComponent, color, size);
  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + pngBuffer.toString("base64");
}

function fmtGBP(n) {
  return "£" + Number(n).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtKg(n) {
  return `${Number(n).toLocaleString("en-GB", { maximumFractionDigits: 1 })} kg`;
}
function fmtDateRange(startISO, endISO) {
  const s = new Date(startISO), e = new Date(endISO);
  const opts = { day: "numeric", month: "long" };
  const sStr = s.toLocaleDateString("en-GB", { day: "numeric", month: s.getMonth() === e.getMonth() ? undefined : "long" });
  const eStr = e.toLocaleDateString("en-GB", opts) + " " + e.getFullYear();
  return `${sStr} – ${eStr}`;
}
function monthAbbrev(monthLabel) {
  // "July 2026" -> "Jul"
  return (monthLabel || "").slice(0, 3);
}

async function build() {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE"; // 13.3 x 7.5
  pres.author = "Kyos Matcha";
  pres.title = `Kyos Matcha B2B Weekly Report — ${metrics.period_start} to ${metrics.period_end}`;

  const [
    gbpIcon, boxIcon, shopIcon, userPlusIcon, flaskIcon, warnIcon, bulbIcon, leafIcon,
    trophyIcon, clockIcon, bullseyeIcon,
  ] = await Promise.all([
    iconToBase64Png(FaSterlingSign, "#FFFFFF", 256),
    iconToBase64Png(FaBoxOpen, "#FFFFFF", 256),
    iconToBase64Png(FaShop, "#FFFFFF", 256),
    iconToBase64Png(FaUserPlus, "#FFFFFF", 256),
    iconToBase64Png(FaFlaskVial, "#FFFFFF", 256),
    iconToBase64Png(FaTriangleExclamation, "#FFFFFF", 256),
    iconToBase64Png(FaLightbulb, "#FFFFFF", 256),
    iconToBase64Png(FaLeaf, "#FFFFFF", 256),
    iconToBase64Png(FaTrophy, "#FFFFFF", 256),
    iconToBase64Png(FaClock, "#FFFFFF", 256),
    iconToBase64Png(FaBullseye, "#FFFFFF", 256),
  ]);

  // ================= SLIDE 1 — TITLE =================
  let s1 = pres.addSlide();
  s1.background = { color: FOREST };

  if (fs.existsSync(LOGO_PATH)) {
    s1.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.7, y: 0.65, w: 2.1, h: 0.66, rectRadius: 0.06, fill: { color: "FFFFFF" },
    });
    s1.addImage({ path: LOGO_PATH, x: 0.85, y: 0.78, w: 1.8, h: 0.483 });
  } else {
    s1.addText("KYOS MATCHA", {
      x: 0.7, y: 0.75, w: 8, h: 0.4, fontSize: 14, bold: true, color: MOSS,
      fontFace: "Calibri", charSpacing: 3, margin: 0,
    });
  }
  s1.addText("B2B Weekly Report", {
    x: 0.7, y: 2.55, w: 11, h: 1.3, fontSize: 44, bold: true, color: "FFFFFF",
    fontFace: "Cambria", margin: 0,
  });
  s1.addText(fmtDateRange(metrics.period_start, metrics.period_end), {
    x: 0.7, y: 3.65, w: 10, h: 0.6, fontSize: 20, color: "D9E4D3",
    fontFace: "Calibri", margin: 0,
  });
  // Small stat teasers so opening the deck already answers "how's this week going"
  // instead of just showing the date range — revenue, kg shipped, and goal status.
  const teaserGoal = metrics.goal;
  const teasers = [
    { label: "REVENUE THIS WEEK", value: fmtGBP(metrics.revenue) },
    { label: "MATCHA SHIPPED", value: (metrics.kg_sold !== undefined ? fmtKg(metrics.kg_sold) : "—") },
    teaserGoal
      ? { label: "MONTHLY KG GOAL", value: teaserGoal.goal_reached ? "✓ Reached" : `${teaserGoal.pct}%` }
      : null,
  ].filter(Boolean);
  const teaserW = 3.4, teaserGap = 0.5;
  teasers.forEach((t, idx) => {
    const tx = 0.7 + idx * (teaserW + teaserGap);
    s1.addText(t.label, {
      x: tx, y: 4.6, w: teaserW, h: 0.3, fontSize: 11, bold: true, color: "9CB08F",
      fontFace: "Calibri", charSpacing: 1, margin: 0,
    });
    s1.addText(t.value, {
      x: tx, y: 4.9, w: teaserW, h: 0.55, fontSize: 26, bold: true, color: "FFFFFF",
      fontFace: "Cambria", margin: 0,
    });
  });

  s1.addText("Wholesale / Café Channel  ·  Prepared from the live Kyos Matcha CRM", {
    x: 0.7, y: 6.6, w: 10, h: 0.4, fontSize: 12, color: "9CB08F",
    fontFace: "Calibri", margin: 0,
  });

  // ================= SLIDE 2 — KPI GRID =================
  let s2 = pres.addSlide();
  s2.background = { color: "FFFFFF" };
  s2.addText("This Week at a Glance", {
    x: 0.6, y: 0.45, w: 10, h: 0.6, fontSize: 30, bold: true, color: INK, fontFace: "Cambria", margin: 0,
  });

  // Outstanding severity: red is reserved for genuinely overdue (30+ day) amounts.
  // Routine unpaid-but-not-yet-due invoices are a normal part of every week, not a
  // problem — so they get a neutral or amber treatment, not a flat red every time.
  const outstandingTotal = metrics.revenue_unpaid + metrics.revenue_overdue;
  const outstandingSeverity = metrics.revenue_overdue > 0
    ? "danger"
    : (metrics.revenue > 0 && outstandingTotal / metrics.revenue > 0.5 ? "caution" : "neutral");
  const outstandingCircleColor = outstandingSeverity === "danger" ? DOWN : outstandingSeverity === "caution" ? GOLD : FOREST;
  const outstandingIcon = outstandingSeverity === "danger" ? warnIcon : clockIcon;
  const outstandingSub = metrics.revenue_overdue > 0
    ? `${fmtGBP(metrics.revenue_overdue)} overdue 30+ days`
    : (outstandingSeverity === "caution" ? "Higher than usual — worth a nudge" : "Normal — nothing overdue");

  // Week-over-week deltas: a standalone number doesn't say whether things are
  // improving. Only applied to the three continuous, trend-worthy metrics
  // (revenue, orders, kg) — count/state metrics like samples or outstanding don't
  // benefit from the same treatment.
  const wow = metrics.wow || {};
  function deltaBadge(pct) {
    if (pct === null || pct === undefined) return null;
    const up = pct >= 0;
    return { text: `${up ? "▲" : "▼"} ${Math.abs(pct)}%`, color: up ? UP : DOWN };
  }

  const cards = [
    { icon: gbpIcon, label: "Revenue invoiced", value: fmtGBP(metrics.revenue), sub: `${fmtGBP(metrics.revenue_paid)} paid · ${fmtGBP(metrics.revenue_unpaid + metrics.revenue_overdue)} outstanding`, delta: deltaBadge(wow.revenue_pct) },
    { icon: boxIcon, label: "Orders", value: String(metrics.orders), sub: `AOV ${fmtGBP(metrics.aov)}`, delta: deltaBadge(wow.orders_pct) },
    { icon: leafIcon, label: "Matcha shipped", value: (metrics.kg_sold !== undefined ? fmtKg(metrics.kg_sold) : "—"), sub: "Invoiced this week", delta: deltaBadge(wow.kg_pct) },
    { icon: flaskIcon, label: "Samples sent", value: (metrics.samples_sent_new_count === null ? String(metrics.total_sample_sent_alltime) : String(metrics.samples_sent_new_count)), sub: metrics.samples_sent_new_count === null ? `${metrics.total_sample_sent_alltime} in pipeline overall` : `${metrics.total_sample_sent_alltime} all-time` },
    { icon: userPlusIcon, label: "New cafés onboarded", value: String(metrics.new_accounts_count), sub: metrics.reactivated_count ? `First order this week · +${metrics.reactivated_count} reactivated` : "First paid order this week" },
    { icon: outstandingIcon, label: "Outstanding invoices", value: fmtGBP(outstandingTotal), sub: outstandingSub, circleColor: outstandingCircleColor },
  ];

  const cols = 3, rows = 2, cardW = 3.85, cardH = 2.55, gapX = 0.35, gapY = 0.35;
  const startX = 0.6, startY = 1.35;

  for (let i = 0; i < cards.length; i++) {
    const col = i % cols, row = Math.floor(i / cols);
    const x = startX + col * (cardW + gapX);
    const y = startY + row * (cardH + gapY);
    const c = cards[i];

    s2.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x, y, w: cardW, h: cardH, rectRadius: 0.08,
      fill: { color: CARDBG },
      shadow: { type: "outer", color: "1B3A22", blur: 8, offset: 2, angle: 90, opacity: 0.10 },
    });
    s2.addShape(pres.shapes.OVAL, {
      x: x + 0.28, y: y + 0.28, w: 0.55, h: 0.55, fill: { color: c.circleColor || FOREST },
    });
    s2.addImage({ data: c.icon, x: x + 0.42, y: y + 0.42, w: 0.27, h: 0.27 });
    if (c.delta) {
      s2.addText(`${c.delta.text} vs last wk`, {
        x: x + cardW - 1.85, y: y + 0.32, w: 1.6, h: 0.3, fontSize: 10, bold: true,
        color: c.delta.color, fontFace: "Calibri", align: "right", margin: 0,
      });
    }
    s2.addText(c.label.toUpperCase(), {
      x: x + 0.28, y: y + 1.0, w: cardW - 0.56, h: 0.35, fontSize: 11, bold: true,
      color: MUTE, fontFace: "Calibri", charSpacing: 1, margin: 0,
    });
    s2.addText(c.value, {
      x: x + 0.28, y: y + 1.3, w: cardW - 0.56, h: 0.75, fontSize: 28, bold: true,
      color: INK, fontFace: "Cambria", margin: 0,
    });
    s2.addText(c.sub, {
      x: x + 0.28, y: y + 2.05, w: cardW - 0.56, h: 0.42, fontSize: 10.5,
      color: MUTE, fontFace: "Calibri", margin: 0,
    });
  }

  // ================= SLIDE 3 — ACTIVE CAFÉS & NEW CAFÉS =================
  let s3 = pres.addSlide();
  s3.background = { color: "FFFFFF" };
  s3.addText("Active Cafés & New Cafés", {
    x: 0.6, y: 0.45, w: 11, h: 0.6, fontSize: 30, bold: true, color: INK, fontFace: "Cambria", margin: 0,
  });

  // Left: active cafés — week + month-to-date (shown every week, not just this one)
  const leftW = 5.2;
  s3.addText("ACTIVE CAFÉS", {
    x: 0.6, y: 1.35, w: leftW, h: 0.35, fontSize: 13, bold: true, color: FOREST, fontFace: "Calibri", charSpacing: 1, margin: 0,
  });
  const activeWeek = metrics.active_accounts_week !== undefined ? metrics.active_accounts_week : metrics.active_accounts;
  const activeMonth = metrics.active_accounts_month;
  s3.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y: 1.8, w: leftW, h: 1.0, rectRadius: 0.06, fill: { color: CARDBG } });
  s3.addText("This week", { x: 0.85, y: 1.95, w: leftW - 1.6, h: 0.35, fontSize: 12, color: MUTE, fontFace: "Calibri", margin: 0 });
  s3.addText(String(activeWeek), { x: 0.85, y: 2.2, w: leftW - 1.6, h: 0.55, fontSize: 26, bold: true, color: INK, fontFace: "Cambria", margin: 0 });
  s3.addShape(pres.shapes.OVAL, { x: leftW - 0.05, y: 2.1, w: 0.5, h: 0.5, fill: { color: FOREST } });
  s3.addImage({ data: shopIcon, x: leftW + 0.08, y: 2.23, w: 0.24, h: 0.24 });

  if (activeMonth !== undefined && activeMonth !== null) {
    s3.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y: 2.95, w: leftW, h: 1.0, rectRadius: 0.06, fill: { color: CARDBG } });
    s3.addText(`This month (${monthAbbrev(metrics.month_label)} MTD)`, { x: 0.85, y: 3.1, w: leftW - 1.6, h: 0.35, fontSize: 12, color: MUTE, fontFace: "Calibri", margin: 0 });
    s3.addText(String(activeMonth), { x: 0.85, y: 3.35, w: leftW - 1.6, h: 0.55, fontSize: 26, bold: true, color: INK, fontFace: "Cambria", margin: 0 });
    s3.addShape(pres.shapes.OVAL, { x: leftW - 0.05, y: 3.25, w: 0.5, h: 0.5, fill: { color: FOREST } });
    s3.addImage({ data: shopIcon, x: leftW + 0.08, y: 3.38, w: 0.24, h: 0.24 });
  }
  s3.addText(`${metrics.total_active_accounts_alltime} active partners all-time`, {
    x: 0.6, y: 4.15, w: leftW, h: 0.35, fontSize: 11, italic: true, color: MUTE, fontFace: "Calibri", margin: 0,
  });

  // Right: new cafés onboarded this week + reactivated cafés (returning partners who'd
  // gone quiet last month and just placed their first invoice again). These are kept
  // as two distinct lists — a reactivated café already had a relationship with us
  // (Added to CRM predates this period), so it should never be labeled "new".
  const rightX = 6.3, rightW = 6.4;
  const newAccts = metrics.new_accounts_onboarded || [];
  const reactivated = metrics.reactivated_onboarded || [];

  function addCafeList(title, list, y, emptyText) {
    s3.addText(title, {
      x: rightX, y, w: rightW, h: 0.32, fontSize: 13, bold: true, color: FOREST, fontFace: "Calibri", charSpacing: 1, margin: 0,
    });
    if (list.length === 0) {
      s3.addText(emptyText, {
        x: rightX, y: y + 0.4, w: rightW, h: 0.35, fontSize: 12, color: MUTE, fontFace: "Calibri", italic: true, margin: 0,
      });
      return y + 0.4 + 0.5;
    }
    const items = list.map((n, idx) => ({
      text: n.replace(/\b\w/g, ch => ch.toUpperCase()),
      options: { bullet: { code: "25CF" }, breakLine: idx < list.length - 1, color: INK },
    }));
    const h = Math.min(2.1, 0.42 * list.length + 0.15);
    s3.addText(items, { x: rightX, y: y + 0.4, w: rightW, h, fontSize: 14.5, fontFace: "Calibri", paraSpaceAfter: 7 });
    return y + 0.4 + h + 0.25;
  }

  let ry = addCafeList("NEW CAFÉS ONBOARDED THIS WEEK", newAccts, 1.35, "No new cafés placed their first-ever order this week.");
  addCafeList("REACTIVATED THIS WEEK — WELCOME BACK", reactivated, ry + 0.15, "No returning cafés this week.");

  // ================= SLIDE 4 — HIGHLIGHTS (top cafés this month, outstanding, focus) =================
  let s4 = pres.addSlide();
  s4.background = { color: "FFFFFF" };
  s4.addText("Highlights", {
    x: 0.6, y: 0.45, w: 10, h: 0.6, fontSize: 30, bold: true, color: INK, fontFace: "Cambria", margin: 0,
  });

  s4.addText("TOP CAFÉS THIS MONTH", {
    x: 0.6, y: 1.35, w: 12.1, h: 0.35, fontSize: 13, bold: true, color: FOREST, fontFace: "Calibri", charSpacing: 1, margin: 0,
  });
  const topMonth = metrics.top_partners_this_month || [];
  const tableRows = [
    [
      { text: "Café", options: { bold: true, color: "FFFFFF", fill: { color: FOREST } } },
      { text: "Orders", options: { bold: true, color: "FFFFFF", fill: { color: FOREST }, align: "center" } },
      { text: "Revenue", options: { bold: true, color: "FFFFFF", fill: { color: FOREST }, align: "right" } },
    ],
    ...topMonth.map(row => [
      { text: row.name, options: { color: INK } },
      { text: String(row.orders), options: { color: INK, align: "center" } },
      { text: fmtGBP(row.revenue), options: { color: INK, align: "right" } },
    ]),
  ];
  s4.addTable(tableRows, {
    x: 0.6, y: 1.85, w: 12.1, colW: [7.7, 2.2, 2.2],
    fontSize: 13, fontFace: "Calibri", border: { pt: 0.75, color: "E1E8DD" },
    autoPage: false, valign: "middle", rowH: 0.38,
  });

  // Bottom boxes sit right below the table instead of at a fixed low position —
  // a short table (the usual case, top 5) was leaving 1.4in+ of dead space above
  // a fixed y=5.55. Never push them ABOVE that original position though, in case
  // a future version of the table grows taller.
  const tableEndY = 1.85 + tableRows.length * 0.38;
  const boxY = Math.min(5.55, tableEndY + 0.55);

  // Bottom left: outstanding invoices — same severity logic as the KPI card. Most
  // weeks this is routine (recent invoices not yet due), so it defaults to a neutral
  // card, not a red warning; red is reserved for a genuine 30+ day overdue amount.
  const halfW = 5.85;
  if (outstandingTotal > 0) {
    const boxBg = outstandingSeverity === "danger" ? "FBF1EC" : outstandingSeverity === "caution" ? "FBF3E3" : CARDBG;
    const boxTitleColor = outstandingSeverity === "danger" ? "8A3A20" : outstandingSeverity === "caution" ? "7A5A12" : FOREST;
    const boxBodyColor = outstandingSeverity === "danger" ? "6B4230" : outstandingSeverity === "caution" ? "6B5527" : MUTE;
    const boxTitle = outstandingSeverity === "danger" ? `${fmtGBP(outstandingTotal)} overdue` : `${fmtGBP(outstandingTotal)} outstanding`;
    const boxBody = outstandingSeverity === "danger"
      ? `${fmtGBP(metrics.revenue_unpaid)} unpaid + ${fmtGBP(metrics.revenue_overdue)} overdue across this week's invoices — worth a follow-up now.`
      : outstandingSeverity === "caution"
        ? `A larger share of this week's revenue than usual is still unpaid. Nothing's overdue yet — worth a light nudge before it ages.`
        : `Recent invoices not yet due — normal for this point in the week, nothing overdue.`;
    s4.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.6, y: boxY, w: halfW, h: 1.4, rectRadius: 0.06,
      fill: { color: boxBg },
    });
    s4.addShape(pres.shapes.OVAL, { x: 0.85, y: boxY + 0.2, w: 0.5, h: 0.5, fill: { color: outstandingCircleColor } });
    s4.addImage({ data: outstandingIcon, x: 0.97, y: boxY + 0.32, w: 0.26, h: 0.26 });
    s4.addText([
      { text: boxTitle, options: { bold: true, fontSize: 15, color: boxTitleColor, breakLine: true } },
      { text: boxBody, options: { fontSize: 12, color: boxBodyColor } },
    ], { x: 1.55, y: boxY + 0.13, w: halfW - 0.95, h: 1.05, fontFace: "Calibri", margin: 0 });
  }

  // Bottom right: recommended focus — data-driven, one-line nudge. Must count
  // reactivations as first orders too, not just brand-new accounts — otherwise a
  // week with 2 reactivated cafés and 0 new ones wrongly says "no first orders".
  const samplesCount = metrics.samples_sent_new_count;
  const firstOrderCafes = (metrics.new_accounts_count || 0) + (metrics.reactivated_count || 0);
  let focusText;
  if (samplesCount && samplesCount > 5) {
    focusText = `${samplesCount} samples went out this week. Follow up on the batch from ~2-3 weeks ago now — that's the window most cafés convert to a first order.`;
  } else if (firstOrderCafes > 0) {
    const parts = [];
    if (metrics.new_accounts_count > 0) parts.push(`${metrics.new_accounts_count} new café${metrics.new_accounts_count > 1 ? "s" : ""}`);
    if (metrics.reactivated_count > 0) parts.push(`${metrics.reactivated_count} reactivated café${metrics.reactivated_count > 1 ? "s" : ""}`);
    focusText = `${parts.join(" and ")} placed a first order this week — a good moment for a quick check-in call to lock in reorder habits early.`;
  } else {
    focusText = `No first orders this week. Worth reviewing which recently-sampled cafés haven't been followed up on.`;
  }
  s4.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.6 + halfW + 0.4, y: boxY, w: halfW, h: 1.4, rectRadius: 0.06,
    fill: { color: CARDBG },
  });
  s4.addShape(pres.shapes.OVAL, { x: 0.85 + halfW + 0.4, y: boxY + 0.2, w: 0.5, h: 0.5, fill: { color: FOREST } });
  s4.addImage({ data: bulbIcon, x: 0.97 + halfW + 0.4, y: boxY + 0.32, w: 0.26, h: 0.26 });
  s4.addText([
    { text: "This week's focus", options: { bold: true, fontSize: 15, color: FOREST, breakLine: true } },
    { text: focusText, options: { fontSize: 12, color: MUTE } },
  ], { x: 1.55 + halfW + 0.4, y: boxY + 0.13, w: halfW - 0.95, h: 1.05, fontFace: "Calibri", margin: 0 });

  // ================= SLIDE 5 — MONTHLY KG GOAL =================
  if (metrics.goal) {
    const g = metrics.goal;
    const target = g.target_kg;
    const mtd = g.mtd_kg;
    const reached = g.goal_reached !== undefined ? g.goal_reached : mtd >= target;

    let s5 = pres.addSlide();
    s5.background = { color: "FFFFFF" };
    s5.addText(`Monthly Kg Goal — ${g.month_label}`, {
      x: 0.6, y: 0.45, w: reached ? 8.4 : 12, h: 0.6, fontSize: 30, bold: true, color: INK, fontFace: "Cambria", margin: 0,
    });
    // Reaching the floor mid-month is the whole point of an achievable target — call
    // it out plainly instead of just letting the % tick past 100 quietly.
    if (reached) {
      s5.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 9.15, y: 0.58, w: 3.55, h: 0.45, rectRadius: 0.22, fill: { color: "E7F0E3" } });
      s5.addText("✓ GOAL REACHED — PUSHING FOR MORE", {
        x: 9.15, y: 0.58, w: 3.55, h: 0.45, fontSize: 10.5, bold: true, color: UP,
        fontFace: "Calibri", align: "center", valign: "middle", margin: 0,
      });
    }

    // Progress bar — scaled to the floor target, with a single marker line at the
    // target position. No stretch goal — Rome removed that concept entirely.
    const pbX = 0.6, pbY = 1.45, pbW = 12.1, pbH = 0.4;
    const scaleMax = Math.max(mtd, target) * 1.08;
    const mainFrac = Math.min(mtd, target) / scaleMax;
    const bonusFrac = mtd > target ? (Math.min(mtd, scaleMax) - target) / scaleMax : 0;
    const targetFrac = target / scaleMax;

    s5.addText([
      { text: `${fmtKg(mtd)} shipped`, options: { bold: true, fontSize: 13, color: INK } },
      { text: reached
          ? `  ·  ${fmtKg(mtd - target)} past the ${fmtKg(target)} target`
          : `  ·  of ${fmtKg(target)} target`,
        options: { fontSize: 13, color: MUTE } },
    ], { x: pbX, y: pbY - 0.4, w: 10, h: 0.3, fontFace: "Calibri", margin: 0 });
    s5.addText(reached ? "✓ MET" : `${g.pct}%`, {
      x: pbX + pbW - 1.5, y: pbY - 0.42, w: 1.5, h: 0.32, fontSize: 14, bold: true,
      color: reached ? UP : INK, fontFace: "Calibri", align: "right", margin: 0,
    });

    s5.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: pbX, y: pbY, w: pbW, h: pbH, rectRadius: 0.06, fill: { color: "E7EDE3" } });
    s5.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: pbX, y: pbY, w: Math.max(0.3, pbW * mainFrac), h: pbH, rectRadius: 0.06, fill: { color: FOREST } });
    if (bonusFrac > 0) {
      s5.addShape(pres.shapes.RECTANGLE, { x: pbX + pbW * mainFrac, y: pbY, w: pbW * bonusFrac, h: pbH, fill: { color: GOLD } });
    }
    function addBarMarker(frac, label, color) {
      const mx = pbX + pbW * Math.min(1, frac);
      s5.addShape(pres.shapes.RECTANGLE, { x: mx - 0.01, y: pbY - 0.07, w: 0.02, h: pbH + 0.14, fill: { color } });
      s5.addText(label, {
        x: mx - 0.75, y: pbY + pbH + 0.06, w: 1.5, h: 0.24, fontSize: 8.5, color,
        fontFace: "Calibri", align: "center", margin: 0,
      });
    }
    addBarMarker(targetFrac, `Target ${fmtKg(target)}`, MUTE);

    let lineY = pbY + pbH + 0.4;

    // Anchor line: what the target is actually built from — either last month's real
    // total or last month's own target (see g.prior_month_basis) + the growth increment.
    // The ladder is a fixed staircase set by Ellis/Rome (July 208kg, +58kg/month) — it
    // does not get rebased down just because a month missed its own target.
    if (g.prior_month_kg !== undefined && g.prior_month_kg !== null) {
      const priorLabel = g.prior_month_label ? monthAbbrev(g.prior_month_label) : "last month";
      const basisWord = g.prior_month_basis === "target" ? "target" : "actual";
      s5.addText(
        `${priorLabel} ${basisWord}: ${fmtKg(g.prior_month_kg)}  →  +${g.increment_kg || 58} kg growth target = ${fmtKg(target)}` +
        (reached ? `   ·   ✓ floor reached` : ""),
        { x: pbX, y: lineY, w: pbW, h: 0.3, fontSize: 11.5, color: MUTE, fontFace: "Calibri", margin: 0 }
      );
      lineY += 0.35;
    }

    // A dedicated "don't stop here" banner whenever the floor is already secured —
    // separate from goal.note so this message always shows regardless of what the
    // authored note says, per Rome: reaching goal shouldn't read as "done for the month."
    // No stretch-goal number here — the floor is the only target now.
    if (reached) {
      s5.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: pbX, y: lineY, w: pbW, h: 0.55, rectRadius: 0.06, fill: { color: "FBF3E3" } });
      s5.addText([
        { text: "Goal reached — ", options: { bold: true, fontSize: 12.5, color: "7A5A12" } },
        { text: "don't stop here. Worth keeping the pace going rather than easing off for the rest of the month.",
          options: { fontSize: 12.5, color: "7A5A12" } },
      ], { x: pbX + 0.2, y: lineY + 0.1, w: pbW - 0.4, h: 0.4, fontFace: "Calibri", margin: 0 });
      lineY += 0.65;
    }

    if (g.note) {
      s5.addText(g.note, {
        x: pbX, y: lineY, w: pbW, h: 0.6, fontSize: 12.5, color: MUTE, fontFace: "Calibri", margin: 0,
      });
      lineY += 0.6;
    }

    // Growth trajectory: no chart — a row of chips showing REAL actuals for past
    // months (so the +58kg/month climb is visible as a track record, not just a
    // future target table), "so far" for the current month, and target-only for
    // months still ahead. Beaten targets get a light green tint so it's clear the
    // 58kg number is a floor, not a ceiling.
    s5.addText("MONTHLY KG GROWTH TRAJECTORY", {
      x: pbX, y: lineY, w: pbW, h: 0.3, fontSize: 12, bold: true, color: FOREST, fontFace: "Calibri", charSpacing: 1, margin: 0,
    });
    const ladder = metrics.target_ladder || [];
    const chipGap = 0.12, chipY = lineY + 0.4, chipH = 1.05;
    // Chip width scales to fit however many months are in the ladder (past actuals +
    // current + future targets) so a longer growth-trajectory history never overflows
    // the slide width, capped at 1.65in so a short ladder doesn't look stretched.
    const chipW = ladder.length ? Math.min(1.65, (pbW - (ladder.length - 1) * chipGap) / ladder.length) : 1.65;
    ladder.forEach((t, idx) => {
      const cx = pbX + idx * (chipW + chipGap);
      const isCurrent = t.month === metrics.goal.month_label;
      const target = isCurrent ? metrics.goal.target_kg : t.target_kg;
      const hasActual = t.actual_kg !== undefined && t.actual_kg !== null;
      // A month can beat its target WHILE still in progress (goal reached mid-month) —
      // don't require the month to be closed out to earn the "beat" tint/caption.
      const beatTarget = hasActual && t.actual_kg >= target;
      const fill = isCurrent ? FOREST : (beatTarget ? "E7F0E3" : CARDBG);
      const headerColor = isCurrent ? "D9E4D3" : (beatTarget ? UP : MUTE);
      const mainColor = isCurrent ? "FFFFFF" : INK;
      const mainValue = hasActual ? t.actual_kg : target;
      const captionColor = isCurrent ? "D9E4D3" : (beatTarget ? UP : MUTE);
      let caption;
      if (t.in_progress) caption = beatTarget ? `+${fmtKg(t.actual_kg - target)} past tgt` : `of ${fmtKg(target)} target`;
      else if (hasActual) caption = beatTarget ? `beat ${fmtKg(target)} tgt` : `target ${fmtKg(target)}`;
      else caption = "target";
      const headerLabel = monthAbbrev(t.month) + (t.in_progress ? (beatTarget ? " ·beat!" : " ·so far") : "");

      s5.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: cx, y: chipY, w: chipW, h: chipH, rectRadius: 0.06, fill: { color: fill },
      });
      s5.addText(headerLabel, {
        x: cx, y: chipY + 0.08, w: chipW, h: 0.28, fontSize: 10, color: headerColor,
        fontFace: "Calibri", align: "center", margin: 0,
      });
      s5.addText(fmtKg(mainValue), {
        x: cx, y: chipY + 0.34, w: chipW, h: 0.33, fontSize: 13, bold: true, color: mainColor,
        fontFace: "Calibri", align: "center", margin: 0,
      });
      s5.addText(caption, {
        x: cx, y: chipY + 0.68, w: chipW, h: 0.3, fontSize: 9, color: captionColor,
        fontFace: "Calibri", align: "center", margin: 0,
      });
      // Small gold checkmark badge on the current month's chip once it's beaten its
      // own target — visually distinct from the "current month, still active" green.
      if (isCurrent && beatTarget) {
        s5.addShape(pres.shapes.OVAL, { x: cx + chipW - 0.3, y: chipY - 0.12, w: 0.34, h: 0.34, fill: { color: GOLD } });
        s5.addText("✓", {
          x: cx + chipW - 0.3, y: chipY - 0.13, w: 0.34, h: 0.34, fontSize: 13, bold: true, color: "FFFFFF",
          fontFace: "Calibri", align: "center", valign: "middle", margin: 0,
        });
      }
    });

    // Vision: one sentence projecting the trajectory to the ladder's final month —
    // replaces the old 8-week bar chart with a forward-looking growth story instead.
    if (metrics.vision_summary) {
      const visionY = chipY + chipH + 0.3;
      s5.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: pbX, y: visionY, w: pbW, h: 0.85, rectRadius: 0.06, fill: { color: CARDBG },
      });
      s5.addShape(pres.shapes.OVAL, { x: pbX + 0.25, y: visionY + 0.18, w: 0.5, h: 0.5, fill: { color: FOREST } });
      s5.addImage({ data: bullseyeIcon, x: pbX + 0.37, y: visionY + 0.3, w: 0.26, h: 0.26 });
      s5.addText([
        { text: "Vision for the year", options: { bold: true, fontSize: 13, color: FOREST, breakLine: true } },
        { text: metrics.vision_summary, options: { fontSize: 12, color: INK } },
      ], { x: pbX + 0.95, y: visionY + 0.13, w: pbW - 1.3, h: 0.6, fontFace: "Calibri", margin: 0 });
    }
  }

  // ================= SLIDE 6 — CAFÉS NEEDING FOLLOW-UP (21+ DAYS) =================
  const atRisk = metrics.at_risk || [];
  if (atRisk.length) {
    let s6 = pres.addSlide();
    s6.background = { color: "FFFFFF" };
    s6.addText("No Order in 21+ Days", {
      x: 0.6, y: 0.45, w: 11, h: 0.6, fontSize: 30, bold: true, color: INK, fontFace: "Cambria", margin: 0,
    });
    s6.addText("Follow-up candidates — not a churn verdict, just a nudge to reach out.", {
      x: 0.6, y: 1.05, w: 11, h: 0.4, fontSize: 13, italic: true, color: MUTE, fontFace: "Calibri", margin: 0,
    });

    const riskRows = [
      [
        { text: "Café", options: { bold: true, color: "FFFFFF", fill: { color: FOREST } } },
        { text: "Last order", options: { bold: true, color: "FFFFFF", fill: { color: FOREST }, align: "center" } },
        { text: "Days since", options: { bold: true, color: "FFFFFF", fill: { color: FOREST }, align: "right" } },
      ],
      ...atRisk.map(r => [
        { text: r.name, options: { color: INK } },
        { text: r.last_order_date || "—", options: { color: MUTE, align: "center" } },
        { text: `${r.days} days`, options: { color: r.days >= 35 ? "A6472B" : "8A6A1E", bold: true, align: "right" } },
      ]),
    ];
    s6.addTable(riskRows, {
      x: 0.6, y: 1.65, w: 12.1, colW: [7.3, 2.9, 1.9],
      fontSize: 13.5, fontFace: "Calibri", border: { pt: 0.75, color: "E1E8DD" },
      autoPage: false, valign: "middle", rowH: 0.42,
    });

    // A short list on its own reads as "here's a small problem" without the context
    // of how big the healthy majority is. This ratio card sits right below the
    // table (using its actual height, not a fixed offset) instead of leaving the
    // rest of the slide blank.
    if (metrics.active_accounts_month !== undefined && metrics.active_accounts_month !== null) {
      const healthy = Math.max(0, metrics.active_accounts_month - atRisk.length);
      const healthyPct = metrics.active_accounts_month > 0 ? Math.round((healthy / metrics.active_accounts_month) * 100) : null;
      const ratioY = 1.65 + (riskRows.length * 0.42) + 0.5;
      s6.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: 0.6, y: ratioY, w: 12.1, h: 0.85, rectRadius: 0.06, fill: { color: CARDBG },
      });
      s6.addShape(pres.shapes.OVAL, { x: 0.85, y: ratioY + 0.18, w: 0.5, h: 0.5, fill: { color: FOREST } });
      s6.addImage({ data: shopIcon, x: 0.97, y: ratioY + 0.3, w: 0.26, h: 0.26 });
      s6.addText([
        { text: `${healthy} of ${metrics.active_accounts_month} active partners this month`, options: { bold: true, fontSize: 13, color: INK, breakLine: true } },
        { text: `${healthyPct !== null ? `${healthyPct}%` : "Most"} have ordered within the last 21 days — this list is the exception, not the norm.`, options: { fontSize: 12, color: MUTE } },
      ], { x: 1.55, y: ratioY + 0.13, w: 10.9, h: 0.6, fontFace: "Calibri", margin: 0 });
    }
  }

  // ================= SLIDE 7+ — INSIGHTS & HOW TO IMPROVE (optional) =================
  // Cards need a minimum height to fit 2 lines of body text without overlapping —
  // cap at 5 per slide and overflow onto additional slides rather than silently
  // shrinking cards until text collides (that happened at 7 on one slide).
  if (metrics.insights && metrics.insights.length) {
    const iconCache = {};
    async function getInsightIcon(tone, iconName) {
      const key = iconName || tone;
      if (!iconCache[key]) {
        const Comp = INSIGHT_ICONS[iconName] || INSIGHT_ICONS[tone] || INSIGHT_ICONS.info;
        iconCache[key] = await iconToBase64Png(Comp, "#FFFFFF", 256);
      }
      return iconCache[key];
    }
    const MAX_PER_SLIDE = 5;
    const chunks = [];
    for (let i = 0; i < metrics.insights.length; i += MAX_PER_SLIDE) {
      chunks.push(metrics.insights.slice(i, i + MAX_PER_SLIDE));
    }
    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      let s7 = pres.addSlide();
      s7.background = { color: "FFFFFF" };
      s7.addText(`Insights & How to Improve${ci > 0 ? " (cont.)" : ""}`, {
        x: 0.6, y: 0.45, w: 11, h: 0.6, fontSize: 30, bold: true, color: INK, fontFace: "Cambria", margin: 0,
      });
      if (ci === 0 && metrics.insights_intro) {
        s7.addText(metrics.insights_intro, {
          x: 0.6, y: 1.05, w: 12, h: 0.4, fontSize: 12.5, italic: true, color: MUTE, fontFace: "Calibri", margin: 0,
        });
      }
      let iy = 1.55;
      const gap = Math.min(1.35, 5.6 / chunk.length);
      for (const row of chunk) {
        const icon = await getInsightIcon(row.tone, row.icon);
        s7.addShape(pres.shapes.ROUNDED_RECTANGLE, {
          x: 0.6, y: iy, w: 12.1, h: gap - 0.2, rectRadius: 0.06, fill: { color: CARDBG },
        });
        s7.addShape(pres.shapes.OVAL, { x: 0.85, y: iy + 0.2, w: 0.46, h: 0.46, fill: { color: INSIGHT_TONE_COLOR[row.tone] || MUTE } });
        s7.addImage({ data: icon, x: 0.97, y: iy + 0.32, w: 0.22, h: 0.22 });
        s7.addText(row.title, {
          x: 1.55, y: iy + 0.12, w: 11.0, h: 0.35, fontSize: 14.5, bold: true, color: INK, fontFace: "Calibri", margin: 0,
        });
        s7.addText(row.body, {
          x: 1.55, y: iy + 0.48, w: 11.0, h: gap - 0.65, fontSize: 11.5, color: MUTE, fontFace: "Calibri", margin: 0,
        });
        iy += gap;
      }
    }
  }

  // ================= SLIDE 8 — MATCHA INVENTORY (optional) =================
  if (metrics.inventory && metrics.inventory.length) {
    let s8 = pres.addSlide();
    s8.background = { color: "FFFFFF" };
    s8.addText("Matcha Inventory", {
      x: 0.6, y: 0.45, w: 11, h: 0.6, fontSize: 30, bold: true, color: INK, fontFace: "Cambria", margin: 0,
    });
    s8.addText("Manually updated — treat as a snapshot, not a live figure.", {
      x: 0.6, y: 1.05, w: 11, h: 0.4, fontSize: 13, italic: true, color: MUTE, fontFace: "Calibri", margin: 0,
    });
    const invW = 5.85;
    metrics.inventory.forEach((item, idx) => {
      const x = 0.6 + idx * (invW + 0.4);
      const low = item.status === "low";
      // Low items get a taller card — the pace-aware restock note + days-of-stock
      // estimate need more room than a plain "In stock" line.
      const cardH = low ? 2.15 : 1.6;
      s8.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x, y: 1.65, w: invW, h: cardH, rectRadius: 0.08, fill: { color: low ? "FBF1EC" : CARDBG },
      });
      s8.addText(item.name, { x: x + 0.3, y: 1.85, w: invW - 0.6, h: 0.35, fontSize: 13, color: low ? "8A3A20" : MUTE, fontFace: "Calibri", margin: 0 });
      s8.addText(fmtKg(item.kg), { x: x + 0.3, y: 2.15, w: invW - 0.6, h: 0.6, fontSize: 28, bold: true, color: INK, fontFace: "Cambria", margin: 0 });
      // If shipments are running ahead of the monthly goal pace, a low-stock item
      // will draw down faster than usual — worth saying explicitly, not just "Low".
      // NOTE: deliberately NOT estimating "days of stock left" here. The only pace
      // figure available is the OVERALL daily shipping rate across all matcha grades
      // combined — dividing one low-stock grade's remaining kg by that combined rate
      // systematically understates its runway (a tried version of this showed "~0
      // days left" on a item that wasn't actually about to run out), which is worse
      // than no number at all. Would need grade-level shipment data to do this right.
      const paceIsHot = metrics.goal && metrics.goal.goal_reached;
      s8.addText(
        low
          ? `Low — threshold ${fmtKg(item.threshold)}.${paceIsHot ? " Shipments are ahead of pace this month — worth restocking sooner rather than later." : ""}`
          : "In stock",
        { x: x + 0.3, y: 2.75, w: invW - 0.6, h: 0.95, fontSize: 11, color: low ? "8A3A20" : UP, fontFace: "Calibri", margin: 0 }
      );
    });
  }

  await pres.writeFile({ fileName: process.argv[3] || "Kyos_B2B_Weekly_Report.pptx" });
  console.log("done");
}

build().catch(e => { console.error(e); process.exit(1); });
