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
let _currentPhotoArray = [];
let _lastTableData = [];
let _currentDetailRecord = null;

const STOCK_PHOTOS = {
  hazard: [
    "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400&h=300&fit=crop",
    "https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=400&h=300&fit=crop",
    "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=400&h=300&fit=crop",
    "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?w=400&h=300&fit=crop",
    "https://images.unsplash.com/photo-1590644365607-1c5e64e6f803?w=400&h=300&fit=crop",
    "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=400&h=300&fit=crop",
    "https://images.unsplash.com/photo-1513467535987-fd81bc7d62f8?w=400&h=300&fit=crop",
    "https://images.unsplash.com/photo-1578496781379-7dcfb995293d?w=400&h=300&fit=crop",
  ],
  positive: [
    "https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=400&h=300&fit=crop",
    "https://images.unsplash.com/photo-1572981779307-38b8cabb2407?w=400&h=300&fit=crop",
    "https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=400&h=300&fit=crop",
    "https://images.unsplash.com/photo-1531834685032-c34bf0d84c77?w=400&h=300&fit=crop",
    "https://images.unsplash.com/photo-1587582423116-ec07293f0395?w=400&h=300&fit=crop",
    "https://images.unsplash.com/photo-1605117882932-f9e32b03fea9?w=400&h=300&fit=crop",
  ],
  general: [
    "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=400&h=300&fit=crop",
    "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=400&h=300&fit=crop",
    "https://images.unsplash.com/photo-1429497419816-9ca5cfb4571a?w=400&h=300&fit=crop",
    "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400&h=300&fit=crop",
    "https://images.unsplash.com/photo-1545259741-2266e5f0e3e1?w=400&h=300&fit=crop",
    "https://images.unsplash.com/photo-1585003791732-ced28e78491c?w=400&h=300&fit=crop",
  ],
};

function getStockPhotoUrl(type, text) {
  const arr = STOCK_PHOTOS[type] || STOCK_PHOTOS.general;
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) - hash) + text.charCodeAt(i);
  return arr[Math.abs(hash) % arr.length];
}

function getGradientForType(type) {
  const map = {
    hazard: "linear-gradient(135deg, #E8413C, #a8302c)",
    positive: "linear-gradient(135deg, #8DC63F, #5a8a25)",
    general: "linear-gradient(135deg, #44C8C1, #003B4D)",
  };
  return map[type] || map.general;
}

// Chart.js global defaults for dark theme (applied at init to ensure Chart.js is loaded)
function applyChartDefaults() {
  if (typeof Chart === "undefined") return;
  Chart.defaults.color = "#ffffff";
  Chart.defaults.borderColor = "rgba(255,255,255,0.18)";
  Chart.defaults.font.family = "'Avenir Next', 'Avenir', 'Helvetica Neue', sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.font.weight = "500";
  Chart.defaults.plugins.legend.labels.boxWidth = 12;
  Chart.defaults.plugins.legend.labels.padding = 14;
  Chart.defaults.plugins.legend.labels.color = "#ffffff";
}

// ============================================================
// FEATURE SERVICE INTEGRATION
// ============================================================

/**
 * Authenticate with ArcGIS Enterprise using the configured auth mode.
 * Returns a token string or null if auth is not needed.
 */
async function authenticateEnterprise() {
  const config = DASHBOARD_CONFIG;

  if (config.AUTH_MODE === "none") return null;

  if (config.AUTH_MODE === "token") return config.AUTH_TOKEN || null;

  // "identity-manager" mode — use ArcGIS JS API IdentityManager
  return new Promise((resolve, reject) => {
    require([
      "esri/identity/IdentityManager",
      "esri/identity/OAuthInfo",
    ], function (IdentityManager, OAuthInfo) {
      // Register the portal so the sign-in popup targets the right server
      IdentityManager.registerServers([{
        server: config.PORTAL_URL,
        hasServer: true,
      }]);

      // Request credentials — this will show the Enterprise login popup
      IdentityManager.getCredential(config.PORTAL_URL + "/sharing/rest")
        .then(function (credential) {
          resolve(credential.token);
        })
        .catch(function (err) {
          console.warn("Authentication cancelled or failed:", err);
          reject(err);
        });
    });
  });
}

/**
 * Fetch all records from the Feature Service with pagination support.
 */
async function fetchFromFeatureService(token) {
  const config = DASHBOARD_CONFIG;
  const url = config.FEATURE_SERVICE_URL;

  if (!url) throw new Error("FEATURE_SERVICE_URL is not configured.");

  const allFeatures = [];
  let offset = 0;
  const batchSize = config.MAX_RECORDS || 2000;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({
      where: "1=1",
      outFields: "*",
      f: "json",
      resultOffset: String(offset),
      resultRecordCount: String(batchSize),
      orderByFields: config.FIELD_MAP.inspectionDate + " DESC",
    });

    if (token) params.append("token", token);

    const response = await fetch(url + "/query?" + params.toString());
    if (!response.ok) throw new Error("Feature Service returned HTTP " + response.status);

    const json = await response.json();
    if (json.error) throw new Error(json.error.message || "Feature Service query error");

    const features = json.features || [];
    allFeatures.push(...features);

    // Check if there are more records (exceededTransferLimit)
    hasMore = json.exceededTransferLimit === true && features.length > 0;
    offset += features.length;
  }

  return allFeatures;
}

/**
 * Transform a single Feature Service record (attributes object) into the
 * dashboard's expected record structure using DASHBOARD_CONFIG.FIELD_MAP.
 */
function transformFeatureServiceRecord(attributes) {
  const fm = DASHBOARD_CONFIG.FIELD_MAP;

  // Helper: get a mapped value (returns empty string if field not mapped or null)
  function val(key) {
    const fieldName = fm[key];
    if (!fieldName || attributes[fieldName] === undefined || attributes[fieldName] === null) return "";
    return String(attributes[fieldName]);
  }

  // Helper: get a checklist value — normalise to "pass"/"fail"/"na"
  function checkVal(key) {
    const raw = val(key).toLowerCase().trim();
    if (raw === "pass" || raw === "yes" || raw === "compliant" || raw === "1") return "pass";
    if (raw === "fail" || raw === "no" || raw === "non-compliant" || raw === "0") return "fail";
    return "na";
  }

  // Parse inspection date from epoch ms or string
  let inspectionDate = "";
  const rawDate = fm.inspectionDate ? attributes[fm.inspectionDate] : null;
  if (rawDate !== null && rawDate !== undefined) {
    if (typeof rawDate === "number") {
      inspectionDate = new Date(rawDate).toISOString().split("T")[0];
    } else {
      // Try to parse as string date
      const d = new Date(rawDate);
      inspectionDate = isNaN(d.getTime()) ? String(rawDate) : d.toISOString().split("T")[0];
    }
  }

  // Parse time
  let inspectionTime = "";
  const rawTime = fm.inspectionTime ? attributes[fm.inspectionTime] : null;
  if (rawTime !== null && rawTime !== undefined) {
    if (typeof rawTime === "number") {
      const td = new Date(rawTime);
      inspectionTime = td.getHours().toString().padStart(2, "0") + ":" + td.getMinutes().toString().padStart(2, "0");
    } else {
      inspectionTime = String(rawTime);
    }
  }

  // Build inspection results sections
  const inspectionResults = {
    ppe: {
      ppe_hardhat: checkVal("ppe_hardhat"),
      ppe_safety_glasses: checkVal("ppe_safety_glasses"),
      ppe_highvis: checkVal("ppe_highvis"),
      ppe_gloves: checkVal("ppe_gloves"),
      ppe_steel_toe: checkVal("ppe_steel_toe"),
      ppe_hearing: checkVal("ppe_hearing"),
      ppe_respiratory: checkVal("ppe_respiratory"),
      ppe_face_shield: checkVal("ppe_face_shield"),
      ppe_fall_harness: checkVal("ppe_fall_harness"),
      ppe_condition: checkVal("ppe_condition"),
    },
    housekeeping: {
      hk_walkways: checkVal("hk_walkways"),
      hk_materials: checkVal("hk_materials"),
      hk_waste: checkVal("hk_waste"),
      hk_spills: checkVal("hk_spills"),
      hk_signage: checkVal("hk_signage"),
      hk_lighting: checkVal("hk_lighting"),
      hk_sanitation: checkVal("hk_sanitation"),
      hk_water: checkVal("hk_water"),
      hk_first_aid: checkVal("hk_first_aid"),
      hk_emergency_routes: checkVal("hk_emergency_routes"),
    },
    fallProtection: {
      fp_guardrails: checkVal("fp_guardrails"),
      fp_floor_openings: checkVal("fp_floor_openings"),
      fp_harness_inspect: checkVal("fp_harness_inspect"),
      fp_anchorage: checkVal("fp_anchorage"),
      fp_lanyards: checkVal("fp_lanyards"),
      fp_ladders_secured: checkVal("fp_ladders_secured"),
      fp_ladder_condition: checkVal("fp_ladder_condition"),
      fp_hole_covers: checkVal("fp_hole_covers"),
      fp_safety_net: checkVal("fp_safety_net"),
      fp_training: checkVal("fp_training"),
    },
    scaffolding: {
      sc_competent_person: checkVal("sc_competent_person"),
      sc_inspection_tag: checkVal("sc_inspection_tag"),
      sc_base_plates: checkVal("sc_base_plates"),
      sc_plumb_level: checkVal("sc_plumb_level"),
      sc_planking: checkVal("sc_planking"),
      sc_guardrails: checkVal("sc_guardrails"),
      sc_access: checkVal("sc_access"),
      sc_clearance: checkVal("sc_clearance"),
      sc_tied_off: checkVal("sc_tied_off"),
      sc_no_overload: checkVal("sc_no_overload"),
    },
    electrical: {
      el_gfci: checkVal("el_gfci"),
      el_loto: checkVal("el_loto"),
      el_panel_access: checkVal("el_panel_access"),
      el_cords: checkVal("el_cords"),
      el_grounding: checkVal("el_grounding"),
      el_wet_conditions: checkVal("el_wet_conditions"),
      el_temp_wiring: checkVal("el_temp_wiring"),
      el_labeling: checkVal("el_labeling"),
      el_arc_flash: checkVal("el_arc_flash"),
      el_qualified: checkVal("el_qualified"),
    },
    fireHotWork: {
      fh_extinguishers: checkVal("fh_extinguishers"),
      fh_hot_work_permit: checkVal("fh_hot_work_permit"),
      fh_fire_watch: checkVal("fh_fire_watch"),
      fh_combustibles: checkVal("fh_combustibles"),
      fh_cylinders: checkVal("fh_cylinders"),
      fh_cylinder_storage: checkVal("fh_cylinder_storage"),
      fh_hoses: checkVal("fh_hoses"),
      fh_ventilation: checkVal("fh_ventilation"),
      fh_flammable_storage: checkVal("fh_flammable_storage"),
      fh_emergency_plan: checkVal("fh_emergency_plan"),
    },
    toolsEquipment: {
      tl_hand_tools: checkVal("tl_hand_tools"),
      tl_power_tools: checkVal("tl_power_tools"),
      tl_inspected: checkVal("tl_inspected"),
      tl_cords_hoses: checkVal("tl_cords_hoses"),
      tl_right_tool: checkVal("tl_right_tool"),
      tl_heavy_equip: checkVal("tl_heavy_equip"),
      tl_operator_cert: checkVal("tl_operator_cert"),
      tl_rigging: checkVal("tl_rigging"),
      tl_crane: checkVal("tl_crane"),
      tl_barricades: checkVal("tl_barricades"),
    },
    excavation: {
      ex_competent_person: checkVal("ex_competent_person"),
      ex_utilities: checkVal("ex_utilities"),
      ex_protective_system: checkVal("ex_protective_system"),
      ex_soil_class: checkVal("ex_soil_class"),
      ex_access_egress: checkVal("ex_access_egress"),
      ex_spoil_pile: checkVal("ex_spoil_pile"),
      ex_water_control: checkVal("ex_water_control"),
      ex_atmosphere: checkVal("ex_atmosphere"),
      ex_daily_inspect: checkVal("ex_daily_inspect"),
      ex_traffic: checkVal("ex_traffic"),
    },
  };

  // Compute compliance from results
  let totalPass = 0, totalFail = 0;
  Object.values(inspectionResults).forEach(function (section) {
    Object.values(section).forEach(function (v) {
      if (v === "pass") totalPass++;
      else if (v === "fail") totalFail++;
    });
  });

  // Overall assessment
  const riskRaw = val("riskLevel").toLowerCase();
  const riskLevel = ["low", "moderate", "high", "critical"].includes(riskRaw) ? riskRaw : "low";

  const ratingRaw = parseInt(val("overallRating")) || 0;
  const rating = ratingRaw >= 1 && ratingRaw <= 5 ? String(ratingRaw) : "3";

  const stopWorkRaw = val("stopWorkIssued").toLowerCase();
  const stopWorkIssued = stopWorkRaw === "true" || stopWorkRaw === "yes" || stopWorkRaw === "1";

  const correctiveRaw = val("correctiveActionsRequired").toLowerCase();
  const correctiveActionsRequired = correctiveRaw === "true" || correctiveRaw === "yes" || correctiveRaw === "1";

  // GPS coordinates — try to extract from geometry first, then from fields
  let latitude = "", longitude = "";
  const latVal = val("latitude") || "";
  const lonVal = val("longitude") || "";
  if (latVal) latitude = latVal;
  if (lonVal) longitude = lonVal;

  return {
    generalInfo: {
      inspectionDate: inspectionDate,
      inspectionTime: inspectionTime,
      inspectorName: val("inspectorName"),
      inspectorRole: val("inspectorRole"),
      projectName: val("projectName"),
      projectNumber: val("projectNumber"),
      contractor: val("contractor"),
      inspectionType: val("inspectionType"),
      weather: val("weather"),
      temperature: val("temperature"),
      workerCount: val("workerCount"),
      shift: val("shift"),
      latitude: latitude,
      longitude: longitude,
    },
    inspectionResults: inspectionResults,
    overallAssessment: {
      rating: rating,
      riskLevel: riskLevel,
      stopWorkIssued: stopWorkIssued,
      correctiveActionsRequired: correctiveActionsRequired,
      correctiveActions: val("correctiveActions"),
      correctionPriority: val("correctionPriority"),
      positiveObservations: val("positiveObservations"),
      additionalComments: val("additionalComments"),
    },
    sectionNotes: {
      ppeNotes: val("ppeNotes"),
      housekeepingNotes: val("housekeepingNotes"),
      fallProtectionNotes: val("fallProtectionNotes"),
      scaffoldingNotes: val("scaffoldingNotes"),
      electricalNotes: val("electricalNotes"),
      fireNotes: val("fireNotes"),
      toolsNotes: val("toolsNotes"),
      excavationNotes: val("excavationNotes"),
    },
    photoCount: 0,
  };
}

