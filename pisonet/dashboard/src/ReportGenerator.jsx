import { useState } from "react";
import { getReport } from "./api";

// Draws a simple bar chart on a jsPDF canvas
function drawBarChart(doc, data, x, y, width, height, color = [16, 185, 129]) {
  if (!data || data.length === 0) return;

  const max   = Math.max(...data.map(d => parseFloat(d.income) || 0), 1);
  const barW  = (width - 10) / data.length - 4;
  const chartBottom = y + height;

  // Chart background
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(x, y, width, height, 3, 3, 'F');

  // Draw bars
  data.forEach((d, i) => {
    const value   = parseFloat(d.income) || 0;
    const barH    = max > 0 ? (value / max) * (height - 30) : 2;
    const barX    = x + 5 + i * (barW + 4);
    const barY    = chartBottom - 20 - barH;

    // Bar fill
    doc.setFillColor(...color);
    doc.roundedRect(barX, barY, barW, barH, 1, 1, 'F');

    // Value label above bar
    if (value > 0) {
      doc.setFontSize(6);
      doc.setTextColor(16, 185, 129);
      doc.text(`P${value.toFixed(0)}`, barX + barW / 2, barY - 2, { align: "center" });
    }

    // Period label below bar
    doc.setFontSize(6.5);
    doc.setTextColor(107, 114, 128);
    const label = d.period_label || String(d.period);
    // Shorten label if too long
    const shortLabel = label.length > 6 ? label.substring(0, 6) : label;
    doc.text(shortLabel, barX + barW / 2, chartBottom - 10, { align: "center" });
  });

  // Reset colors
  doc.setTextColor(0, 0, 0);
}

