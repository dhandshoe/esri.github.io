/**
 * Dashboard panel with KPI cards and charts (Canvas API).
 * @module js/dashboard-panel
 */

import { ComplianceStatus, ComplianceStatusLabels, StatusColors, AlertSeverity, SeverityColors, Fields, API, Defaults } from "../utils/constants.js";
import * as apiService from "../services/api-service.js";
import { generateComplianceSummary } from "../services/compliance-service.js";

// ---------------------------------------------------------------------------
// Module State
// ---------------------------------------------------------------------------

let _container = null;
let _refreshTimer = null;
let _permits = [];

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize the dashboard panel.
 * @param {HTMLElement} container
 */
export function init(container) {
  _container = container;
  render();
}

function render() {
  if (!_container) return;

  _container.innerHTML = `
    <div class="ecms-panel active" id="dashboard-panel-inner">
      <div class="panel-header">
        <h3>Dashboard</h3>
        <div style="display:flex;gap:6px;align-items:center;">
          <calcite-switch id="auto-refresh-toggle" scale="s"></calcite-switch>
          <span class="text-sm text-muted">Auto-refresh</span>
          <calcite-button id="btn-refresh-dashboard" icon-start="refresh" appearance="outline" scale="s">Refresh</calcite-button>
        </div>
      </div>
      <div class="panel-content">
        <!-- KPI Cards -->
        <div class="kpi-row" id="dash-kpi-row"></div>

        <!-- Charts -->
        <div class="chart-grid">
          <calcite-card class="chart-card">
            <span slot="heading">Compliance Status Distribution</span>
            <canvas id="chart-pie"></canvas>
          </calcite-card>
          <calcite-card class="chart-card">
            <span slot="heading">Compliance Trend</span>
            <canvas id="chart-trend"></canvas>
          </calcite-card>
          <calcite-card class="chart-card">
            <span slot="heading">Alert Volume by Type</span>
            <canvas id="chart-alerts"></canvas>
          </calcite-card>
          <calcite-card class="chart-card">
            <span slot="heading">Risk Heat Map – Top 10</span>
            <canvas id="chart-risk"></canvas>
          </calcite-card>
        </div>

        <!-- Upcoming Deadlines -->
        <calcite-card class="mt-md">
          <span slot="heading">Upcoming Deadlines</span>
          <calcite-list id="deadline-list" selection-mode="none"></calcite-list>
        </calcite-card>
      </div>
    </div>
  `;

  bindEvents();
  loadDashboard();
}

function bindEvents() {
  _container.querySelector("#btn-refresh-dashboard")?.addEventListener("click", loadDashboard);
  _container.querySelector("#auto-refresh-toggle")?.addEventListener("calciteSwitchChange", (e) => {
    if (e.target.checked) {
      _refreshTimer = setInterval(loadDashboard, Defaults.REFRESH_INTERVAL_MS);
    } else {
      clearInterval(_refreshTimer);
      _refreshTimer = null;
    }
  });
}

// ---------------------------------------------------------------------------
// Data Loading
// ---------------------------------------------------------------------------

async function loadDashboard() {
  try {
    _permits = await apiService.queryAllFeatures(API.LAYERS.PERMITS, { returnGeometry: false });
    const alerts = await apiService.queryAllFeatures(API.LAYERS.ALERTS, {
      where: "1=1",
      orderByFields: `${Fields.ALERT_CREATED} DESC`,
    });

    const summary = generateComplianceSummary(_permits);
    renderKPIs(summary, alerts);
    drawPieChart(summary.byCounts);
    drawTrendChart(_permits);
    drawAlertChart(alerts);
    drawRiskChart(_permits);
    renderDeadlines(summary.upcomingExpirations);
  } catch (err) {
    console.error("Dashboard load failed:", err);
  }
}

// ---------------------------------------------------------------------------
// KPI Rendering
// ---------------------------------------------------------------------------

