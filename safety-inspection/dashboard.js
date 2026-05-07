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
// PDF GENERATION (jsPDF — no DOM cloning, no html2canvas)
// ============================================================

var _logoDataUrl = null;

async function loadLogoForPdf() {
  if (_logoDataUrl) return _logoDataUrl;
  try {
    var resp = await fetch('worley-logo.svg');
    var svgText = await resp.text();
    var canvas = document.createElement('canvas');
    canvas.width = 200; canvas.height = 200;
    var ctx = canvas.getContext('2d');
    var img = new Image();
    var blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    return new Promise(function (resolve) {
      img.onload = function () { ctx.drawImage(img, 0, 0, 200, 200); _logoDataUrl = canvas.toDataURL('image/png'); URL.revokeObjectURL(url); resolve(_logoDataUrl); };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  } catch (e) { return null; }
}

var PC = {
  navy:[0,59,77], red:[232,65,60], coral:[244,115,107], teal:[68,200,193],
  green:[141,198,63], greenDk:[45,122,15], white:[255,255,255],
  gray:[136,136,136], grayLt:[246,248,249], grayBd:[224,230,234],
  txt:[51,51,51], txtLt:[102,102,102],
  rLow:[45,122,15], rMod:[157,107,10], rHi:[212,88,10], rCrit:[196,43,28],
};

function pdfLogo(doc, x, y, sz) {
  if (_logoDataUrl) try { doc.addImage(_logoDataUrl, 'PNG', x, y, sz, sz); } catch (e) {}
}

function pdfSH(doc, y, title, sub) {
  doc.setFillColor(232,65,60);
  doc.rect(15, y, 1.5, 7, 'F');
  doc.setFont("helvetica","bold"); doc.setFontSize(13); doc.setTextColor(0,59,77);
  doc.text(title, 20, y+5.5);
  if (sub) {
    var tw = doc.getTextWidth(title);
    doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(136,136,136);
    doc.text(sub, 20+tw+6, y+5.5);
  }
  return y + 12;
}

function pdfPH(doc, y) {
  pdfLogo(doc, 15, y-3, 8);
  doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.setTextColor(0,59,77);
  doc.text("worley", 25, y+1);
  doc.setFontSize(6); doc.setTextColor(232,65,60);
  doc.text("CONSULTING", 25, y+5);
  doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(136,136,136);
  doc.text("Safety Inspection Report", 50, y+1);
  doc.text(new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}), 195, y+1, {align:"right"});
  doc.setFillColor(232,65,60); doc.rect(15, y+8, 180, 0.6, 'F');
  return y + 14;
}

function pdfFT(doc) {
  doc.setFillColor(232,65,60); doc.rect(15, 282, 180, 0.6, 'F');
  pdfLogo(doc, 15, 284, 6);
  doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(136,136,136);
  doc.text("Worley Field Safety Program", 23, 288);
  doc.text("(c) 2026 Worley. Confidential - Internal use only.", 195, 288, {align:"right"});
}

function pdfRating(doc, x, y, rating) {
  for (var i = 0; i < 5; i++) {
    if (i < rating) { doc.setFillColor(237,211,23); doc.circle(x+i*4, y, 1.3, 'F'); }
    else { doc.setDrawColor(200,200,200); doc.setFillColor(255,255,255); doc.circle(x+i*4, y, 1.3, 'FD'); }
  }
}