export default function ReportGenerator() {
  const [reportType, setReportType] = useState("weekly");
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");

  const generatePDF = async () => {
    setLoading(true);
    setError("");

    try {
      // Fetch report data from server
      const res = await getReport(reportType);
      if (!res.data.success) {
        setError(res.data.message);
        return;
      }

      const data = res.data.data;

      // Dynamically load jsPDF from CDN if not already loaded
      if (!window.jspdf) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
          script.onload  = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      const pageW  = 210;
      const margin = 16;
      const contentW = pageW - margin * 2;
      let y = 0;

      // ── Header bar ──────────────────────────────────────────────────────────
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageW, 28, 'F');

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
      doc.text(data.label, pageW - margin, 12, { align: "right" });

      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text(`Generated: ${data.generated_at}`, pageW - margin, 19, { align: "right" });

      y = 36;

      // ── Summary cards ────────────────────────────────────────────────────────
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Income Summary", margin, y);
      y += 6;

      const cards = [
        { label: "Total Income",    value: `P${data.summary.total_income.toLocaleString()}`,   color: [16, 185, 129] },
        { label: "Total Sessions",  value: String(data.summary.total_sessions),                color: [59, 130, 246] },
        { label: "Avg per Session", value: `P${data.summary.avg_income.toFixed(2)}`,           color: [139, 92, 246] },
        { label: "Avg Duration",    value: `${data.summary.avg_duration.toFixed(1)} min`,      color: [245, 158, 11] },
      ];

      const cardW = (contentW - 9) / 4;
      cards.forEach((card, i) => {
        const cx = margin + i * (cardW + 3);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(cx, y, cardW, 22, 2, 2, 'F');
        doc.setDrawColor(...card.color);
        doc.setLineWidth(0.5);
        doc.roundedRect(cx, y, cardW, 22, 2, 2, 'S');

        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(107, 114, 128);
        doc.text(card.label, cx + cardW / 2, y + 7, { align: "center" });

        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...card.color);
        doc.text(card.value, cx + cardW / 2, y + 16, { align: "center" });
      });

      y += 28;

      // ── Bar chart ─────────────────────────────────────────────────────────────
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Income Chart (₱)", margin, y);
      y += 5;

      if (data.chart && data.chart.length > 0) {
        drawBarChart(doc, data.chart, margin, y, contentW, 55);
        y += 62;
      } else {
        doc.setFontSize(9);
        doc.setTextColor(156, 163, 175);
        doc.text("No session data for this period", margin, y + 10);
        y += 20;
      }

      // ── Per machine breakdown ─────────────────────────────────────────────────
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Per Machine Breakdown", margin, y);
      y += 6;

      if (data.machines && data.machines.length > 0) {
        // Table header
        const cols = [60, 35, 35, 40, 8]; // widths
        const headers = ["Machine", "Sessions", "Income (₱)", "Avg Duration", ""];

        doc.setFillColor(15, 23, 42);
        doc.rect(margin, y, contentW, 8, 'F');

        let cx = margin;
        headers.forEach((h, i) => {
          doc.setFontSize(7.5);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(255, 255, 255);
          doc.text(h, cx + 2, y + 5.5);
          cx += cols[i];
        });
        y += 8;

        // Table rows
        data.machines.forEach((m, idx) => {
          const rowColor = idx % 2 === 0 ? [255, 255, 255] : [248, 250, 252];
          doc.setFillColor(...rowColor);
          doc.rect(margin, y, contentW, 7, 'F');

          const row = [
            m.machine_name,
            String(m.sessions),
            `P${parseFloat(m.income).toFixed(2)}`,
            `${parseFloat(m.avg_duration).toFixed(1)} min`,
          ];

          cx = margin;
          row.forEach((val, i) => {
            doc.setFontSize(8);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(55, 65, 81);
            doc.text(val, cx + 2, y + 5);
            cx += cols[i];
          });

          // Income bar indicator
          const maxIncome = Math.max(...data.machines.map(m => parseFloat(m.income)));
          const barPct    = maxIncome > 0 ? parseFloat(m.income) / maxIncome : 0;
          doc.setFillColor(16, 185, 129);
          doc.rect(margin + contentW - 20, y + 2, barPct * 18, 3, 'F');

          y += 7;
        });

        // Bottom border
        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(0.3);
        doc.line(margin, y, margin + contentW, y);
        y += 8;
      } else {
        doc.setFontSize(9);
        doc.setTextColor(156, 163, 175);
        doc.text("No machine data for this period", margin, y + 5);
        y += 15;
      }

      // ── Top session ───────────────────────────────────────────────────────────
      if (data.top_session) {
        doc.setTextColor(17, 24, 39);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text("Top Session", margin, y);
        y += 6;

        doc.setFillColor(240, 253, 244);
        doc.roundedRect(margin, y, contentW, 16, 2, 2, 'F');
        doc.setDrawColor(110, 231, 183);
        doc.setLineWidth(0.5);
        doc.roundedRect(margin, y, contentW, 16, 2, 2, 'S');

        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(6, 95, 70);
        doc.text(`${data.top_session.machine_name}`, margin + 4, y + 7);

        doc.setFont("helvetica", "normal");
        doc.setTextColor(55, 65, 81);
        doc.text(
          `P${data.top_session.pesos} — ${data.top_session.duration_min} minutes — ${data.top_session.started_at}`,
          margin + 4, y + 13
        );
        y += 22;
      }

      // ── Footer ────────────────────────────────────────────────────────────────
      doc.setFontSize(8);
      doc.setTextColor(156, 163, 175);
      doc.text(
        `PisoNet Computer Shop Management System  |  Page 1 of 1  |  ${data.generated_at}`,
        pageW / 2, 287, { align: "center" }
      );
      doc.setDrawColor(229, 231, 235);
      doc.setLineWidth(0.3);
      doc.line(margin, 283, pageW - margin, 283);

      // ── Save ─────────────────────────────────────────────────────────────────
      const filename = `pisonet_report_${reportType}_${data.generated_at.replace(/[: ]/g, '-')}.pdf`;
      doc.save(filename);

    } catch (err) {
      console.error("PDF generation error:", err);
      setError("Failed to generate PDF — check console for details");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      background: "white", borderRadius: 12, padding: 20,
      border: "1px solid #e5e7eb", marginBottom: 16,
    }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: "#374151", marginBottom: 4 }}>
        Generate Report
      </div>
      <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 16 }}>
        Download a PDF analytics report with income summary, charts, and per-machine breakdown
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {/* Report type selector */}
        {["daily", "weekly", "monthly"].map(type => (
          <button
            key={type}
            onClick={() => setReportType(type)}
            style={{
              padding: "7px 16px",
              borderRadius: 8,
              border: reportType === type ? "1.5px solid #10b981" : "1.5px solid #e5e7eb",
              background: reportType === type ? "#f0fdf4" : "white",
              color: reportType === type ? "#065f46" : "#374151",
              fontWeight: reportType === type ? 700 : 400,
              fontSize: 13,
              cursor: "pointer",
              textTransform: "capitalize",
              fontFamily: "'DM Sans', system-ui, sans-serif",
              transition: "all 0.15s",
            }}
          >
            {type}
          </button>
        ))}

        {/* Download button */}
        <button
          onClick={generatePDF}
          disabled={loading}
          style={{
            padding: "7px 20px",
            borderRadius: 8,
            border: "none",
            background: loading ? "#e5e7eb" : "linear-gradient(135deg, #10b981, #059669)",
            color: loading ? "#9ca3af" : "white",
            fontWeight: 700,
            fontSize: 13,
            cursor: loading ? "not-allowed" : "pointer",
            fontFamily: "'DM Sans', system-ui, sans-serif",
            display: "flex",
            alignItems: "center",
            gap: 6,
            transition: "opacity 0.15s",
          }}
        >
          {loading ? "Generating…" : "⬇ Download PDF"}
        </button>
      </div>

      {error && (
        <div style={{
          marginTop: 10, background: "#fef2f2", border: "1px solid #fecaca",
          borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#991b1b",
        }}>
          ⚠ {error}
        </div>
      )}
    </div>
  );
}
