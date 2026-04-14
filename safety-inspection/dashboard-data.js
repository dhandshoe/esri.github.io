/**
 * Safety Inspection Dashboard - Pre-Populated Database (Part 3)
 * Procedural generator that produces 150 realistic inspection records
 * with varied projects, inspectors, contractors, weather, GPS scatter,
 * and per-site quality patterns.
 */

// ============================================================
// SEEDED PSEUDO-RANDOM NUMBER GENERATOR (deterministic output)
// ============================================================
const _seed = { v: 42 };
function rand() {
  _seed.v = (_seed.v * 16807 + 0) % 2147483647;
  return (_seed.v & 0x7fffffff) / 2147483647;
}
function randInt(min, max) { return Math.floor(rand() * (max - min + 1)) + min; }
function pick(arr) { return arr[randInt(0, arr.length - 1)]; }
function weightedPick(arr, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total, cum = 0;
  for (let i = 0; i < arr.length; i++) { cum += weights[i]; if (r <= cum) return arr[i]; }
  return arr[arr.length - 1];
}

// ============================================================
// SEED DATA: projects, people, locations
// ============================================================

const PROJECTS = [
  { name: "Riverside Bridge Replacement", number: "PRJ-2026-0451", contractor: "Turner Construction", lat: 29.7604, lon: -95.3698, quality: 0.88, hasScaffold: true, hasExcavation: false, hasHotWork: true, workerRange: [30, 55] },
  { name: "Downtown Tower Phase II", number: "PRJ-2026-0523", contractor: "Skanska USA", lat: 29.7550, lon: -95.3700, quality: 0.72, hasScaffold: true, hasExcavation: true, hasHotWork: true, workerRange: [60, 130] },
  { name: "Highway 290 Expansion", number: "PRJ-2025-0892", contractor: "Granite Construction", lat: 29.7850, lon: -95.4100, quality: 0.95, hasScaffold: false, hasExcavation: true, hasHotWork: false, workerRange: [25, 50] },
  { name: "Midtown Medical Center", number: "PRJ-2026-0610", contractor: "McCarthy Building", lat: 29.7400, lon: -95.3850, quality: 0.80, hasScaffold: true, hasExcavation: false, hasHotWork: true, workerRange: [70, 140] },
  { name: "Westside Water Treatment", number: "PRJ-2026-0715", contractor: "Kiewit Infrastructure", lat: 29.7300, lon: -95.4500, quality: 0.60, hasScaffold: true, hasExcavation: true, hasHotWork: true, workerRange: [40, 70] },
  { name: "Bayou Greenway Trail", number: "PRJ-2026-0830", contractor: "Sundt Construction", lat: 29.7700, lon: -95.3550, quality: 0.92, hasScaffold: false, hasExcavation: true, hasHotWork: false, workerRange: [15, 30] },
  { name: "Port Terminal Expansion", number: "PRJ-2026-0944", contractor: "Bechtel Corporation", lat: 29.7200, lon: -95.2700, quality: 0.76, hasScaffold: true, hasExcavation: true, hasHotWork: true, workerRange: [80, 160] },
  { name: "Eastside Elementary Reno", number: "PRJ-2026-1010", contractor: "Hensel Phelps", lat: 29.7480, lon: -95.3200, quality: 0.85, hasScaffold: true, hasExcavation: false, hasHotWork: false, workerRange: [20, 40] },
  { name: "Galleria Parking Garage", number: "PRJ-2026-1105", contractor: "Brasfield & Gorrie", lat: 29.7590, lon: -95.4610, quality: 0.82, hasScaffold: true, hasExcavation: true, hasHotWork: true, workerRange: [35, 65] },
  { name: "NW Transmission Line", number: "PRJ-2025-1220", contractor: "Quanta Services", lat: 29.8100, lon: -95.5000, quality: 0.78, hasScaffold: false, hasExcavation: true, hasHotWork: true, workerRange: [10, 25] },
];

