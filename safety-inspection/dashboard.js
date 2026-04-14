/**
 * Safety Inspection Dashboard - Part A
 * Core engine: data processing, KPI cards, Chart.js charts,
 * top failing items, compliance sparklines, recent inspections table,
 * and filter population.
 *
 * Part B will add: ArcGIS map, inspector leaderboard, report generation,
 * trend toggle interactivity.
 */

// ============================================================
// GLOBAL STATE
// ============================================================

let filteredData = [];
let chartInstances = {};

// Chart.js global defaults for dark theme
Chart.defaults.color = "#999";
Chart.defaults.borderColor = "rgba(255,255,255,0.06)";
Chart.defaults.font.family = "'Avenir Next', 'Avenir', 'Helvetica Neue', sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.plugins.legend.labels.boxWidth = 12;
Chart.defaults.plugins.legend.labels.padding = 12;

// ============================================================
// DATA PROCESSING UTILITIES
// ============================================================

function getInspectionData() {
  return SAMPLE_INSPECTIONS || [];
}

function applyFilters(data) {
  const project = document.getElementById("filterProject")?.value || "all";
  const contractor = document.getElementById("filterContractor")?.value || "all";
  const risk = document.getElementById("filterRisk")?.value || "all";
  const days = document.getElementById("filterTimeRange")?.value || "all";

  return data.filter((d) => {
    if (project !== "all" && d.generalInfo.projectName !== project) return false;
    if (contractor !== "all" && d.generalInfo.contractor !== contractor) return false;
    if (risk !== "all" && d.overallAssessment.riskLevel !== risk) return false;
    if (days !== "all") {
      // Use the latest date in the dataset as "today" so the demo works on any machine
      const latestDate = _datasetLatestDate || new Date();
      const cutoff = new Date(latestDate);
      cutoff.setDate(cutoff.getDate() - parseInt(days));
      if (new Date(d.generalInfo.inspectionDate + "T00:00:00") < cutoff) return false;
    }
    return true;
  });
}

// Cached latest date in the dataset (computed once at init)
let _datasetLatestDate = null;
function computeDatasetLatestDate(data) {
  const dates = data.map((d) => d.generalInfo.inspectionDate).sort();
  _datasetLatestDate = dates.length > 0 ? new Date(dates[dates.length - 1] + "T23:59:59") : new Date();
}

function populateFilterDropdowns(data) {
  const projects = [...new Set(data.map((d) => d.generalInfo.projectName))].sort();
  const contractors = [...new Set(data.map((d) => d.generalInfo.contractor))].sort();

  const projectSelect = document.getElementById("filterProject");
  const contractorSelect = document.getElementById("filterContractor");

  projects.forEach((p) => {
    const opt = document.createElement("calcite-option");
    opt.value = p;
    opt.textContent = p;
    projectSelect.appendChild(opt);
  });

  contractors.forEach((c) => {
    const opt = document.createElement("calcite-option");
    opt.value = c;
    opt.textContent = c;
    contractorSelect.appendChild(opt);
  });
}

/** Count pass/fail/na across all items in a section across all inspections */
function getSectionStats(data, sectionKey) {
  let pass = 0, fail = 0, na = 0, total = 0;
  data.forEach((d) => {
    const section = d.inspectionResults[sectionKey];
    if (!section) return;
    Object.values(section).forEach((v) => {
      if (v === "pass") pass++;
      else if (v === "fail") fail++;
      else if (v === "na") na++;
      total++;
    });
  });
  return { pass, fail, na, total, applicable: pass + fail };
}

/** Get fail count per individual item across all inspections */
function getItemFailCounts(data) {
  const counts = {};
  data.forEach((d) => {
    Object.values(d.inspectionResults).forEach((section) => {
      Object.entries(section).forEach(([itemId, value]) => {
        if (!counts[itemId]) counts[itemId] = { fail: 0, total: 0 };
        if (value === "pass" || value === "fail") counts[itemId].total++;
        if (value === "fail") counts[itemId].fail++;
      });
    });
  });
  return counts;
}

/** Overall compliance = pass / (pass+fail) ignoring N/A */
function getOverallCompliance(data) {
  let pass = 0, fail = 0;
  data.forEach((d) => {
    Object.values(d.inspectionResults).forEach((section) => {
      Object.values(section).forEach((v) => {
        if (v === "pass") pass++;
        else if (v === "fail") fail++;
      });
    });
  });
  const total = pass + fail;
  return total > 0 ? ((pass / total) * 100).toFixed(1) : "0.0";
}

function getAverageRating(data) {
  if (data.length === 0) return "0.0";
  const sum = data.reduce((acc, d) => acc + parseFloat(d.overallAssessment.rating || 0), 0);
  return (sum / data.length).toFixed(1);
}

function getRiskCounts(data) {
  const counts = { low: 0, moderate: 0, high: 0, critical: 0 };
  data.forEach((d) => {
    const level = d.overallAssessment.riskLevel;
    if (counts.hasOwnProperty(level)) counts[level]++;
  });
  return counts;
}

function getStopWorkCount(data) {
  return data.filter((d) => d.overallAssessment.stopWorkIssued).length;
}

function getCorrectiveActionCount(data) {
  return data.filter((d) => d.overallAssessment.correctiveActionsRequired).length;
}

function getWeatherCounts(data) {
  const counts = {};
  data.forEach((d) => {
    const w = d.generalInfo.weather;
    counts[w] = (counts[w] || 0) + 1;
  });
  return counts;
}

/** Group inspections by date for trend chart */
function getInspectionsByDate(data) {
  const byDate = {};
  data.forEach((d) => {
    const date = d.generalInfo.inspectionDate;
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(d);
  });
  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, inspections]) => ({
      date,
      count: inspections.length,
      compliance: parseFloat(getOverallCompliance(inspections)),
    }));
}

// ============================================================
// KPI CARDS
// ============================================================

