import { useState } from "react";
import { jsPDF } from "jspdf";

// jsPDF can't print the peso sign, so we use "P" instead
function peso(n) {
  return `P${Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

// Makes the "+P320 (+12.0%)" text and picks a color for it
function deltaInfo(cur, prev, fmt) {
  const diff = cur - prev;
  const pct  = prev > 0 ? (diff / prev) * 100 : null;
  const sign = diff > 0 ? "+" : diff < 0 ? "-" : "";

  let text = `${sign}${fmt(Math.abs(diff))}`;
  if (pct !== null) text += ` (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)`;

  const color = diff > 0 ? [16, 185, 129] : diff < 0 ? [239, 68, 68] : [156, 163, 175];
  return { text, color };
}

// Draws the income chart (stacked by coin) with a dashed line for the previous period
function drawBarChart(doc, data, x, y, width, height) {
  if (!data || data.length === 0) return;

  const colors = { p1: [156, 163, 175], p5: [96, 165, 250], p10: [52, 211, 153], p20: [16, 185, 129] };
  const max    = Math.max(...data.map(d => Math.max(d.value || 0, d.prev_value || 0)), 1);

  const plotH  = height - 22;            // space for labels
  const bottom = y + height - 12;        // where the bars start
  const gap    = data.length > 20 ? 0.6 : 2;
  const barW   = (width - 10) / data.length - gap;
  const step   = Math.ceil(data.length / 16); // show fewer labels if too many bars

  // chart background
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(x, y, width, height, 3, 3, "F");

  data.forEach((d, i) => {
    const barX = x + 5 + i * (barW + gap);
    const barH = ((d.value || 0) / max) * plotH;

    // stacked segments, one color per coin
    let segY = bottom;
    ["p1", "p5", "p10", "p20"].forEach(key => {
      const v = d.breakdown?.[key] || 0;
      if (v <= 0 || d.value <= 0) return;
      const segH = (v / d.value) * barH;
      segY -= segH;
      doc.setFillColor(...colors[key]);
      doc.rect(barX, segY, barW, segH, "F");
    });

    // dashed line = previous period at the same position
    if (d.prev_value > 0) {
      const lineY = bottom - (d.prev_value / max) * plotH;
      doc.setDrawColor(107, 114, 128);
      doc.setLineWidth(0.3);
      doc.setLineDashPattern([0.8, 0.8], 0);
      doc.line(barX - 0.5, lineY, barX + barW + 0.5, lineY);
      doc.setLineDashPattern([], 0);
    }

    // value on top (only when there are few bars)
    if (data.length <= 8 && d.value > 0) {
      doc.setFontSize(6);
      doc.setTextColor(16, 185, 129);
      doc.text(`P${Math.round(d.value)}`, barX + barW / 2, bottom - barH - 1.5, { align: "center" });
    }

    // label below the bar
    if (i % step === 0) {
      doc.setFontSize(6.5);
      doc.setTextColor(107, 114, 128);
      doc.text(String(d.label), barX + barW / 2, y + height - 5, { align: "center" });
    }
  });

  // small legend inside the chart (top right)
  const lx = x + width - 78;
  const ly = y + 5;
  [["P1", colors.p1], ["P5", colors.p5], ["P10", colors.p10], ["P20", colors.p20]].forEach(([name, c], i) => {
    doc.setFillColor(...c);
    doc.rect(lx + i * 14, ly - 2.2, 2.5, 2.5, "F");
    doc.setFontSize(6);
    doc.setTextColor(107, 114, 128);
    doc.text(name, lx + i * 14 + 3.5, ly);
  });
  doc.setDrawColor(107, 114, 128);
  doc.setLineWidth(0.3);
  doc.setLineDashPattern([0.8, 0.8], 0);
  doc.line(lx + 56, ly - 1, lx + 61, ly - 1);
  doc.setLineDashPattern([], 0);
  doc.setFontSize(6);
  doc.text("Previous", lx + 62.5, ly);

  doc.setTextColor(0, 0, 0);
}

// The report always follows the period chosen in the Analytics tab
export default function ReportGenerator({ analytics, loading: dataLoading }) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const generatePDF = async () => {
    if (!analytics) return;
    setLoading(true);
    setError("");

    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      const pageW    = 210;
      const margin   = 16;
      const contentW = pageW - margin * 2;
      const bottomY  = 280; // do not write below this line
      let y = 0;

      const label       = analytics.period.label.replace(/–/g, "-");
      const prevLabel   = analytics.period.prev_label.replace(/–/g, "-");
      const generatedAt = new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" });
      const modeName    = { day: "Daily", week: "Weekly", month: "Monthly", custom: "Custom" }[analytics.period.mode];

      // If the next block does not fit, start a new page
      const ensure = (h) => {
        if (y + h > bottomY) {
          doc.addPage();
          y = 20;
        }
      };

      // Section title
      const sectionTitle = (text) => {
        ensure(16);
        doc.setTextColor(17, 24, 39);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text(text, margin, y);
        y += 6;
      };

      // Simple table. offsets = x position of each column (from the left margin)
      // pcts = optional list of 0-1 values that draw a small bar on the right
      const drawTable = (headers, offsets, rows, pcts) => {
        ensure(8 + 7 * Math.min(rows.length, 2));

        doc.setFillColor(15, 23, 42);
        doc.rect(margin, y, contentW, 8, "F");
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        headers.forEach((h, i) => doc.text(h, margin + offsets[i], y + 5.5));
        y += 8;

        rows.forEach((row, idx) => {
          ensure(7);
          doc.setFillColor(...(idx % 2 === 0 ? [255, 255, 255] : [248, 250, 252]));
          doc.rect(margin, y, contentW, 7, "F");

          doc.setFontSize(8);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(55, 65, 81);
          row.forEach((val, i) => doc.text(String(val), margin + offsets[i], y + 5));

          if (pcts) {
            doc.setFillColor(16, 185, 129);
            doc.rect(margin + contentW - 36, y + 2, (pcts[idx] || 0) * 34, 3, "F");
          }
          y += 7;
        });

        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(0.3);
        doc.line(margin, y, margin + contentW, y);
        y += 8;
      };

      // ── Header bar (first page only) ──────────────────────────────────────
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageW, 28, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("PisoNet", margin, 12);

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text("Computer Shop Management System", margin, 19);

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(`${modeName} Report`, pageW - margin, 12, { align: "right" });

      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text(`Generated: ${generatedAt}`, pageW - margin, 19, { align: "right" });

      y = 38;

      // ── Period and what we compare with ───────────────────────────────────
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text(label, margin, y);
      y += 6;

      const note = analytics.period.in_progress
        ? `Compared with ${prevLabel} up to the same point in time (${analytics.period.compared_until}). ` +
          `Whole previous period: ${peso(analytics.previous_full.total)}.`
        : `Compared with ${prevLabel}.`;

      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(107, 114, 128);
      const noteLines = doc.splitTextToSize(note, contentW);
      doc.text(noteLines, margin, y);
      y += noteLines.length * 4 + 4;

      // ── Summary cards with comparison ─────────────────────────────────────
      sectionTitle("Summary");

      const cur  = analytics.current;
      const prev = analytics.previous;
      const num  = (n) => Number(n).toLocaleString("en-US");

      const cards = [
        { label: "Income",         value: peso(cur.total),               delta: deltaInfo(cur.total, prev.total, peso),                         color: [16, 185, 129] },
        { label: "Coins inserted", value: num(cur.coins),                delta: deltaInfo(cur.coins, prev.coins, num),                         color: [59, 130, 246] },
        { label: "Sessions",       value: num(cur.sessions),             delta: deltaInfo(cur.sessions, prev.sessions, num),                   color: [139, 92, 246] },
        { label: "Avg session",    value: `${cur.avg_duration.toFixed(1)} min`,
          delta: deltaInfo(cur.avg_duration, prev.avg_duration, (n) => `${n.toFixed(1)} min`),                                                   color: [245, 158, 11] },
      ];

      const cardW = (contentW - 9) / 4;
      ensure(30);
      cards.forEach((card, i) => {
        const cx = margin + i * (cardW + 3);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(cx, y, cardW, 26, 2, 2, "F");
        doc.setDrawColor(...card.color);
        doc.setLineWidth(0.5);
        doc.roundedRect(cx, y, cardW, 26, 2, 2, "S");

        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(107, 114, 128);
        doc.text(card.label, cx + cardW / 2, y + 6.5, { align: "center" });

        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...card.color);
        doc.text(card.value, cx + cardW / 2, y + 14.5, { align: "center" });

        doc.setFontSize(6.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...card.delta.color);
        doc.text(card.delta.text, cx + cardW / 2, y + 21.5, { align: "center" });
      });
      y += 32;

      // ── Chart ─────────────────────────────────────────────────────────────
      sectionTitle(`Income Chart (${analytics.period.mode === "day" ? "per hour" : "per day"})`);
      ensure(60);
      if (analytics.chart && analytics.chart.some(d => d.value > 0 || d.prev_value > 0)) {
        drawBarChart(doc, analytics.chart, margin, y, contentW, 58);
        y += 66;
      } else {
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(156, 163, 175);
        doc.text("No coin data for this period", margin, y + 6);
        y += 16;
      }

      // ── Coin breakdown ────────────────────────────────────────────────────
      sectionTitle("Coin Breakdown");
      const maxCoins = Math.max(...analytics.coin_breakdown.map(c => c.count), 1);
      drawTable(
        ["Coin", "Count", "Total"],
        [2, 50, 100],
        analytics.coin_breakdown.map(c => [`P${c.denomination}`, `${c.count}x`, peso(c.total)]),
        analytics.coin_breakdown.map(c => c.count / maxCoins)
      );

      // ── Peak hours ────────────────────────────────────────────────────────
      sectionTitle("Peak Hours");
      if (analytics.peak_hours.length > 0) {
        const maxTx = analytics.peak_hours[0].transactions || 1;
        drawTable(
          ["Hour", "Coins", "Income"],
          [2, 50, 100],
          analytics.peak_hours.map(r => [r.hour_label, String(r.transactions), peso(r.income)]),
          analytics.peak_hours.map(r => r.transactions / maxTx)
        );
      } else {
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(156, 163, 175);
        doc.text("No coins in this period", margin, y + 2);
        y += 12;
      }

            // ── Machine utilization ───────────────────────────────────────────────
      sectionTitle("Machine Utilization");
      const mu = analytics.machine_usage;

      if (mu && mu.machines.length > 0) {
        // insights first (plain sentences)
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        mu.insights.forEach(ins => {
          const prefix = ins.level === "warning" ? "[!] " : ins.level === "good" ? "[OK] " : "[i] ";
          const lines  = doc.splitTextToSize(prefix + ins.message, contentW);
          ensure(lines.length * 4 + 3);
          doc.setTextColor(...(ins.level === "warning" ? [146, 64, 14] : [75, 85, 99]));
          doc.text(lines, margin, y);
          y += lines.length * 4 + 2;
        });
        y += 3;

        const statusName = { busy: "Busy", normal: "Normal", low: "Low usage", none: "No sessions" };
        const maxSess    = Math.max(...mu.machines.map(m => m.sessions), 1);

        drawTable(
          ["Machine", "Sessions", "Share", "Earnings", "Coins", "Status"],
          [2, 42, 66, 88, 118, 138],
          mu.machines.map(m => [
            m.name,
            String(m.sessions),
            `${m.share_pct}%`,
            peso(m.income),
            String(m.coins),
            statusName[m.status] ?? m.status,
          ]),
          mu.machines.map(m => m.sessions / maxSess)
        );
      } else {
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(156, 163, 175);
        doc.text("No machine data for this period", margin, y + 2);
        y += 12;
      }

      // ── Footer on every page ──────────────────────────────────────────────
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(0.3);
        doc.line(margin, 283, pageW - margin, 283);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(156, 163, 175);
        doc.text(
          `PisoNet Computer Shop Management System  |  Page ${i} of ${totalPages}  |  ${generatedAt}`,
          pageW / 2, 287, { align: "center" }
        );
      }

      // ── Save ──────────────────────────────────────────────────────────────
      const safeLabel = label.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
      doc.save(`pisonet_report_${analytics.period.mode}_${safeLabel}.pdf`);

    } catch (err) {
      console.error("PDF generation error:", err);
      setError("Failed to generate PDF. Check your internet (jsPDF loads from a CDN) and the console.");
    } finally {
      setLoading(false);
    }
  };

  const notReady = !analytics || dataLoading;

  return (
    <div className="report-card">
      <div>
        <div className="report-title">Download Report</div>
        <div className="report-sub">
          {analytics
            ? <>PDF for the selected period: <strong>{analytics.period.label}</strong></>
            : "Waiting for analytics data…"}
        </div>
      </div>

      <button className="report-btn" onClick={generatePDF} disabled={loading || notReady}>
        {loading ? "Generating…" : "⬇ Download PDF"}
      </button>

      {error && <div className="report-error">⚠ {error}</div>}
    </div>
  );
}