const INSPECTORS = [
  { name: "Mike Torres", role: "safety_officer" },
  { name: "Sarah Chen", role: "safety_engineer" },
  { name: "James Rodriguez", role: "foreman" },
  { name: "Angela Washington", role: "safety_officer" },
  { name: "Robert Kim", role: "site_superintendent" },
  { name: "Lisa Patel", role: "quality_inspector" },
  { name: "David Okafor", role: "safety_officer" },
  { name: "Maria Gonzalez", role: "foreman" },
  { name: "Tom Bradley", role: "project_manager" },
  { name: "Kevin Nguyen", role: "safety_engineer" },
  { name: "Rachel Foster", role: "safety_officer" },
  { name: "Carlos Mendez", role: "subcontractor_rep" },
];

const INSPECTION_TYPES = ["routine", "routine", "routine", "pretask", "weekly", "weekly", "monthly", "incident_followup", "regulatory", "subcontractor"];
const SHIFTS = ["day", "day", "day", "day", "swing", "night"];
const WEATHER_BY_MONTH = {
  1: { opts: ["clear", "overcast", "fog", "extreme_cold", "light_rain"], weights: [25, 25, 15, 20, 15] },
  2: { opts: ["clear", "partly_cloudy", "overcast", "light_rain", "fog"], weights: [25, 25, 15, 20, 15] },
  3: { opts: ["clear", "partly_cloudy", "light_rain", "heavy_rain", "fog"], weights: [20, 25, 25, 15, 15] },
  4: { opts: ["clear", "partly_cloudy", "light_rain", "heavy_rain", "extreme_heat"], weights: [20, 25, 20, 20, 15] },
  5: { opts: ["clear", "partly_cloudy", "extreme_heat", "heavy_rain", "high_wind"], weights: [20, 20, 25, 20, 15] },
  6: { opts: ["clear", "extreme_heat", "partly_cloudy", "heavy_rain", "high_wind"], weights: [15, 35, 15, 25, 10] },
  7: { opts: ["extreme_heat", "clear", "partly_cloudy", "heavy_rain"], weights: [40, 25, 20, 15] },
  8: { opts: ["extreme_heat", "clear", "partly_cloudy", "heavy_rain"], weights: [40, 25, 20, 15] },
  9: { opts: ["extreme_heat", "clear", "partly_cloudy", "light_rain", "heavy_rain"], weights: [25, 25, 20, 15, 15] },
  10: { opts: ["clear", "partly_cloudy", "overcast", "light_rain", "fog"], weights: [30, 25, 15, 20, 10] },
  11: { opts: ["clear", "partly_cloudy", "overcast", "light_rain", "fog", "extreme_cold"], weights: [25, 20, 15, 15, 15, 10] },
  12: { opts: ["clear", "overcast", "fog", "extreme_cold", "light_rain"], weights: [25, 20, 20, 20, 15] },
};

const TEMP_BY_WEATHER = {
  clear: [68, 92], partly_cloudy: [65, 88], overcast: [58, 78], light_rain: [55, 75],
  heavy_rain: [52, 72], snow: [18, 34], fog: [48, 65], extreme_heat: [96, 108],
  extreme_cold: [22, 35], high_wind: [55, 80],
};

