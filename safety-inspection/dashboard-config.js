/**
 * Dashboard Configuration
 * ---------------------------------------------------------------
 * Edit the settings below to connect the dashboard to your
 * ArcGIS Enterprise Feature Service.
 *
 * SETUP STEPS:
 * 1. Publish your Survey123 form in Portal (this creates a Feature Service)
 * 2. Find the Feature Service URL in Portal > Content > your survey's
 *    Feature Layer > REST endpoint (usually ends in /FeatureServer/0)
 * 3. Paste that URL below as FEATURE_SERVICE_URL
 * 4. Set USE_FEATURE_SERVICE to true
 * 5. Map your Feature Service field names to the FIELD_MAP below
 */

const DASHBOARD_CONFIG = {

  // ── Connection ─────────────────────────────────────────────
  // Set to true once your Feature Service is published and the
  // FEATURE_SERVICE_URL and FIELD_MAP are configured.
  USE_FEATURE_SERVICE: false,

  // Your ArcGIS Enterprise Portal URL
  PORTAL_URL: "https://geomatics.worley.com/portal",

  // The Feature Service layer URL created by Survey123
  // Example: https://geomatics.worley.com/server/rest/services/Hosted/safety_inspection/FeatureServer/0
  FEATURE_SERVICE_URL: "",

  // Maximum records to fetch per request (set to 0 for all)
  MAX_RECORDS: 2000,

  // ── Authentication ─────────────────────────────────────────
  // How to authenticate with Enterprise.
  // "identity-manager" = ArcGIS JS API sign-in popup (recommended)
  // "token"            = Hardcoded token (for testing only)
  // "none"             = Service is shared publicly
  AUTH_MODE: "identity-manager",

  // Only used when AUTH_MODE is "token" (for quick testing)
  AUTH_TOKEN: "",

  // ── Field Mapping ──────────────────────────────────────────
  // Map YOUR Feature Service field names (left) to the dashboard's
  // expected field names (right). Survey123 generates field names
  // based on your XLSForm question names.
  //
  // After publishing your survey, open the Feature Service REST
  // endpoint in a browser to see the actual field names, then
  // update the LEFT side of each mapping below.
  //
  // Fields set to null are ignored (the dashboard will show N/A).

  FIELD_MAP: {
    // ── General Info ──
    inspectionDate:    "inspection_date",
    inspectionTime:    "inspection_time",
    inspectorName:     "inspector_name",
    inspectorRole:     "inspector_role",
    projectName:       "project_name",
    projectNumber:     "project_number",
    contractor:        "contractor",
    inspectionType:    "inspection_type",
    weather:           "weather",
    temperature:       "temperature",
    workerCount:       "worker_count",
    shift:             "shift",

    // ── PPE ──
    ppe_hardhat:       "ppe_hardhat",
    ppe_safety_glasses:"ppe_safety_glasses",
    ppe_highvis:       "ppe_highvis",
    ppe_gloves:        "ppe_gloves",
    ppe_steel_toe:     "ppe_steel_toe",
    ppe_hearing:       "ppe_hearing",
    ppe_respiratory:   "ppe_respiratory",
    ppe_face_shield:   "ppe_face_shield",
    ppe_fall_harness:  "ppe_fall_harness",
    ppe_condition:     "ppe_condition",

    // ── Housekeeping ──
    hk_walkways:       "hk_walkways",
    hk_materials:      "hk_materials",
    hk_waste:          "hk_waste",
    hk_spills:         "hk_spills",
    hk_signage:        "hk_signage",
    hk_lighting:       "hk_lighting",
    hk_sanitation:     "hk_sanitation",
    hk_water:          "hk_water",
    hk_first_aid:      "hk_first_aid",
    hk_emergency_routes:"hk_emergency_routes",

    // ── Fall Protection ──
    fp_guardrails:     "fp_guardrails",
    fp_floor_openings: "fp_floor_openings",
    fp_harness_inspect:"fp_harness_inspect",
    fp_anchorage:      "fp_anchorage",
    fp_lanyards:       "fp_lanyards",
    fp_ladders_secured:"fp_ladders_secured",
    fp_ladder_condition:"fp_ladder_condition",
    fp_hole_covers:    "fp_hole_covers",
    fp_safety_net:     "fp_safety_net",
    fp_training:       "fp_training",

    // ── Scaffolding ──
    sc_competent_person:"sc_competent_person",
    sc_inspection_tag: "sc_inspection_tag",
    sc_base_plates:    "sc_base_plates",
    sc_plumb_level:    "sc_plumb_level",
    sc_planking:       "sc_planking",
    sc_guardrails:     "sc_guardrails",
    sc_access:         "sc_access",
    sc_clearance:      "sc_clearance",
    sc_tied_off:       "sc_tied_off",
    sc_no_overload:    "sc_no_overload",

    // ── Electrical ──
    el_gfci:           "el_gfci",
    el_loto:           "el_loto",
    el_panel_access:   "el_panel_access",
    el_cords:          "el_cords",
    el_grounding:      "el_grounding",
    el_wet_conditions: "el_wet_conditions",
    el_temp_wiring:    "el_temp_wiring",
    el_labeling:       "el_labeling",
    el_arc_flash:      "el_arc_flash",
    el_qualified:      "el_qualified",

    // ── Fire / Hot Work ──
    fh_extinguishers:  "fh_extinguishers",
    fh_hot_work_permit:"fh_hot_work_permit",
    fh_fire_watch:     "fh_fire_watch",
    fh_combustibles:   "fh_combustibles",
    fh_cylinders:      "fh_cylinders",
    fh_cylinder_storage:"fh_cylinder_storage",
    fh_hoses:          "fh_hoses",
    fh_ventilation:    "fh_ventilation",
    fh_flammable_storage:"fh_flammable_storage",
    fh_emergency_plan: "fh_emergency_plan",

    // ── Tools & Equipment ──
    tl_hand_tools:     "tl_hand_tools",
    tl_power_tools:    "tl_power_tools",
    tl_inspected:      "tl_inspected",
    tl_cords_hoses:    "tl_cords_hoses",
    tl_right_tool:     "tl_right_tool",
    tl_heavy_equip:    "tl_heavy_equip",
    tl_operator_cert:  "tl_operator_cert",
    tl_rigging:        "tl_rigging",
    tl_crane:          "tl_crane",
    tl_barricades:     "tl_barricades",

    // ── Excavation ──
    ex_competent_person:"ex_competent_person",
    ex_utilities:      "ex_utilities",
    ex_protective_system:"ex_protective_system",
    ex_soil_class:     "ex_soil_class",
    ex_access_egress:  "ex_access_egress",
    ex_spoil_pile:     "ex_spoil_pile",
    ex_water_control:  "ex_water_control",
    ex_atmosphere:     "ex_atmosphere",
    ex_daily_inspect:  "ex_daily_inspect",
    ex_traffic:        "ex_traffic",

    // ── Overall Assessment ──
    overallRating:     "overall_rating",
    riskLevel:         "risk_level",
    stopWorkIssued:    "stop_work_issued",
    correctiveActionsRequired: "corrective_actions_required",
    correctiveActions: "corrective_actions",
    correctionPriority:"correction_priority",
    positiveObservations:"positive_observations",
    additionalComments:"additional_comments",

    // ── Notes ──
    ppeNotes:          "ppe_notes",
    housekeepingNotes: "housekeeping_notes",
    fallProtectionNotes:"fall_protection_notes",
    scaffoldingNotes:  "scaffolding_notes",
    electricalNotes:   "electrical_notes",
    fireNotes:         "fire_notes",
    toolsNotes:        "tools_notes",
    excavationNotes:   "excavation_notes",
  },
};