function renderKPIs(data) {
  const container = document.getElementById("kpiRow");
  container.innerHTML = "";

  const compliance = getOverallCompliance(data);
  const avgRating = getAverageRating(data);
  const riskCounts = getRiskCounts(data);
  const stopWork = getStopWorkCount(data);
  const corrective = getCorrectiveActionCount(data);

  const kpis = [
    {
      value: data.length,
      label: "Total Inspections",
      icon: "clipboard-check",
      color: "blue",
      trend: null,
    },
    {
      value: compliance + "%",
      label: "Overall Compliance",
      icon: "check-circle",
      color: parseFloat(compliance) >= 90 ? "green" : parseFloat(compliance) >= 75 ? "amber" : "red",
      trend: parseFloat(compliance) >= 85 ? { dir: "up", text: "Above target (85%)" } : { dir: "down", text: "Below target (85%)" },
    },
    {
      value: avgRating + " / 5",
      label: "Avg Safety Rating",
      icon: "star",
      color: parseFloat(avgRating) >= 4 ? "green" : parseFloat(avgRating) >= 3 ? "amber" : "red",
      trend: null,
    },
    {
      value: riskCounts.high + riskCounts.critical,
      label: "High / Critical Risk",
      icon: "exclamation-mark-triangle",
      color: (riskCounts.high + riskCounts.critical) > 0 ? "red" : "green",
      trend: null,
    },
    {
      value: corrective,
      label: "Corrective Actions",
      icon: "wrench",
      color: corrective > 0 ? "amber" : "green",
      trend: null,
    },
    {
      value: stopWork,
      label: "Stop Work Orders",
      icon: "x-octagon",
      color: stopWork > 0 ? "red" : "green",
      trend: null,
    },
  ];

  kpis.forEach((kpi) => {
    const card = document.createElement("div");
    card.className = `kpi-card ${kpi.color}`;
    card.innerHTML = `
      <div class="kpi-icon"><calcite-icon icon="${kpi.icon}" scale="l"></calcite-icon></div>
      <div class="kpi-value" style="color: ${getKpiColor(kpi.color)}">${kpi.value}</div>
      <div class="kpi-label">${kpi.label}</div>
      ${kpi.trend ? `<div class="kpi-trend ${kpi.trend.dir}">
        <calcite-icon icon="${kpi.trend.dir === "up" ? "arrow-up" : "arrow-down"}" scale="s"></calcite-icon>
        ${kpi.trend.text}
      </div>` : ""}
    `;
    container.appendChild(card);
  });
}

function getKpiColor(colorName) {
  const map = { blue: "#00a0e9", green: "#5ec26a", red: "#f05545", amber: "#f5e642", purple: "#a78bfa", teal: "#2dd4bf" };
  return map[colorName] || "#fff";
}

// ============================================================
// COMPLIANCE BY CATEGORY CHART (horizontal bar)
// ============================================================

function renderComplianceChart(data) {
  const ctx = document.getElementById("complianceChart").getContext("2d");
  if (chartInstances.compliance) chartInstances.compliance.destroy();

  const sections = Object.keys(SECTION_LABELS);
  const labels = sections.map((s) => SECTION_LABELS[s]);
  const rates = sections.map((s) => {
    const stats = getSectionStats(data, s);
    return stats.applicable > 0 ? ((stats.pass / stats.applicable) * 100).toFixed(1) : 0;
  });

  const barColors = rates.map((r) => {
    if (r >= 90) return "rgba(53,172,70,0.85)";
    if (r >= 75) return "rgba(237,211,23,0.85)";
    return "rgba(216,48,32,0.85)";
  });

  chartInstances.compliance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Compliance %",
        data: rates,
        backgroundColor: barColors,
        borderRadius: 4,
        borderSkipped: false,
        maxBarThickness: 32,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.parsed.x}% compliance`,
          },
        },
      },
      scales: {
        x: {
          min: 0,
          max: 100,
          grid: { color: "rgba(255,255,255,0.04)" },
          ticks: { callback: (v) => v + "%" },
        },
        y: {
          grid: { display: false },
        },
      },
    },
  });
}

// ============================================================
// RISK DISTRIBUTION DONUT CHART
// ============================================================

function renderRiskDonut(data) {
  const ctx = document.getElementById("riskDonutChart").getContext("2d");
  if (chartInstances.riskDonut) chartInstances.riskDonut.destroy();

  const riskCounts = getRiskCounts(data);
  const riskColors = {
    low: "#35ac46",
    moderate: "#edd317",
    high: "#f05545",
    critical: "#b91c1c",
  };

  chartInstances.riskDonut = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Low", "Moderate", "High", "Critical"],
      datasets: [{
        data: [riskCounts.low, riskCounts.moderate, riskCounts.high, riskCounts.critical],
        backgroundColor: [riskColors.low, riskColors.moderate, riskColors.high, riskColors.critical],
        borderWidth: 0,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "70%",
      plugins: {
        legend: { display: false },
      },
    },
  });

  // Custom legend
  const legend = document.getElementById("riskLegend");
  legend.innerHTML = "";
  const total = data.length || 1;
  [
    { label: "Low", count: riskCounts.low, color: riskColors.low },
    { label: "Moderate", count: riskCounts.moderate, color: riskColors.moderate },
    { label: "High", count: riskCounts.high, color: riskColors.high },
    { label: "Critical", count: riskCounts.critical, color: riskColors.critical },
  ].forEach((item) => {
    const row = document.createElement("div");
    row.className = "flex items-center justify-between text-xs px-2";
    row.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 rounded-full" style="background:${item.color}"></span>
        <span class="text-gray-400">${item.label}</span>
      </div>
      <div>
        <span class="font-semibold" style="color:${item.color}">${item.count}</span>
        <span class="text-gray-600 ml-1">(${((item.count / total) * 100).toFixed(0)}%)</span>
      </div>
    `;
    legend.appendChild(row);
  });
}

// ============================================================
// TREND LINE CHART
// ============================================================