function renderKPIs(summary, alerts) {
  const openAlerts = alerts.filter((a) => {
    const s = a.attributes?.[Fields.ALERT_STATUS];
    return s === "Open" || s === "Acknowledged";
  }).length;

  const row = _container.querySelector("#dash-kpi-row");
  if (!row) return;

  row.innerHTML = `
    <calcite-card class="kpi-card">
      <div class="kpi-value">${summary.total}</div>
      <div class="kpi-label">Total Permits</div>
    </calcite-card>
    <calcite-card class="kpi-card">
      <div class="kpi-value compliant">${summary.percentCompliant}%</div>
      <div class="kpi-label">Compliant</div>
    </calcite-card>
    <calcite-card class="kpi-card">
      <div class="kpi-value noncompliant">${summary.activeViolations}</div>
      <div class="kpi-label">Active Violations</div>
    </calcite-card>
    <calcite-card class="kpi-card">
      <div class="kpi-value" style="color:var(--severity-high)">${openAlerts}</div>
      <div class="kpi-label">Open Alerts</div>
    </calcite-card>
    <calcite-card class="kpi-card">
      <div class="kpi-value">${summary.avgRiskScore}</div>
      <div class="kpi-label">Avg Risk Score</div>
    </calcite-card>
  `;
}

// ---------------------------------------------------------------------------
// Charts – Canvas API
// ---------------------------------------------------------------------------

/**
 * Draw a donut / pie chart of compliance status counts.
 * @param {Record<string, number>} byCounts
 */
function drawPieChart(byCounts) {
  const canvas = _container.querySelector("#chart-pie");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 300;
  const h = canvas.clientHeight || 220;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  const entries = Object.entries(byCounts).filter(([, v]) => v > 0);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total === 0) return;

  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(cx, cy) - 30;
  const innerRadius = radius * 0.55;

  let angle = -Math.PI / 2;
  for (const [status, count] of entries) {
    const sliceAngle = (count / total) * 2 * Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, angle, angle + sliceAngle);
    ctx.closePath();
    ctx.fillStyle = StatusColors[status]?.fill || "#adb5bd";
    ctx.fill();

    // Label
    const mid = angle + sliceAngle / 2;
    const lx = cx + (radius * 0.75) * Math.cos(mid);
    const ly = cy + (radius * 0.75) * Math.sin(mid);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 11px Avenir Next, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (sliceAngle > 0.3) {
      ctx.fillText(`${count}`, lx, ly);
    }

    angle += sliceAngle;
  }

  // Inner circle for donut
  ctx.beginPath();
  ctx.arc(cx, cy, innerRadius, 0, 2 * Math.PI);
  ctx.fillStyle = "#fff";
  ctx.fill();

  // Center text
  ctx.fillStyle = "#333";
  ctx.font = "bold 22px Avenir Next, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(total), cx, cy - 8);
  ctx.font = "11px Avenir Next, sans-serif";
  ctx.fillStyle = "#666";
  ctx.fillText("Total", cx, cy + 12);

  // Legend below
  const legendY = h - 15;
  let lx = 10;
  ctx.font = "10px Avenir Next, sans-serif";
  for (const [status] of entries) {
    ctx.fillStyle = StatusColors[status]?.fill || "#adb5bd";
    ctx.fillRect(lx, legendY, 10, 10);
    ctx.fillStyle = "#333";
    const label = ComplianceStatusLabels[status] || status;
    ctx.fillText(label, lx + 14, legendY + 9);
    lx += ctx.measureText(label).width + 24;
  }
}

/**
 * Draw a trend line chart. Groups permits by issue-date month and shows cumulative counts per status.
 * @param {Array} permits
 */