// Checklist item keys per section
const SECTION_ITEMS = {
  ppe: ["ppe_hardhat", "ppe_safety_glasses", "ppe_highvis", "ppe_gloves", "ppe_steel_toe", "ppe_hearing", "ppe_respiratory", "ppe_face_shield", "ppe_fall_harness", "ppe_condition"],
  housekeeping: ["hk_walkways", "hk_materials", "hk_waste", "hk_spills", "hk_signage", "hk_lighting", "hk_sanitation", "hk_water", "hk_first_aid", "hk_emergency_routes"],
  fallProtection: ["fp_guardrails", "fp_floor_openings", "fp_harness_inspect", "fp_anchorage", "fp_lanyards", "fp_ladders_secured", "fp_ladder_condition", "fp_hole_covers", "fp_safety_net", "fp_training"],
  scaffolding: ["sc_competent_person", "sc_inspection_tag", "sc_base_plates", "sc_plumb_level", "sc_planking", "sc_guardrails", "sc_access", "sc_clearance", "sc_tied_off", "sc_no_overload"],
  electrical: ["el_gfci", "el_loto", "el_panel_access", "el_cords", "el_grounding", "el_wet_conditions", "el_temp_wiring", "el_labeling", "el_arc_flash", "el_qualified"],
  fireHotWork: ["fh_extinguishers", "fh_hot_work_permit", "fh_fire_watch", "fh_combustibles", "fh_cylinders", "fh_cylinder_storage", "fh_hoses", "fh_ventilation", "fh_flammable_storage", "fh_emergency_plan"],
  tools: ["tl_hand_tools", "tl_power_tools", "tl_inspected", "tl_cords_hoses", "tl_right_tool", "tl_heavy_equip", "tl_operator_cert", "tl_rigging", "tl_crane", "tl_barricades"],
  excavation: ["ex_competent_person", "ex_utilities", "ex_protective_system", "ex_soil_class", "ex_access_egress", "ex_spoil_pile", "ex_water_control", "ex_atmosphere", "ex_daily_inspect", "ex_traffic"],
};

// Items that are N/A when a section's activity is not present on the project
const NA_WHEN_MISSING = {
  scaffolding: "all",
  excavation: "all",
  fireHotWork: ["fh_hot_work_permit", "fh_fire_watch", "fh_combustibles", "fh_cylinders", "fh_cylinder_storage", "fh_hoses", "fh_ventilation"],
};

// Positive observation pool
const POSITIVE_OBS = [
  "Excellent PPE compliance across all trades today.",
  "Toolbox talk was well-attended and engaging.",
  "New safety signage is clear and well-positioned.",
  "Housekeeping has improved significantly since last inspection.",
  "Crane crew demonstrated exemplary rigging practices.",
  "Fire watch procedures followed meticulously during welding.",
  "Workers proactively reporting near-misses - strong safety culture.",
  "Subcontractor safety plans are thorough and up to date.",
  "Excavation crew following OSHA competent person requirements perfectly.",
  "Great job securing ladders and maintaining 3-point contact.",
  "Emergency muster drill completed under target time.",
  "Heat illness prevention plan actively enforced with extra water stations.",
  "Fall protection training records all current.",
  "GFCIs tested and functioning on all temporary circuits.",
  "Scaffolding inspection tags current, platforms fully planked.",
  "Traffic control setup exceeded DOT requirements.",
  "Lock-out/tag-out procedures followed without exception.",
  "Night shift safety lighting meets all requirements.",
  "",
  "",
];

// Corrective action pool
const CORRECTIVE_ACTIONS = [
  "Waste containers overflowing in Zone B - add additional dumpster.",
  "Damaged extension cord at Panel 3 - replace immediately.",
  "Missing guardrail at 2nd floor opening west side - install before next shift.",
  "Harness lanyard frayed on worker #247 - remove from service.",
  "Fire extinguisher in break area expired - replace and log.",
  "Spoil pile too close to trench edge in Area C - move back 2 ft minimum.",
  "Hot work permit not posted at welding station 4 - obtain permit before resuming.",
  "Three workers observed without hearing protection near concrete saw.",
  "Scaffold inspection tag missing on north scaffold - competent person must re-inspect.",
  "Electrical panel C blocked by material storage - clear 36 in. minimum.",
  "Ladder at south access point not secured - tie off at top.",
  "Trench box shifted after rain - competent person must evaluate before entry.",
  "Multiple extension cords daisy-chained at tool staging - correct wiring.",
  "Arc flash boundaries not marked at Panel 7 - label immediately.",
  "Gas cylinders stored together without separation barrier.",
  "Workers on scaffold without toe boards - install before next shift.",
  "Floor opening on level 5 covered but not labeled - mark as HOLE/COVER.",
  "LOTO procedures not followed during motor replacement - retrain crew.",
];