function renderTrendChart(data) {
  const ctx = document.getElementById("trendChart").getContext("2d");
  if (chartInstances.trend) chartInstances.trend.destroy();

  const trend = getInspectionsByDate(data);
  const labels = trend.map((t) => {
    const d = new Date(t.date + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  });

  chartInstances.trend = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Inspections",
          data: trend.map((t) => t.count),
          borderColor: "#0079c1",
          backgroundColor: "rgba(0,121,193,0.1)",
          fill: true,
          tension: 0.3,
          pointRadius: 5,
          pointBackgroundColor: "#0079c1",
          pointBorderColor: "#161a22",
          pointBorderWidth: 2,
          yAxisID: "y",
        },
        {
          label: "Compliance %",
          data: trend.map((t) => t.compliance),
          borderColor: "#35ac46",
          backgroundColor: "rgba(53,172,70,0.08)",
          fill: true,
          tension: 0.3,
          pointRadius: 5,
          pointBackgroundColor: "#35ac46",
          pointBorderColor: "#161a22",
          pointBorderWidth: 2,
          yAxisID: "y1",
          hidden: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "top" },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              if (ctx.dataset.label === "Compliance %") return `Compliance: ${ctx.parsed.y}%`;
              return `Inspections: ${ctx.parsed.y}`;
            },
          },
        },
      },
      scales: {
        x: { grid: { color: "rgba(255,255,255,0.04)" } },
        y: {
          type: "linear",
          position: "left",
          beginAtZero: true,
          ticks: { stepSize: 1 },
          grid: { color: "rgba(255,255,255,0.04)" },
          title: { display: true, text: "Count", color: "#666" },
        },
        y1: {
          type: "linear",
          position: "right",
          min: 0,
          max: 100,
          grid: { display: false },
          ticks: { callback: (v) => v + "%" },
          title: { display: true, text: "Compliance %", color: "#666" },
          display: false,
        },
      },
    },
  });

  // Store reference for trend toggle (Part B)
  window._trendChart = chartInstances.trend;
}

// ============================================================
// WEATHER CHART (polar area)
// ============================================================