function pdfCover(doc, scope, data) {
  doc.setFillColor(0,59,77); doc.rect(0, 0, 210, 145, 'F');
  pdfLogo(doc, 17, 25, 22);
  doc.setTextColor(255,255,255); doc.setFont("helvetica","bold"); doc.setFontSize(28);
  doc.text("worley", 43, 38);
  doc.setFontSize(9); doc.setTextColor(244,115,107);
  doc.text("CONSULTING", 43, 44);
  doc.setFillColor(232,65,60); doc.rect(15, 58, 50, 1.5, 'F');
  doc.setTextColor(200,215,220); doc.setFont("helvetica","normal"); doc.setFontSize(9);
  doc.text("FIELD SAFETY PROGRAM", 15, 70);

  var title, subtitle;
  if (scope === "inspection" && data.length === 1) {
    var gi = data[0].generalInfo;
    title = "Safety Inspection Report";
    subtitle = "Detailed inspection record for " + gi.projectName + " conducted on " +
      new Date(gi.inspectionDate+"T00:00:00").toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
  } else if (scope === "project" && data.length > 0) {
    title = "Project Safety Performance Report";
    subtitle = "Comprehensive safety review for " + data[0].generalInfo.projectName +
      " covering " + data.length + " inspection" + (data.length!==1?"s":"");
  } else {
    title = "Safety Inspection Executive Report";
    var dates = data.map(function(d){return d.generalInfo.inspectionDate;}).sort();
    subtitle = "Comprehensive analysis of " + data.length + " safety inspection" + (data.length!==1?"s":"");
    if (dates.length > 1) subtitle += " conducted " +
      new Date(dates[0]+"T00:00:00").toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"}) +
      " through " + new Date(dates[dates.length-1]+"T00:00:00").toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
  }

  doc.setTextColor(255,255,255); doc.setFont("helvetica","bold"); doc.setFontSize(26);
  var tl = doc.splitTextToSize(title, 130);
  doc.text(tl, 15, 82);
  doc.setFont("helvetica","normal"); doc.setFontSize(11); doc.setTextColor(220,230,235);
  doc.text(doc.splitTextToSize(subtitle, 145), 15, 82 + tl.length*10 + 6);

  doc.setFillColor(246,248,249); doc.rect(15, 155, 180, 60, 'F');
  doc.setDrawColor(224,230,234); doc.rect(15, 155, 180, 60, 'S');
  var meta = [
    ["REPORT TYPE", scope==="inspection"?"Single Inspection Detail":scope==="project"?"Project Safety Review":"Comprehensive Dashboard Report"],
    ["INSPECTIONS COVERED", data.length+" inspection"+(data.length!==1?"s":"")],
    ["GENERATED", new Date().toLocaleString("en-US",{month:"long",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"})],
    ["CLASSIFICATION", "Internal - Confidential"],
  ];
  meta.forEach(function(m,i) {
    var cx = 25+(i%2)*90, cy = 167+Math.floor(i/2)*26;
    doc.setFont("helvetica","bold"); doc.setFontSize(7); doc.setTextColor(136,136,136);
    doc.text(m[0], cx, cy);
    doc.setFontSize(11); doc.setTextColor(0,59,77);
    doc.text(m[1], cx, cy+6);
  });

  doc.setFillColor(232,65,60); doc.rect(15, 240, 180, 0.8, 'F');
  doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(153,153,153);
  doc.text("(c) 2026 Worley. This report contains confidential information intended for authorized personnel only.", 105, 248, {align:"center"});
}

function pdfDashboard(doc, state, data, checkPage) {
  var compliance = getOverallCompliance(data);
  var avgRating = getAverageRating(data);
  var riskCounts = getRiskCounts(data);
  var stopWork = getStopWorkCount(data);
  var corrective = getCorrectiveActionCount(data);
  var inspectors = getInspectorStats(data).sort(function(a,b){return b.count-a.count;});
  var sections = Object.keys(SECTION_LABELS);
  var compVal = parseFloat(compliance);

  var sc, sl;
  if (compVal >= 90 && stopWork === 0) { sc = PC.rLow; sl = "GOOD STANDING"; }
  else if (compVal >= 75) { sc = PC.rMod; sl = "CAUTION ADVISED"; }
  else { sc = PC.rCrit; sl = "ACTION REQUIRED"; }

  doc.setFillColor(246,248,249); doc.rect(15, state.y, 180, 18, 'F');
  doc.setFillColor.apply(doc, sc); doc.rect(15, state.y, 1.5, 18, 'F');
  doc.setFont("helvetica","bold"); doc.setFontSize(7); doc.setTextColor.apply(doc, sc);
  doc.text("OVERALL STATUS", 21, state.y+5);
  doc.setFontSize(14); doc.text(sl, 21, state.y+13);
  doc.setFontSize(22); doc.text(compliance+"%", 190, state.y+13, {align:"right"});
  doc.setFontSize(7); doc.setTextColor(136,136,136);
  doc.text("COMPLIANCE RATE", 190, state.y+17, {align:"right"});
  state.y += 24;

  state.y = pdfSH(doc, state.y, "Executive Summary", data.length+" inspections analyzed");

  var tw = 57.3, th = 24;
  var kpis = [
    ["Total Inspections", data.length, PC.navy, "in reporting period"],
    ["Avg Safety Rating", avgRating+" / 5", PC.coral, parseFloat(avgRating)>=4?"above target":"review needed"],
    ["Stop Work Orders", stopWork, stopWork>0?PC.rCrit:PC.greenDk, stopWork>0?"investigate":"none issued"],
    ["Corrective Actions", corrective, corrective>0?PC.rMod:PC.greenDk, "open or scheduled"],
    ["Active Inspectors", inspectors.length, PC.teal, "across program"],
    ["High/Critical Risk", riskCounts.high+riskCounts.critical, (riskCounts.high+riskCounts.critical)>0?PC.rCrit:PC.greenDk, "inspections"],
  ];
  kpis.forEach(function(k,i) {
    var col = i%3, row = Math.floor(i/3);
    var kx = 15+col*(tw+4), ky = state.y+row*(th+4);
    doc.setFillColor(255,255,255); doc.rect(kx, ky, tw, th, 'F');
    doc.setDrawColor(224,230,234); doc.rect(kx, ky, tw, th, 'S');
    doc.setFillColor.apply(doc, k[2]); doc.rect(kx, ky, tw, 1.2, 'F');
    doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(136,136,136);
    doc.text(String(k[0]).toUpperCase(), kx+4, ky+7);
    doc.setFontSize(16); doc.setTextColor(0,59,77);
    doc.text(String(k[1]), kx+4, ky+15);
    doc.setFont("helvetica","normal"); doc.setFontSize(6.5); doc.setTextColor(136,136,136);
    doc.text(k[3], kx+4, ky+20);
  });
  state.y += (th+4)*2+6;

  checkPage(70);
  state.y = pdfSH(doc, state.y, "Risk Distribution");
  doc.setFillColor(246,248,249); doc.rect(15, state.y, 180, 60, 'F');
  var ry = state.y + 4;
  [["Low Risk",riskCounts.low,PC.rLow],["Moderate Risk",riskCounts.moderate,PC.rMod],
   ["High Risk",riskCounts.high,PC.rHi],["Critical Risk",riskCounts.critical,PC.rCrit]
  ].forEach(function(r) {
    var pct = data.length>0?((r[1]/data.length)*100).toFixed(0):0;
    doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor.apply(doc, r[2]);
    doc.text(r[0], 20, ry+4);
    doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(102,102,102);
    doc.text(r[1]+" ("+pct+"%)", 190, ry+4, {align:"right"});
    doc.setFillColor(232,237,240); doc.rect(20, ry+6, 170, 3, 'F');
    if (parseFloat(pct)>0) { doc.setFillColor.apply(doc, r[2]); doc.rect(20, ry+6, 170*parseFloat(pct)/100, 3, 'F'); }
    ry += 14;
  });
  state.y += 64;

  checkPage(30);
  state.y = pdfSH(doc, state.y, "Compliance by Category");
  var compRows = sections.map(function(s) {
    var st = getSectionStats(data, s), app = st.pass+st.fail;
    var rate = app>0?((st.pass/app)*100).toFixed(1):"N/A";
    return [SECTION_LABELS[s], String(st.pass), String(st.fail), String(st.na), rate!=="N/A"?rate+"%":rate];
  });
  doc.autoTable({
    startY: state.y,
    head: [["Category","Pass","Fail","N/A","Compliance"]],
    body: compRows, theme: "grid",
    headStyles: {fillColor:PC.navy, textColor:255, fontSize:7, fontStyle:"bold", cellPadding:3},
    styles: {fontSize:8, cellPadding:2.5, textColor:PC.txt},
    columnStyles: {0:{fontStyle:"bold",textColor:PC.navy},1:{halign:"right",textColor:PC.greenDk},2:{halign:"right",textColor:PC.rCrit},3:{halign:"right",textColor:PC.gray},4:{halign:"right",fontStyle:"bold"}},
    alternateRowStyles: {fillColor:PC.grayLt},
    margin: {left:15, right:15},
    didParseCell: function(d) {
      if (d.column.index===4 && d.section==="body") {
        var v=parseFloat(d.cell.raw);
        if(v>=90) d.cell.styles.textColor=PC.greenDk;
        else if(v>=75) d.cell.styles.textColor=PC.rMod;
        else if(!isNaN(v)) d.cell.styles.textColor=PC.rCrit;
      }
    },
  });
  state.y = doc.lastAutoTable.finalY + 8;

  var pm = {};
  data.forEach(function(d) {
    var p = d.generalInfo.projectName;
    if (!pm[p]) pm[p] = {count:0, pass:0, app:0, risks:[]};
    pm[p].count++; pm[p].risks.push(d.overallAssessment.riskLevel);
    Object.values(d.inspectionResults).forEach(function(sec) {
      Object.values(sec).forEach(function(v) {
        if (v==="pass") {pm[p].pass++;pm[p].app++;} else if(v==="fail") {pm[p].app++;}
      });
    });
  });
  if (Object.keys(pm).length > 1) {
    checkPage(40);
    state.y = pdfSH(doc, state.y, "Project Performance Summary");
    var pRows = Object.entries(pm).map(function(e) {
      var pc = e[1].app>0?((e[1].pass/e[1].app)*100).toFixed(1):"0";
      return [e[0], String(e[1].count), pc+"%", getWorstRisk(e[1].risks).toUpperCase()];
    });
    doc.autoTable({
      startY: state.y,
      head: [["Project","Inspections","Compliance","Highest Risk"]],
      body: pRows, theme: "grid",
      headStyles: {fillColor:PC.navy, textColor:255, fontSize:7, fontStyle:"bold", cellPadding:3},
      styles: {fontSize:8, cellPadding:2.5, textColor:PC.txt},
      columnStyles: {0:{fontStyle:"bold",textColor:PC.navy},1:{halign:"right"},2:{halign:"right",fontStyle:"bold"},3:{fontStyle:"bold"}},
      alternateRowStyles: {fillColor:PC.grayLt},
      margin: {left:15, right:15},
      didParseCell: function(d) {
        if (d.column.index===2 && d.section==="body") {
          var v=parseFloat(d.cell.raw);
          if(v>=90) d.cell.styles.textColor=PC.greenDk;
          else if(v>=75) d.cell.styles.textColor=PC.rMod;
          else d.cell.styles.textColor=PC.rCrit;
        }
        if (d.column.index===3 && d.section==="body") {
          var rm={LOW:PC.rLow,MODERATE:PC.rMod,HIGH:PC.rHi,CRITICAL:PC.rCrit};
          d.cell.styles.textColor = rm[d.cell.raw]||PC.txt;
        }
      },
    });
    state.y = doc.lastAutoTable.finalY + 8;
  }

  if (inspectors.length > 0) {
    checkPage(40);
    state.y = pdfSH(doc, state.y, "Inspector Activity", "Sorted by inspection count");
    doc.autoTable({
      startY: state.y,
      head: [["Inspector","Role","Inspections","Avg Rating","Compliance"]],
      body: inspectors.map(function(ins){return [ins.name, ROLE_LABELS[ins.role]||ins.role, String(ins.count), ins.avgRating, ins.compliance+"%"];}),
      theme: "grid",
      headStyles: {fillColor:PC.navy, textColor:255, fontSize:7, fontStyle:"bold", cellPadding:3},
      styles: {fontSize:8, cellPadding:2.5, textColor:PC.txt},
      columnStyles: {0:{fontStyle:"bold",textColor:PC.navy},2:{halign:"right"},3:{halign:"right"},4:{halign:"right",fontStyle:"bold"}},
      alternateRowStyles: {fillColor:PC.grayLt},
      margin: {left:15, right:15},
      didParseCell: function(d) {
        if (d.column.index===4 && d.section==="body") {
          var v=parseFloat(d.cell.raw);
          if(v>=90) d.cell.styles.textColor=PC.greenDk;
          else if(v>=75) d.cell.styles.textColor=PC.rMod;
          else d.cell.styles.textColor=PC.rCrit;
        }
      },
    });
    state.y = doc.lastAutoTable.finalY + 8;
  }

  var scomp = sections.map(function(s) {
    var st = getSectionStats(data,s), app=st.pass+st.fail;
    return {key:s, label:SECTION_LABELS[s], rate:app>0?(st.pass/app)*100:100, pass:st.pass, fail:st.fail, na:st.na};
  }).sort(function(a,b){return a.rate-b.rate;});
  var recs = generateRecommendations(data, scomp, riskCounts, stopWork);
  if (recs.length > 0) {
    checkPage(recs.length*7+20);
    state.y = pdfSH(doc, state.y, "Automated Recommendations");
    var rH = recs.length*7+10;
    doc.setFillColor(246,248,249); doc.rect(15, state.y, 180, rH, 'F');
    doc.setFillColor(0,59,77); doc.rect(15, state.y, 1.5, rH, 'F');
    doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(51,51,51);
    recs.forEach(function(r,i) { doc.text(doc.splitTextToSize((i+1)+". "+r, 168), 21, state.y+7+i*7); });
    state.y += rH + 6;
  }
}

function pdfInspection(doc, state, record, checkPage) {
  var g = record.generalInfo, a = record.overallAssessment;
  var compliance = getOverallCompliance([record]);
  var compVal = parseFloat(compliance);
  var sc = compVal>=90&&!a.stopWorkIssued?PC.rLow:compVal>=75?PC.rMod:PC.rCrit;
  var rcm = {low:PC.rLow,moderate:PC.rMod,high:PC.rHi,critical:PC.rCrit};
  var rc = rcm[a.riskLevel]||PC.navy;
  var dateStr = new Date(g.inspectionDate+"T00:00:00").toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
  var typeLabel = INSPECTION_TYPE_LABELS[g.inspectionType]||g.inspectionType;
  var weatherLabel = WEATHER_LABELS[g.weather]||g.weather;
  var roleLabel = ROLE_LABELS[g.inspectorRole]||g.inspectorRole;

  doc.setFillColor(246,248,249); doc.rect(15, state.y, 180, 22, 'F');
  doc.setFillColor.apply(doc, sc); doc.rect(15, state.y, 1.5, 22, 'F');
  doc.setFont("helvetica","bold"); doc.setFontSize(7); doc.setTextColor.apply(doc, sc);
  doc.text("SITE COMPLIANCE", 21, state.y+5);
  doc.setFontSize(22); doc.text(compliance+"%", 21, state.y+17);
  doc.setFontSize(9); doc.setTextColor.apply(doc, rc);
  doc.text(a.riskLevel.toUpperCase()+" RISK", 190, state.y+7, {align:"right"});
  pdfRating(doc, 170, state.y+13, parseInt(a.rating));
  doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(102,102,102);
  doc.text("("+a.rating+"/5)", 190, state.y+14, {align:"right"});
  if (a.stopWorkIssued) {
    doc.setFillColor(196,43,28); doc.rect(152, state.y+17, 38, 5, 'F');
    doc.setFont("helvetica","bold"); doc.setFontSize(6); doc.setTextColor(255,255,255);
    doc.text("STOP WORK ISSUED", 171, state.y+20.5, {align:"center"});
  }
  state.y += 28;

  state.y = pdfSH(doc, state.y, "General Information");
  var fields = [
    ["Inspector",g.inspectorName],["Role",roleLabel],["Contractor",g.contractor],
    ["Project Number",g.projectNumber||"N/A"],["Inspection Type",typeLabel],
    ["Date / Time",dateStr+" @ "+g.inspectionTime],
    ["Weather",weatherLabel+(g.temperature?" ("+g.temperature+"F)":"")],
    ["Workers On-Site",String(g.workerCount)],
    ["Shift",g.shift.charAt(0).toUpperCase()+g.shift.slice(1)],
  ];
  if (g.latitude&&g.longitude) fields.push(["GPS Location",g.latitude+", "+g.longitude]);
  var fRows = Math.ceil(fields.length/3), fH = fRows*14+8;
  doc.setFillColor(246,248,249); doc.rect(15, state.y, 180, fH, 'F');
  fields.forEach(function(f,i) {
    var fx = 20+(i%3)*56.7, fy = state.y+6+Math.floor(i/3)*14;
    doc.setFont("helvetica","bold"); doc.setFontSize(6); doc.setTextColor(136,136,136);
    doc.text(f[0].toUpperCase(), fx, fy);
    doc.setFontSize(9); doc.setTextColor(0,59,77);
    doc.text(String(f[1]), fx, fy+5);
  });
  state.y += fH + 6;

  checkPage(20);
  state.y = pdfSH(doc, state.y, "Inspection Checklist", "Detailed results by category");
  Object.keys(SECTION_LABELS).forEach(function(sKey) {
    var sd = record.inspectionResults[sKey];
    if (!sd) return;
    var p=0, f=0, n=0;
    Object.values(sd).forEach(function(v){if(v==="pass")p++;else if(v==="fail")f++;else n++;});
    var app = p+f, rate = app>0?((p/app)*100).toFixed(0)+"%":"--";
    var items = Object.entries(sd);
    checkPage(items.length*4+14);
    doc.autoTable({
      startY: state.y,
      head: [[{content: SECTION_LABELS[sKey]+"  ("+p+"P / "+f+"F / "+n+"N/A | "+rate+")", colSpan:2, styles:{fillColor:PC.navy, textColor:255, fontSize:8, fontStyle:"bold"}}]],
      body: items.map(function(entry) {
        var status = entry[1]==="pass"?"PASS":entry[1]==="fail"?"FAIL":"N/A";
        return [status, ITEM_LABELS[entry[0]]||entry[0]];
      }),
      theme: "grid",
      styles: {fontSize:7.5, cellPadding:2, textColor:PC.txt},
      columnStyles: {0:{cellWidth:18, halign:"center", fontStyle:"bold"}, 1:{}},
      alternateRowStyles: {fillColor:PC.grayLt},
      margin: {left:15, right:15},
      didParseCell: function(d) {
        if (d.column.index===0 && d.section==="body") {
          if (d.cell.raw==="PASS") d.cell.styles.textColor = PC.greenDk;
          else if (d.cell.raw==="FAIL") d.cell.styles.textColor = PC.rCrit;
          else d.cell.styles.textColor = [187,187,187];
        }
      },
    });
    state.y = doc.lastAutoTable.finalY + 4;
  });
  state.y += 4;

  if (a.correctiveActionsRequired && a.correctiveActions) {
    checkPage(25);
    state.y = pdfSH(doc, state.y, "Corrective Actions Required");
    var caL = doc.splitTextToSize(a.correctiveActions, 168);
    var caH = caL.length*4.5+(a.correctionPriority?16:8);
    doc.setFillColor(246,248,249); doc.rect(15, state.y, 180, caH, 'F');
    doc.setFillColor(196,43,28); doc.rect(15, state.y, 1.5, caH, 'F');
    var caY = state.y+7;
    if (a.correctionPriority) {
      doc.setFillColor(196,43,28); doc.rect(20, state.y+3, 32, 5, 'F');
      doc.setFont("helvetica","bold"); doc.setFontSize(6); doc.setTextColor(255,255,255);
      doc.text("PRIORITY: "+a.correctionPriority.toUpperCase(), 22, state.y+6.5);
      caY = state.y+13;
    }
    doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(51,51,51);
    doc.text(caL, 20, caY);
    state.y += caH + 6;
  }

  if (a.positiveObservations) {
    checkPage(20);
    state.y = pdfSH(doc, state.y, "Positive Observations");
    var poL = doc.splitTextToSize('"'+a.positiveObservations+'"', 168);
    var poH = poL.length*4.5+8;
    doc.setFillColor(246,248,249); doc.rect(15, state.y, 180, poH, 'F');
    doc.setFillColor(45,122,15); doc.rect(15, state.y, 1.5, poH, 'F');
    doc.setFont("helvetica","italic"); doc.setFontSize(9); doc.setTextColor(51,51,51);
    doc.text(poL, 20, state.y+6);
    state.y += poH + 6;
  }
}

function generatePdfFilename(scope, data) {
  var date = new Date().toISOString().split("T")[0];
  if (scope==="project"&&data.length>0) return "Worley-Safety-"+data[0].generalInfo.projectName.replace(/[^a-zA-Z0-9]+/g,"-").substring(0,30)+"-"+date+".pdf";
  if (scope==="inspection"&&data.length===1) return "Worley-Inspection-"+data[0].generalInfo.projectName.replace(/[^a-zA-Z0-9]+/g,"-").substring(0,20)+"-"+data[0].generalInfo.inspectionDate+".pdf";
  return "Worley-Safety-Dashboard-Report-"+date+".pdf";
}

async function generatePdf(scope, targetData) {
  if (!targetData||targetData.length===0) { alert("No inspection data available for this scope."); return; }
  var jsPDFClass = (window.jspdf&&window.jspdf.jsPDF)||window.jsPDF;
  if (!jsPDFClass) {
    console.error("jsPDF not loaded. Globals present:", { "window.jspdf": window.jspdf, "window.jsPDF": window.jsPDF });
    alert("PDF library failed to load from CDN. Open the browser console for details, then hard-reload the page (Ctrl+Shift+R / Cmd+Shift+R). A network restriction or ad-blocker may be blocking jsdelivr/cdnjs/unpkg.");
    return;
  }
  console.log("Generating PDF - scope:", scope, "records:", targetData.length, "autoTable available:", !!(jsPDFClass.API && jsPDFClass.API.autoTable));
  if (!_logoDataUrl) await loadLogoForPdf();
  var doc = new jsPDFClass({unit:"mm",format:"a4",orientation:"portrait",compress:true});
  var state = {y:15};
  function checkPage(needed) { if(state.y+needed>277){doc.addPage();state.y=15;state.y=pdfPH(doc,state.y);} }
  pdfCover(doc, scope, targetData);
  doc.addPage(); state.y=15; state.y=pdfPH(doc, state.y);
  if (scope==="inspection"&&targetData.length===1) pdfInspection(doc, state, targetData[0], checkPage);
  else pdfDashboard(doc, state, targetData, checkPage);
  pdfFT(doc);
  doc.save(generatePdfFilename(scope, targetData));
  console.log("PDF generated successfully");
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
