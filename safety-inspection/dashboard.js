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
  const days = document.getElementById("filterTimeRange")?.value || "30";

  return data.filter((d) => {
    if (project !== "all" && d.generalInfo.projectName !== project) return false;
    if (contractor !== "all" && d.generalInfo.contractor !== contractor) return false;
    if (risk !== "all" && d.overallAssessment.riskLevel !== risk) return false;
    if (days !== "all") {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - parseInt(days));
      if (new Date(d.generalInfo.inspectionDate) < cutoff) return false;
    }
    return true;
  });
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
    populateFilterDropdowns(allData);
    filteredData = applyFilters(allData);
    initFilterListeners();
    initTrendToggle();
    initInspectionMap();
    renderAll(filteredData);
  });
});
