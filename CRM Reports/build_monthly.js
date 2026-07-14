/**
 * Kyos Matcha — B2B Monthly Report deck builder (reusable)
 *
 * Usage:
 *   node build_monthly.js <report_data.json> <output.pptx>
 *
 * report_data.json shape — see monthly_report_data_TEMPLATE.json for a filled example.
 */
const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const { FaArrowTrendUp, FaArrowTrendDown, FaTriangleExclamation, FaMagnifyingGlass, FaUsers, FaCircleInfo, FaLightbulb } = require("react-icons/fa6");
const fs = require("fs");
const path = require("path");

const LOGO_PATH = path.join(__dirname, "Kyo_s_Logo.png");

// ---- Palette: Kyos Matcha brand (sampled from the logo; "Green, Gray, White" per brand board) ----
const FOREST = "3C6034";
const MOSS = "93B37F";
const GOLD = "C99A3A";
const INK = "20291F";
const MUTE = "6E7568";
const CARDBG = "F4F7F2";
const UP = "3C7A3F";
const DOWN = "A6472B";

const ICONS = { up: FaArrowTrendUp, down: FaArrowTrendDown, warn: FaTriangleExclamation, info: FaMagnifyingGlass, users: FaUsers, neutral: FaCircleInfo, idea: FaLightbulb };
const TONE_COLOR = { up: UP, down: DOWN, warn: GOLD, info: FOREST, users: UP, neutral: MUTE, idea: FOREST };

function renderIconSvg(IconComponent, color = "#000000", size = 256) {
  return ReactDOMServer.renderToStaticMarkup(React.createElement(IconComponent, { color, size: String(size) }));
}
async function iconToBase64Png(IconComponent, color, size = 256) {
  const svg = renderIconSvg(IconComponent, color, size);
  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + pngBuffer.toString("base64");
}