// ============================================================
// RECORD GENERATOR
// ============================================================

function generateInspection(dateStr, project, inspector) {
  const month = parseInt(dateStr.split("-")[1]);
  const weatherInfo = WEATHER_BY_MONTH[month];
  const weather = weightedPick(weatherInfo.opts, weatherInfo.weights);
  const tempRange = TEMP_BY_WEATHER[weather];
  const temperature = randInt(tempRange[0], tempRange[1]);
  const shift = pick(SHIFTS);
  const inspType = pick(INSPECTION_TYPES);
  const workerCount = randInt(project.workerRange[0], project.workerRange[1]);

  // GPS jitter (up to ~200m scatter)
  const lat = (project.lat + (rand() - 0.5) * 0.004).toFixed(6);
  const lon = (project.lon + (rand() - 0.5) * 0.004).toFixed(6);

  // Time: mostly morning starts
  const hour = weightedPick([6, 7, 8, 9, 10, 13, 14, 15], [10, 25, 20, 15, 5, 5, 10, 10]);
  const minute = pick(["00", "15", "30", "45"]);

  // Quality modifier: worse in bad weather, at night, with certain inspectors
  let q = project.quality;
  if (weather === "heavy_rain" || weather === "extreme_heat") q -= 0.06;
  if (weather === "fog" || weather === "snow") q -= 0.04;
  if (shift === "night") q -= 0.05;
  if (inspType === "incident_followup") q -= 0.08;
  q = Math.max(0.2, Math.min(0.98, q + (rand() - 0.5) * 0.12));

  // Generate checklist results
  const inspectionResults = {};
  let totalPass = 0, totalFail = 0;

  Object.entries(SECTION_ITEMS).forEach(([sectionKey, items]) => {
    const sectionResult = {};
    const isNASection =
      (sectionKey === "scaffolding" && !project.hasScaffold) ||
      (sectionKey === "excavation" && !project.hasExcavation);

    items.forEach((itemId) => {
      // Determine if item should be N/A
      let isNA = false;
      if (isNASection) { isNA = true; }
      else if (sectionKey === "fireHotWork" && !project.hasHotWork && NA_WHEN_MISSING.fireHotWork.includes(itemId)) { isNA = true; }
      // Some items are contextually N/A sometimes
      else if (itemId === "ppe_face_shield" && !project.hasHotWork && rand() > 0.3) { isNA = true; }
      else if (itemId === "ppe_respiratory" && rand() > 0.6) { isNA = true; }
      else if (itemId === "fp_safety_net" && rand() > 0.3) { isNA = true; }
      else if (itemId === "el_arc_flash" && rand() > 0.5) { isNA = true; }
      else if (itemId === "tl_crane" && rand() > 0.4) { isNA = true; }
      else if (itemId === "tl_rigging" && rand() > 0.5) { isNA = true; }

      if (isNA) {
        sectionResult[itemId] = "na";
      } else {
        // Pass/fail based on quality factor
        const passes = rand() < q;
        sectionResult[itemId] = passes ? "pass" : "fail";
        if (passes) totalPass++; else totalFail++;
      }
    });
    inspectionResults[sectionKey] = sectionResult;
  });

  // Overall assessment based on results
  const totalApplicable = totalPass + totalFail;
  const complianceRate = totalApplicable > 0 ? totalPass / totalApplicable : 1;

  let riskLevel, rating;
  if (complianceRate >= 0.95) { riskLevel = "low"; rating = 5; }
  else if (complianceRate >= 0.88) { riskLevel = "low"; rating = 4; }
  else if (complianceRate >= 0.78) { riskLevel = "moderate"; rating = 3; }
  else if (complianceRate >= 0.65) { riskLevel = "high"; rating = 2; }
  else { riskLevel = "critical"; rating = 1; }

  // Occasionally bump risk up for drama
  if (rand() < 0.05 && riskLevel !== "critical") {
    const levels = ["low", "moderate", "high", "critical"];
    const idx = levels.indexOf(riskLevel);
    riskLevel = levels[Math.min(idx + 1, 3)];
    rating = Math.max(1, rating - 1);
  }

  const stopWork = riskLevel === "critical" && rand() < 0.7;
  const needsCorrective = totalFail > 2 || riskLevel === "high" || riskLevel === "critical";

  let correctiveActions = "", correctionPriority = "";
  if (needsCorrective) {
    const numActions = Math.min(totalFail, randInt(1, 3));
    const actions = [];
    for (let i = 0; i < numActions; i++) actions.push(pick(CORRECTIVE_ACTIONS));
    correctiveActions = [...new Set(actions)].join(" ");
    correctionPriority = riskLevel === "critical" ? "immediate" : riskLevel === "high" ? "today" : pick(["today", "24hours", "week"]);
  }

  const positiveObs = pick(POSITIVE_OBS);

  return {
    generalInfo: {
      inspectionDate: dateStr,
      inspectionTime: String(hour).padStart(2, "0") + ":" + minute,
      inspectorName: inspector.name,
      inspectorRole: inspector.role,
      projectName: project.name,
      projectNumber: project.number,
      contractor: project.contractor,
      inspectionType: inspType,
      weather: weather,
      temperature: String(temperature),
      workerCount: String(workerCount),
      shift: shift,
      latitude: lat,
      longitude: lon,
    },
    inspectionResults: inspectionResults,
    overallAssessment: {
      rating: String(rating),
      riskLevel: riskLevel,
      stopWorkIssued: stopWork,
      correctiveActionsRequired: needsCorrective,
      correctiveActions: correctiveActions,
      correctionPriority: correctionPriority,
      positiveObservations: positiveObs,
      additionalComments: "",
    },
    photoCount: randInt(0, 10),
  };
}