/**
 * Load inspection data from the Feature Service, transforming each record.
 * Returns an array in the same format as SAMPLE_INSPECTIONS.
 */
async function loadFeatureServiceData() {
  const token = await authenticateEnterprise();
  const features = await fetchFromFeatureService(token);
  return features.map(function (f) {
    return transformFeatureServiceRecord(f.attributes || {});
  });
}

// ============================================================
// DATA PROCESSING UTILITIES
// ============================================================

/**
 * Get inspection data — from Feature Service (if configured) or demo data.
 * Returns a Promise that resolves to the records array.
 */
async function getInspectionData() {
  if (typeof DASHBOARD_CONFIG !== "undefined" && DASHBOARD_CONFIG.USE_FEATURE_SERVICE) {
    try {
      const data = await loadFeatureServiceData();
      if (data.length > 0) {
        // Update timestamp
        const el = document.getElementById("lastUpdated");
        if (el) el.textContent = "Updated " + new Date().toLocaleTimeString();
        return data;
      }
      console.warn("Feature Service returned 0 records, falling back to demo data.");
    } catch (err) {
      console.error("Feature Service error, falling back to demo data:", err);
    }
  }
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
  const map = {
    blue: "#ffffff",
    green: "#c4ea8a",
    red: "#ffb8b3",
    amber: "#fff0a0",
    purple: "#ffffff",
    teal: "#d0f4f1",
  };
  return map[colorName] || "#ffffff";
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
    if (r >= 90) return "#8DC63F";
    if (r >= 75) return "#edd317";
    return "#E8413C";
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
          grid: { color: "rgba(255,255,255,0.15)" },
          ticks: { callback: (v) => v + "%", color: "#ffffff" },
        },
        y: {
          grid: { display: false },
          ticks: { color: "#ffffff", font: { weight: "600" } },
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
    low: "#8DC63F",
    moderate: "#edd317",
    high: "#F4736B",
    critical: "#E8413C",
  };

  chartInstances.riskDonut = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Low", "Moderate", "High", "Critical"],
      datasets: [{
        data: [riskCounts.low, riskCounts.moderate, riskCounts.high, riskCounts.critical],
        backgroundColor: [riskColors.low, riskColors.moderate, riskColors.high, riskColors.critical],
        borderWidth: 2,
        borderColor: "#66868F",
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
        <span style="color:#ffffff; font-weight:500;">${item.label}</span>
      </div>
      <div>
        <span class="font-bold" style="color:${item.color}">${item.count}</span>
        <span style="color:rgba(255,255,255,0.7)" class="ml-1">(${((item.count / total) * 100).toFixed(0)}%)</span>
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
          borderColor: "#F4736B",
          backgroundColor: "rgba(244,115,107,0.2)",
          fill: true,
          tension: 0.3,
          pointRadius: 5,
          pointBackgroundColor: "#F4736B",
          pointBorderColor: "#ffffff",
          pointBorderWidth: 2,
          borderWidth: 3,
          yAxisID: "y",
        },
        {
          label: "Compliance %",
          data: trend.map((t) => t.compliance),
          borderColor: "#8DC63F",
          backgroundColor: "rgba(141,198,63,0.18)",
          fill: true,
          tension: 0.3,
          pointRadius: 5,
          pointBackgroundColor: "#8DC63F",
          pointBorderColor: "#ffffff",
          pointBorderWidth: 2,
          borderWidth: 3,
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
        x: {
          grid: { color: "rgba(255,255,255,0.15)" },
          ticks: { color: "#ffffff" },
        },
        y: {
          type: "linear",
          position: "left",
          beginAtZero: true,
          ticks: { stepSize: 1, color: "#ffffff" },
          grid: { color: "rgba(255,255,255,0.15)" },
          title: { display: true, text: "Count", color: "#ffffff" },
        },
        y1: {
          type: "linear",
          position: "right",
          min: 0,
          max: 100,
          grid: { display: false },
          ticks: { callback: (v) => v + "%", color: "#ffffff" },
          title: { display: true, text: "Compliance %", color: "#ffffff" },
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
          grid: { color: "rgba(255,255,255,0.2)" },
          ticks: { display: false },
          angleLines: { color: "rgba(255,255,255,0.15)" },
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
    container.innerHTML = '<p class="text-sm text-center py-4" style="color:rgba(255,255,255,0.7);">No failures recorded.</p>';
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
        <span class="text-xs truncate" style="max-width:180px; color:#ffffff; font-weight:500;" title="${label}">${label}</span>
        <span class="text-xs font-bold" style="color:#ffd5d1">${stats.fail} fail${stats.fail !== 1 ? "s" : ""} <span style="color:rgba(255,255,255,0.7); font-weight:500;">(${pct}%)</span></span>
      </div>
      <div class="w-full h-2 rounded-full" style="background:rgba(0,59,77,0.3)">
        <div class="h-full rounded-full" style="width:${barWidth}%; background: linear-gradient(90deg, #E8413C, #F4736B);"></div>
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

    const barColor = passRate >= 90 ? "#8DC63F" : passRate >= 75 ? "#edd317" : "#E8413C";
    const valueColor = passRate >= 90 ? "#c4ea8a" : passRate >= 75 ? "#fff0a0" : "#ffb8b3";

    const row = document.createElement("div");
    row.className = "sparkline-row";
    row.innerHTML = `
      <div class="sparkline-label">${SECTION_LABELS[sectionKey]}</div>
      <div class="sparkline-bar-bg">
        <div class="sparkline-bar-fill" style="width:${passRate}%; background:${barColor}"></div>
      </div>
      <div class="sparkline-value" style="color:${valueColor}">${passRate}%</div>
      <div style="flex:0 0 80px; text-align:right">
        <span class="text-xs font-semibold" style="color:#c4ea8a">${stats.pass}P</span>
        <span class="text-xs font-semibold ml-1" style="color:#ffb8b3">${stats.fail}F</span>
        <span class="text-xs ml-1" style="color:rgba(255,255,255,0.7)">${stats.na}N</span>
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
  _lastTableData = sorted;

  sorted.forEach((d, idx) => {
    const compliance = getOverallCompliance([d]);
    const dateStr = new Date(d.generalInfo.inspectionDate + "T00:00:00").toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });

    const riskLevel = d.overallAssessment.riskLevel;
    const typeLabel = INSPECTION_TYPE_LABELS[d.generalInfo.inspectionType] || d.generalInfo.inspectionType;

    const row = document.createElement("tr");
    row.setAttribute("data-index", idx);
    row.style.cursor = "pointer";
    const complianceColor = parseFloat(compliance) >= 90 ? "#c4ea8a" : parseFloat(compliance) >= 75 ? "#fff0a0" : "#ffb8b3";
    row.innerHTML = `
      <td class="whitespace-nowrap">${dateStr}</td>
      <td>${d.generalInfo.inspectorName}</td>
      <td class="max-w-[160px] truncate" title="${d.generalInfo.projectName}">${d.generalInfo.projectName}</td>
      <td class="max-w-[140px] truncate" title="${d.generalInfo.contractor}">${d.generalInfo.contractor}</td>
      <td>${typeLabel}</td>
      <td><span class="risk-badge ${riskLevel}">${riskLevel}</span></td>
      <td style="color:#fff0a0">${"&#9733;".repeat(parseInt(d.overallAssessment.rating))}<span style="color:rgba(255,255,255,0.4)">${"&#9734;".repeat(5 - parseInt(d.overallAssessment.rating))}</span></td>
      <td>
        <span style="color:${complianceColor}; font-weight:700;">${compliance}%</span>
      </td>
      <td>${d.overallAssessment.stopWorkIssued ? '<span class="risk-badge critical">YES</span>' : '<span style="color:rgba(255,255,255,0.6)">No</span>'}</td>
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
let _mapReady = false;
let _pendingMapData = null;

function initInspectionMap() {
  if (typeof require === "undefined") {
    console.warn("ArcGIS JS API not loaded — map disabled.");
    showMapFallback("ArcGIS JS API not available. Map requires access to js.arcgis.com.");
    return;
  }

  require([
    "esri/config",
    "esri/Map",
    "esri/views/MapView",
    "esri/Graphic",
    "esri/layers/GraphicsLayer",
  ], function (esriConfig, Map, MapView, Graphic, GraphicsLayer) {
    // Point the API at the Enterprise portal so basemaps and services
    // are resolved through the portal instead of ArcGIS Online.
    var portalUrl = (typeof DASHBOARD_CONFIG !== "undefined" && DASHBOARD_CONFIG.PORTAL_URL)
      ? DASHBOARD_CONFIG.PORTAL_URL
      : "";
    if (portalUrl) {
      esriConfig.portalUrl = portalUrl;
    }

    // Store constructors globally for renderMapPoints
    window._MapGraphic = Graphic;

    mapGraphicsLayer = new GraphicsLayer({ title: "Inspections" });

    var map = new Map({
      basemap: "gray-vector",
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

    // When map is ready, render any queued data
    mapView.when(function () {
      _mapReady = true;
      if (_pendingMapData) {
        renderMapPoints(_pendingMapData);
        _pendingMapData = null;
      }
    }, function (err) {
      console.error("MapView failed to load:", err);
      showMapFallback("Map failed to load. Check network access to the ArcGIS basemap service.");
    });
  });
}

function showMapFallback(message) {
  var container = document.getElementById("inspectionMap");
  if (container) {
    container.style.display = "flex";
    container.style.alignItems = "center";
    container.style.justifyContent = "center";
    container.style.background = "rgba(0,59,77,0.25)";
    container.innerHTML = '<div style="text-align:center;color:#ffffff;font-size:0.9rem;padding:20px;">'
      + '<calcite-icon icon="exclamation-mark-triangle" scale="l" style="color:#F4736B;margin-bottom:8px;"></calcite-icon>'
      + '<br>' + message + '</div>';
  }
}

function renderMapPoints(data) {
  if (!_mapReady || !mapGraphicsLayer || !window._MapGraphic) {
    // Map not ready yet — queue for when it initializes
    _pendingMapData = data;
    return;
  }
  mapGraphicsLayer.removeAll();

  const riskColorMap = {
    low: [141, 198, 63],
    moderate: [237, 211, 23],
    high: [244, 115, 107],
    critical: [232, 65, 60],
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
      color: riskColorMap[risk] || [0, 59, 77],
      outline: { color: [255, 255, 255, 230], width: 2 },
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
    container.innerHTML = '<p class="text-sm text-center py-4" style="color:rgba(255,255,255,0.7);">No inspectors found.</p>';
    return;
  }

  // Medal colors for top 3
  const medals = ["#f59e0b", "#94a3b8", "#b45309"];

  inspectors.slice(0, 5).forEach((inspector, idx) => {
    const compColor = parseFloat(inspector.compliance) >= 90 ? "#c4ea8a" : parseFloat(inspector.compliance) >= 75 ? "#fff0a0" : "#ffb8b3";
    const roleLabel = ROLE_LABELS[inspector.role] || inspector.role;

    const row = document.createElement("div");
    row.className = "flex items-center gap-3 py-2" + (idx < inspectors.length - 1 ? " border-b" : "");
    row.style.borderColor = "rgba(255,255,255,0.12)";
    row.innerHTML = `
      <div class="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
           style="background:${idx < 3 ? medals[idx] + "33" : "rgba(255,255,255,0.12)"}; color:${idx < 3 ? medals[idx] : "#ffffff"};">
        ${idx + 1}
      </div>
      <div class="flex-grow min-w-0">
        <div class="text-sm font-semibold truncate" style="color:#ffffff">${inspector.name}</div>
        <div class="text-xs" style="color:rgba(255,255,255,0.75)">${roleLabel}</div>
      </div>
      <div class="text-right flex-shrink-0">
        <div class="text-sm font-bold" style="color:${compColor}">${inspector.compliance}%</div>
        <div class="text-xs" style="color:rgba(255,255,255,0.7)">${inspector.count} insp.</div>
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
  let statusColor, statusLabel, statusIcon, statusTextColor;
  if (compVal >= 90 && stopWork === 0) {
    statusColor = "#8DC63F"; statusTextColor = "#c4ea8a"; statusLabel = "GOOD"; statusIcon = "check-circle-f";
  } else if (compVal >= 75) {
    statusColor = "#edd317"; statusTextColor = "#fff0a0"; statusLabel = "CAUTION"; statusIcon = "exclamation-mark-triangle-f";
  } else {
    statusColor = "#E8413C"; statusTextColor = "#ffb8b3"; statusLabel = "ACTION REQUIRED"; statusIcon = "exclamation-mark-circle-f";
  }

  content.innerHTML = `
    <!-- Overall Status Banner -->
    <div class="report-section" style="border-color:${statusColor}66; background:${statusColor}1a">
      <div class="flex items-center gap-3 mb-2">
        <calcite-icon icon="${statusIcon}" scale="l" style="color:${statusTextColor}"></calcite-icon>
        <div>
          <h4 style="color:${statusTextColor}; margin:0">Overall Safety Status: ${statusLabel}</h4>
          <p class="text-sm mt-1" style="color:rgba(255,255,255,0.85);">Based on ${data.length} inspection${data.length !== 1 ? "s" : ""} across ${Object.keys(projectMap).length} project${Object.keys(projectMap).length !== 1 ? "s" : ""}</p>
        </div>
      </div>
    </div>

    <!-- Key Metrics -->
    <div class="report-section">
      <h4>Key Performance Indicators</h4>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:12px;">
        ${reportMetricCard("Total Inspections", data.length, "#ffffff")}
        ${reportMetricCard("Overall Compliance", compliance + "%", compVal >= 90 ? "#c4ea8a" : compVal >= 75 ? "#fff0a0" : "#ffb8b3")}
        ${reportMetricCard("Avg Safety Rating", avgRating + " / 5", parseFloat(avgRating) >= 4 ? "#c4ea8a" : "#fff0a0")}
        ${reportMetricCard("Stop Work Orders", stopWork, stopWork > 0 ? "#ffb8b3" : "#c4ea8a")}
        ${reportMetricCard("Corrective Actions", corrective, corrective > 0 ? "#fff0a0" : "#c4ea8a")}
        ${reportMetricCard("Unique Inspectors", inspectors.length, "#d0f4f1")}
      </div>
    </div>

    <!-- Risk Distribution -->
    <div class="report-section">
      <h4>Risk Distribution</h4>
      <div class="flex flex-wrap gap-4">
        ${reportRiskBar("Low", riskCounts.low, data.length, "#8DC63F")}
        ${reportRiskBar("Moderate", riskCounts.moderate, data.length, "#edd317")}
        ${reportRiskBar("High", riskCounts.high, data.length, "#F4736B")}
        ${reportRiskBar("Critical", riskCounts.critical, data.length, "#E8413C")}
      </div>
    </div>

    <!-- Category Compliance -->
    <div class="report-section">
      <h4>Compliance by Category</h4>
      <table style="width:100%; font-size:0.8rem; border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.18)">
            <th style="text-align:left; padding:6px 8px; color:rgba(255,255,255,0.75); font-weight:600;">Category</th>
            <th style="text-align:right; padding:6px 8px; color:rgba(255,255,255,0.75); font-weight:600;">Pass</th>
            <th style="text-align:right; padding:6px 8px; color:rgba(255,255,255,0.75); font-weight:600;">Fail</th>
            <th style="text-align:right; padding:6px 8px; color:rgba(255,255,255,0.75); font-weight:600;">N/A</th>
            <th style="text-align:right; padding:6px 8px; color:rgba(255,255,255,0.75); font-weight:600;">Compliance</th>
          </tr>
        </thead>
        <tbody>
          ${sectionCompliance.map((s) => {
            const rate = s.rate.toFixed(1);
            const color = s.rate >= 90 ? "#c4ea8a" : s.rate >= 75 ? "#fff0a0" : "#ffb8b3";
            return `<tr style="border-bottom:1px solid rgba(255,255,255,0.08)">
              <td style="padding:6px 8px; color:#ffffff;">${s.label}</td>
              <td style="padding:6px 8px; text-align:right; color:#c4ea8a;">${s.pass}</td>
              <td style="padding:6px 8px; text-align:right; color:#ffb8b3;">${s.fail}</td>
              <td style="padding:6px 8px; text-align:right; color:rgba(255,255,255,0.6);">${s.na}</td>
              <td style="padding:6px 8px; text-align:right; font-weight:700; color:${color};">${rate}%</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>

    <!-- Areas of Concern -->
    ${worstSections.length > 0 ? `
    <div class="report-section" style="border-color:rgba(232,65,60,0.4)">
      <h4 style="color:#ffb8b3">Areas of Concern</h4>
      ${worstSections.map((s) => `
        <div class="mb-3">
          <div class="flex justify-between items-center">
            <span class="text-sm" style="color:#ffffff;">${s.label}</span>
            <span class="text-sm font-bold" style="color:${s.rate >= 75 ? "#fff0a0" : "#ffb8b3"}">${s.rate.toFixed(1)}% compliance</span>
          </div>
          <div class="w-full h-1.5 rounded-full mt-1" style="background:rgba(0,59,77,0.35)">
            <div class="h-full rounded-full" style="width:${s.rate}%; background:${s.rate >= 75 ? "#edd317" : "#E8413C"}"></div>
          </div>
        </div>
      `).join("")}
    </div>` : ""}

    <!-- Top Failing Checklist Items -->
    ${topFails.length > 0 ? `
    <div class="report-section" style="border-color:rgba(232,65,60,0.4)">
      <h4 style="color:#ffb8b3">Top Failing Checklist Items</h4>
      <ol class="text-sm space-y-2 pl-4" style="list-style:decimal; color:#ffffff;">
        ${topFails.map(([itemId, stats]) => {
          const pct = stats.total > 0 ? ((stats.fail / stats.total) * 100).toFixed(0) : 0;
          return `<li><span style="color:#ffffff;">${ITEM_LABELS[itemId] || itemId}</span> &mdash; <span style="color:#ffd5d1; font-weight:600;">${stats.fail} failure${stats.fail !== 1 ? "s" : ""} (${pct}% fail rate)</span></li>`;
        }).join("")}
      </ol>
    </div>` : ""}

    <!-- Positive Highlights -->
    <div class="report-section" style="border-color:rgba(141,198,63,0.4)">
      <h4 style="color:#c4ea8a">Positive Highlights</h4>
      ${bestSections.filter((s) => s.rate >= 90).length > 0 ? `
        <p class="text-sm mb-2" style="color:#ffffff;">The following categories achieved <span style="color:#c4ea8a; font-weight:600;">&ge;90% compliance</span>:</p>
        <ul class="text-sm space-y-1 pl-4" style="list-style:disc; color:#ffffff;">
          ${bestSections.filter((s) => s.rate >= 90).map((s) => `<li>${s.label} &mdash; <span style="color:#c4ea8a; font-weight:600;">${s.rate.toFixed(1)}%</span></li>`).join("")}
        </ul>
      ` : '<p class="text-sm" style="color:rgba(255,255,255,0.7);">No categories achieved 90% compliance in this period.</p>'}
      ${getPositiveObservations(data).length > 0 ? `
        <p class="text-sm mt-3 mb-2" style="color:#ffffff;">Inspector observations:</p>
        <ul class="text-sm space-y-1 pl-4" style="list-style:disc; color:rgba(255,255,255,0.85);">
          ${getPositiveObservations(data).slice(0, 4).map((obs) => `<li>"${obs}"</li>`).join("")}
        </ul>
      ` : ""}
    </div>

    <!-- Project Breakdown -->
    <div class="report-section">
      <h4>Project Summary</h4>
      <table style="width:100%; font-size:0.8rem; border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.18)">
            <th style="text-align:left; padding:6px 8px; color:rgba(255,255,255,0.75); font-weight:600;">Project</th>
            <th style="text-align:right; padding:6px 8px; color:rgba(255,255,255,0.75); font-weight:600;">Inspections</th>
            <th style="text-align:right; padding:6px 8px; color:rgba(255,255,255,0.75); font-weight:600;">Compliance</th>
            <th style="text-align:right; padding:6px 8px; color:rgba(255,255,255,0.75); font-weight:600;">Highest Risk</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(projectMap).map(([name, p]) => {
            const pCompliance = p.totalApplicable > 0 ? ((p.totalPass / p.totalApplicable) * 100).toFixed(1) : "N/A";
            const pColor = parseFloat(pCompliance) >= 90 ? "#c4ea8a" : parseFloat(pCompliance) >= 75 ? "#fff0a0" : "#ffb8b3";
            const worstRisk = getWorstRisk(p.risks);
            const riskBadgeColor = { low: "#c4ea8a", moderate: "#fff0a0", high: "#ffd5d1", critical: "#ffb8b3" }[worstRisk] || "#ffffff";
            return `<tr style="border-bottom:1px solid rgba(255,255,255,0.08)">
              <td style="padding:6px 8px; color:#ffffff; max-width:200px;" class="truncate" title="${name}">${name}</td>
              <td style="padding:6px 8px; text-align:right; color:#ffffff;">${p.count}</td>
              <td style="padding:6px 8px; text-align:right; font-weight:600; color:${pColor};">${pCompliance}%</td>
              <td style="padding:6px 8px; text-align:right;"><span style="color:${riskBadgeColor}; font-weight:700; text-transform:uppercase; font-size:0.7rem;">${worstRisk}</span></td>
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
          <tr style="border-bottom:1px solid rgba(255,255,255,0.18)">
            <th style="text-align:left; padding:6px 8px; color:rgba(255,255,255,0.75); font-weight:600;">Inspector</th>
            <th style="text-align:left; padding:6px 8px; color:rgba(255,255,255,0.75); font-weight:600;">Role</th>
            <th style="text-align:right; padding:6px 8px; color:rgba(255,255,255,0.75); font-weight:600;">Inspections</th>
            <th style="text-align:right; padding:6px 8px; color:rgba(255,255,255,0.75); font-weight:600;">Avg Rating</th>
            <th style="text-align:right; padding:6px 8px; color:rgba(255,255,255,0.75); font-weight:600;">Compliance</th>
          </tr>
        </thead>
        <tbody>
          ${inspectors.map((ins) => {
            const cColor = parseFloat(ins.compliance) >= 90 ? "#c4ea8a" : parseFloat(ins.compliance) >= 75 ? "#fff0a0" : "#ffb8b3";
            return `<tr style="border-bottom:1px solid rgba(255,255,255,0.08)">
              <td style="padding:6px 8px; color:#ffffff;">${ins.name}</td>
              <td style="padding:6px 8px; color:rgba(255,255,255,0.7);">${ROLE_LABELS[ins.role] || ins.role}</td>
              <td style="padding:6px 8px; text-align:right; color:#ffffff;">${ins.count}</td>
              <td style="padding:6px 8px; text-align:right; color:#fff0a0;">${ins.avgRating}</td>
              <td style="padding:6px 8px; text-align:right; font-weight:600; color:${cColor};">${ins.compliance}%</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>

    <!-- Corrective Actions Log -->
    ${corrective > 0 ? `
    <div class="report-section" style="border-color:rgba(237,211,23,0.4)">
      <h4 style="color:#fff0a0">Open Corrective Actions</h4>
      ${data.filter((d) => d.overallAssessment.correctiveActionsRequired).map((d) => {
        const dateStr = new Date(d.generalInfo.inspectionDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const priorityColors = { immediate: "#E8413C", today: "#F4736B", "24hours": "#edd317", week: "#9DADBA" };
        const priorityTextColors = { immediate: "#ffb8b3", today: "#ffd5d1", "24hours": "#fff0a0", week: "#ffffff" };
        const prio = d.overallAssessment.correctionPriority || "today";
        return `<div class="mb-3 p-3 rounded" style="background:rgba(0,59,77,0.3); border-left:3px solid ${priorityColors[prio] || "#9DADBA"}">
          <div class="flex justify-between items-start mb-1">
            <span class="text-sm font-semibold" style="color:#ffffff;">${d.generalInfo.projectName}</span>
            <span class="text-xs px-2 py-0.5 rounded font-semibold" style="background:${priorityColors[prio]}33; color:${priorityTextColors[prio]};">${prio.toUpperCase()}</span>
          </div>
          <p class="text-xs mb-1" style="color:rgba(255,255,255,0.75);">${dateStr} &bull; ${d.generalInfo.inspectorName}</p>
          <p class="text-sm" style="color:#ffffff;">${d.overallAssessment.correctiveActions}</p>
        </div>`;
      }).join("")}
    </div>` : ""}

    <!-- Recommendations -->
    <div class="report-section">
      <h4>Automated Recommendations</h4>
      <ul class="text-sm space-y-2 pl-4" style="list-style:disc; color:#ffffff;">
        ${generateRecommendations(data, sectionCompliance, riskCounts, stopWork).map((r) => `<li>${r}</li>`).join("")}
      </ul>
    </div>

    <!-- Report Footer -->
    <div class="mt-6 pt-4 text-center" style="border-top:1px solid rgba(255,255,255,0.18);">
      <p class="text-xs" style="color:rgba(255,255,255,0.85);">This report was automatically generated by the Worley Safety Inspection Dashboard.</p>
      <p class="text-xs mt-1" style="color:rgba(255,255,255,0.65);">Generated on ${new Date().toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</p>
    </div>
  `;
}

// Report helper: metric card HTML
function reportMetricCard(label, value, color) {
  return `<div style="background:rgba(0,59,77,0.3); border-radius:8px; padding:12px; text-align:center; border:1px solid rgba(255,255,255,0.1);">
    <div style="font-size:1.4rem; font-weight:700; color:${color};">${value}</div>
    <div style="font-size:0.7rem; color:rgba(255,255,255,0.8); text-transform:uppercase; letter-spacing:0.04em; margin-top:4px; font-weight:600;">${label}</div>
  </div>`;
}

// Report helper: risk bar HTML
function reportRiskBar(label, count, total, color) {
  const pct = total > 0 ? ((count / total) * 100).toFixed(0) : 0;
  return `<div style="flex:1; min-width:100px;">
    <div class="flex justify-between text-xs mb-1">
      <span style="color:${color}; font-weight:600;">${label}</span>
      <span style="color:rgba(255,255,255,0.85);">${count} (${pct}%)</span>
    </div>
    <div style="height:6px; background:rgba(0,59,77,0.35); border-radius:3px; overflow:hidden;">
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

  // PDF export button
  var exportPdfBtn = document.getElementById("exportPdfBtn");
  if (exportPdfBtn) {
    exportPdfBtn.addEventListener("click", async function (e) {
      e.preventDefault();
      console.log("Export PDF clicked");
      try {
        exportPdfBtn.loading = true;
      } catch (_) { exportPdfBtn.setAttribute("loading", ""); }
      try {
        var scopeEl = document.querySelector("#reportScope calcite-segmented-control-item[checked]");
        var scope = scopeEl ? scopeEl.value : "dashboard";
        var targetData;
        if (scope === "project") {
          var projSelect = document.getElementById("reportProjectSelect");
          var projName = projSelect ? projSelect.value : null;
          if (!projName) {
            alert("Please select a project from the dropdown.");
            return;
          }
          targetData = filteredData.filter(function (d) { return d.generalInfo.projectName === projName; });
        } else if (scope === "inspection") {
          var inspSel = document.getElementById("reportInspectionSelect");
          var iIdx = inspSel && inspSel.value !== "" ? parseInt(inspSel.value) : NaN;
          if (isNaN(iIdx) || !filteredData[iIdx]) {
            alert("Please select an inspection from the dropdown.");
            return;
          }
          targetData = [filteredData[iIdx]];
        } else {
          targetData = filteredData;
        }
        await generatePdf(scope, targetData);
      } catch (err) {
        console.error("Export PDF handler error:", err);
        alert("Failed to generate PDF: " + (err.message || err));
      } finally {
        try { exportPdfBtn.loading = false; } catch (_) { exportPdfBtn.removeAttribute("loading"); }
      }
    });
  }

  // Report scope controls
  initReportScopeControls();
}

function initReportScopeControls() {
  var scopeCtrl = document.getElementById("reportScope");
  var projSelect = document.getElementById("reportProjectSelect");
  var inspSelect = document.getElementById("reportInspectionSelect");
  if (!scopeCtrl) return;

  scopeCtrl.addEventListener("calciteSegmentedControlChange", function () {
    var selected = scopeCtrl.querySelector("calcite-segmented-control-item[checked]");
    var mode = selected ? selected.value : "dashboard";
    projSelect.style.display = mode === "project" ? "" : "none";
    inspSelect.style.display = mode === "inspection" ? "" : "none";

    if (mode === "project") {
      populateReportProjectSelect();
      var projName = projSelect.value;
      if (projName) generateReport(filteredData.filter(function (d) { return d.generalInfo.projectName === projName; }));
    } else if (mode === "inspection") {
      populateReportInspectionSelect();
      var idx = parseInt(inspSelect.value);
      if (!isNaN(idx) && filteredData[idx]) generateReport(filteredData.slice(idx, idx + 1));
    } else {
      generateReport(filteredData);
    }
  });

  if (projSelect) {
    projSelect.addEventListener("calciteSelectChange", function () {
      var projName = projSelect.value;
      if (projName) generateReport(filteredData.filter(function (d) { return d.generalInfo.projectName === projName; }));
    });
  }
  if (inspSelect) {
    inspSelect.addEventListener("calciteSelectChange", function () {
      var idx = parseInt(inspSelect.value);
      if (!isNaN(idx) && filteredData[idx]) generateReport(filteredData.slice(idx, idx + 1));
    });
  }
}

function populateReportProjectSelect() {
  var sel = document.getElementById("reportProjectSelect");
  if (!sel) return;
  sel.innerHTML = "";
  var projects = [...new Set(filteredData.map(function (d) { return d.generalInfo.projectName; }))].sort();
  projects.forEach(function (p) {
    var opt = document.createElement("calcite-option");
    opt.value = p;
    opt.textContent = p;
    sel.appendChild(opt);
  });
}

function populateReportInspectionSelect() {
  var sel = document.getElementById("reportInspectionSelect");
  if (!sel) return;
  sel.innerHTML = "";
  filteredData.forEach(function (d, idx) {
    var dateStr = new Date(d.generalInfo.inspectionDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
    var opt = document.createElement("calcite-option");
    opt.value = String(idx);
    opt.textContent = dateStr + " — " + d.generalInfo.projectName + " — " + d.generalInfo.inspectorName;
    sel.appendChild(opt);
  });
}

// ============================================================
// PDF GENERATION
// ============================================================

var WORLEY_LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" style="width:64px;height:64px;display:block;">'
  + '<defs>'
  + '<clipPath id="pdfSphereClip"><circle cx="50" cy="50" r="48"/></clipPath>'
  + '<radialGradient id="pdfSphereShade" cx="35%" cy="30%" r="80%">'
  + '<stop offset="0%" stop-color="#ffffff" stop-opacity="0.45"/>'
  + '<stop offset="55%" stop-color="#ffffff" stop-opacity="0"/>'
  + '<stop offset="100%" stop-color="#000000" stop-opacity="0.12"/>'
  + '</radialGradient>'
  + '</defs>'
  + '<circle cx="50" cy="50" r="48" fill="#ffffff"/>'
  + '<g clip-path="url(#pdfSphereClip)">'
  + '<path d="M -10 32 C 18 12, 38 22, 58 18 C 80 14, 100 22, 110 18 L 110 8 C 90 4, 78 12, 56 8 C 32 4, 18 0, -10 14 Z" fill="#E8413C"/>'
  + '<path d="M -10 28 C 12 18, 32 30, 50 28 C 72 26, 92 32, 110 28 L 110 36 C 90 40, 72 34, 50 36 C 32 38, 14 32, -10 40 Z" fill="#E8413C" opacity="0.85"/>'
  + '<path d="M 58 -8 C 76 18, 60 38, 78 56 C 88 70, 75 88, 60 102 L 70 108 C 92 90, 102 70, 90 50 C 78 32, 92 16, 78 -10 Z" fill="#8DC63F"/>'
  + '<path d="M 30 -8 C 18 12, 32 24, 22 40 C 12 56, 28 72, 18 92 L 30 102 C 44 80, 30 64, 40 48 C 50 30, 38 14, 50 -8 Z" fill="#8DC63F" opacity="0.78"/>'
  + '<path d="M -10 58 C 18 42, 40 60, 60 52 C 80 44, 100 56, 110 50 L 110 64 C 92 70, 72 60, 52 66 C 32 72, 12 66, -10 72 Z" fill="#44C8C1"/>'
  + '<path d="M -10 78 C 14 70, 36 84, 56 78 C 78 72, 96 84, 110 78 L 110 92 C 90 100, 70 90, 50 96 C 30 102, 12 92, -10 98 Z" fill="#44C8C1" opacity="0.82"/>'
  + '<path d="M -10 88 C 10 80, 28 90, 44 84 C 60 78, 78 86, 110 80 L 110 100 L -10 100 Z" fill="#E8413C" opacity="0.55"/>'
  + '<circle cx="50" cy="50" r="48" fill="url(#pdfSphereShade)"/>'
  + '</g>'
  + '<circle cx="50" cy="50" r="48" fill="none" stroke="rgba(0,0,0,0.06)" stroke-width="0.5"/>'
  + '</svg>';

function pdfLogoLarge() {
  return WORLEY_LOGO_SVG.replace('width:64px;height:64px', 'width:120px;height:120px');
}

function pdfLogoSmall() {
  return WORLEY_LOGO_SVG.replace('width:64px;height:64px', 'width:42px;height:42px');
}

function buildPdfCoverPage(title, subtitle, scope, dataLength) {
  return '<div style="page-break-after:always; min-height:1000px; display:flex; flex-direction:column; justify-content:space-between; padding:0;">'
    + '<div style="background:linear-gradient(135deg,#003B4D 0%,#00637E 100%); color:#fff; padding:60px 50px; border-radius:8px; position:relative; overflow:hidden;">'
    + '<div style="position:absolute; top:-50px; right:-50px; width:300px; height:300px; background:radial-gradient(circle,rgba(232,65,60,0.18) 0%,transparent 70%); border-radius:50%;"></div>'
    + '<div style="position:absolute; bottom:-80px; left:30%; width:280px; height:280px; background:radial-gradient(circle,rgba(68,200,193,0.12) 0%,transparent 70%); border-radius:50%;"></div>'
    + '<div style="position:relative; z-index:2;">'
    + '<div style="display:flex; align-items:center; gap:20px; margin-bottom:60px;">'
    + pdfLogoLarge()
    + '<div><div style="font-size:38px; font-weight:700; letter-spacing:1px; line-height:1;">worley</div>'
    + '<div style="font-size:11px; letter-spacing:5px; color:#F4736B; font-weight:600; margin-top:4px;">CONSULTING</div></div>'
    + '</div>'
    + '<div style="height:4px; width:80px; background:#E8413C; border-radius:2px; margin-bottom:24px;"></div>'
    + '<div style="font-size:13px; color:rgba(255,255,255,0.7); text-transform:uppercase; letter-spacing:3px; font-weight:600; margin-bottom:8px;">Field Safety Program</div>'
    + '<h1 style="font-size:36px; font-weight:700; line-height:1.15; margin:0 0 16px 0; color:#ffffff;">' + title + '</h1>'
    + '<p style="font-size:14px; color:rgba(255,255,255,0.85); line-height:1.5; max-width:500px; margin:0;">' + subtitle + '</p>'
    + '</div>'
    + '</div>'
    + '<div style="padding:40px 50px; background:#f6f8f9; border-radius:8px; margin-top:24px;">'
    + '<div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">'
    + '<div><div style="font-size:9px; text-transform:uppercase; letter-spacing:2px; color:#888; font-weight:700;">Report Type</div>'
    + '<div style="font-size:14px; color:#003B4D; font-weight:600; margin-top:4px;">' + (scope === "inspection" ? "Single Inspection Detail" : scope === "project" ? "Project Safety Review" : "Comprehensive Dashboard Report") + '</div></div>'
    + '<div><div style="font-size:9px; text-transform:uppercase; letter-spacing:2px; color:#888; font-weight:700;">Inspections Covered</div>'
    + '<div style="font-size:14px; color:#003B4D; font-weight:600; margin-top:4px;">' + dataLength + ' inspection' + (dataLength !== 1 ? 's' : '') + '</div></div>'
    + '<div><div style="font-size:9px; text-transform:uppercase; letter-spacing:2px; color:#888; font-weight:700;">Generated</div>'
    + '<div style="font-size:14px; color:#003B4D; font-weight:600; margin-top:4px;">' + new Date().toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) + '</div></div>'
    + '<div><div style="font-size:9px; text-transform:uppercase; letter-spacing:2px; color:#888; font-weight:700;">Classification</div>'
    + '<div style="font-size:14px; color:#003B4D; font-weight:600; margin-top:4px;">Internal &mdash; Confidential</div></div>'
    + '</div></div>'
    + '<div style="margin-top:40px; padding-top:16px; border-top:2px solid #E8413C; text-align:center;">'
    + '<p style="font-size:9px; color:#999; margin:0;">© 2026 Worley. This report contains confidential information intended for authorized personnel only.</p>'
    + '</div>'
    + '</div>';
}

function buildPdfPageHeader(scope) {
  return '<div style="display:flex; align-items:center; justify-content:space-between; padding-bottom:10px; border-bottom:2px solid #E8413C; margin-bottom:20px;">'
    + '<div style="display:flex; align-items:center; gap:10px;">'
    + pdfLogoSmall()
    + '<div><div style="font-size:13px; color:#003B4D; font-weight:700; letter-spacing:0.5px;">worley <span style="color:#E8413C; font-size:9px; letter-spacing:2px; font-weight:600;">CONSULTING</span></div>'
    + '<div style="font-size:9px; color:#888; text-transform:uppercase; letter-spacing:1px;">Safety Inspection Report</div></div></div>'
    + '<div style="font-size:9px; color:#888;">' + new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + '</div>'
    + '</div>';
}

function buildPdfSectionHeader(title, subtitle) {
  return '<div style="margin:24px 0 14px 0;">'
    + '<div style="display:flex; align-items:baseline; gap:12px;">'
    + '<div style="width:4px; height:22px; background:#E8413C; border-radius:2px;"></div>'
    + '<h2 style="font-size:16px; font-weight:700; color:#003B4D; margin:0; letter-spacing:0.3px;">' + title + '</h2>'
    + (subtitle ? '<span style="font-size:10px; color:#888; font-weight:500;">' + subtitle + '</span>' : '')
    + '</div></div>';
}

function buildPdfKpiTile(label, value, accentColor, sublabel) {
  return '<div style="background:#ffffff; border:1px solid #e0e6ea; border-radius:8px; padding:14px 16px; position:relative; overflow:hidden;">'
    + '<div style="position:absolute; top:0; left:0; right:0; height:3px; background:' + accentColor + ';"></div>'
    + '<div style="font-size:9px; text-transform:uppercase; letter-spacing:1.5px; color:#888; font-weight:700; margin-bottom:6px; padding-top:4px;">' + label + '</div>'
    + '<div style="font-size:22px; font-weight:700; color:#003B4D; line-height:1;">' + value + '</div>'
    + (sublabel ? '<div style="font-size:9px; color:#888; margin-top:4px;">' + sublabel + '</div>' : '')
    + '</div>';
}

function buildPdfRiskBar(label, count, total, color) {
  var pct = total > 0 ? ((count / total) * 100).toFixed(0) : 0;
  return '<div style="margin-bottom:10px;">'
    + '<div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:4px;">'
    + '<span style="font-weight:600; color:' + color + ';">' + label + '</span>'
    + '<span style="color:#666;"><strong style="color:#003B4D;">' + count + '</strong> &nbsp;(' + pct + '%)</span>'
    + '</div>'
    + '<div style="height:8px; background:#e8edf0; border-radius:4px; overflow:hidden;">'
    + '<div style="height:100%; width:' + pct + '%; background:linear-gradient(90deg,' + color + ',' + color + 'cc); border-radius:4px;"></div>'
    + '</div></div>';
}

function buildPdfDashboardContent(data) {
  var compliance = getOverallCompliance(data);
  var avgRating = getAverageRating(data);
  var riskCounts = getRiskCounts(data);
  var stopWork = getStopWorkCount(data);
  var corrective = getCorrectiveActionCount(data);
  var inspectors = getInspectorStats(data).sort(function (a, b) { return b.count - a.count; });
  var sections = Object.keys(SECTION_LABELS);
  var compVal = parseFloat(compliance);

  // Status banner
  var statusColor, statusLabel;
  if (compVal >= 90 && stopWork === 0) { statusColor = "#2d7a0f"; statusLabel = "GOOD STANDING"; }
  else if (compVal >= 75) { statusColor = "#9d6b0a"; statusLabel = "CAUTION ADVISED"; }
  else { statusColor = "#c42b1c"; statusLabel = "ACTION REQUIRED"; }

  var html = '';

  // Status banner
  html += '<div style="background:linear-gradient(135deg,' + statusColor + '15,' + statusColor + '08); border-left:4px solid ' + statusColor + '; border-radius:6px; padding:16px 20px; margin-bottom:24px;">';
  html += '<div style="display:flex; align-items:center; justify-content:space-between;">';
  html += '<div><div style="font-size:9px; text-transform:uppercase; letter-spacing:1.5px; color:' + statusColor + '; font-weight:700;">Overall Status</div>';
  html += '<div style="font-size:20px; font-weight:700; color:' + statusColor + '; margin-top:2px;">' + statusLabel + '</div></div>';
  html += '<div style="text-align:right;"><div style="font-size:36px; font-weight:700; color:' + statusColor + '; line-height:1;">' + compliance + '%</div>';
  html += '<div style="font-size:9px; text-transform:uppercase; letter-spacing:1.5px; color:#888; font-weight:600; margin-top:2px;">Compliance Rate</div></div>';
  html += '</div></div>';

  html += buildPdfSectionHeader("Executive Summary", data.length + " inspections analyzed");

  // KPI Grid
  html += '<div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:20px;">';
  html += buildPdfKpiTile("Total Inspections", data.length, "#003B4D", "in reporting period");
  html += buildPdfKpiTile("Avg Safety Rating", avgRating + " / 5", "#F4736B", parseFloat(avgRating) >= 4 ? "above target" : "review needed");
  html += buildPdfKpiTile("Stop Work Orders", stopWork, stopWork > 0 ? "#c42b1c" : "#2d7a0f", stopWork > 0 ? "investigate" : "none issued");
  html += buildPdfKpiTile("Corrective Actions", corrective, corrective > 0 ? "#9d6b0a" : "#2d7a0f", "open or scheduled");
  html += buildPdfKpiTile("Active Inspectors", inspectors.length, "#44C8C1", "across program");
  html += buildPdfKpiTile("High/Critical Risk", riskCounts.high + riskCounts.critical, (riskCounts.high + riskCounts.critical) > 0 ? "#c42b1c" : "#2d7a0f", "inspections");
  html += '</div>';

  // Risk Distribution
  html += buildPdfSectionHeader("Risk Distribution");
  html += '<div style="background:#f6f8f9; border-radius:8px; padding:16px 20px; margin-bottom:20px;">';
  html += buildPdfRiskBar("Low Risk", riskCounts.low, data.length, "#2d7a0f");
  html += buildPdfRiskBar("Moderate Risk", riskCounts.moderate, data.length, "#9d6b0a");
  html += buildPdfRiskBar("High Risk", riskCounts.high, data.length, "#d4580a");
  html += buildPdfRiskBar("Critical Risk", riskCounts.critical, data.length, "#c42b1c");
  html += '</div>';

  // Compliance by Category
  html += buildPdfSectionHeader("Compliance by Category");
  html += '<table style="width:100%; font-size:10px; border-collapse:separate; border-spacing:0; margin-bottom:20px; border:1px solid #e0e6ea; border-radius:8px; overflow:hidden;">';
  html += '<thead><tr style="background:#003B4D; color:#fff;">';
  html += '<th style="text-align:left; padding:10px 12px; font-size:9px; text-transform:uppercase; letter-spacing:1px; font-weight:700;">Category</th>';
  html += '<th style="text-align:right; padding:10px 12px; font-size:9px; text-transform:uppercase; letter-spacing:1px; font-weight:700;">Pass</th>';
  html += '<th style="text-align:right; padding:10px 12px; font-size:9px; text-transform:uppercase; letter-spacing:1px; font-weight:700;">Fail</th>';
  html += '<th style="text-align:right; padding:10px 12px; font-size:9px; text-transform:uppercase; letter-spacing:1px; font-weight:700;">N/A</th>';
  html += '<th style="text-align:right; padding:10px 12px; font-size:9px; text-transform:uppercase; letter-spacing:1px; font-weight:700;">Compliance</th>';
  html += '<th style="text-align:left; padding:10px 12px; font-size:9px; text-transform:uppercase; letter-spacing:1px; font-weight:700; width:120px;">Performance</th>';
  html += '</tr></thead><tbody>';
  sections.forEach(function (s, idx) {
    var stats = getSectionStats(data, s);
    var applicable = stats.pass + stats.fail;
    var rate = applicable > 0 ? ((stats.pass / applicable) * 100).toFixed(1) : 0;
    var c = parseFloat(rate) >= 90 ? "#2d7a0f" : parseFloat(rate) >= 75 ? "#9d6b0a" : "#c42b1c";
    var bg = idx % 2 === 0 ? "#ffffff" : "#f6f8f9";
    html += '<tr style="background:' + bg + ';">';
    html += '<td style="padding:8px 12px; color:#003B4D; font-weight:600;">' + SECTION_LABELS[s] + '</td>';
    html += '<td style="padding:8px 12px; text-align:right; color:#2d7a0f; font-weight:600;">' + stats.pass + '</td>';
    html += '<td style="padding:8px 12px; text-align:right; color:#c42b1c; font-weight:600;">' + stats.fail + '</td>';
    html += '<td style="padding:8px 12px; text-align:right; color:#999;">' + stats.na + '</td>';
    html += '<td style="padding:8px 12px; text-align:right; font-weight:700; color:' + c + ';">' + rate + '%</td>';
    html += '<td style="padding:8px 12px;"><div style="height:6px; background:#e8edf0; border-radius:3px; overflow:hidden;"><div style="height:100%; width:' + rate + '%; background:' + c + ';"></div></div></td>';
    html += '</tr>';
  });
  html += '</tbody></table>';

  // Project breakdown
  var projectMap = {};
  data.forEach(function (d) {
    var p = d.generalInfo.projectName;
    if (!projectMap[p]) projectMap[p] = { count: 0, totalPass: 0, totalApplicable: 0, risks: [] };
    projectMap[p].count++;
    projectMap[p].risks.push(d.overallAssessment.riskLevel);
    Object.values(d.inspectionResults).forEach(function (section) {
      Object.values(section).forEach(function (v) {
        if (v === "pass") { projectMap[p].totalPass++; projectMap[p].totalApplicable++; }
        else if (v === "fail") { projectMap[p].totalApplicable++; }
      });
    });
  });

  if (Object.keys(projectMap).length > 1) {
    html += '<div style="page-break-before:always;">' + buildPdfPageHeader() + '</div>';
    html += buildPdfSectionHeader("Project Performance Summary");
    html += '<table style="width:100%; font-size:10px; border-collapse:separate; border-spacing:0; margin-bottom:20px; border:1px solid #e0e6ea; border-radius:8px; overflow:hidden;">';
    html += '<thead><tr style="background:#003B4D; color:#fff;"><th style="text-align:left; padding:10px 12px; font-size:9px; text-transform:uppercase; letter-spacing:1px;">Project</th>';
    html += '<th style="text-align:right; padding:10px 12px; font-size:9px; text-transform:uppercase; letter-spacing:1px;">Inspections</th>';
    html += '<th style="text-align:right; padding:10px 12px; font-size:9px; text-transform:uppercase; letter-spacing:1px;">Compliance</th>';
    html += '<th style="text-align:left; padding:10px 12px; font-size:9px; text-transform:uppercase; letter-spacing:1px;">Highest Risk</th></tr></thead><tbody>';
    Object.entries(projectMap).forEach(function (entry, idx) {
      var name = entry[0], p = entry[1];
      var pComp = p.totalApplicable > 0 ? ((p.totalPass / p.totalApplicable) * 100).toFixed(1) : 0;
      var c = parseFloat(pComp) >= 90 ? "#2d7a0f" : parseFloat(pComp) >= 75 ? "#9d6b0a" : "#c42b1c";
      var worstRisk = getWorstRisk(p.risks);
      var rc = { low: "#2d7a0f", moderate: "#9d6b0a", high: "#d4580a", critical: "#c42b1c" }[worstRisk];
      var bg = idx % 2 === 0 ? "#ffffff" : "#f6f8f9";
      html += '<tr style="background:' + bg + ';">';
      html += '<td style="padding:8px 12px; color:#003B4D; font-weight:600;">' + name + '</td>';
      html += '<td style="padding:8px 12px; text-align:right;">' + p.count + '</td>';
      html += '<td style="padding:8px 12px; text-align:right; font-weight:700; color:' + c + ';">' + pComp + '%</td>';
      html += '<td style="padding:8px 12px;"><span style="color:' + rc + '; font-weight:700; text-transform:uppercase; font-size:9px; padding:3px 8px; background:' + rc + '20; border-radius:10px;">' + worstRisk + '</span></td>';
      html += '</tr>';
    });
    html += '</tbody></table>';
  }

  // Inspector activity
  if (inspectors.length > 0) {
    html += buildPdfSectionHeader("Inspector Activity", "Sorted by inspection count");
    html += '<table style="width:100%; font-size:10px; border-collapse:separate; border-spacing:0; margin-bottom:20px; border:1px solid #e0e6ea; border-radius:8px; overflow:hidden;">';
    html += '<thead><tr style="background:#003B4D; color:#fff;"><th style="text-align:left; padding:10px 12px; font-size:9px; text-transform:uppercase; letter-spacing:1px;">Inspector</th>';
    html += '<th style="text-align:left; padding:10px 12px; font-size:9px; text-transform:uppercase; letter-spacing:1px;">Role</th>';
    html += '<th style="text-align:right; padding:10px 12px; font-size:9px; text-transform:uppercase; letter-spacing:1px;">Inspections</th>';
    html += '<th style="text-align:right; padding:10px 12px; font-size:9px; text-transform:uppercase; letter-spacing:1px;">Avg Rating</th>';
    html += '<th style="text-align:right; padding:10px 12px; font-size:9px; text-transform:uppercase; letter-spacing:1px;">Compliance</th></tr></thead><tbody>';
    inspectors.forEach(function (ins, idx) {
      var c = parseFloat(ins.compliance) >= 90 ? "#2d7a0f" : parseFloat(ins.compliance) >= 75 ? "#9d6b0a" : "#c42b1c";
      var bg = idx % 2 === 0 ? "#ffffff" : "#f6f8f9";
      html += '<tr style="background:' + bg + ';">';
      html += '<td style="padding:8px 12px; color:#003B4D; font-weight:600;">' + ins.name + '</td>';
      html += '<td style="padding:8px 12px; color:#666;">' + (ROLE_LABELS[ins.role] || ins.role) + '</td>';
      html += '<td style="padding:8px 12px; text-align:right;">' + ins.count + '</td>';
      html += '<td style="padding:8px 12px; text-align:right; color:#9d6b0a;">' + ins.avgRating + '</td>';
      html += '<td style="padding:8px 12px; text-align:right; font-weight:700; color:' + c + ';">' + ins.compliance + '%</td>';
      html += '</tr>';
    });
    html += '</tbody></table>';
  }

  // Recommendations
  var sectionCompliance = sections.map(function (s) {
    var stats = getSectionStats(data, s);
    var applicable = stats.pass + stats.fail;
    return { key: s, label: SECTION_LABELS[s], rate: applicable > 0 ? ((stats.pass / applicable) * 100) : 100, pass: stats.pass, fail: stats.fail, na: stats.na };
  }).sort(function (a, b) { return a.rate - b.rate; });

  var recs = generateRecommendations(data, sectionCompliance, riskCounts, stopWork);
  if (recs.length > 0) {
    html += buildPdfSectionHeader("Automated Recommendations");
    html += '<div style="background:linear-gradient(135deg,#003B4D08,#003B4D03); border-left:4px solid #003B4D; border-radius:6px; padding:16px 20px;">';
    html += '<ol style="margin:0; padding-left:20px; font-size:11px; color:#333; line-height:1.7;">';
    recs.forEach(function (r) {
      html += '<li style="margin-bottom:8px;">' + r + '</li>';
    });
    html += '</ol></div>';
  }

  return html;
}

function buildPdfInspectionContent(record) {
  var g = record.generalInfo;
  var a = record.overallAssessment;
  var compliance = getOverallCompliance([record]);
  var dateStr = new Date(g.inspectionDate + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  var typeLabel = INSPECTION_TYPE_LABELS[g.inspectionType] || g.inspectionType;
  var weatherLabel = WEATHER_LABELS[g.weather] || g.weather;
  var roleLabel = ROLE_LABELS[g.inspectorRole] || g.inspectorRole;

  var compVal = parseFloat(compliance);
  var statusColor = compVal >= 90 && !a.stopWorkIssued ? "#2d7a0f" : compVal >= 75 ? "#9d6b0a" : "#c42b1c";
  var riskColor = { low: "#2d7a0f", moderate: "#9d6b0a", high: "#d4580a", critical: "#c42b1c" }[a.riskLevel] || "#003B4D";

  var html = '';

  // Status banner
  html += '<div style="background:linear-gradient(135deg,' + statusColor + '15,' + statusColor + '05); border-left:4px solid ' + statusColor + '; border-radius:6px; padding:16px 20px; margin-bottom:24px; display:flex; justify-content:space-between; align-items:center;">';
  html += '<div><div style="font-size:9px; text-transform:uppercase; letter-spacing:1.5px; color:' + statusColor + '; font-weight:700;">Site Compliance</div>';
  html += '<div style="font-size:32px; font-weight:700; color:' + statusColor + '; line-height:1; margin-top:2px;">' + compliance + '%</div></div>';
  html += '<div style="text-align:right;">';
  html += '<div style="margin-bottom:6px;"><span style="display:inline-block; padding:4px 12px; background:' + riskColor + '; color:#fff; border-radius:14px; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px;">' + a.riskLevel + ' RISK</span></div>';
  html += '<div style="font-size:14px; color:#9d6b0a;">' + "★".repeat(parseInt(a.rating)) + '<span style="color:#ddd;">' + "☆".repeat(5 - parseInt(a.rating)) + '</span> <span style="color:#666; font-size:11px;">(' + a.rating + '/5)</span></div>';
  if (a.stopWorkIssued) html += '<div style="margin-top:6px;"><span style="display:inline-block; padding:4px 10px; background:#c42b1c; color:#fff; border-radius:4px; font-size:9px; font-weight:700; letter-spacing:1px;">⚠ STOP WORK ISSUED</span></div>';
  html += '</div></div>';

  // General info
  html += buildPdfSectionHeader("General Information");
  html += '<div style="display:grid; grid-template-columns:repeat(3,1fr); gap:14px 20px; padding:16px 20px; background:#f6f8f9; border-radius:8px; margin-bottom:20px;">';
  html += pdfField("Inspector", g.inspectorName);
  html += pdfField("Role", roleLabel);
  html += pdfField("Contractor", g.contractor);
  html += pdfField("Project Number", g.projectNumber || "N/A");
  html += pdfField("Inspection Type", typeLabel);
  html += pdfField("Date / Time", dateStr + " @ " + g.inspectionTime);
  html += pdfField("Weather", weatherLabel + (g.temperature ? " (" + g.temperature + "°F)" : ""));
  html += pdfField("Workers On-Site", g.workerCount);
  html += pdfField("Shift", g.shift.charAt(0).toUpperCase() + g.shift.slice(1));
  if (g.latitude && g.longitude) html += pdfField("GPS Location", g.latitude + ", " + g.longitude);
  html += '</div>';

  // Checklist
  html += buildPdfSectionHeader("Inspection Checklist", "Detailed pass / fail / N/A by category");
  Object.keys(SECTION_LABELS).forEach(function (sKey) {
    var sd = record.inspectionResults[sKey];
    if (!sd) return;
    var p = 0, f = 0, n = 0;
    Object.values(sd).forEach(function (v) { if (v === "pass") p++; else if (v === "fail") f++; else n++; });
    var applicable = p + f;
    var rate = applicable > 0 ? ((p / applicable) * 100).toFixed(0) : "—";
    var rateColor = parseFloat(rate) >= 90 ? "#2d7a0f" : parseFloat(rate) >= 75 ? "#9d6b0a" : "#c42b1c";

    html += '<div style="margin-bottom:14px; border:1px solid #e0e6ea; border-radius:8px; overflow:hidden; page-break-inside:avoid;">';
    html += '<div style="background:#f6f8f9; padding:10px 14px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e0e6ea;">';
    html += '<div style="font-size:12px; font-weight:700; color:#003B4D;">' + SECTION_LABELS[sKey] + '</div>';
    html += '<div style="font-size:10px; color:#666;"><span style="color:#2d7a0f; font-weight:700;">' + p + ' Pass</span> &nbsp;<span style="color:#c42b1c; font-weight:700;">' + f + ' Fail</span> &nbsp;<span>' + n + ' N/A</span> &nbsp;';
    if (rate !== "—") html += '<span style="color:' + rateColor + '; font-weight:700; padding:2px 8px; background:' + rateColor + '15; border-radius:10px; margin-left:4px;">' + rate + '%</span>';
    html += '</div></div>';
    html += '<div style="padding:10px 14px; display:grid; grid-template-columns:1fr 1fr; gap:4px 16px;">';
    Object.entries(sd).forEach(function (entry) {
      var label = ITEM_LABELS[entry[0]] || entry[0];
      var sym, clr, weight;
      if (entry[1] === "pass") { sym = "✓"; clr = "#2d7a0f"; weight = "700"; }
      else if (entry[1] === "fail") { sym = "✗"; clr = "#c42b1c"; weight = "700"; }
      else { sym = "—"; clr = "#bbb"; weight = "500"; }
      html += '<div style="display:flex; gap:8px; align-items:center; font-size:10px; padding:2px 0;"><span style="color:' + clr + '; font-weight:' + weight + '; font-size:13px; width:14px; text-align:center;">' + sym + '</span><span style="color:' + (entry[1] === "na" ? "#999" : "#333") + ';">' + label + '</span></div>';
    });
    html += '</div></div>';
  });

  // Corrective Actions
  if (a.correctiveActionsRequired && a.correctiveActions) {
    html += buildPdfSectionHeader("Corrective Actions Required");
    html += '<div style="background:linear-gradient(135deg,#c42b1c10,#c42b1c05); border-left:4px solid #c42b1c; border-radius:6px; padding:16px 20px; margin-bottom:14px;">';
    if (a.correctionPriority) html += '<div style="margin-bottom:8px;"><span style="display:inline-block; padding:4px 10px; background:#c42b1c; color:#fff; border-radius:4px; font-size:9px; font-weight:700; letter-spacing:1px; text-transform:uppercase;">Priority: ' + a.correctionPriority + '</span></div>';
    html += '<p style="font-size:11px; color:#333; line-height:1.5; margin:0;">' + a.correctiveActions + '</p>';
    html += '</div>';
  }

  // Positive Observations
  if (a.positiveObservations) {
    html += buildPdfSectionHeader("Positive Observations");
    html += '<div style="background:linear-gradient(135deg,#2d7a0f10,#2d7a0f05); border-left:4px solid #2d7a0f; border-radius:6px; padding:16px 20px; margin-bottom:14px;">';
    html += '<p style="font-size:11px; color:#333; line-height:1.5; margin:0; font-style:italic;">"' + a.positiveObservations + '"</p>';
    html += '</div>';
  }

  return html;
}

function pdfField(label, value) {
  return '<div><div style="font-size:8px; color:#888; text-transform:uppercase; font-weight:700; letter-spacing:0.5px;">' + label + '</div>'
    + '<div style="font-size:11px; color:#003B4D; font-weight:600; margin-top:2px;">' + (value || "N/A") + '</div></div>';
}

function generatePdfFilename(scope, data) {
  var date = new Date().toISOString().split("T")[0];
  if (scope === "project" && data.length > 0) {
    var proj = data[0].generalInfo.projectName.replace(/[^a-zA-Z0-9]+/g, "-").substring(0, 30);
    return "Worley-Safety-" + proj + "-" + date + ".pdf";
  }
  if (scope === "inspection" && data.length === 1) {
    var insp = data[0].generalInfo.projectName.replace(/[^a-zA-Z0-9]+/g, "-").substring(0, 20);
    return "Worley-Inspection-" + insp + "-" + data[0].generalInfo.inspectionDate + ".pdf";
  }
  return "Worley-Safety-Dashboard-Report-" + date + ".pdf";
}

async function generatePdf(scope, targetData) {
  if (!targetData || targetData.length === 0) {
    alert("No inspection data available for this scope. Please select a different scope or filter.");
    return;
  }

  if (typeof html2pdf === "undefined") {
    alert("PDF library is still loading. Please wait a moment and try again.");
    return;
  }

  console.log("Generating PDF — scope:", scope, "records:", targetData.length);

  var pdfContainer = document.createElement("div");
  pdfContainer.id = "pdfRenderTarget";
  pdfContainer.style.cssText = "position:fixed; top:0; left:-99999px; width:794px; background:#ffffff; color:#333; padding:32px 36px; font-family:'Helvetica Neue',Arial,sans-serif; font-size:11px; line-height:1.5; box-sizing:border-box; z-index:-1;";
  document.body.appendChild(pdfContainer);

  var title, subtitle;
  if (scope === "inspection" && targetData.length === 1) {
    var g = targetData[0].generalInfo;
    title = "Safety Inspection Report";
    subtitle = "Detailed inspection record for " + g.projectName + " conducted on " + new Date(g.inspectionDate + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  } else if (scope === "project" && targetData.length > 0) {
    title = "Project Safety Performance Report";
    subtitle = "Comprehensive safety review for " + targetData[0].generalInfo.projectName + " covering " + targetData.length + " inspection" + (targetData.length !== 1 ? "s" : "");
  } else {
    title = "Safety Inspection Executive Report";
    var dates = targetData.map(function (d) { return d.generalInfo.inspectionDate; }).sort();
    var dr = dates.length > 0 ? new Date(dates[0] + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) + " through " + new Date(dates[dates.length - 1] + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";
    subtitle = "Comprehensive analysis of " + targetData.length + " safety inspection" + (targetData.length !== 1 ? "s" : "") + (dr ? " conducted " + dr : "") + ".";
  }

  var content = buildPdfCoverPage(title, subtitle, scope, targetData.length);
  content += buildPdfPageHeader(scope);

  if (scope === "inspection" && targetData.length === 1) {
    content += buildPdfInspectionContent(targetData[0]);
  } else {
    content += buildPdfDashboardContent(targetData);
  }

  content += '<div style="margin-top:36px; padding-top:14px; border-top:2px solid #E8413C; display:flex; justify-content:space-between; align-items:center;">';
  content += '<div style="display:flex; align-items:center; gap:8px;">' + pdfLogoSmall();
  content += '<div style="font-size:9px; color:#888;">Worley Field Safety Program</div></div>';
  content += '<div style="font-size:9px; color:#999;">© 2026 Worley. Confidential — Internal use only.</div>';
  content += '</div>';

  pdfContainer.innerHTML = content;

  try {
    await html2pdf().set({
      margin: [12, 12, 16, 12],
      filename: generatePdfFilename(scope, targetData),
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff" },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait", compress: true },
      pagebreak: { mode: ["css", "legacy"], avoid: "tr" },
    }).from(pdfContainer).save();
    console.log("PDF generated successfully");
  } catch (err) {
    console.error("PDF generation error:", err);
    alert("Error generating PDF: " + (err.message || err));
  } finally {
    if (pdfContainer.parentNode) document.body.removeChild(pdfContainer);
  }
}

// ============================================================
// FILTER EVENT HANDLERS
// ============================================================

async function onFilterChange() {
  const allData = await getInspectionData();
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
// PHOTO DOCUMENTATION PANEL
// ============================================================

function renderPhotoDocumentation(data) {
  var container = document.getElementById("photoDocPanel");
  var countEl = document.getElementById("photoCount");
  if (!container) return;

  var photos = [];
  data.forEach(function (d) {
    if (!d.photoDescriptions || d.photoDescriptions.length === 0) return;
    var dateStr = new Date(d.generalInfo.inspectionDate + "T00:00:00").toLocaleDateString("en-US", {
      month: "short", day: "numeric",
    });
    d.photoDescriptions.forEach(function (photo) {
      photos.push({
        text: photo.text,
        type: photo.type,
        date: dateStr,
        project: d.generalInfo.projectName,
        inspector: d.generalInfo.inspectorName,
        risk: d.overallAssessment.riskLevel,
        imgUrl: getStockPhotoUrl(photo.type, photo.text),
      });
    });
  });

  _currentPhotoArray = photos;

  var totalPhotoCount = data.reduce(function (sum, d) { return sum + (d.photoCount || 0); }, 0);
  if (countEl) {
    countEl.textContent = totalPhotoCount + " photos across " + data.length + " inspections";
  }

  if (photos.length === 0) {
    container.innerHTML = '<p class="text-sm text-center py-6" style="color:rgba(255,255,255,0.7);">No photo documentation available for the selected inspections.</p>';
    return;
  }

  var recent = photos.slice(0, 12);

  var html = '<div class="photo-grid">';
  recent.forEach(function (photo, idx) {
    html += '<div class="photo-card" data-photo-index="' + idx + '" style="cursor:pointer">'
      + '<div class="photo-thumb" style="position:relative; height:120px; overflow:hidden;">'
      + '<img src="' + photo.imgUrl + '" alt="' + photo.text.replace(/"/g, '&quot;') + '" '
      + 'style="width:100%;height:120px;object-fit:cover;" loading="lazy" '
      + 'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">'
      + '<div style="display:none;height:120px;align-items:center;justify-content:center;background:' + getGradientForType(photo.type) + '">'
      + '<calcite-icon icon="camera" scale="l" style="color:#fff;opacity:0.7"></calcite-icon></div>'
      + '<span class="photo-type-badge ' + photo.type + '">' + photo.type + '</span>'
      + '<input type="checkbox" class="photo-select-cb" data-photo-index="' + idx + '" '
      + 'style="position:absolute;top:8px;left:8px;z-index:2;width:16px;height:16px;cursor:pointer;" '
      + 'onclick="event.stopPropagation()" title="Select for download">'
      + '</div>'
      + '<div class="photo-card-body photo-card-body-gradient ' + photo.type + '">'
      + '<div class="photo-card-desc">' + photo.text + '</div>'
      + '<div class="photo-card-meta">'
      + photo.date + ' &bull; ' + photo.project
      + '<br>' + photo.inspector
      + '</div>'
      + '</div>'
      + '</div>';
  });
  html += '</div>';

  if (photos.length > 12) {
    html += '<p class="text-xs text-center mt-3" style="color:rgba(255,255,255,0.75);">Showing 12 of ' + photos.length + ' documented photos</p>';
  }

  container.innerHTML = html;
}

// ============================================================
// LIGHTBOX
// ============================================================

let _lightboxIndex = 0;

function openLightbox(index) {
  if (!_currentPhotoArray[index]) return;
  _lightboxIndex = index;
  var photo = _currentPhotoArray[index];
  var overlay = document.getElementById("lightboxOverlay");
  document.getElementById("lightboxImage").src = photo.imgUrl.replace("w=400&h=300", "w=1200&h=900");
  document.getElementById("lightboxImage").alt = photo.text;
  document.getElementById("lightboxBadge").innerHTML =
    '<span class="risk-badge ' + photo.risk + '" style="font-size:0.75rem;">' + photo.type.toUpperCase() + '</span>';
  document.getElementById("lightboxDetails").innerHTML =
    '<p style="font-size:0.95rem;font-weight:600;margin-bottom:6px;">' + photo.text + '</p>'
    + '<p style="font-size:0.82rem;color:rgba(255,255,255,0.75);">'
    + photo.date + ' &bull; ' + photo.project + ' &bull; ' + photo.inspector + '</p>';
  document.getElementById("lightboxCounter").textContent = (index + 1) + " / " + Math.min(_currentPhotoArray.length, 12);
  overlay.classList.add("active");
}

function closeLightbox() {
  document.getElementById("lightboxOverlay").classList.remove("active");
}

function initLightbox() {
  var panel = document.getElementById("photoDocPanel");
  if (panel) {
    panel.addEventListener("click", function (e) {
      var card = e.target.closest(".photo-card");
      if (!card || e.target.classList.contains("photo-select-cb")) return;
      var idx = parseInt(card.getAttribute("data-photo-index"));
      if (!isNaN(idx)) openLightbox(idx);
    });
  }

  document.getElementById("lightboxCloseBtn").addEventListener("click", closeLightbox);
  document.getElementById("lightboxOverlay").addEventListener("click", function (e) {
    if (e.target === this) closeLightbox();
  });
  document.getElementById("lightboxPrev").addEventListener("click", function () {
    var maxIdx = Math.min(_currentPhotoArray.length, 12) - 1;
    openLightbox(_lightboxIndex > 0 ? _lightboxIndex - 1 : maxIdx);
  });
  document.getElementById("lightboxNext").addEventListener("click", function () {
    var maxIdx = Math.min(_currentPhotoArray.length, 12) - 1;
    openLightbox(_lightboxIndex < maxIdx ? _lightboxIndex + 1 : 0);
  });
  document.getElementById("lightboxDownloadBtn").addEventListener("click", function () {
    var photo = _currentPhotoArray[_lightboxIndex];
    if (photo) downloadPhoto(photo.imgUrl.replace("w=400&h=300", "w=1200&h=900"), "safety-photo-" + (_lightboxIndex + 1) + ".jpg");
  });
  document.addEventListener("keydown", function (e) {
    if (!document.getElementById("lightboxOverlay").classList.contains("active")) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") document.getElementById("lightboxPrev").click();
    if (e.key === "ArrowRight") document.getElementById("lightboxNext").click();
  });

  var dlBtn = document.getElementById("downloadSelectedPhotos");
  if (dlBtn) {
    dlBtn.addEventListener("click", downloadSelectedPhotos);
  }
  document.addEventListener("change", function (e) {
    if (e.target.classList.contains("photo-select-cb")) updateDownloadButtonVisibility();
  });
}

function downloadPhoto(url, filename) {
  fetch(url, { mode: "cors" })
    .then(function (r) { return r.blob(); })
    .then(function (blob) {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    })
    .catch(function () { window.open(url, "_blank"); });
}

function downloadSelectedPhotos() {
  var cbs = document.querySelectorAll(".photo-select-cb:checked");
  cbs.forEach(function (cb, i) {
    var idx = parseInt(cb.getAttribute("data-photo-index"));
    var photo = _currentPhotoArray[idx];
    if (photo) {
      setTimeout(function () {
        downloadPhoto(photo.imgUrl.replace("w=400&h=300", "w=1200&h=900"), "safety-photo-" + (idx + 1) + ".jpg");
      }, i * 500);
    }
  });
}

function updateDownloadButtonVisibility() {
  var btn = document.getElementById("downloadSelectedPhotos");
  var checked = document.querySelectorAll(".photo-select-cb:checked");
  if (btn) btn.style.display = checked.length > 0 ? "" : "none";
}

// ============================================================
// INSPECTION DETAIL MODAL
// ============================================================

function renderInspectionDetail(record) {
  var content = document.getElementById("inspectionDetailContent");
  if (!content) return;

  var g = record.generalInfo;
  var a = record.overallAssessment;
  var dateStr = new Date(g.inspectionDate + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  var typeLabel = INSPECTION_TYPE_LABELS[g.inspectionType] || g.inspectionType;
  var weatherLabel = WEATHER_LABELS[g.weather] || g.weather;
  var roleLabel = ROLE_LABELS[g.inspectorRole] || g.inspectorRole;
  var compliance = getOverallCompliance([record]);
  var compColor = parseFloat(compliance) >= 90 ? "#c4ea8a" : parseFloat(compliance) >= 75 ? "#fff0a0" : "#ffb8b3";
  var riskBadgeColor = { low: "#8DC63F", moderate: "#edd317", high: "#F4736B", critical: "#E8413C" }[a.riskLevel] || "#ffffff";

  document.getElementById("inspectionDetailTitle").textContent = g.projectName;
  document.getElementById("inspectionDetailSubtitle").textContent = dateStr + " • " + g.inspectorName + " • " + typeLabel;

  var html = '';

  // General Info
  html += '<div class="detail-section">';
  html += '<h4><calcite-icon icon="information" scale="s" style="margin-right:6px;color:#F4736B"></calcite-icon> General Information</h4>';
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px 20px;">';
  html += detailField("Inspector", g.inspectorName);
  html += detailField("Role", roleLabel);
  html += detailField("Project #", g.projectNumber || "N/A");
  html += detailField("Contractor", g.contractor);
  html += detailField("Inspection Type", typeLabel);
  html += detailField("Date / Time", dateStr + " at " + g.inspectionTime);
  html += detailField("Weather", weatherLabel + (g.temperature ? " (" + g.temperature + "°F)" : ""));
  html += detailField("Workers On-Site", g.workerCount);
  html += detailField("Shift", g.shift.charAt(0).toUpperCase() + g.shift.slice(1));
  html += detailField("Location", g.latitude && g.longitude ? g.latitude + ", " + g.longitude : "N/A");
  html += '</div></div>';

  // Overall Assessment
  html += '<div class="detail-section" style="border-color:' + riskBadgeColor + '44">';
  html += '<h4><calcite-icon icon="gauge" scale="s" style="margin-right:6px;color:#F4736B"></calcite-icon> Overall Assessment</h4>';
  html += '<div style="display:flex;flex-wrap:wrap;gap:16px;align-items:center;">';
  html += '<div style="text-align:center;min-width:90px"><div style="font-size:1.8rem;color:' + compColor + ';font-weight:700;">' + compliance + '%</div><div style="font-size:0.7rem;color:rgba(255,255,255,0.7);text-transform:uppercase;">Compliance</div></div>';
  html += '<div style="text-align:center;min-width:80px"><div style="font-size:1.4rem;color:#fff0a0;">' + "★".repeat(parseInt(a.rating)) + '<span style="color:rgba(255,255,255,0.3)">' + "☆".repeat(5 - parseInt(a.rating)) + '</span></div><div style="font-size:0.7rem;color:rgba(255,255,255,0.7);">Rating</div></div>';
  html += '<div><span class="risk-badge ' + a.riskLevel + '" style="font-size:0.8rem;">' + a.riskLevel.toUpperCase() + '</span></div>';
  if (a.stopWorkIssued) html += '<div><span class="risk-badge critical" style="font-size:0.8rem;">STOP WORK ISSUED</span></div>';
  html += '</div></div>';

  // Checklist sections
  var sections = Object.keys(SECTION_LABELS);
  sections.forEach(function (sKey) {
    var sectionData = record.inspectionResults[sKey];
    if (!sectionData) return;
    var pass = 0, fail = 0, na = 0;
    Object.values(sectionData).forEach(function (v) { if (v === "pass") pass++; else if (v === "fail") fail++; else na++; });

    html += '<div class="detail-section">';
    html += '<h4><calcite-icon icon="clipboard-check" scale="s" style="margin-right:6px;color:#F4736B"></calcite-icon> ' + SECTION_LABELS[sKey];
    html += ' <span style="float:right;font-size:0.75rem;font-weight:500;color:rgba(255,255,255,0.7);text-transform:none;letter-spacing:0;">';
    html += '<span style="color:#c4ea8a">' + pass + 'P</span> <span style="color:#ffb8b3">' + fail + 'F</span> <span>' + na + 'N/A</span></span></h4>';
    html += '<div class="checklist-grid">';
    Object.entries(sectionData).forEach(function (entry) {
      var itemId = entry[0], val = entry[1];
      var label = ITEM_LABELS[itemId] || itemId;
      var icon, cls;
      if (val === "pass") { icon = "check-circle-f"; cls = "checklist-icon-pass"; }
      else if (val === "fail") { icon = "x-circle-f"; cls = "checklist-icon-fail"; }
      else { icon = "minus-circle"; cls = "checklist-icon-na"; }
      html += '<div class="checklist-item"><calcite-icon icon="' + icon + '" scale="s" class="' + cls + '"></calcite-icon><span>' + label + '</span></div>';
    });
    html += '</div>';

    var noteKey = sKey === "tools" ? "toolsNotes" : sKey === "fireHotWork" ? "fireNotes" : sKey + "Notes";
    var note = record.sectionNotes && record.sectionNotes[noteKey];
    if (note) html += '<p style="margin-top:8px;font-size:0.82rem;color:rgba(255,255,255,0.75);font-style:italic;">"' + note + '"</p>';
    html += '</div>';
  });

  // Corrective Actions
  if (a.correctiveActionsRequired && a.correctiveActions) {
    html += '<div class="detail-section" style="border-color:rgba(232,65,60,0.4)">';
    html += '<h4 style="color:#ffb8b3"><calcite-icon icon="exclamation-mark-triangle" scale="s" style="margin-right:6px;color:#ffb8b3"></calcite-icon> Corrective Actions Required</h4>';
    html += '<p style="font-size:0.85rem;color:#ffffff;">' + a.correctiveActions + '</p>';
    if (a.correctionPriority) html += '<p style="margin-top:6px;font-size:0.78rem;"><span class="risk-badge ' + (a.correctionPriority === "immediate" ? "critical" : a.correctionPriority === "today" ? "high" : "moderate") + '">' + a.correctionPriority.toUpperCase() + '</span></p>';
    html += '</div>';
  }

  // Positive Observations
  if (a.positiveObservations) {
    html += '<div class="detail-section" style="border-color:rgba(141,198,63,0.4)">';
    html += '<h4 style="color:#c4ea8a"><calcite-icon icon="thumbs-up" scale="s" style="margin-right:6px;color:#c4ea8a"></calcite-icon> Positive Observations</h4>';
    html += '<p style="font-size:0.85rem;color:#ffffff;">' + a.positiveObservations + '</p>';
    html += '</div>';
  }

  content.innerHTML = html;
}

function detailField(label, value) {
  return '<div><div style="font-size:0.68rem;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.04em;font-weight:600;">' + label + '</div>'
    + '<div style="font-size:0.88rem;color:#ffffff;font-weight:500;">' + (value || "N/A") + '</div></div>';
}

function openInspectionDetail(record) {
  _currentDetailRecord = record;
  renderInspectionDetail(record);
  document.getElementById("inspectionDetailOverlay").classList.add("active");
}

function closeInspectionDetail() {
  document.getElementById("inspectionDetailOverlay").classList.remove("active");
}

function initInspectionDetailModal() {
  var overlay = document.getElementById("inspectionDetailOverlay");
  var closeBtn = document.getElementById("inspectionDetailCloseBtn");
  var pdfBtn = document.getElementById("inspectionDetailPdfBtn");

  if (closeBtn) closeBtn.addEventListener("click", closeInspectionDetail);
  if (overlay) overlay.addEventListener("click", function (e) { if (e.target === overlay) closeInspectionDetail(); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && overlay && overlay.classList.contains("active")) closeInspectionDetail();
  });
  if (pdfBtn) pdfBtn.addEventListener("click", function () {
    if (_currentDetailRecord) generatePdf("inspection", [_currentDetailRecord]);
  });

  // Table row click delegation (bind once)
  var tbody = document.getElementById("inspectionTableBody");
  if (tbody) {
    tbody.addEventListener("click", function (e) {
      var row = e.target.closest("tr");
      if (!row) return;
      var idx = parseInt(row.getAttribute("data-index"));
      if (!isNaN(idx) && _lastTableData[idx]) openInspectionDetail(_lastTableData[idx]);
    });
  }
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
  renderPhotoDocumentation(data);
  renderComplianceBreakdown(data);
  renderInspectionTable(data);
  renderInspectorLeaderboard(data);
  renderMapPoints(data);
}

// ============================================================
// INITIALIZE
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  customElements.whenDefined("calcite-select").then(async () => {
    applyChartDefaults();
    try {
      const allData = await getInspectionData();
      computeDatasetLatestDate(allData);
      populateFilterDropdowns(allData);
      filteredData = applyFilters(allData);
      initFilterListeners();
      initTrendToggle();
      initReportModal();
      initLightbox();
      initInspectionDetailModal();
      initInspectionMap();
      renderAll(filteredData);
    } catch (err) {
      console.error("Dashboard initialization error:", err);
      const allData = SAMPLE_INSPECTIONS || [];
      computeDatasetLatestDate(allData);
      populateFilterDropdowns(allData);
      filteredData = applyFilters(allData);
      initFilterListeners();
      initTrendToggle();
      initReportModal();
      initLightbox();
      initInspectionDetailModal();
      initInspectionMap();
      renderAll(filteredData);
    }
  });
});