function drawTrendChart(permits) {
  const canvas = _container.querySelector("#chart-trend");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 300;
  const h = canvas.clientHeight || 220;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  // Build monthly buckets for the last 12 months
  const now = new Date();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString(undefined, { month: "short" }) });
  }

  const statusKeys = [ComplianceStatus.COMPLIANT, ComplianceStatus.NON_COMPLIANT, ComplianceStatus.AT_RISK];
  const series = {};
  for (const sk of statusKeys) {
    series[sk] = months.map(() => 0);
  }

  for (const p of permits) {
    const a = p.attributes;
    const issueDate = a[Fields.ISSUE_DATE];
    if (!issueDate) continue;
    const d = new Date(issueDate);
    const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const idx = months.findIndex((m) => m.key === mk);
    if (idx < 0) continue;
    const status = a[Fields.COMPLIANCE_STATUS];
    if (series[status]) series[status][idx]++;
  }

  // Draw
  const margin = { top: 20, right: 15, bottom: 30, left: 35 };
  const plotW = w - margin.left - margin.right;
  const plotH = h - margin.top - margin.bottom;

  const allVals = Object.values(series).flat();
  const maxVal = Math.max(1, ...allVals);

  // Axes
  ctx.strokeStyle = "#ddd";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(margin.left, margin.top);
  ctx.lineTo(margin.left, margin.top + plotH);
  ctx.lineTo(margin.left + plotW, margin.top + plotH);
  ctx.stroke();

  // X labels
  ctx.fillStyle = "#666";
  ctx.font = "9px Avenir Next, sans-serif";
  ctx.textAlign = "center";
  months.forEach((m, i) => {
    const x = margin.left + (i / (months.length - 1)) * plotW;
    ctx.fillText(m.label, x, margin.top + plotH + 15);
  });

  // Y labels
  ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const v = Math.round((maxVal * i) / 4);
    const y = margin.top + plotH - (i / 4) * plotH;
    ctx.fillText(String(v), margin.left - 5, y + 3);
    ctx.strokeStyle = "#eee";
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(margin.left + plotW, y);
    ctx.stroke();
  }

  // Lines
  for (const sk of statusKeys) {
    ctx.strokeStyle = StatusColors[sk]?.fill || "#999";
    ctx.lineWidth = 2;
    ctx.beginPath();
    series[sk].forEach((val, i) => {
      const x = margin.left + (i / (months.length - 1)) * plotW;
      const y = margin.top + plotH - (val / maxVal) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Dots
    series[sk].forEach((val, i) => {
      const x = margin.left + (i / (months.length - 1)) * plotW;
      const y = margin.top + plotH - (val / maxVal) * plotH;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, 2 * Math.PI);
      ctx.fillStyle = StatusColors[sk]?.fill || "#999";
      ctx.fill();
    });
  }
}

/**
 * Draw a bar chart of alerts by severity.
 * @param {Array} alerts
 */
function drawAlertChart(alerts) {
  const canvas = _container.querySelector("#chart-alerts");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 300;
  const h = canvas.clientHeight || 220;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  const counts = {};
  for (const sev of Object.values(AlertSeverity)) counts[sev] = 0;
  for (const a of alerts) {
    const sev = a.attributes?.[Fields.ALERT_SEVERITY];
    if (counts[sev] !== undefined) counts[sev]++;
  }

  const entries = Object.entries(counts);
  const maxVal = Math.max(1, ...entries.map(([, v]) => v));

  const margin = { top: 20, right: 15, bottom: 30, left: 35 };
  const plotW = w - margin.left - margin.right;
  const plotH = h - margin.top - margin.bottom;

  const barW = plotW / entries.length * 0.6;
  const gap = plotW / entries.length;

  // Axes
  ctx.strokeStyle = "#ddd";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(margin.left, margin.top);
  ctx.lineTo(margin.left, margin.top + plotH);
  ctx.lineTo(margin.left + plotW, margin.top + plotH);
  ctx.stroke();

  entries.forEach(([sev, count], i) => {
    const x = margin.left + i * gap + (gap - barW) / 2;
    const barH = (count / maxVal) * plotH;
    const y = margin.top + plotH - barH;

    ctx.fillStyle = SeverityColors[sev] || "#adb5bd";
    ctx.fillRect(x, y, barW, barH);

    // Value label
    ctx.fillStyle = "#333";
    ctx.font = "bold 11px Avenir Next, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(count), x + barW / 2, y - 5);

    // X label
    ctx.fillStyle = "#666";
    ctx.font = "9px Avenir Next, sans-serif";
    ctx.fillText(sev, x + barW / 2, margin.top + plotH + 15);
  });
}

