/**
 * Safety Inspection Dashboard - Sample Dataset
 * This file will be replaced by a full pre-populated database in Part 3.
 * For now it provides enough records for the dashboard to render meaningfully.
 */

const SAMPLE_INSPECTIONS = [
  {
    generalInfo: { inspectionDate: "2026-04-01", inspectionTime: "07:30", inspectorName: "Mike Torres", inspectorRole: "safety_officer", projectName: "Riverside Bridge Replacement", projectNumber: "PRJ-2026-0451", contractor: "Turner Construction", inspectionType: "routine", weather: "clear", temperature: "72", workerCount: "45", shift: "day", latitude: "29.7604", longitude: "-95.3698" },
    inspectionResults: {
      ppe: { ppe_hardhat: "pass", ppe_safety_glasses: "pass", ppe_highvis: "pass", ppe_gloves: "pass", ppe_steel_toe: "pass", ppe_hearing: "pass", ppe_respiratory: "na", ppe_face_shield: "na", ppe_fall_harness: "pass", ppe_condition: "pass" },
      housekeeping: { hk_walkways: "pass", hk_materials: "pass", hk_waste: "fail", hk_spills: "pass", hk_signage: "pass", hk_lighting: "pass", hk_sanitation: "pass", hk_water: "pass", hk_first_aid: "pass", hk_emergency_routes: "pass" },
      fallProtection: { fp_guardrails: "pass", fp_floor_openings: "pass", fp_harness_inspect: "pass", fp_anchorage: "pass", fp_lanyards: "pass", fp_ladders_secured: "pass", fp_ladder_condition: "pass", fp_hole_covers: "fail", fp_safety_net: "na", fp_training: "pass" },
      scaffolding: { sc_competent_person: "pass", sc_inspection_tag: "pass", sc_base_plates: "pass", sc_plumb_level: "pass", sc_planking: "pass", sc_guardrails: "pass", sc_access: "pass", sc_clearance: "pass", sc_tied_off: "pass", sc_no_overload: "pass" },
      electrical: { el_gfci: "pass", el_loto: "pass", el_panel_access: "pass", el_cords: "fail", el_grounding: "pass", el_wet_conditions: "pass", el_temp_wiring: "pass", el_labeling: "pass", el_arc_flash: "na", el_qualified: "pass" },
      fireHotWork: { fh_extinguishers: "pass", fh_hot_work_permit: "na", fh_fire_watch: "na", fh_combustibles: "pass", fh_cylinders: "na", fh_cylinder_storage: "na", fh_hoses: "na", fh_ventilation: "pass", fh_flammable_storage: "pass", fh_emergency_plan: "pass" },
      tools: { tl_hand_tools: "pass", tl_power_tools: "pass", tl_inspected: "pass", tl_cords_hoses: "pass", tl_right_tool: "pass", tl_heavy_equip: "pass", tl_operator_cert: "pass", tl_rigging: "na", tl_crane: "na", tl_barricades: "pass" },
      excavation: { ex_competent_person: "na", ex_utilities: "na", ex_protective_system: "na", ex_soil_class: "na", ex_access_egress: "na", ex_spoil_pile: "na", ex_water_control: "na", ex_atmosphere: "na", ex_daily_inspect: "na", ex_traffic: "na" }
    },
    overallAssessment: { rating: "4", riskLevel: "low", stopWorkIssued: false, correctiveActionsRequired: true, correctiveActions: "Waste containers overflowing in Zone B. Damaged extension cord at Panel 3.", correctionPriority: "today", positiveObservations: "Excellent PPE compliance. New safety signage well-placed.", additionalComments: "" },
    photoCount: 3
  },
  {
    generalInfo: { inspectionDate: "2026-04-02", inspectionTime: "08:15", inspectorName: "Sarah Chen", inspectorRole: "safety_engineer", projectName: "Downtown Tower Phase II", projectNumber: "PRJ-2026-0523", contractor: "Skanska USA", inspectionType: "weekly", weather: "partly_cloudy", temperature: "68", workerCount: "82", shift: "day", latitude: "29.7550", longitude: "-95.3700" },
    inspectionResults: {
      ppe: { ppe_hardhat: "pass", ppe_safety_glasses: "pass", ppe_highvis: "fail", ppe_gloves: "pass", ppe_steel_toe: "pass", ppe_hearing: "fail", ppe_respiratory: "pass", ppe_face_shield: "pass", ppe_fall_harness: "pass", ppe_condition: "pass" },
      housekeeping: { hk_walkways: "fail", hk_materials: "fail", hk_waste: "pass", hk_spills: "pass", hk_signage: "pass", hk_lighting: "fail", hk_sanitation: "pass", hk_water: "pass", hk_first_aid: "pass", hk_emergency_routes: "pass" },
      fallProtection: { fp_guardrails: "fail", fp_floor_openings: "fail", fp_harness_inspect: "pass", fp_anchorage: "pass", fp_lanyards: "pass", fp_ladders_secured: "fail", fp_ladder_condition: "pass", fp_hole_covers: "fail", fp_safety_net: "na", fp_training: "pass" },
      scaffolding: { sc_competent_person: "pass", sc_inspection_tag: "fail", sc_base_plates: "pass", sc_plumb_level: "pass", sc_planking: "fail", sc_guardrails: "pass", sc_access: "pass", sc_clearance: "pass", sc_tied_off: "pass", sc_no_overload: "pass" },
      electrical: { el_gfci: "pass", el_loto: "fail", el_panel_access: "fail", el_cords: "fail", el_grounding: "pass", el_wet_conditions: "pass", el_temp_wiring: "fail", el_labeling: "fail", el_arc_flash: "pass", el_qualified: "pass" },
      fireHotWork: { fh_extinguishers: "pass", fh_hot_work_permit: "pass", fh_fire_watch: "fail", fh_combustibles: "fail", fh_cylinders: "pass", fh_cylinder_storage: "pass", fh_hoses: "pass", fh_ventilation: "fail", fh_flammable_storage: "pass", fh_emergency_plan: "pass" },
      tools: { tl_hand_tools: "fail", tl_power_tools: "fail", tl_inspected: "fail", tl_cords_hoses: "pass", tl_right_tool: "pass", tl_heavy_equip: "pass", tl_operator_cert: "pass", tl_rigging: "pass", tl_crane: "pass", tl_barricades: "pass" },
      excavation: { ex_competent_person: "pass", ex_utilities: "pass", ex_protective_system: "fail", ex_soil_class: "pass", ex_access_egress: "pass", ex_spoil_pile: "fail", ex_water_control: "pass", ex_atmosphere: "na", ex_daily_inspect: "pass", ex_traffic: "pass" }
    },
    overallAssessment: { rating: "2", riskLevel: "high", stopWorkIssued: false, correctiveActionsRequired: true, correctiveActions: "Multiple fall protection deficiencies on floors 8-10. LOTO not followed at electrical panel C.", correctionPriority: "immediate", positiveObservations: "Excavation team following procedures well.", additionalComments: "Recommend safety stand-down for fall protection refresher." },
    photoCount: 7
  },
  {
    generalInfo: { inspectionDate: "2026-04-03", inspectionTime: "06:45", inspectorName: "James Rodriguez", inspectorRole: "foreman", projectName: "Highway 290 Expansion", projectNumber: "PRJ-2025-0892", contractor: "Granite Construction", inspectionType: "pretask", weather: "extreme_heat", temperature: "98", workerCount: "35", shift: "day", latitude: "29.7850", longitude: "-95.4100" },
    inspectionResults: {
      ppe: { ppe_hardhat: "pass", ppe_safety_glasses: "pass", ppe_highvis: "pass", ppe_gloves: "pass", ppe_steel_toe: "pass", ppe_hearing: "pass", ppe_respiratory: "pass", ppe_face_shield: "na", ppe_fall_harness: "na", ppe_condition: "pass" },
      housekeeping: { hk_walkways: "pass", hk_materials: "pass", hk_waste: "pass", hk_spills: "pass", hk_signage: "pass", hk_lighting: "pass", hk_sanitation: "pass", hk_water: "pass", hk_first_aid: "pass", hk_emergency_routes: "pass" },
      fallProtection: { fp_guardrails: "na", fp_floor_openings: "na", fp_harness_inspect: "na", fp_anchorage: "na", fp_lanyards: "na", fp_ladders_secured: "pass", fp_ladder_condition: "pass", fp_hole_covers: "na", fp_safety_net: "na", fp_training: "pass" },
      scaffolding: { sc_competent_person: "na", sc_inspection_tag: "na", sc_base_plates: "na", sc_plumb_level: "na", sc_planking: "na", sc_guardrails: "na", sc_access: "na", sc_clearance: "na", sc_tied_off: "na", sc_no_overload: "na" },
      electrical: { el_gfci: "pass", el_loto: "pass", el_panel_access: "pass", el_cords: "pass", el_grounding: "pass", el_wet_conditions: "pass", el_temp_wiring: "pass", el_labeling: "pass", el_arc_flash: "na", el_qualified: "pass" },
      fireHotWork: { fh_extinguishers: "pass", fh_hot_work_permit: "na", fh_fire_watch: "na", fh_combustibles: "pass", fh_cylinders: "na", fh_cylinder_storage: "na", fh_hoses: "na", fh_ventilation: "pass", fh_flammable_storage: "pass", fh_emergency_plan: "pass" },
      tools: { tl_hand_tools: "pass", tl_power_tools: "pass", tl_inspected: "pass", tl_cords_hoses: "pass", tl_right_tool: "pass", tl_heavy_equip: "pass", tl_operator_cert: "pass", tl_rigging: "pass", tl_crane: "na", tl_barricades: "pass" },
      excavation: { ex_competent_person: "pass", ex_utilities: "pass", ex_protective_system: "pass", ex_soil_class: "pass", ex_access_egress: "pass", ex_spoil_pile: "pass", ex_water_control: "pass", ex_atmosphere: "pass", ex_daily_inspect: "pass", ex_traffic: "pass" }
    },
    overallAssessment: { rating: "5", riskLevel: "low", stopWorkIssued: false, correctiveActionsRequired: false, correctiveActions: "", correctionPriority: "", positiveObservations: "Exemplary site. Heat illness prevention plan actively enforced. Extra water stations set up.", additionalComments: "" },
    photoCount: 2
  },
  {
    generalInfo: { inspectionDate: "2026-04-05", inspectionTime: "14:00", inspectorName: "Angela Washington", inspectorRole: "safety_officer", projectName: "Riverside Bridge Replacement", projectNumber: "PRJ-2026-0451", contractor: "Turner Construction", inspectionType: "incident_followup", weather: "light_rain", temperature: "65", workerCount: "38", shift: "day", latitude: "29.7610", longitude: "-95.3690" },
    inspectionResults: {
      ppe: { ppe_hardhat: "pass", ppe_safety_glasses: "pass", ppe_highvis: "pass", ppe_gloves: "fail", ppe_steel_toe: "pass", ppe_hearing: "pass", ppe_respiratory: "pass", ppe_face_shield: "pass", ppe_fall_harness: "pass", ppe_condition: "fail" },
      housekeeping: { hk_walkways: "fail", hk_materials: "pass", hk_waste: "pass", hk_spills: "fail", hk_signage: "pass", hk_lighting: "pass", hk_sanitation: "pass", hk_water: "pass", hk_first_aid: "pass", hk_emergency_routes: "pass" },
      fallProtection: { fp_guardrails: "pass", fp_floor_openings: "pass", fp_harness_inspect: "fail", fp_anchorage: "pass", fp_lanyards: "fail", fp_ladders_secured: "pass", fp_ladder_condition: "pass", fp_hole_covers: "pass", fp_safety_net: "na", fp_training: "pass" },
      scaffolding: { sc_competent_person: "pass", sc_inspection_tag: "pass", sc_base_plates: "pass", sc_plumb_level: "pass", sc_planking: "pass", sc_guardrails: "pass", sc_access: "pass", sc_clearance: "pass", sc_tied_off: "fail", sc_no_overload: "pass" },
      electrical: { el_gfci: "pass", el_loto: "pass", el_panel_access: "pass", el_cords: "pass", el_grounding: "pass", el_wet_conditions: "fail", el_temp_wiring: "pass", el_labeling: "pass", el_arc_flash: "na", el_qualified: "pass" },
      fireHotWork: { fh_extinguishers: "pass", fh_hot_work_permit: "pass", fh_fire_watch: "pass", fh_combustibles: "pass", fh_cylinders: "pass", fh_cylinder_storage: "pass", fh_hoses: "pass", fh_ventilation: "pass", fh_flammable_storage: "pass", fh_emergency_plan: "pass" },
      tools: { tl_hand_tools: "pass", tl_power_tools: "pass", tl_inspected: "pass", tl_cords_hoses: "pass", tl_right_tool: "pass", tl_heavy_equip: "pass", tl_operator_cert: "pass", tl_rigging: "pass", tl_crane: "pass", tl_barricades: "pass" },
      excavation: { ex_competent_person: "na", ex_utilities: "na", ex_protective_system: "na", ex_soil_class: "na", ex_access_egress: "na", ex_spoil_pile: "na", ex_water_control: "na", ex_atmosphere: "na", ex_daily_inspect: "na", ex_traffic: "na" }
    },
    overallAssessment: { rating: "3", riskLevel: "moderate", stopWorkIssued: false, correctiveActionsRequired: true, correctiveActions: "Wet conditions creating slip hazards on deck. Harness lanyards frayed - replace immediately.", correctionPriority: "immediate", positiveObservations: "Fire prevention practices excellent. Good housekeeping in most areas.", additionalComments: "Follow-up from last week's near-miss on deck level 3." },
    photoCount: 5
  },
  {
    generalInfo: { inspectionDate: "2026-04-07", inspectionTime: "07:00", inspectorName: "Mike Torres", inspectorRole: "safety_officer", projectName: "Midtown Medical Center", projectNumber: "PRJ-2026-0610", contractor: "McCarthy Building", inspectionType: "monthly", weather: "overcast", temperature: "71", workerCount: "120", shift: "day", latitude: "29.7400", longitude: "-95.3850" },
    inspectionResults: {
      ppe: { ppe_hardhat: "pass", ppe_safety_glasses: "pass", ppe_highvis: "pass", ppe_gloves: "pass", ppe_steel_toe: "pass", ppe_hearing: "fail", ppe_respiratory: "fail", ppe_face_shield: "fail", ppe_fall_harness: "pass", ppe_condition: "pass" },
      housekeeping: { hk_walkways: "pass", hk_materials: "fail", hk_waste: "pass", hk_spills: "pass", hk_signage: "pass", hk_lighting: "pass", hk_sanitation: "fail", hk_water: "pass", hk_first_aid: "pass", hk_emergency_routes: "pass" },
      fallProtection: { fp_guardrails: "pass", fp_floor_openings: "fail", fp_harness_inspect: "pass", fp_anchorage: "pass", fp_lanyards: "pass", fp_ladders_secured: "pass", fp_ladder_condition: "fail", fp_hole_covers: "fail", fp_safety_net: "pass", fp_training: "pass" },
      scaffolding: { sc_competent_person: "pass", sc_inspection_tag: "pass", sc_base_plates: "pass", sc_plumb_level: "pass", sc_planking: "pass", sc_guardrails: "fail", sc_access: "pass", sc_clearance: "pass", sc_tied_off: "pass", sc_no_overload: "pass" },
      electrical: { el_gfci: "pass", el_loto: "pass", el_panel_access: "pass", el_cords: "pass", el_grounding: "pass", el_wet_conditions: "pass", el_temp_wiring: "pass", el_labeling: "fail", el_arc_flash: "pass", el_qualified: "pass" },
      fireHotWork: { fh_extinguishers: "pass", fh_hot_work_permit: "pass", fh_fire_watch: "pass", fh_combustibles: "pass", fh_cylinders: "pass", fh_cylinder_storage: "fail", fh_hoses: "pass", fh_ventilation: "pass", fh_flammable_storage: "fail", fh_emergency_plan: "pass" },
      tools: { tl_hand_tools: "pass", tl_power_tools: "pass", tl_inspected: "fail", tl_cords_hoses: "pass", tl_right_tool: "pass", tl_heavy_equip: "pass", tl_operator_cert: "pass", tl_rigging: "fail", tl_crane: "pass", tl_barricades: "pass" },
      excavation: { ex_competent_person: "na", ex_utilities: "na", ex_protective_system: "na", ex_soil_class: "na", ex_access_egress: "na", ex_spoil_pile: "na", ex_water_control: "na", ex_atmosphere: "na", ex_daily_inspect: "na", ex_traffic: "na" }
    },
    overallAssessment: { rating: "3", riskLevel: "moderate", stopWorkIssued: false, correctiveActionsRequired: true, correctiveActions: "Hearing/respiratory protection gaps in MEP work areas. Cylinder storage not separated per OSHA.", correctionPriority: "24hours", positiveObservations: "Electrical work areas well-managed. Good crane operations.", additionalComments: "Large site with many subcontractors - need more frequent walk-throughs." },
    photoCount: 8
  },
  {
    generalInfo: { inspectionDate: "2026-04-08", inspectionTime: "15:30", inspectorName: "Sarah Chen", inspectorRole: "safety_engineer", projectName: "Downtown Tower Phase II", projectNumber: "PRJ-2026-0523", contractor: "Skanska USA", inspectionType: "routine", weather: "clear", temperature: "85", workerCount: "78", shift: "swing", latitude: "29.7555", longitude: "-95.3695" },
    inspectionResults: {
      ppe: { ppe_hardhat: "pass", ppe_safety_glasses: "pass", ppe_highvis: "pass", ppe_gloves: "pass", ppe_steel_toe: "pass", ppe_hearing: "pass", ppe_respiratory: "pass", ppe_face_shield: "pass", ppe_fall_harness: "pass", ppe_condition: "pass" },
      housekeeping: { hk_walkways: "pass", hk_materials: "pass", hk_waste: "pass", hk_spills: "pass", hk_signage: "pass", hk_lighting: "pass", hk_sanitation: "pass", hk_water: "pass", hk_first_aid: "pass", hk_emergency_routes: "pass" },
      fallProtection: { fp_guardrails: "pass", fp_floor_openings: "pass", fp_harness_inspect: "pass", fp_anchorage: "pass", fp_lanyards: "pass", fp_ladders_secured: "pass", fp_ladder_condition: "pass", fp_hole_covers: "pass", fp_safety_net: "na", fp_training: "pass" },
      scaffolding: { sc_competent_person: "pass", sc_inspection_tag: "pass", sc_base_plates: "pass", sc_plumb_level: "pass", sc_planking: "pass", sc_guardrails: "pass", sc_access: "pass", sc_clearance: "pass", sc_tied_off: "pass", sc_no_overload: "pass" },
      electrical: { el_gfci: "pass", el_loto: "pass", el_panel_access: "pass", el_cords: "pass", el_grounding: "pass", el_wet_conditions: "pass", el_temp_wiring: "pass", el_labeling: "pass", el_arc_flash: "pass", el_qualified: "pass" },
      fireHotWork: { fh_extinguishers: "pass", fh_hot_work_permit: "pass", fh_fire_watch: "pass", fh_combustibles: "pass", fh_cylinders: "pass", fh_cylinder_storage: "pass", fh_hoses: "pass", fh_ventilation: "pass", fh_flammable_storage: "pass", fh_emergency_plan: "pass" },
      tools: { tl_hand_tools: "pass", tl_power_tools: "pass", tl_inspected: "pass", tl_cords_hoses: "pass", tl_right_tool: "pass", tl_heavy_equip: "pass", tl_operator_cert: "pass", tl_rigging: "pass", tl_crane: "pass", tl_barricades: "pass" },
      excavation: { ex_competent_person: "pass", ex_utilities: "pass", ex_protective_system: "pass", ex_soil_class: "pass", ex_access_egress: "pass", ex_spoil_pile: "pass", ex_water_control: "pass", ex_atmosphere: "pass", ex_daily_inspect: "pass", ex_traffic: "pass" }
    },
    overallAssessment: { rating: "5", riskLevel: "low", stopWorkIssued: false, correctiveActionsRequired: false, correctiveActions: "", correctionPriority: "", positiveObservations: "Outstanding improvement since last week's audit. All corrective actions from previous inspection closed out. Swing shift demonstrating strong safety culture.", additionalComments: "" },
    photoCount: 2
  },
  {
    generalInfo: { inspectionDate: "2026-04-09", inspectionTime: "09:00", inspectorName: "Robert Kim", inspectorRole: "site_superintendent", projectName: "Westside Water Treatment", projectNumber: "PRJ-2026-0715", contractor: "Kiewit Infrastructure", inspectionType: "subcontractor", weather: "fog", temperature: "62", workerCount: "55", shift: "day", latitude: "29.7300", longitude: "-95.4500" },
    inspectionResults: {
      ppe: { ppe_hardhat: "pass", ppe_safety_glasses: "fail", ppe_highvis: "pass", ppe_gloves: "fail", ppe_steel_toe: "pass", ppe_hearing: "pass", ppe_respiratory: "pass", ppe_face_shield: "na", ppe_fall_harness: "pass", ppe_condition: "fail" },
      housekeeping: { hk_walkways: "fail", hk_materials: "fail", hk_waste: "fail", hk_spills: "fail", hk_signage: "pass", hk_lighting: "fail", hk_sanitation: "pass", hk_water: "pass", hk_first_aid: "fail", hk_emergency_routes: "pass" },
      fallProtection: { fp_guardrails: "fail", fp_floor_openings: "fail", fp_harness_inspect: "fail", fp_anchorage: "fail", fp_lanyards: "fail", fp_ladders_secured: "fail", fp_ladder_condition: "fail", fp_hole_covers: "fail", fp_safety_net: "na", fp_training: "fail" },
      scaffolding: { sc_competent_person: "fail", sc_inspection_tag: "fail", sc_base_plates: "fail", sc_plumb_level: "pass", sc_planking: "fail", sc_guardrails: "fail", sc_access: "fail", sc_clearance: "pass", sc_tied_off: "fail", sc_no_overload: "fail" },
      electrical: { el_gfci: "fail", el_loto: "fail", el_panel_access: "fail", el_cords: "fail", el_grounding: "fail", el_wet_conditions: "fail", el_temp_wiring: "fail", el_labeling: "fail", el_arc_flash: "fail", el_qualified: "fail" },
      fireHotWork: { fh_extinguishers: "fail", fh_hot_work_permit: "fail", fh_fire_watch: "fail", fh_combustibles: "fail", fh_cylinders: "fail", fh_cylinder_storage: "fail", fh_hoses: "fail", fh_ventilation: "fail", fh_flammable_storage: "fail", fh_emergency_plan: "fail" },
      tools: { tl_hand_tools: "fail", tl_power_tools: "fail", tl_inspected: "fail", tl_cords_hoses: "fail", tl_right_tool: "fail", tl_heavy_equip: "fail", tl_operator_cert: "fail", tl_rigging: "fail", tl_crane: "na", tl_barricades: "fail" },
      excavation: { ex_competent_person: "fail", ex_utilities: "pass", ex_protective_system: "fail", ex_soil_class: "fail", ex_access_egress: "fail", ex_spoil_pile: "fail", ex_water_control: "fail", ex_atmosphere: "fail", ex_daily_inspect: "fail", ex_traffic: "fail" }
    },
    overallAssessment: { rating: "1", riskLevel: "critical", stopWorkIssued: true, correctiveActionsRequired: true, correctiveActions: "STOP WORK issued. Subcontractor Apex Mechanical has systematic safety failures across all categories. Immediate removal from site until safety program is reviewed and re-approved.", correctionPriority: "immediate", positiveObservations: "Main contractor Kiewit areas are acceptable. Problem isolated to subcontractor.", additionalComments: "Incident report filed. OSHA notification may be required." },
    photoCount: 15
  },
  {
    generalInfo: { inspectionDate: "2026-04-10", inspectionTime: "07:15", inspectorName: "Angela Washington", inspectorRole: "safety_officer", projectName: "Highway 290 Expansion", projectNumber: "PRJ-2025-0892", contractor: "Granite Construction", inspectionType: "routine", weather: "partly_cloudy", temperature: "75", workerCount: "40", shift: "day", latitude: "29.7860", longitude: "-95.4110" },
    inspectionResults: {
      ppe: { ppe_hardhat: "pass", ppe_safety_glasses: "pass", ppe_highvis: "pass", ppe_gloves: "pass", ppe_steel_toe: "pass", ppe_hearing: "pass", ppe_respiratory: "na", ppe_face_shield: "na", ppe_fall_harness: "na", ppe_condition: "pass" },
      housekeeping: { hk_walkways: "pass", hk_materials: "pass", hk_waste: "pass", hk_spills: "pass", hk_signage: "pass", hk_lighting: "pass", hk_sanitation: "pass", hk_water: "pass", hk_first_aid: "pass", hk_emergency_routes: "pass" },
      fallProtection: { fp_guardrails: "na", fp_floor_openings: "na", fp_harness_inspect: "na", fp_anchorage: "na", fp_lanyards: "na", fp_ladders_secured: "pass", fp_ladder_condition: "pass", fp_hole_covers: "na", fp_safety_net: "na", fp_training: "pass" },
      scaffolding: { sc_competent_person: "na", sc_inspection_tag: "na", sc_base_plates: "na", sc_plumb_level: "na", sc_planking: "na", sc_guardrails: "na", sc_access: "na", sc_clearance: "na", sc_tied_off: "na", sc_no_overload: "na" },
      electrical: { el_gfci: "pass", el_loto: "pass", el_panel_access: "pass", el_cords: "pass", el_grounding: "pass", el_wet_conditions: "pass", el_temp_wiring: "pass", el_labeling: "pass", el_arc_flash: "na", el_qualified: "pass" },
      fireHotWork: { fh_extinguishers: "pass", fh_hot_work_permit: "na", fh_fire_watch: "na", fh_combustibles: "pass", fh_cylinders: "na", fh_cylinder_storage: "na", fh_hoses: "na", fh_ventilation: "pass", fh_flammable_storage: "pass", fh_emergency_plan: "pass" },
      tools: { tl_hand_tools: "pass", tl_power_tools: "pass", tl_inspected: "pass", tl_cords_hoses: "pass", tl_right_tool: "pass", tl_heavy_equip: "pass", tl_operator_cert: "pass", tl_rigging: "pass", tl_crane: "pass", tl_barricades: "pass" },
      excavation: { ex_competent_person: "pass", ex_utilities: "pass", ex_protective_system: "pass", ex_soil_class: "pass", ex_access_egress: "pass", ex_spoil_pile: "pass", ex_water_control: "pass", ex_atmosphere: "pass", ex_daily_inspect: "pass", ex_traffic: "pass" }
    },
    overallAssessment: { rating: "5", riskLevel: "low", stopWorkIssued: false, correctiveActionsRequired: false, correctiveActions: "", correctionPriority: "", positiveObservations: "Granite continues to set the standard. Perfect excavation operations. Great traffic control.", additionalComments: "" },
    photoCount: 1
  }
];

// Human-readable label maps used by the dashboard
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