// ============================================================
// GENERATE 150 RECORDS ACROSS 90 DAYS
// ============================================================

function generateDatabase() {
  const records = [];
  // Generate dates from Jan 2 2026 through Apr 14 2026 (~103 days)
  const startDate = new Date(2026, 0, 2);  // Jan 2
  const endDate = new Date(2026, 3, 14);   // Apr 14

  const current = new Date(startDate);
  while (current <= endDate) {
    // Skip weekends (most construction is Mon-Sat, but skip Sundays)
    const dow = current.getDay();
    if (dow === 0) { current.setDate(current.getDate() + 1); continue; }

    // Determine how many inspections this day (1-3, with some days having 0)
    let inspectionsToday;
    if (dow === 6) {
      inspectionsToday = rand() < 0.5 ? 1 : 0; // Saturdays: fewer inspections
    } else {
      inspectionsToday = weightedPick([0, 1, 2, 3], [2, 30, 40, 28]);
    }

    for (let i = 0; i < inspectionsToday; i++) {
      const project = pick(PROJECTS);
      const inspector = pick(INSPECTORS);
      const dateStr = current.toISOString().split("T")[0];
      records.push(generateInspection(dateStr, project, inspector));
    }

    current.setDate(current.getDate() + 1);
  }

  return records;
}

const SAMPLE_INSPECTIONS = generateDatabase();

// ============================================================
// HUMAN-READABLE LABEL MAPS (used by dashboard.js)
// ============================================================

const SECTION_LABELS = {
  ppe: "PPE",
  housekeeping: "Housekeeping",
  fallProtection: "Fall Protection",
  scaffolding: "Scaffolding",
  electrical: "Electrical",
  fireHotWork: "Fire / Hot Work",
  tools: "Tools & Equipment",
  excavation: "Excavation"
};