/**
 * Draw a horizontal bar chart of top 10 highest risk permits.
 * @param {Array} permits
 */
function drawRiskChart(permits) {
  const canvas = _container.querySelector("#chart-risk");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 300;
  const h = canvas.clientHeight || 220;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  const sorted = [...permits]
    .filter((p) => p.attributes?.[Fields.RISK_SCORE] != null)
    .sort((a, b) => (b.attributes[Fields.RISK_SCORE] || 0) - (a.attributes[Fields.RISK_SCORE] || 0))
    .slice(0, 10);

  if (!sorted.length) {
    ctx.fillStyle = "#999";
    ctx.font = "12px Avenir Next, sans-serif";
    ctx.fillText("No risk data available.", 20, h / 2);
    return;
  }

  const margin = { top: 10, right: 40, bottom: 10, left: 100 };
  const plotW = w - margin.left - margin.right;
  const plotH = h - margin.top - margin.bottom;
  const barH = plotH / sorted.length * 0.7;
  const gap = plotH / sorted.length;
  const maxVal = Math.max(1, sorted[0].attributes[Fields.RISK_SCORE]);

  sorted.forEach((p, i) => {
    const a = p.attributes;
    const risk = a[Fields.RISK_SCORE] || 0;
    const barW = (risk / 100) * plotW;
    const y = margin.top + i * gap + (gap - barH) / 2;

    // Color by risk
    let color = "#2d6a4f";
    if (risk >= 75) color = "#d00000";
    else if (risk >= 50) color = "#e36414";
    else if (risk >= 25) color = "#e09f3e";

    ctx.fillStyle = color;
    ctx.fillRect(margin.left, y, barW, barH);

    // Label
    ctx.fillStyle = "#333";
    ctx.font = "10px Avenir Next, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const label = (a[Fields.PERMIT_ID] || "").substring(0, 14);
    ctx.fillText(label, margin.left - 5, y + barH / 2);

    // Value
    ctx.textAlign = "left";
    ctx.fillText(String(risk), margin.left + barW + 4, y + barH / 2);
  });
}

// ---------------------------------------------------------------------------
// Deadlines
// ---------------------------------------------------------------------------

function renderDeadlines(upcoming) {
  const list = _container.querySelector("#deadline-list");
  if (!list) return;

  if (!upcoming?.length) {
    list.innerHTML = `<calcite-notice open kind="success" scale="s"><div slot="message">No upcoming deadlines.</div></calcite-notice>`;
    return;
  }

  list.innerHTML = upcoming.slice(0, 15).map((item) => {
    const a = item.permit;
    const icon = item.daysLeft <= 30 ? "exclamation-mark-triangle" : "clock";
    const kind = item.daysLeft <= 30 ? "danger" : "warning";
    return `
      <calcite-list-item
        label="${a[Fields.PERMIT_NAME] || a[Fields.PERMIT_ID]}"
        description="Expires in ${item.daysLeft} days — ${new Date(a[Fields.EXPIRATION_DATE]).toLocaleDateString()}"
      >
        <calcite-icon slot="content-start" icon="${icon}" style="color:${item.daysLeft <= 30 ? 'var(--severity-critical)' : 'var(--severity-medium)'};" scale="s"></calcite-icon>
      </calcite-list-item>
    `;
  }).join("");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Refresh dashboard data.
 */
export function refresh() {
  loadDashboard();
}

/**
 * Destroy auto-refresh timer.
 */
export function destroy() {
  if (_refreshTimer) {
    clearInterval(_refreshTimer);
    _refreshTimer = null;
  }
}
