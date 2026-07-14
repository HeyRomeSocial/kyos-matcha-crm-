const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const { FaSterlingSign, FaBoxOpen, FaShop, FaUserPlus, FaFlaskVial, FaTriangleExclamation, FaLightbulb, FaLeaf } = require("react-icons/fa6");
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

function fmtDateRange(startISO, endISO) {
  const s = new Date(startISO), e = new Date(endISO);
  const opts = { day: "numeric", month: "long" };
  const sStr = s.toLocaleDateString("en-GB", { day: "numeric", month: s.getMonth() === e.getMonth() ? undefined : "long" });
  const eStr = e.toLocaleDateString("en-GB", opts) + " " + e.getFullYear();
  return `${sStr} – ${eStr}`;
}

async function build() {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE"; // 13.3 x 7.5
  pres.author = "Kyos Matcha";
  pres.title = `Kyos Matcha B2B Weekly Snapshot — ${metrics.period_start} to ${metrics.period_end}`;

  const [gbpIcon, boxIcon, shopIcon, userPlusIcon, flaskIcon, warnIcon, bulbIcon, leafIcon] = await Promise.all([
    iconToBase64Png(FaSterlingSign, "#FFFFFF", 256),
    iconToBase64Png(FaBoxOpen, "#FFFFFF", 256),
    iconToBase64Png(FaShop, "#FFFFFF", 256),
    iconToBase64Png(FaUserPlus, "#FFFFFF", 256),
    iconToBase64Png(FaFlaskVial, "#FFFFFF", 256),
    iconToBase64Png(FaTriangleExclamation, "#B5442B", 256),
    iconToBase64Png(FaLightbulb, "#FFFFFF", 256),
    iconToBase64Png(FaLeaf, "#FFFFFF", 256),
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
  s1.addText("B2B Weekly Snapshot", {
    x: 0.7, y: 2.55, w: 11, h: 1.3, fontSize: 44, bold: true, color: "FFFFFF",
    fontFace: "Cambria", margin: 0,
  });
  s1.addText(fmtDateRange(metrics.period_start, metrics.period_end), {
    x: 0.7, y: 3.65, w: 10, h: 0.6, fontSize: 20, color: "D9E4D3",
    fontFace: "Calibri", margin: 0,
  });
  s1.addText("Wholesale / Café Channel  ·  Prepared from the Partner Hub CRM", {
    x: 0.7, y: 6.6, w: 10, h: 0.4, fontSize: 12, color: "9CB08F",
    fontFace: "Calibri", margin: 0,
  });

  // ================= SLIDE 2 — KPI GRID =================
  let s2 = pres.addSlide();
  s2.background = { color: "FFFFFF" };
  s2.addText("This Week at a Glance", {
    x: 0.6, y: 0.45, w: 10, h: 0.6, fontSize: 30, bold: true, color: INK, fontFace: "Cambria", margin: 0,
  });

  const cards = [
    { icon: gbpIcon, label: "Revenue invoiced", value: fmtGBP(metrics.revenue), sub: `${fmtGBP(metrics.revenue_paid)} paid · ${fmtGBP(metrics.revenue_unpaid + metrics.revenue_overdue)} outstanding` },
    { icon: boxIcon, label: "Orders", value: String(metrics.orders), sub: `AOV ${fmtGBP(metrics.aov)}` },
    { icon: leafIcon, label: "Matcha shipped", value: (metrics.kg_sold !== undefined ? `${metrics.kg_sold} kg` : "—"), sub: "Invoiced this week" },
    { icon: shopIcon, label: "Active cafés", value: String(metrics.active_accounts), sub: `${metrics.total_active_accounts_alltime} active partners overall` },
    { icon: userPlusIcon, label: "New cafés onboarded", value: String(metrics.new_accounts_count), sub: "First paid order this week" },
    { icon: flaskIcon, label: "Samples sent", value: (metrics.samples_sent_new_count === null ? String(metrics.total_sample_sent_alltime) : String(metrics.samples_sent_new_count)), sub: metrics.samples_sent_new_count === null ? `${metrics.total_sample_sent_alltime} in pipeline overall` : "New this week" },
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
      x: x + 0.28, y: y + 0.28, w: 0.55, h: 0.55, fill: { color: FOREST },
    });
    s2.addImage({ data: c.icon, x: x + 0.42, y: y + 0.42, w: 0.27, h: 0.27 });
    s2.addText(c.label.toUpperCase(), {
      x: x + 0.28, y: y + 1.0, w: cardW - 0.56, h: 0.35, fontSize: 11, bold: true,
      color: MUTE, fontFace: "Calibri", charSpacing: 1, margin: 0,
    });
    s2.addText(c.value, {
      x: x + 0.28, y: y + 1.3, w: cardW - 0.56, h: 0.75, fontSize: 30, bold: true,
      color: INK, fontFace: "Cambria", margin: 0,
    });
    s2.addText(c.sub, {
      x: x + 0.28, y: y + 2.05, w: cardW - 0.56, h: 0.42, fontSize: 10.5,
      color: MUTE, fontFace: "Calibri", margin: 0,
    });
  }

  // ================= SLIDE 3 — HIGHLIGHTS =================
  let s3 = pres.addSlide();
  s3.background = { color: "FFFFFF" };
  s3.addText("Highlights", {
    x: 0.6, y: 0.45, w: 10, h: 0.6, fontSize: 30, bold: true, color: INK, fontFace: "Cambria", margin: 0,
  });

  // Left: new cafes onboarded
  s3.addText("NEW CAFÉS ONBOARDED", {
    x: 0.6, y: 1.35, w: 5.6, h: 0.35, fontSize: 13, bold: true, color: FOREST, fontFace: "Calibri", charSpacing: 1, margin: 0,
  });
  const newAccts = metrics.new_accounts_onboarded || [];
  if (newAccts.length === 0) {
    s3.addText("No new cafés placed their first order this week.", {
      x: 0.6, y: 1.85, w: 5.6, h: 0.5, fontSize: 13, color: MUTE, fontFace: "Calibri", italic: true, margin: 0,
    });
  } else {
    const items = newAccts.map((n, idx) => ({
      text: n.replace(/\b\w/g, ch => ch.toUpperCase()),
      options: { bullet: { code: "25CF" }, breakLine: idx < newAccts.length - 1, color: INK },
    }));
    s3.addText(items, { x: 0.6, y: 1.85, w: 5.6, h: 2.0, fontSize: 15, fontFace: "Calibri", paraSpaceAfter: 8 });
  }

  // Right: top partners by revenue this week
  s3.addText("TOP CAFÉS BY REVENUE THIS WEEK", {
    x: 6.7, y: 1.35, w: 6.0, h: 0.35, fontSize: 13, bold: true, color: FOREST, fontFace: "Calibri", charSpacing: 1, margin: 0,
  });
  const top = metrics.top_partners_by_revenue || [];
  const tableRows = [
    [
      { text: "Café", options: { bold: true, color: "FFFFFF", fill: { color: FOREST } } },
      { text: "Revenue", options: { bold: true, color: "FFFFFF", fill: { color: FOREST }, align: "right" } },
    ],
    ...top.map(([name, amt]) => [
      { text: name, options: { color: INK } },
      { text: fmtGBP(amt), options: { color: INK, align: "right" } },
    ]),
  ];
  s3.addTable(tableRows, {
    x: 6.7, y: 1.85, w: 6.0, colW: [4.0, 2.0],
    fontSize: 13, fontFace: "Calibri", border: { pt: 0.75, color: "E1E8DD" },
    autoPage: false, valign: "middle", rowH: 0.4,
  });

  // Bottom left: outstanding invoices flag
  const outstanding = metrics.revenue_unpaid + metrics.revenue_overdue;
  const halfW = 5.85;
  if (outstanding > 0) {
    s3.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.6, y: 5.2, w: halfW, h: 1.55, rectRadius: 0.06,
      fill: { color: "FBF1EC" },
    });
    s3.addImage({ data: warnIcon, x: 0.9, y: 5.5, w: 0.4, h: 0.4 });
    s3.addText([
      { text: `${fmtGBP(outstanding)} outstanding`, options: { bold: true, fontSize: 15, color: "8A3A20", breakLine: true } },
      { text: `${fmtGBP(metrics.revenue_unpaid)} unpaid + ${fmtGBP(metrics.revenue_overdue)} overdue across this week's invoices — worth a quick follow-up.`, options: { fontSize: 12, color: "6B4230" } },
    ], { x: 1.5, y: 5.37, w: halfW - 0.9, h: 1.15, fontFace: "Calibri", margin: 0 });
  }

  // Bottom right: recommended focus — data-driven, one-line nudge
  const samplesCount = metrics.samples_sent_new_count;
  const focusText = samplesCount && samplesCount > 5
    ? `${samplesCount} samples went out this week. Follow up on the batch from ~2-3 weeks ago now — that's the window most cafés convert to a first order.`
    : metrics.new_accounts_count > 0
      ? `${metrics.new_accounts_count} café(s) placed a first order this week — a good moment for a quick check-in call to lock in reorder habits early.`
      : `No first orders this week. Worth reviewing which recently-sampled cafés haven't been followed up on.`;
  s3.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.6 + halfW + 0.4, y: 5.2, w: halfW, h: 1.55, rectRadius: 0.06,
    fill: { color: CARDBG },
  });
  s3.addShape(pres.shapes.OVAL, { x: 0.85 + halfW + 0.4, y: 5.45, w: 0.5, h: 0.5, fill: { color: FOREST } });
  s3.addImage({ data: bulbIcon, x: 0.97 + halfW + 0.4, y: 5.57, w: 0.26, h: 0.26 });
  s3.addText([
    { text: "This week's focus", options: { bold: true, fontSize: 15, color: FOREST, breakLine: true } },
    { text: focusText, options: { fontSize: 12, color: MUTE } },
  ], { x: 1.55 + halfW + 0.4, y: 5.37, w: halfW - 0.95, h: 1.15, fontFace: "Calibri", margin: 0 });

  await pres.writeFile({ fileName: process.argv[3] || "Kyos_B2B_Weekly_Snapshot.pptx" });
  console.log("done");
}

build().catch(e => { console.error(e); process.exit(1); });