async function build() {
  const dataPath = process.argv[2];
  const outPath = process.argv[3] || "Kyos_B2B_Monthly_Report.pptx";
  if (!dataPath) { console.error("Usage: node build_monthly.js <report_data.json> <output.pptx>"); process.exit(1); }
  const D = JSON.parse(fs.readFileSync(dataPath, "utf8"));

  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";
  pres.author = "Kyos Matcha";
  pres.title = `Kyos Matcha B2B Monthly Report — ${D.month_label}`;

  const iconCache = {};
  async function getIcon(tone) {
    if (!iconCache[tone]) iconCache[tone] = await iconToBase64Png(ICONS[tone] || ICONS.neutral, "#FFFFFF", 256);
    return iconCache[tone];
  }

  const headerRow = (cols) => cols.map(t => ({ text: t, options: { bold: true, color: "FFFFFF", fill: { color: FOREST }, fontSize: 12 } }));
  const rowColor = (up) => (up === null || up === undefined ? MUTE : (up ? UP : DOWN));

  // ================= SLIDE 1 — TITLE =================
  let s1 = pres.addSlide();
  s1.background = { color: FOREST };
  if (fs.existsSync(LOGO_PATH)) {
    s1.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.7, y: 0.65, w: 2.1, h: 0.66, rectRadius: 0.06, fill: { color: "FFFFFF" } });
    s1.addImage({ path: LOGO_PATH, x: 0.85, y: 0.78, w: 1.8, h: 0.483 });
  } else {
    s1.addText("KYOS MATCHA", { x: 0.7, y: 0.75, w: 8, h: 0.4, fontSize: 14, bold: true, color: MOSS, fontFace: "Calibri", charSpacing: 3, margin: 0 });
  }
  s1.addText("B2B Monthly Report", { x: 0.7, y: 2.4, w: 11, h: 1.3, fontSize: 44, bold: true, color: "FFFFFF", fontFace: "Cambria", margin: 0 });
  s1.addText(`${D.month_label}  ·  Wholesale / Café Channel`, { x: 0.7, y: 3.5, w: 10, h: 0.55, fontSize: 20, color: "D9E4D3", fontFace: "Calibri", margin: 0 });
  s1.addText(D.subtitle || `Compared against ${D.compare_label}`, { x: 0.7, y: 4.05, w: 10.8, h: 0.5, fontSize: 14, color: "9CB08F", fontFace: "Calibri", italic: true, margin: 0 });
  s1.addText("Prepared from the Partner Hub CRM", { x: 0.7, y: 6.6, w: 10, h: 0.4, fontSize: 12, color: "9CB08F", fontFace: "Calibri", margin: 0 });

  // ================= SLIDE 2 — HEADLINE METRICS =================
  let s2 = pres.addSlide();
  s2.background = { color: "FFFFFF" };
  s2.addText(`Headline Metrics — ${D.compare_label} vs ${D.month_label}`, { x: 0.6, y: 0.45, w: 12, h: 0.6, fontSize: 26, bold: true, color: INK, fontFace: "Cambria", margin: 0 });
  let hRows = [headerRow(["Metric", D.compare_label, D.month_label, "Change", "% Change"])];
  D.headline.forEach(([m, prior, cur, chg, pct, up]) => {
    hRows.push([
      { text: m, options: { bold: true, color: INK, fontSize: 13 } },
      { text: prior, options: { color: MUTE, fontSize: 13, align: "center" } },
      { text: cur, options: { color: INK, fontSize: 14, bold: true, align: "center" } },
      { text: chg, options: { color: rowColor(up), fontSize: 13, align: "center" } },
      { text: pct, options: { color: rowColor(up), fontSize: 13, bold: true, align: "center" } },
    ]);
  });
  s2.addTable(hRows, { x: 0.6, y: 1.3, w: 12.1, colW: [4.1, 2.0, 2.0, 2.0, 2.0], fontFace: "Calibri", border: { pt: 0.75, color: "E1E8DD" }, valign: "middle", rowH: 0.62 });
  if (D.headline_footnote) {
    s2.addText(D.headline_footnote, { x: 0.6, y: 5.15, w: 12.1, h: 0.5, fontSize: 14, italic: true, color: MUTE, fontFace: "Calibri", margin: 0 });
  }

  // ================= SLIDE 3 — DERIVED METRICS =================
  let s3 = pres.addSlide();
  s3.background = { color: "FFFFFF" };
  s3.addText(`Derived Metrics — ${D.compare_label} vs ${D.month_label}`, { x: 0.6, y: 0.45, w: 12, h: 0.6, fontSize: 26, bold: true, color: INK, fontFace: "Cambria", margin: 0 });
  let dRows = [headerRow(["Metric", D.compare_label, D.month_label, "Change", "% Change"])];
  D.derived.forEach(([m, prior, cur, chg, pct, up]) => {
    dRows.push([
      { text: m, options: { bold: true, color: INK, fontSize: 12 } },
      { text: prior, options: { color: MUTE, fontSize: 12, align: "center" } },
      { text: cur, options: { color: INK, fontSize: 13, bold: true, align: "center" } },
      { text: chg, options: { color: rowColor(up), fontSize: 12, align: "center" } },
      { text: pct, options: { color: rowColor(up), fontSize: 12, bold: true, align: "center" } },
    ]);
  });
  const dRowH = Math.min(0.62, 4.1 / D.derived.length);
  s3.addTable(dRows, { x: 0.6, y: 1.25, w: 12.1, colW: [4.6, 1.85, 1.85, 1.9, 1.9], fontFace: "Calibri", border: { pt: 0.75, color: "E1E8DD" }, valign: "middle", rowH: dRowH });
  if (D.derived_footnote) {
    s3.addText(D.derived_footnote, { x: 0.6, y: 1.35 + dRowH * (D.derived.length + 1) + 0.15, w: 12.1, h: 0.5, fontSize: 11, italic: true, color: MUTE, fontFace: "Calibri", margin: 0 });
  }

  // ================= SLIDE 4 — PERFORMANCE STATEMENT =================
  let s4 = pres.addSlide();
  s4.background = { color: CARDBG };
  s4.addText("Performance Statement", { x: 0.6, y: 0.45, w: 11, h: 0.6, fontSize: 28, bold: true, color: INK, fontFace: "Cambria", margin: 0 });
  s4.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y: 1.3, w: 12.1, h: 2.35, rectRadius: 0.06, fill: { color: "FFFFFF" }, shadow: { type: "outer", color: "1B3A22", blur: 8, offset: 2, angle: 90, opacity: 0.08 } });
  s4.addText(D.performance_statement, { x: 0.95, y: 1.55, w: 11.4, h: 1.9, fontSize: 14, color: INK, fontFace: "Calibri", lineSpacingMultiple: 1.22, margin: 0 });
  if (D.net_summary) {
    s4.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y: 3.9, w: 12.1, h: 0.95, rectRadius: 0.06, fill: { color: FOREST } });
    s4.addText([{ text: "Net: ", options: { bold: true, color: "FFFFFF" } }, { text: D.net_summary, options: { color: "E4EDDF" } }],
      { x: 0.95, y: 4.02, w: 11.4, h: 0.7, fontSize: 13.5, fontFace: "Calibri", valign: "middle", margin: 0 });
  }

  // ================= SLIDE 5 — WHAT THE NUMBERS TELL US =================
  let s5 = pres.addSlide();
  s5.background = { color: "FFFFFF" };
  s5.addText("What the Numbers Tell Us", { x: 0.6, y: 0.45, w: 11, h: 0.6, fontSize: 28, bold: true, color: INK, fontFace: "Cambria", margin: 0 });
  const rows = D.insights.length;
  let iy = 1.2;
  const gap = Math.min(1.08, 5.5 / rows);
  for (const row of D.insights) {
    const icon = await getIcon(row.tone);
    s5.addShape(pres.shapes.OVAL, { x: 0.6, y: iy, w: 0.5, h: 0.5, fill: { color: TONE_COLOR[row.tone] || MUTE } });
    s5.addImage({ data: icon, x: 0.72, y: iy + 0.12, w: 0.26, h: 0.26 });
    s5.addText(row.title, { x: 1.35, y: iy - 0.03, w: 11.2, h: 0.35, fontSize: 15, bold: true, color: INK, fontFace: "Calibri", margin: 0 });
    s5.addText(row.body, { x: 1.35, y: iy + 0.33, w: 11.2, h: 0.5, fontSize: 12, color: MUTE, fontFace: "Calibri", margin: 0 });
    iy += gap;
  }

  // ================= SLIDE 6 — KPI DASHBOARD =================
  let s6 = pres.addSlide();
  s6.background = { color: "FFFFFF" };
  s6.addText("KPI Dashboard", { x: 0.6, y: 0.4, w: 11, h: 0.55, fontSize: 28, bold: true, color: INK, fontFace: "Cambria", margin: 0 });
  if (D.kpi_dashboard_note) {
    s6.addText(D.kpi_dashboard_note, { x: 0.6, y: 0.92, w: 12, h: 0.35, fontSize: 12, italic: true, color: MUTE, fontFace: "Calibri", margin: 0 });
  }
  let kRows = [headerRow(["KPI", D.compare_label, D.month_label, "% Change", "Read"])];
  D.kpi_dashboard.forEach(([k, prior, cur, pct, read, up]) => {
    const color = rowColor(up);
    kRows.push([
      { text: k, options: { bold: true, color: INK, fontSize: 11.5 } },
      { text: prior, options: { color: MUTE, fontSize: 11.5, align: "center" } },
      { text: cur, options: { color: INK, fontSize: 12, bold: true, align: "center" } },
      { text: pct, options: { color, fontSize: 11.5, align: "center" } },
      { text: read, options: { color, fontSize: 11.5, align: "left" } },
    ]);
  });
  const kRowH = Math.min(0.42, 5.6 / (D.kpi_dashboard.length + 1));
  s6.addTable(kRows, { x: 0.6, y: 1.4, w: 12.1, colW: [3.1, 1.7, 1.7, 1.8, 3.8], fontFace: "Calibri", border: { pt: 0.75, color: "E1E8DD" }, valign: "middle", rowH: kRowH });

  // ================= SLIDE 7 — DATA GAPS + DEFINITIONS =================
  let s7 = pres.addSlide();
  s7.background = { color: "FFFFFF" };
  s7.addText("Data to Capture  ·  Definitions", { x: 0.6, y: 0.45, w: 12, h: 0.6, fontSize: 26, bold: true, color: INK, fontFace: "Cambria", margin: 0 });

  s7.addText("TOP PRIORITY GAPS", { x: 0.6, y: 1.3, w: 6, h: 0.35, fontSize: 13, bold: true, color: FOREST, fontFace: "Calibri", charSpacing: 1, margin: 0 });
  let gRows = [[
    { text: "Data to capture", options: { bold: true, color: "FFFFFF", fill: { color: FOREST }, fontSize: 11 } },
    { text: "Unlocks", options: { bold: true, color: "FFFFFF", fill: { color: FOREST }, fontSize: 11 } },
    { text: "Priority", options: { bold: true, color: "FFFFFF", fill: { color: FOREST }, fontSize: 11 } },
  ]];
  D.data_gaps.forEach(([d, u, p]) => gRows.push([
    { text: d, options: { color: INK, fontSize: 11 } },
    { text: u, options: { color: MUTE, fontSize: 10.5 } },
    { text: p, options: { color: GOLD, bold: true, fontSize: 10.5 } },
  ]));
  const gRowH = Math.min(0.85, 4.6 / (D.data_gaps.length + 1));
  s7.addTable(gRows, { x: 0.6, y: 1.7, w: 6.0, colW: [2.5, 2.5, 1.0], fontFace: "Calibri", border: { pt: 0.75, color: "E1E8DD" }, valign: "middle", rowH: gRowH });

  s7.addText("LOCKED DEFINITIONS", { x: 6.9, y: 1.3, w: 6, h: 0.35, fontSize: 13, bold: true, color: FOREST, fontFace: "Calibri", charSpacing: 1, margin: 0 });
  let dfRows = [[
    { text: "Term", options: { bold: true, color: "FFFFFF", fill: { color: FOREST }, fontSize: 11 } },
    { text: "Working definition", options: { bold: true, color: "FFFFFF", fill: { color: FOREST }, fontSize: 11 } },
  ]];
  D.definitions.forEach(([t, d]) => dfRows.push([
    { text: t, options: { color: INK, bold: true, fontSize: 11 } },
    { text: d, options: { color: MUTE, fontSize: 10.5 } },
  ]));
  const dfRowH = Math.min(0.85, 4.6 / (D.definitions.length + 1));
  s7.addTable(dfRows, { x: 6.9, y: 1.7, w: 5.8, colW: [1.9, 3.9], fontFace: "Calibri", border: { pt: 0.75, color: "E1E8DD" }, valign: "middle", rowH: dfRowH });

  // ================= SLIDE 8 — RECOMMENDATIONS (optional) =================
  if (D.recommendations && D.recommendations.length) {
    let s8 = pres.addSlide();
    s8.background = { color: FOREST };
    s8.addText("Recommendations to Grow the Brand", { x: 0.7, y: 0.6, w: 11.5, h: 0.7, fontSize: 30, bold: true, color: "FFFFFF", fontFace: "Cambria", margin: 0 });
    if (D.recommendations_intro) {
      s8.addText(D.recommendations_intro, { x: 0.7, y: 1.28, w: 11.5, h: 0.5, fontSize: 13, italic: true, color: "C7D6BE", fontFace: "Calibri", margin: 0 });
    }
    const n = D.recommendations.length;
    const cols = n > 3 ? 2 : 1;
    const rowsN = Math.ceil(n / cols);
    const gridW = 11.9, gridX = 0.7, gridYStart = 2.0;
    const cardW = cols === 2 ? (gridW - 0.4) / 2 : gridW;
    const cardH = Math.min(1.55, (5.1 / rowsN) - 0.25);
    const idea = await getIcon("idea");
    D.recommendations.forEach((rec, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = gridX + col * (cardW + 0.4);
      const y = gridYStart + row * (cardH + 0.25);
      s8.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: cardW, h: cardH, rectRadius: 0.06, fill: { color: "FFFFFF" } });
      s8.addShape(pres.shapes.OVAL, { x: x + 0.25, y: y + 0.22, w: 0.42, h: 0.42, fill: { color: FOREST } });
      s8.addImage({ data: idea, x: x + 0.35, y: y + 0.32, w: 0.22, h: 0.22 });
      s8.addText(`${i + 1}. ${rec.title}`, { x: x + 0.8, y: y + 0.16, w: cardW - 1.05, h: 0.4, fontSize: 13.5, bold: true, color: INK, fontFace: "Calibri", margin: 0 });
      s8.addText(rec.body, { x: x + 0.8, y: y + 0.56, w: cardW - 1.05, h: cardH - 0.7, fontSize: 11, color: MUTE, fontFace: "Calibri", margin: 0 });
    });
  }

  await pres.writeFile({ fileName: outPath });
  console.log("done");
}

build().catch(e => { console.error(e); process.exit(1); });