function renderWeatherChart(data) {
  const ctx = document.getElementById("weatherChart").getContext("2d");
  if (chartInstances.weather) chartInstances.weather.destroy();

  const weatherCounts = getWeatherCounts(data);
  const sortedEntries = Object.entries(weatherCounts).sort((a, b) => b[1] - a[1]);

  const weatherColors = {
    clear: "#f59e0b", partly_cloudy: "#a3e635", overcast: "#94a3b8",
    light_rain: "#60a5fa", heavy_rain: "#2563eb", snow: "#e2e8f0",
    fog: "#9ca3af", extreme_heat: "#ef4444", extreme_cold: "#06b6d4", high_wind: "#8b5cf6",
  };

  chartInstances.weather = new Chart(ctx, {
    type: "polarArea",
    data: {
      labels: sortedEntries.map(([k]) => WEATHER_LABELS[k] || k),
      datasets: [{
        data: sortedEntries.map(([, v]) => v),
        backgroundColor: sortedEntries.map(([k]) => (weatherColors[k] || "#666") + "99"),
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        r: {
          grid: { color: "rgba(255,255,255,0.06)" },
          ticks: { display: false },
        },
      },
    },
  });
}

// ============================================================
// TOP FAILING ITEMS
// ============================================================

function renderFailingItems(data) {
  const container = document.getElementById("failingItemsList");
  container.innerHTML = "";

  const counts = getItemFailCounts(data);
  const sorted = Object.entries(counts)
    .filter(([, v]) => v.fail > 0)
    .sort((a, b) => b[1].fail - a[1].fail)
    .slice(0, 8);

  if (sorted.length === 0) {
    container.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">No failures recorded.</p>';
    return;
  }

  const maxFails = sorted[0][1].fail;

  sorted.forEach(([itemId, stats]) => {
    const label = ITEM_LABELS[itemId] || itemId;
    const pct = stats.total > 0 ? ((stats.fail / stats.total) * 100).toFixed(0) : 0;
    const barWidth = maxFails > 0 ? ((stats.fail / maxFails) * 100).toFixed(0) : 0;

    const row = document.createElement("div");
    row.className = "mb-3";
    row.innerHTML = `
      <div class="flex justify-between items-center mb-1">
        <span class="text-xs text-gray-300 truncate" style="max-width:180px" title="${label}">${label}</span>
        <span class="text-xs font-semibold text-red-400">${stats.fail} fail${stats.fail !== 1 ? "s" : ""} <span class="text-gray-600">(${pct}%)</span></span>
      </div>
      <div class="w-full h-1.5 rounded-full" style="background:rgba(255,255,255,0.06)">
        <div class="h-full rounded-full" style="width:${barWidth}%; background: linear-gradient(90deg, #d83020, #f05545);"></div>
      </div>
    `;
    container.appendChild(row);
  });
}

// ============================================================
// COMPLIANCE BREAKDOWN SPARKLINES
// ============================================================

function renderComplianceBreakdown(data) {
  const container = document.getElementById("complianceBreakdown");
  container.innerHTML = "";

  const sections = Object.keys(SECTION_LABELS);

  sections.forEach((sectionKey) => {
    const stats = getSectionStats(data, sectionKey);
    const applicable = stats.pass + stats.fail;
    const passRate = applicable > 0 ? ((stats.pass / applicable) * 100).toFixed(1) : 0;
    const failRate = applicable > 0 ? ((stats.fail / applicable) * 100).toFixed(1) : 0;

    const barColor = passRate >= 90 ? "#35ac46" : passRate >= 75 ? "#edd317" : "#d83020";

    const row = document.createElement("div");
    row.className = "sparkline-row";
    row.innerHTML = `
      <div class="sparkline-label">${SECTION_LABELS[sectionKey]}</div>
      <div class="sparkline-bar-bg">
        <div class="sparkline-bar-fill" style="width:${passRate}%; background:${barColor}"></div>
      </div>
      <div class="sparkline-value" style="color:${barColor}">${passRate}%</div>
      <div style="flex:0 0 80px; text-align:right">
        <span class="text-xs text-green-500">${stats.pass}P</span>
        <span class="text-xs text-red-400 ml-1">${stats.fail}F</span>
        <span class="text-xs text-gray-600 ml-1">${stats.na}N</span>
      </div>
    `;
    container.appendChild(row);
  });
}

// ============================================================
// RECENT INSPECTIONS TABLE
// ============================================================

function renderInspectionTable(data) {
  const tbody = document.getElementById("inspectionTableBody");
  tbody.innerHTML = "";

  const sorted = [...data].sort((a, b) => b.generalInfo.inspectionDate.localeCompare(a.generalInfo.inspectionDate));

  sorted.forEach((d) => {
    const compliance = getOverallCompliance([d]);
    const dateStr = new Date(d.generalInfo.inspectionDate + "T00:00:00").toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });

    const riskLevel = d.overallAssessment.riskLevel;
    const typeLabel = INSPECTION_TYPE_LABELS[d.generalInfo.inspectionType] || d.generalInfo.inspectionType;

    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="whitespace-nowrap">${dateStr}</td>
      <td>${d.generalInfo.inspectorName}</td>
      <td class="max-w-[160px] truncate" title="${d.generalInfo.projectName}">${d.generalInfo.projectName}</td>
      <td class="max-w-[140px] truncate" title="${d.generalInfo.contractor}">${d.generalInfo.contractor}</td>
      <td>${typeLabel}</td>
      <td><span class="risk-badge ${riskLevel}">${riskLevel}</span></td>
      <td>${"&#9733;".repeat(parseInt(d.overallAssessment.rating))}${"&#9734;".repeat(5 - parseInt(d.overallAssessment.rating))}</td>
      <td>
        <span style="color:${parseFloat(compliance) >= 90 ? "#35ac46" : parseFloat(compliance) >= 75 ? "#edd317" : "#d83020"}">${compliance}%</span>
      </td>
      <td>${d.overallAssessment.stopWorkIssued ? '<span class="risk-badge critical">YES</span>' : '<span class="text-gray-600">No</span>'}</td>
    `;
    tbody.appendChild(row);
  });

  document.getElementById("tableCount").textContent = `Showing ${sorted.length} inspection${sorted.length !== 1 ? "s" : ""}`;
}

// ============================================================
// ARCGIS MAP WITH INSPECTION POINTS (Part B1)
// ============================================================

let mapView = null;
let mapGraphicsLayer = null;

function initInspectionMap() {
  require([
    "esri/Map",
    "esri/views/MapView",
    "esri/Graphic",
    "esri/layers/GraphicsLayer",
    "esri/widgets/Legend",
  ], function (Map, MapView, Graphic, GraphicsLayer, Legend) {
    // Store constructors globally for renderMapPoints
    window._MapGraphic = Graphic;

    mapGraphicsLayer = new GraphicsLayer({ title: "Inspections" });

    const map = new Map({
      basemap: "dark-gray-vector",
      layers: [mapGraphicsLayer],
    });

    mapView = new MapView({
      container: "inspectionMap",
      map: map,
      center: [-95.39, 29.76],
      zoom: 11,
      ui: { components: ["zoom"] },
      popup: {
        dockEnabled: true,
        dockOptions: { buttonEnabled: false, breakpoint: false, position: "bottom-right" },
      },
    });

    // Dark theme for the map view
    mapView.when(() => {
      renderMapPoints(filteredData);
    });
  });
}

function renderMapPoints(data) {
  if (!mapGraphicsLayer || !window._MapGraphic) return;
  mapGraphicsLayer.removeAll();

  const riskColorMap = {
    low: [53, 172, 70],
    moderate: [237, 211, 23],
    high: [240, 85, 69],
    critical: [185, 28, 28],
  };

  const riskSizeMap = { low: 10, moderate: 12, high: 14, critical: 18 };

  const withCoords = data.filter((d) => d.generalInfo.latitude && d.generalInfo.longitude);

  withCoords.forEach((d) => {
    const risk = d.overallAssessment.riskLevel || "moderate";
    const compliance = getOverallCompliance([d]);
    const dateStr = new Date(d.generalInfo.inspectionDate + "T00:00:00").toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
    const typeLabel = INSPECTION_TYPE_LABELS[d.generalInfo.inspectionType] || d.generalInfo.inspectionType;

    const point = {
      type: "point",
      longitude: parseFloat(d.generalInfo.longitude),
      latitude: parseFloat(d.generalInfo.latitude),
    };

    const symbol = {
      type: "simple-marker",
      color: riskColorMap[risk] || [0, 121, 193],
      outline: { color: [20, 24, 34, 200], width: 2 },
      size: riskSizeMap[risk] || 12,
    };

    const attributes = {
      inspector: d.generalInfo.inspectorName,
      project: d.generalInfo.projectName,
      contractor: d.generalInfo.contractor,
      date: dateStr,
      type: typeLabel,
      risk: risk.charAt(0).toUpperCase() + risk.slice(1),
      rating: d.overallAssessment.rating + " / 5",
      compliance: compliance + "%",
      workers: d.generalInfo.workerCount,
      stopWork: d.overallAssessment.stopWorkIssued ? "YES" : "No",
    };

    const popupTemplate = {
      title: "<span style='font-size:13px'>{project}</span>",
      content: `
        <table style="font-size:12px; width:100%; border-collapse:collapse;">
          <tr><td style="padding:3px 8px; color:#888;">Date</td><td style="padding:3px 8px; font-weight:600;">{date}</td></tr>
          <tr><td style="padding:3px 8px; color:#888;">Inspector</td><td style="padding:3px 8px;">{inspector}</td></tr>
          <tr><td style="padding:3px 8px; color:#888;">Contractor</td><td style="padding:3px 8px;">{contractor}</td></tr>
          <tr><td style="padding:3px 8px; color:#888;">Type</td><td style="padding:3px 8px;">{type}</td></tr>
          <tr><td style="padding:3px 8px; color:#888;">Risk Level</td><td style="padding:3px 8px; font-weight:700;">{risk}</td></tr>
          <tr><td style="padding:3px 8px; color:#888;">Rating</td><td style="padding:3px 8px;">{rating}</td></tr>
          <tr><td style="padding:3px 8px; color:#888;">Compliance</td><td style="padding:3px 8px; font-weight:700;">{compliance}</td></tr>
          <tr><td style="padding:3px 8px; color:#888;">Workers</td><td style="padding:3px 8px;">{workers}</td></tr>
          <tr><td style="padding:3px 8px; color:#888;">Stop Work</td><td style="padding:3px 8px;">{stopWork}</td></tr>
        </table>
      `,
    };

    const graphic = new window._MapGraphic({
      geometry: point,
      symbol: symbol,
      attributes: attributes,
      popupTemplate: popupTemplate,
    });

    mapGraphicsLayer.add(graphic);
  });

  // Fit map extent to points if we have them
  if (withCoords.length > 1 && mapView) {
    mapView.goTo(mapGraphicsLayer.graphics.toArray(), { padding: 60, duration: 800 }).catch(() => {});
  } else if (withCoords.length === 1 && mapView) {
    mapView.goTo({ center: [parseFloat(withCoords[0].generalInfo.longitude), parseFloat(withCoords[0].generalInfo.latitude)], zoom: 13 }, { duration: 800 }).catch(() => {});
  }

  // Update count label
  const mapCount = document.getElementById("mapPointCount");
  if (mapCount) {
    mapCount.textContent = `${withCoords.length} inspection${withCoords.length !== 1 ? "s" : ""} mapped`;
  }
}

// ============================================================
// INSPECTOR LEADERBOARD (Part B1)
// ============================================================

function getInspectorStats(data) {
  const stats = {};
  data.forEach((d) => {
    const name = d.generalInfo.inspectorName;
    if (!stats[name]) {
      stats[name] = { name, count: 0, totalRating: 0, totalPass: 0, totalApplicable: 0, role: d.generalInfo.inspectorRole };
    }
    stats[name].count++;
    stats[name].totalRating += parseFloat(d.overallAssessment.rating || 0);

    // Count pass/fail across all sections for this inspection
    Object.values(d.inspectionResults).forEach((section) => {
      Object.values(section).forEach((v) => {
        if (v === "pass") { stats[name].totalPass++; stats[name].totalApplicable++; }
        else if (v === "fail") { stats[name].totalApplicable++; }
      });
    });
  });
  return Object.values(stats).map((s) => ({
    ...s,
    avgRating: (s.totalRating / s.count).toFixed(1),
    compliance: s.totalApplicable > 0 ? ((s.totalPass / s.totalApplicable) * 100).toFixed(1) : "0.0",
  }));
}

const ROLE_LABELS = {
  safety_officer: "Safety Officer",
  site_superintendent: "Superintendent",
  foreman: "Foreman",
  project_manager: "PM",
  safety_engineer: "Safety Engineer",
  quality_inspector: "QC Inspector",
  craft_worker: "Craft Worker",
  subcontractor_rep: "Sub Rep",
  other: "Other",
};

function renderInspectorLeaderboard(data) {
  const container = document.getElementById("inspectorLeaderboard");
  container.innerHTML = "";

  const inspectors = getInspectorStats(data).sort((a, b) => b.count - a.count);

  if (inspectors.length === 0) {
    container.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">No inspectors found.</p>';
    return;
  }

  // Medal colors for top 3
  const medals = ["#f59e0b", "#94a3b8", "#b45309"];

  inspectors.slice(0, 5).forEach((inspector, idx) => {
    const compColor = parseFloat(inspector.compliance) >= 90 ? "#35ac46" : parseFloat(inspector.compliance) >= 75 ? "#edd317" : "#d83020";
    const roleLabel = ROLE_LABELS[inspector.role] || inspector.role;

    const row = document.createElement("div");
    row.className = "flex items-center gap-3 py-2" + (idx < inspectors.length - 1 ? " border-b border-gray-800" : "");
    row.innerHTML = `
      <div class="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
           style="background:${idx < 3 ? medals[idx] + "22" : "rgba(255,255,255,0.04)"}; color:${idx < 3 ? medals[idx] : "#666"};">
        ${idx + 1}
      </div>
      <div class="flex-grow min-w-0">
        <div class="text-sm font-medium text-gray-200 truncate">${inspector.name}</div>
        <div class="text-xs text-gray-500">${roleLabel}</div>
      </div>
      <div class="text-right flex-shrink-0">
        <div class="text-sm font-semibold" style="color:${compColor}">${inspector.compliance}%</div>
        <div class="text-xs text-gray-500">${inspector.count} insp.</div>
      </div>
    `;
    container.appendChild(row);
  });
}

// ============================================================
// TREND CHART TOGGLE (Part B1)
// ============================================================

function initTrendToggle() {
  const toggle = document.getElementById("trendToggle");
  if (!toggle) return;

  toggle.addEventListener("calciteSegmentedControlChange", (e) => {
    const chart = chartInstances.trend;
    if (!chart) return;

    const selected = toggle.querySelector("calcite-segmented-control-item[checked]");
    const mode = selected ? selected.value : "count";

    if (mode === "count") {
      // Show inspections dataset, hide compliance
      chart.data.datasets[0].hidden = false;
      chart.data.datasets[1].hidden = true;
      chart.options.scales.y.display = true;
      chart.options.scales.y1.display = false;
    } else {
      // Show compliance dataset, hide inspections
      chart.data.datasets[0].hidden = true;
      chart.data.datasets[1].hidden = false;
      chart.options.scales.y.display = false;
      chart.options.scales.y1.display = true;
    }
    chart.update();
  });
}

// ============================================================
// AUTOMATED REPORT GENERATION (Part B2)
// ============================================================

function generateReport(data) {
  const content = document.getElementById("reportContent");
  if (!content) return;

  const compliance = getOverallCompliance(data);
  const avgRating = getAverageRating(data);
  const riskCounts = getRiskCounts(data);
  const stopWork = getStopWorkCount(data);
  const corrective = getCorrectiveActionCount(data);
  const inspectors = getInspectorStats(data).sort((a, b) => b.count - a.count);
  const sections = Object.keys(SECTION_LABELS);

  // Determine date range
  const dates = data.map((d) => d.generalInfo.inspectionDate).sort();
  const startDate = dates.length > 0 ? new Date(dates[0] + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "--";
  const endDate = dates.length > 0 ? new Date(dates[dates.length - 1] + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "--";
  document.getElementById("reportDateRange").textContent = `Reporting period: ${startDate} \u2013 ${endDate}`;

  // Find worst and best sections
  const sectionCompliance = sections.map((s) => {
    const stats = getSectionStats(data, s);
    const applicable = stats.pass + stats.fail;
    return {
      key: s,
      label: SECTION_LABELS[s],
      rate: applicable > 0 ? ((stats.pass / applicable) * 100) : 100,
      pass: stats.pass,
      fail: stats.fail,
      na: stats.na,
    };
  }).sort((a, b) => a.rate - b.rate);

  const worstSections = sectionCompliance.filter((s) => s.fail > 0).slice(0, 3);
  const bestSections = [...sectionCompliance].sort((a, b) => b.rate - a.rate).slice(0, 3);

  // Top failing items
  const failCounts = getItemFailCounts(data);
  const topFails = Object.entries(failCounts)
    .filter(([, v]) => v.fail > 0)
    .sort((a, b) => b[1].fail - a[1].fail)
    .slice(0, 5);

  // Projects summary
  const projectMap = {};
  data.forEach((d) => {
    const p = d.generalInfo.projectName;
    if (!projectMap[p]) projectMap[p] = { count: 0, totalPass: 0, totalApplicable: 0, risks: [] };
    projectMap[p].count++;
    projectMap[p].risks.push(d.overallAssessment.riskLevel);
    Object.values(d.inspectionResults).forEach((section) => {
      Object.values(section).forEach((v) => {
        if (v === "pass") { projectMap[p].totalPass++; projectMap[p].totalApplicable++; }
        else if (v === "fail") { projectMap[p].totalApplicable++; }
      });
    });
  });

  // Determine overall status color and label
  const compVal = parseFloat(compliance);
  let statusColor, statusLabel, statusIcon;
  if (compVal >= 90 && stopWork === 0) {
    statusColor = "#35ac46"; statusLabel = "GOOD"; statusIcon = "check-circle-f";
  } else if (compVal >= 75) {
    statusColor = "#edd317"; statusLabel = "CAUTION"; statusIcon = "exclamation-mark-triangle-f";
  } else {
    statusColor = "#d83020"; statusLabel = "ACTION REQUIRED"; statusIcon = "exclamation-mark-circle-f";
  }

  content.innerHTML = `
    <!-- Overall Status Banner -->
    <div class="report-section" style="border-color:${statusColor}44; background:${statusColor}08">
      <div class="flex items-center gap-3 mb-2">
        <calcite-icon icon="${statusIcon}" scale="l" style="color:${statusColor}"></calcite-icon>
        <div>
          <h4 style="color:${statusColor}; margin:0">Overall Safety Status: ${statusLabel}</h4>
          <p class="text-sm text-gray-400 mt-1">Based on ${data.length} inspection${data.length !== 1 ? "s" : ""} across ${Object.keys(projectMap).length} project${Object.keys(projectMap).length !== 1 ? "s" : ""}</p>
        </div>
      </div>
    </div>

    <!-- Key Metrics -->
    <div class="report-section">
      <h4>Key Performance Indicators</h4>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:12px;">
        ${reportMetricCard("Total Inspections", data.length, "#00a0e9")}
        ${reportMetricCard("Overall Compliance", compliance + "%", compVal >= 90 ? "#35ac46" : compVal >= 75 ? "#edd317" : "#d83020")}
        ${reportMetricCard("Avg Safety Rating", avgRating + " / 5", parseFloat(avgRating) >= 4 ? "#35ac46" : "#edd317")}
        ${reportMetricCard("Stop Work Orders", stopWork, stopWork > 0 ? "#d83020" : "#35ac46")}
        ${reportMetricCard("Corrective Actions", corrective, corrective > 0 ? "#edd317" : "#35ac46")}
        ${reportMetricCard("Unique Inspectors", inspectors.length, "#a78bfa")}
      </div>
    </div>

    <!-- Risk Distribution -->
    <div class="report-section">
      <h4>Risk Distribution</h4>
      <div class="flex flex-wrap gap-4">
        ${reportRiskBar("Low", riskCounts.low, data.length, "#35ac46")}
        ${reportRiskBar("Moderate", riskCounts.moderate, data.length, "#edd317")}
        ${reportRiskBar("High", riskCounts.high, data.length, "#f05545")}
        ${reportRiskBar("Critical", riskCounts.critical, data.length, "#b91c1c")}
      </div>
    </div>

    <!-- Category Compliance -->
    <div class="report-section">
      <h4>Compliance by Category</h4>
      <table style="width:100%; font-size:0.8rem; border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.1)">
            <th style="text-align:left; padding:6px 8px; color:#888;">Category</th>
            <th style="text-align:right; padding:6px 8px; color:#888;">Pass</th>
            <th style="text-align:right; padding:6px 8px; color:#888;">Fail</th>
            <th style="text-align:right; padding:6px 8px; color:#888;">N/A</th>
            <th style="text-align:right; padding:6px 8px; color:#888;">Compliance</th>
          </tr>
        </thead>
        <tbody>
          ${sectionCompliance.map((s) => {
            const rate = s.rate.toFixed(1);
            const color = s.rate >= 90 ? "#35ac46" : s.rate >= 75 ? "#edd317" : "#d83020";
            return `<tr style="border-bottom:1px solid rgba(255,255,255,0.04)">
              <td style="padding:6px 8px; color:#ccc;">${s.label}</td>
              <td style="padding:6px 8px; text-align:right; color:#35ac46;">${s.pass}</td>
              <td style="padding:6px 8px; text-align:right; color:#f05545;">${s.fail}</td>
              <td style="padding:6px 8px; text-align:right; color:#666;">${s.na}</td>
              <td style="padding:6px 8px; text-align:right; font-weight:700; color:${color};">${rate}%</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>

    <!-- Areas of Concern -->
    ${worstSections.length > 0 ? `
    <div class="report-section" style="border-color:rgba(216,48,32,0.2)">
      <h4 style="color:#f05545">Areas of Concern</h4>
      ${worstSections.map((s) => `
        <div class="mb-3">
          <div class="flex justify-between items-center">
            <span class="text-sm text-gray-300">${s.label}</span>
            <span class="text-sm font-bold" style="color:${s.rate >= 75 ? "#edd317" : "#f05545"}">${s.rate.toFixed(1)}% compliance</span>
          </div>
          <div class="w-full h-1.5 rounded-full mt-1" style="background:rgba(255,255,255,0.06)">
            <div class="h-full rounded-full" style="width:${s.rate}%; background:${s.rate >= 75 ? "#edd317" : "#f05545"}"></div>
          </div>
        </div>
      `).join("")}
    </div>` : ""}

    <!-- Top Failing Checklist Items -->
    ${topFails.length > 0 ? `
    <div class="report-section" style="border-color:rgba(216,48,32,0.2)">
      <h4 style="color:#f05545">Top Failing Checklist Items</h4>
      <ol class="text-sm text-gray-300 space-y-2 pl-4" style="list-style:decimal">
        ${topFails.map(([itemId, stats]) => {
          const pct = stats.total > 0 ? ((stats.fail / stats.total) * 100).toFixed(0) : 0;
          return `<li><span class="text-gray-200">${ITEM_LABELS[itemId] || itemId}</span> &mdash; <span class="text-red-400 font-semibold">${stats.fail} failure${stats.fail !== 1 ? "s" : ""} (${pct}% fail rate)</span></li>`;
        }).join("")}
      </ol>
    </div>` : ""}

    <!-- Positive Highlights -->
    <div class="report-section" style="border-color:rgba(53,172,70,0.2)">
      <h4 style="color:#35ac46">Positive Highlights</h4>
      ${bestSections.filter((s) => s.rate >= 90).length > 0 ? `
        <p class="text-sm text-gray-300 mb-2">The following categories achieved <span class="text-green-400 font-semibold">&ge;90% compliance</span>:</p>
        <ul class="text-sm text-gray-300 space-y-1 pl-4" style="list-style:disc">
          ${bestSections.filter((s) => s.rate >= 90).map((s) => `<li>${s.label} &mdash; <span class="text-green-400 font-semibold">${s.rate.toFixed(1)}%</span></li>`).join("")}
        </ul>
      ` : '<p class="text-sm text-gray-400">No categories achieved 90% compliance in this period.</p>'}
      ${getPositiveObservations(data).length > 0 ? `
        <p class="text-sm text-gray-300 mt-3 mb-2">Inspector observations:</p>
        <ul class="text-sm text-gray-400 space-y-1 pl-4" style="list-style:disc">
          ${getPositiveObservations(data).slice(0, 4).map((obs) => `<li>"${obs}"</li>`).join("")}
        </ul>
      ` : ""}
    </div>

    <!-- Project Breakdown -->
    <div class="report-section">
      <h4>Project Summary</h4>
      <table style="width:100%; font-size:0.8rem; border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.1)">
            <th style="text-align:left; padding:6px 8px; color:#888;">Project</th>
            <th style="text-align:right; padding:6px 8px; color:#888;">Inspections</th>
            <th style="text-align:right; padding:6px 8px; color:#888;">Compliance</th>
            <th style="text-align:right; padding:6px 8px; color:#888;">Highest Risk</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(projectMap).map(([name, p]) => {
            const pCompliance = p.totalApplicable > 0 ? ((p.totalPass / p.totalApplicable) * 100).toFixed(1) : "N/A";
            const pColor = parseFloat(pCompliance) >= 90 ? "#35ac46" : parseFloat(pCompliance) >= 75 ? "#edd317" : "#d83020";
            const worstRisk = getWorstRisk(p.risks);
            const riskBadgeColor = { low: "#35ac46", moderate: "#edd317", high: "#f05545", critical: "#b91c1c" }[worstRisk] || "#888";
            return `<tr style="border-bottom:1px solid rgba(255,255,255,0.04)">
              <td style="padding:6px 8px; color:#ccc; max-width:200px;" class="truncate" title="${name}">${name}</td>
              <td style="padding:6px 8px; text-align:right; color:#aaa;">${p.count}</td>
              <td style="padding:6px 8px; text-align:right; font-weight:600; color:${pColor};">${pCompliance}%</td>
              <td style="padding:6px 8px; text-align:right;"><span style="color:${riskBadgeColor}; font-weight:600; text-transform:uppercase; font-size:0.7rem;">${worstRisk}</span></td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>

    <!-- Inspector Activity -->
    <div class="report-section">
      <h4>Inspector Activity</h4>
      <table style="width:100%; font-size:0.8rem; border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.1)">
            <th style="text-align:left; padding:6px 8px; color:#888;">Inspector</th>
            <th style="text-align:left; padding:6px 8px; color:#888;">Role</th>
            <th style="text-align:right; padding:6px 8px; color:#888;">Inspections</th>
            <th style="text-align:right; padding:6px 8px; color:#888;">Avg Rating</th>
            <th style="text-align:right; padding:6px 8px; color:#888;">Compliance</th>
          </tr>
        </thead>
        <tbody>
          ${inspectors.map((ins) => {
            const cColor = parseFloat(ins.compliance) >= 90 ? "#35ac46" : parseFloat(ins.compliance) >= 75 ? "#edd317" : "#d83020";
            return `<tr style="border-bottom:1px solid rgba(255,255,255,0.04)">
              <td style="padding:6px 8px; color:#ccc;">${ins.name}</td>
              <td style="padding:6px 8px; color:#888;">${ROLE_LABELS[ins.role] || ins.role}</td>
              <td style="padding:6px 8px; text-align:right; color:#aaa;">${ins.count}</td>
              <td style="padding:6px 8px; text-align:right; color:#aaa;">${ins.avgRating}</td>
              <td style="padding:6px 8px; text-align:right; font-weight:600; color:${cColor};">${ins.compliance}%</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>

    <!-- Corrective Actions Log -->
    ${corrective > 0 ? `
    <div class="report-section" style="border-color:rgba(237,211,23,0.2)">
      <h4 style="color:#edd317">Open Corrective Actions</h4>
      ${data.filter((d) => d.overallAssessment.correctiveActionsRequired).map((d) => {
        const dateStr = new Date(d.generalInfo.inspectionDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const priorityColors = { immediate: "#d83020", today: "#f05545", "24hours": "#edd317", week: "#888" };
        const prio = d.overallAssessment.correctionPriority || "today";
        return `<div class="mb-3 p-3 rounded" style="background:rgba(255,255,255,0.02); border-left:3px solid ${priorityColors[prio] || "#888"}">
          <div class="flex justify-between items-start mb-1">
            <span class="text-sm font-semibold text-gray-200">${d.generalInfo.projectName}</span>
            <span class="text-xs px-2 py-0.5 rounded" style="background:${priorityColors[prio]}22; color:${priorityColors[prio]};">${prio.toUpperCase()}</span>
          </div>
          <p class="text-xs text-gray-400 mb-1">${dateStr} &bull; ${d.generalInfo.inspectorName}</p>
          <p class="text-sm text-gray-300">${d.overallAssessment.correctiveActions}</p>
        </div>`;
      }).join("")}
    </div>` : ""}

    <!-- Recommendations -->
    <div class="report-section">
      <h4>Automated Recommendations</h4>
      <ul class="text-sm text-gray-300 space-y-2 pl-4" style="list-style:disc">
        ${generateRecommendations(data, sectionCompliance, riskCounts, stopWork).map((r) => `<li>${r}</li>`).join("")}
      </ul>
    </div>

    <!-- Report Footer -->
    <div class="mt-6 pt-4 border-t border-gray-700 text-center">
      <p class="text-xs text-gray-500">This report was automatically generated by the AEC Safety Inspection Dashboard.</p>
      <p class="text-xs text-gray-600 mt-1">Generated on ${new Date().toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</p>
    </div>
  `;
}

// Report helper: metric card HTML
function reportMetricCard(label, value, color) {
  return `<div style="background:rgba(255,255,255,0.03); border-radius:8px; padding:12px; text-align:center;">
    <div style="font-size:1.4rem; font-weight:700; color:${color};">${value}</div>
    <div style="font-size:0.7rem; color:#888; text-transform:uppercase; letter-spacing:0.04em; margin-top:4px;">${label}</div>
  </div>`;
}

// Report helper: risk bar HTML
function reportRiskBar(label, count, total, color) {
  const pct = total > 0 ? ((count / total) * 100).toFixed(0) : 0;
  return `<div style="flex:1; min-width:100px;">
    <div class="flex justify-between text-xs mb-1">
      <span style="color:${color}">${label}</span>
      <span class="text-gray-400">${count} (${pct}%)</span>
    </div>
    <div style="height:6px; background:rgba(255,255,255,0.06); border-radius:3px; overflow:hidden;">
      <div style="height:100%; width:${pct}%; background:${color}; border-radius:3px;"></div>
    </div>
  </div>`;
}

// Report helper: get worst risk from an array of risk levels
function getWorstRisk(risks) {
  const order = ["critical", "high", "moderate", "low"];
  for (const level of order) {
    if (risks.includes(level)) return level;
  }
  return "low";
}

// Report helper: extract positive observations
function getPositiveObservations(data) {
  return data
    .map((d) => d.overallAssessment.positiveObservations)
    .filter((obs) => obs && obs.trim().length > 10);
}

// Report helper: generate smart recommendations based on data
function generateRecommendations(data, sectionCompliance, riskCounts, stopWork) {
  const recs = [];

  // Low compliance sections
  const lowSections = sectionCompliance.filter((s) => s.rate < 80 && s.fail > 0);
  if (lowSections.length > 0) {
    recs.push(`Schedule targeted safety stand-downs for <strong>${lowSections.map((s) => s.label).join(", ")}</strong> \u2014 these categories are below the 80% compliance threshold.`);
  }

  // Critical / stop work
  if (riskCounts.critical > 0 || stopWork > 0) {
    recs.push(`<strong>${riskCounts.critical} critical-risk inspection${riskCounts.critical !== 1 ? "s" : ""}</strong> and <strong>${stopWork} stop work order${stopWork !== 1 ? "s" : ""}</strong> were recorded. Conduct root-cause analysis and verify all corrective actions are closed out before resuming full operations.`);
  }

  // High-risk trend
  if (riskCounts.high + riskCounts.critical > data.length * 0.3) {
    recs.push("More than 30% of inspections were rated High or Critical risk. Consider increasing inspection frequency and deploying additional safety personnel.");
  }

  // PPE specific
  const ppeStats = sectionCompliance.find((s) => s.key === "ppe");
  if (ppeStats && ppeStats.rate < 90) {
    recs.push(`PPE compliance is at <strong>${ppeStats.rate.toFixed(1)}%</strong>. Reinforce PPE requirements during daily toolbox talks and consider posting visual reminders at site entry points.`);
  }

  // Fall protection specific
  const fpStats = sectionCompliance.find((s) => s.key === "fallProtection");
  if (fpStats && fpStats.rate < 85) {
    recs.push(`Fall protection compliance (<strong>${fpStats.rate.toFixed(1)}%</strong>) is below the 85% target. This is an OSHA Focus Four hazard \u2014 prioritize guardrail installation and harness inspection programs.`);
  }

  // Positive reinforcement
  const excellent = sectionCompliance.filter((s) => s.rate >= 95);
  if (excellent.length > 0) {
    recs.push(`Recognize teams for excellent performance in <strong>${excellent.map((s) => s.label).join(", ")}</strong> (${"\u2265"}95% compliance). Positive reinforcement drives sustained safety culture.`);
  }

  // Inspector coverage
  const inspectors = getInspectorStats(data);
  if (data.length > 0 && inspectors.length < 3) {
    recs.push("Only " + inspectors.length + " inspector(s) contributed during this period. Consider cross-training additional personnel to ensure consistent audit coverage.");
  }

  // Default if no issues
  if (recs.length === 0) {
    recs.push("All safety metrics are within acceptable thresholds. Continue current inspection cadence and maintain safety awareness programs.");
  }

  return recs;
}

// Report modal open/close/print handlers
function initReportModal() {
  const overlay = document.getElementById("reportOverlay");
  const openBtn = document.getElementById("generateReportBtn");
  const closeBtn = document.getElementById("closeReportBtn");
  const printBtn = document.getElementById("printReportBtn");

  if (openBtn) {
    openBtn.addEventListener("click", () => {
      generateReport(filteredData);
      overlay.classList.add("active");
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      overlay.classList.remove("active");
    });
  }

  // Close on overlay background click
  if (overlay) {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.classList.remove("active");
    });
  }

  // Close on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("active")) {
      overlay.classList.remove("active");
    }
  });

  if (printBtn) {
    printBtn.addEventListener("click", () => {
      window.print();
    });
  }
}

// ============================================================
// FILTER EVENT HANDLERS
// ============================================================

function onFilterChange() {
  const allData = getInspectionData();
  filteredData = applyFilters(allData);
  renderAll(filteredData);
}

function initFilterListeners() {
  ["filterProject", "filterContractor", "filterRisk", "filterTimeRange"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("calciteSelectChange", onFilterChange);
  });
}

// ============================================================
// RENDER ALL
// ============================================================

function renderAll(data) {
  renderKPIs(data);
  renderComplianceChart(data);
  renderRiskDonut(data);
  renderTrendChart(data);
  renderWeatherChart(data);
  renderFailingItems(data);
  renderComplianceBreakdown(data);
  renderInspectionTable(data);
  renderInspectorLeaderboard(data);
  renderMapPoints(data);
}

// ============================================================
// INITIALIZE
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  customElements.whenDefined("calcite-select").then(() => {
    const allData = getInspectionData();
    computeDatasetLatestDate(allData);
    populateFilterDropdowns(allData);
    filteredData = applyFilters(allData);
    initFilterListeners();
    initTrendToggle();
    initReportModal();
    initInspectionMap();
    renderAll(filteredData);
  });
});