const ITEM_LABELS = {
  ppe_hardhat: "Hard hats", ppe_safety_glasses: "Safety glasses", ppe_highvis: "High-vis vests", ppe_gloves: "Work gloves", ppe_steel_toe: "Safety footwear", ppe_hearing: "Hearing protection", ppe_respiratory: "Respiratory protection", ppe_face_shield: "Face shields", ppe_fall_harness: "Fall harnesses worn", ppe_condition: "PPE condition",
  hk_walkways: "Walkways clear", hk_materials: "Materials stored", hk_waste: "Waste containers", hk_spills: "No spills", hk_signage: "Safety signage", hk_lighting: "Adequate lighting", hk_sanitation: "Sanitation", hk_water: "Drinking water", hk_first_aid: "First aid kits", hk_emergency_routes: "Emergency routes",
  fp_guardrails: "Guardrails (>6ft)", fp_floor_openings: "Floor openings", fp_harness_inspect: "Harness inspection", fp_anchorage: "Anchorage points", fp_lanyards: "Lanyards/SRLs", fp_ladders_secured: "Ladders secured", fp_ladder_condition: "Ladder condition", fp_hole_covers: "Hole covers", fp_safety_net: "Safety nets", fp_training: "Fall protection training",
  sc_competent_person: "Competent person", sc_inspection_tag: "Inspection tag", sc_base_plates: "Base plates", sc_plumb_level: "Plumb & level", sc_planking: "Planking", sc_guardrails: "Scaffold guardrails", sc_access: "Scaffold access", sc_clearance: "Power line clearance", sc_tied_off: "Tied to structure", sc_no_overload: "Load ratings",
  el_gfci: "GFCIs in use", el_loto: "Lockout/Tagout", el_panel_access: "Panel access", el_cords: "Extension cords", el_grounding: "Grounding", el_wet_conditions: "Wet protection", el_temp_wiring: "Temp wiring", el_labeling: "Labeling", el_arc_flash: "Arc flash", el_qualified: "Qualified workers",
  fh_extinguishers: "Extinguishers", fh_hot_work_permit: "Hot work permit", fh_fire_watch: "Fire watch", fh_combustibles: "Combustibles cleared", fh_cylinders: "Cylinders secured", fh_cylinder_storage: "Cylinder storage", fh_hoses: "Welding hoses", fh_ventilation: "Ventilation", fh_flammable_storage: "Flammable storage", fh_emergency_plan: "Emergency plan",
  tl_hand_tools: "Hand tools", tl_power_tools: "Power tool guards", tl_inspected: "Tools inspected", tl_cords_hoses: "Cords/hoses", tl_right_tool: "Correct tool", tl_heavy_equip: "Heavy equip inspection", tl_operator_cert: "Operator certs", tl_rigging: "Rigging inspection", tl_crane: "Crane inspection", tl_barricades: "Danger zone barriers",
  ex_competent_person: "Competent person", ex_utilities: "Utilities located", ex_protective_system: "Protective system", ex_soil_class: "Soil classified", ex_access_egress: "Egress provided", ex_spoil_pile: "Spoil setback", ex_water_control: "Water control", ex_atmosphere: "Atmospheric testing", ex_daily_inspect: "Daily inspection", ex_traffic: "Traffic control"
};

const WEATHER_LABELS = {
  clear: "Clear / Sunny", partly_cloudy: "Partly Cloudy", overcast: "Overcast",
  light_rain: "Light Rain", heavy_rain: "Heavy Rain", snow: "Snow / Ice",
  fog: "Fog", extreme_heat: "Extreme Heat", extreme_cold: "Extreme Cold", high_wind: "High Wind"
};

const INSPECTION_TYPE_LABELS = {
  routine: "Routine", pretask: "Pre-Task", weekly: "Weekly Audit",
  monthly: "Monthly", incident_followup: "Incident F/U",
  regulatory: "Regulatory", subcontractor: "Subcontractor", other: "Other"
};
