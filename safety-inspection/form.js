/**
 * Safety Inspection Survey - Form Logic
 * Handles: inspection checklist rendering, GPS capture, map display,
 * photo upload/preview, signature pad, progress tracking, form validation & submission.
 */

// ============================================================
// INSPECTION CHECKLIST DATA
// ============================================================

const INSPECTION_SECTIONS = {
  ppe: {
    gridId: "ppeGrid",
    items: [
      { id: "ppe_hardhat", label: "Hard hats worn by all workers" },
      { id: "ppe_safety_glasses", label: "Safety glasses / eye protection in use" },
      { id: "ppe_highvis", label: "High-visibility vests / clothing worn" },
      { id: "ppe_gloves", label: "Appropriate work gloves in use" },
      { id: "ppe_steel_toe", label: "Steel-toed / safety footwear worn" },
      { id: "ppe_hearing", label: "Hearing protection used in high-noise areas" },
      { id: "ppe_respiratory", label: "Respiratory protection available & used when needed" },
      { id: "ppe_face_shield", label: "Face shields / welding helmets used for hot work" },
      { id: "ppe_fall_harness", label: "Fall protection harnesses properly worn & adjusted" },
      { id: "ppe_condition", label: "All PPE in good condition (no damage, clean, fits properly)" },
    ],
  },
  housekeeping: {
    gridId: "housekeepingGrid",
    items: [
      { id: "hk_walkways", label: "Walkways and access routes clear of debris" },
      { id: "hk_materials", label: "Materials neatly stacked and properly stored" },
      { id: "hk_waste", label: "Waste containers available and not overflowing" },
      { id: "hk_spills", label: "No oil, chemical, or fluid spills present" },
      { id: "hk_signage", label: "Safety signs and barricades properly placed" },
      { id: "hk_lighting", label: "Adequate lighting in all work areas" },
      { id: "hk_sanitation", label: "Restrooms / sanitation facilities clean and stocked" },
      { id: "hk_water", label: "Drinking water available and accessible" },
      { id: "hk_first_aid", label: "First aid kits accessible, stocked, and clearly marked" },
      { id: "hk_emergency_routes", label: "Emergency exits / muster points clearly marked" },
    ],
  },
  fallProtection: {
    gridId: "fallProtectionGrid",
    items: [
      { id: "fp_guardrails", label: "Guardrails installed at all open edges (> 6 ft)" },
      { id: "fp_floor_openings", label: "Floor openings covered or protected with guardrails" },
      { id: "fp_harness_inspect", label: "Fall harnesses inspected and within service date" },
      { id: "fp_anchorage", label: "Anchorage points rated for 5,000 lbs or designed by PE" },
      { id: "fp_lanyards", label: "Lanyards / SRLs in good condition and properly connected" },
      { id: "fp_ladders_secured", label: "Ladders secured, proper angle (4:1), extend 3 ft above landing" },
      { id: "fp_ladder_condition", label: "Ladders in good condition (no bent rungs, cracked rails)" },
      { id: "fp_hole_covers", label: "Hole covers secured and labeled \"HOLE\" or \"COVER\"" },
      { id: "fp_safety_net", label: "Safety nets installed where required" },
      { id: "fp_training", label: "Workers trained on fall protection procedures" },
    ],
  },
  scaffolding: {
    gridId: "scaffoldingGrid",
    items: [
      { id: "sc_competent_person", label: "Competent person on-site for scaffold oversight" },
      { id: "sc_inspection_tag", label: "Green inspection tag displayed and current" },
      { id: "sc_base_plates", label: "Base plates and mudsills properly installed" },
      { id: "sc_plumb_level", label: "Scaffold is plumb, level, and square" },
      { id: "sc_planking", label: "All platforms fully planked (no gaps > 1 in.)" },
      { id: "sc_guardrails", label: "Guardrails, mid-rails, and toe boards installed" },
      { id: "sc_access", label: "Proper access (ladder or stair) provided" },
      { id: "sc_clearance", label: "Minimum 10 ft clearance from power lines" },
      { id: "sc_tied_off", label: "Scaffold tied to structure at required intervals" },
      { id: "sc_no_overload", label: "Not overloaded; load ratings posted" },
    ],
  },
  electrical: {
    gridId: "electricalGrid",
    items: [
      { id: "el_gfci", label: "GFCIs in use on all temporary power circuits" },
      { id: "el_loto", label: "Lockout / Tagout procedures followed for de-energized work" },
      { id: "el_panel_access", label: "Electrical panels accessible (36 in. clearance maintained)" },
      { id: "el_cords", label: "Extension cords in good condition (no splices or damage)" },
      { id: "el_grounding", label: "All equipment properly grounded" },
      { id: "el_wet_conditions", label: "Electrical equipment protected from wet conditions" },
      { id: "el_temp_wiring", label: "Temporary wiring properly installed and protected" },
      { id: "el_labeling", label: "Circuits, panels, and disconnects properly labeled" },
      { id: "el_arc_flash", label: "Arc flash boundaries marked where applicable" },
      { id: "el_qualified", label: "Only qualified persons performing electrical work" },
    ],
  },
  fireHotWork: {
    gridId: "fireHotWorkGrid",
    items: [
      { id: "fh_extinguishers", label: "Fire extinguishers charged, inspected, and accessible" },
      { id: "fh_hot_work_permit", label: "Valid hot work permit posted at each welding/cutting location" },
      { id: "fh_fire_watch", label: "Fire watch assigned for hot work (during + 30 min after)" },
      { id: "fh_combustibles", label: "Combustibles removed or covered within 35 ft of hot work" },
      { id: "fh_cylinders", label: "Gas cylinders upright, capped when not in use, and secured" },
      { id: "fh_cylinder_storage", label: "Oxygen and fuel gas stored separately (min. 20 ft or barrier)" },
      { id: "fh_hoses", label: "Welding leads and hoses in good condition, no leaks" },
      { id: "fh_ventilation", label: "Adequate ventilation for welding / cutting fumes" },
      { id: "fh_flammable_storage", label: "Flammable liquids stored in approved cabinets" },
      { id: "fh_emergency_plan", label: "Fire emergency and evacuation plan communicated" },
    ],
  },
  tools: {
    gridId: "toolsGrid",
    items: [
      { id: "tl_hand_tools", label: "Hand tools in good condition (no mushroomed heads, cracked handles)" },
      { id: "tl_power_tools", label: "Power tools have guards in place and functioning" },
      { id: "tl_inspected", label: "Tools inspected before use (color-coded tag current)" },
      { id: "tl_cords_hoses", label: "Power cords and pneumatic hoses free of damage" },
      { id: "tl_right_tool", label: "Correct tool being used for the task" },
      { id: "tl_heavy_equip", label: "Heavy equipment daily inspection completed" },
      { id: "tl_operator_cert", label: "Equipment operators have current certification" },
      { id: "tl_rigging", label: "Rigging equipment (slings, shackles) inspected and rated" },
      { id: "tl_crane", label: "Crane annual inspection current; load chart available" },
      { id: "tl_barricades", label: "Swing radius / danger zones barricaded during equipment operation" },
    ],
  },
  excavation: {
    gridId: "excavationGrid",
    items: [
      { id: "ex_competent_person", label: "Competent person on-site monitoring excavation" },
      { id: "ex_utilities", label: "Underground utilities located and marked (811 / One Call)" },
      { id: "ex_protective_system", label: "Protective system in place (shoring, sloping, or trench box)" },
      { id: "ex_soil_class", label: "Soil classified by competent person" },
      { id: "ex_access_egress", label: "Means of egress within 25 ft of all workers (ladder, ramp)" },
      { id: "ex_spoil_pile", label: "Spoil pile set back min. 2 ft from edge of excavation" },
      { id: "ex_water_control", label: "Water accumulation controlled" },
      { id: "ex_atmosphere", label: "Atmospheric testing conducted in excavations > 4 ft (if warranted)" },
      { id: "ex_daily_inspect", label: "Daily inspection conducted before workers enter" },
      { id: "ex_traffic", label: "Traffic control / barriers in place near roadways" },
    ],
  },
};

// ============================================================
// RENDER INSPECTION CHECKLIST GRIDS
// ============================================================

function renderInspectionGrids() {
  Object.values(INSPECTION_SECTIONS).forEach(({ gridId, items }) => {
    const grid = document.getElementById(gridId);
    if (!grid) return;

    items.forEach((item) => {
      // Label
      const label = document.createElement("div");
      label.className = "inspection-item-label";
      label.textContent = item.label;

      // Radio group
      const radioGroup = document.createElement("calcite-segmented-control");
      radioGroup.setAttribute("name", item.id);
      radioGroup.setAttribute("scale", "s");
      radioGroup.setAttribute("width", "auto");
      radioGroup.id = item.id;

      const options = [
        { value: "pass", label: "Pass" },
        { value: "fail", label: "Fail" },
        { value: "na", label: "N/A" },
      ];

      options.forEach((opt) => {
        const radioItem = document.createElement("calcite-segmented-control-item");
        radioItem.setAttribute("value", opt.value);
        radioItem.textContent = opt.label;
        radioGroup.appendChild(radioItem);
      });

      grid.appendChild(label);
      grid.appendChild(radioGroup);
    });
  });
}

// ============================================================
// GPS LOCATION CAPTURE & MAP
// ============================================================

let locationMap = null;
let locationMarker = null;

function initMap() {
  require(["esri/Map", "esri/views/MapView", "esri/Graphic"], function (
    Map,
    MapView,
    Graphic
  ) {
    const map = new Map({ basemap: "streets-navigation-vector" });

    locationMap = new MapView({
      container: "location-map",
      map: map,
      center: [-98.5795, 39.8283], // Center of US
      zoom: 4,
      ui: { components: ["zoom"] },
    });

    // Store Graphic class for later use
    window._ArcGISGraphic = Graphic;

    // Allow tap-to-set-location on map
    locationMap.on("click", function (event) {
      const lat = event.mapPoint.latitude.toFixed(6);
      const lon = event.mapPoint.longitude.toFixed(6);
      setLocationOnMap(parseFloat(lat), parseFloat(lon));
    });
  });
}

function setLocationOnMap(lat, lon) {
  document.getElementById("latitude").value = lat;
  document.getElementById("longitude").value = lon;

  const locationChip = document.getElementById("locationChip");
  const locationText = document.getElementById("locationText");
  locationChip.classList.remove("hidden");
  locationText.textContent = `${lat}, ${lon}`;

  if (locationMap && window._ArcGISGraphic) {
    // Remove old marker
    locationMap.graphics.removeAll();

    const point = {
      type: "point",
      longitude: lon,
      latitude: lat,
    };

    const markerSymbol = {
      type: "simple-marker",
      color: [0, 95, 107],
      outline: { color: [255, 255, 255], width: 2 },
      size: 14,
    };

    const graphic = new window._ArcGISGraphic({
      geometry: point,
      symbol: markerSymbol,
    });

    locationMap.graphics.add(graphic);
    locationMap.goTo({ center: [lon, lat], zoom: 15 }, { duration: 1000 });
  }

  updateProgress();
}

function captureLocation() {
  const btn = document.getElementById("captureLocationBtn");
  btn.setAttribute("loading", "");
  btn.setAttribute("disabled", "");

  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        btn.removeAttribute("loading");
        btn.removeAttribute("disabled");
        setLocationOnMap(
          position.coords.latitude,
          position.coords.longitude
        );
      },
      (error) => {
        btn.removeAttribute("loading");
        btn.removeAttribute("disabled");
        // Fallback: place a default marker and let user tap the map
        showToast("warning", "Location Unavailable", "Tap the map to set your location manually.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  } else {
    btn.removeAttribute("loading");
    btn.removeAttribute("disabled");
    showToast("warning", "GPS Not Supported", "Tap the map to set your location manually.");
  }
}

// ============================================================
// PHOTO UPLOAD & PREVIEW
// ============================================================

const uploadedPhotos = [];

function initPhotoUpload() {
  const zone = document.getElementById("photoUploadZone");
  const input = document.getElementById("photoInput");

  zone.addEventListener("click", () => input.click());

  // Drag and drop
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.style.borderColor = "#0079c1";
    zone.style.background = "#f0f7fc";
  });

  zone.addEventListener("dragleave", () => {
    zone.style.borderColor = "#c4c4c4";
    zone.style.background = "#fafafa";
  });

  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.style.borderColor = "#c4c4c4";
    zone.style.background = "#fafafa";
    handleFiles(e.dataTransfer.files);
  });

  input.addEventListener("change", () => {
    handleFiles(input.files);
    input.value = ""; // Reset so same file can be re-added
  });
}

function handleFiles(files) {
  Array.from(files).forEach((file) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 10 * 1024 * 1024) {
      showToast("danger", "File Too Large", `${file.name} exceeds the 10 MB limit.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      uploadedPhotos.push({
        name: file.name,
        dataUrl: e.target.result,
      });
      renderPhotoPreview();
      updateProgress();
    };
    reader.readAsDataURL(file);
  });
}

function renderPhotoPreview() {
  const grid = document.getElementById("photoPreviewGrid");
  grid.innerHTML = "";

  uploadedPhotos.forEach((photo, index) => {
    const item = document.createElement("div");
    item.className = "photo-preview-item";

    const img = document.createElement("img");
    img.src = photo.dataUrl;
    img.alt = photo.name;

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "\u00D7";
    removeBtn.type = "button";
    removeBtn.addEventListener("click", () => {
      uploadedPhotos.splice(index, 1);
      renderPhotoPreview();
    });

    item.appendChild(img);
    item.appendChild(removeBtn);
    grid.appendChild(item);
  });
}

// ============================================================
// SIGNATURE PAD
// ============================================================

let isDrawing = false;
let signatureCtx = null;
let signatureData = [];

function initSignaturePad() {
  const canvas = document.getElementById("signaturePad");
  signatureCtx = canvas.getContext("2d");

  function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = 150 * dpr;
    canvas.style.width = rect.width + "px";
    canvas.style.height = "150px";
    signatureCtx.scale(dpr, dpr);
    signatureCtx.lineWidth = 2;
    signatureCtx.lineCap = "round";
    signatureCtx.lineJoin = "round";
    signatureCtx.strokeStyle = "#1a1a1a";
    // Redraw existing signature data
    redrawSignature();
  }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    };
  }

  function startDraw(e) {
    e.preventDefault();
    isDrawing = true;
    const pos = getPos(e);
    signatureData.push({ type: "start", x: pos.x, y: pos.y });
    signatureCtx.beginPath();
    signatureCtx.moveTo(pos.x, pos.y);
  }

  function draw(e) {
    if (!isDrawing) return;
    e.preventDefault();
    const pos = getPos(e);
    signatureData.push({ type: "draw", x: pos.x, y: pos.y });
    signatureCtx.lineTo(pos.x, pos.y);
    signatureCtx.stroke();
  }

  function stopDraw(e) {
    if (isDrawing) {
      e.preventDefault();
      isDrawing = false;
      signatureData.push({ type: "end" });
      updateProgress();
    }
  }

  canvas.addEventListener("mousedown", startDraw);
  canvas.addEventListener("mousemove", draw);
  canvas.addEventListener("mouseup", stopDraw);
  canvas.addEventListener("mouseleave", stopDraw);

  canvas.addEventListener("touchstart", startDraw, { passive: false });
  canvas.addEventListener("touchmove", draw, { passive: false });
  canvas.addEventListener("touchend", stopDraw, { passive: false });

  document.getElementById("clearSignature").addEventListener("click", () => {
    signatureData = [];
    signatureCtx.clearRect(0, 0, canvas.width, canvas.height);
    updateProgress();
  });

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
}

function redrawSignature() {
  signatureData.forEach((point) => {
    if (point.type === "start") {
      signatureCtx.beginPath();
      signatureCtx.moveTo(point.x, point.y);
    } else if (point.type === "draw") {
      signatureCtx.lineTo(point.x, point.y);
      signatureCtx.stroke();
    }
  });
}

function hasSignature() {
  return signatureData.length > 5; // Need more than just a dot
}

// ============================================================
// PROGRESS BAR
// ============================================================

function updateProgress() {
  const totalSections = 12; // Approximate sections/groups to track
  let completed = 0;

  // Section 1: General Info (check a few key fields)
  const genFields = ["inspectorName", "projectName", "contractor", "workerCount"];
  const genFilled = genFields.filter((id) => {
    const el = document.getElementById(id);
    return el && el.value && el.value.trim() !== "";
  }).length;
  if (genFilled >= 3) completed++;

  // Has location?
  if (document.getElementById("latitude").value) completed++;

  // Sections 2-9: Check if at least half the items in each section have a selection
  Object.values(INSPECTION_SECTIONS).forEach(({ items }) => {
    let answered = 0;
    items.forEach((item) => {
      const el = document.getElementById(item.id);
      if (el) {
        const checked = el.querySelector("calcite-segmented-control-item[checked]");
        if (checked) answered++;
      }
    });
    if (answered >= items.length / 2) completed++;
  });

  // Overall assessment
  const rating = document.getElementById("overallRating");
  if (rating && rating.value > 0) completed++;

  // Signature
  if (hasSignature()) completed++;

  const pct = Math.round((completed / totalSections) * 100);
  document.getElementById("progressBarFill").style.width = pct + "%";
}

// ============================================================
// CORRECTIVE ACTIONS TOGGLE
// ============================================================

function initCorrectiveActionsToggle() {
  const checkbox = document.getElementById("correctiveActionsRequired");
  const section = document.getElementById("correctiveActionsSection");

  checkbox.addEventListener("calciteCheckboxChange", () => {
    if (checkbox.checked) {
      section.classList.remove("hidden");
    } else {
      section.classList.add("hidden");
    }
  });
}

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================

function showToast(kind, title, message) {
  const container = document.getElementById("toast");
  const inner = document.getElementById("toastInner");
  const titleEl = document.getElementById("toastTitle");
  const msgEl = document.getElementById("toastMessage");

  // Update content and color
  inner.className = "toast-inner " + kind;
  titleEl.textContent = title;
  msgEl.textContent = message;

  // Show then auto-hide
  container.classList.remove("show");
  requestAnimationFrame(() => {
    container.classList.add("show");
    setTimeout(() => container.classList.remove("show"), 5000);
  });
}

// ============================================================
// FORM VALIDATION
// ============================================================

function validateForm() {
  const errors = [];

  // Required text/select fields
  const requiredFields = [
    { id: "inspectorName", label: "Inspector Name" },
    { id: "projectName", label: "Project Name" },
    { id: "contractor", label: "General Contractor" },
    { id: "workerCount", label: "Workers On-Site" },
    { id: "inspectorEmail", label: "Inspector Email" },
  ];

  requiredFields.forEach(({ id, label }) => {
    const el = document.getElementById(id);
    if (!el || !el.value || el.value.trim() === "") {
      errors.push(label + " is required.");
      el?.setAttribute("status", "invalid");
    } else {
      el?.removeAttribute("status");
    }
  });

  // Validate email format
  const emailEl = document.getElementById("inspectorEmail");
  if (emailEl && emailEl.value) {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(emailEl.value)) {
      errors.push("Please enter a valid email address.");
      emailEl.setAttribute("status", "invalid");
    }
  }

  // Location
  if (!document.getElementById("latitude").value) {
    errors.push("Site location is required. Capture GPS or tap the map.");
  }

  // Signature
  if (!hasSignature()) {
    errors.push("Inspector signature is required.");
  }

  return errors;
}

// ============================================================
// FORM SUBMISSION
// ============================================================

function collectFormData() {
  const data = {
    metadata: {
      submittedAt: new Date().toISOString(),
      formVersion: "1.0.0",
    },
    generalInfo: {
      inspectionDate: document.getElementById("inspectionDate")?.value || "",
      inspectionTime: document.getElementById("inspectionTime")?.value || "",
      inspectorName: document.getElementById("inspectorName")?.value || "",
      inspectorRole: document.getElementById("inspectorRole")?.value || "",
      projectName: document.getElementById("projectName")?.value || "",
      projectNumber: document.getElementById("projectNumber")?.value || "",
      contractor: document.getElementById("contractor")?.value || "",
      inspectionType: document.getElementById("inspectionType")?.value || "",
      weather: document.getElementById("weather")?.value || "",
      temperature: document.getElementById("temperature")?.value || "",
      workerCount: document.getElementById("workerCount")?.value || "",
      shift: document.getElementById("shift")?.value || "",
      latitude: document.getElementById("latitude")?.value || "",
      longitude: document.getElementById("longitude")?.value || "",
    },
    inspectionResults: {},
    notes: {},
    overallAssessment: {
      rating: document.getElementById("overallRating")?.value || "",
      riskLevel: document.querySelector("#riskLevel calcite-segmented-control-item[checked]")?.value || "moderate",
      stopWorkIssued: document.getElementById("stopWorkIssued")?.checked || false,
      correctiveActionsRequired: document.getElementById("correctiveActionsRequired")?.checked || false,
      correctiveActions: document.getElementById("correctiveActions")?.value || "",
      correctionPriority: document.getElementById("correctionPriority")?.value || "",
      positiveObservations: document.getElementById("positiveObservations")?.value || "",
      additionalComments: document.getElementById("additionalComments")?.value || "",
    },
    signoff: {
      email: document.getElementById("inspectorEmail")?.value || "",
      phone: document.getElementById("inspectorPhone")?.value || "",
      hasSignature: hasSignature(),
    },
    photoCount: uploadedPhotos.length,
  };

  // Collect all checklist results
  Object.entries(INSPECTION_SECTIONS).forEach(([sectionKey, { items }]) => {
    data.inspectionResults[sectionKey] = {};
    items.forEach((item) => {
      const el = document.getElementById(item.id);
      const checked = el?.querySelector("calcite-segmented-control-item[checked]");
      data.inspectionResults[sectionKey][item.id] = checked?.value || "unanswered";
    });
  });

  // Collect notes
  const noteFields = [
    "ppeNotes", "housekeepingNotes", "fallProtectionNotes", "scaffoldingNotes",
    "electricalNotes", "fireNotes", "toolsNotes", "excavationNotes", "photoDescriptions",
  ];
  noteFields.forEach((id) => {
    data.notes[id] = document.getElementById(id)?.value || "";
  });

  return data;
}

function submitForm() {
  const errors = validateForm();

  if (errors.length > 0) {
    showToast("danger", "Validation Error", errors[0]);
    // Scroll to first error area
    const firstInvalid = document.querySelector("[status='invalid']");
    if (firstInvalid) {
      firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    return;
  }

  const btn = document.getElementById("submitBtn");
  btn.setAttribute("loading", "");
  btn.setAttribute("disabled", "");

  const formData = collectFormData();

  // Simulate submission delay (in production this would POST to ArcGIS feature service)
  setTimeout(() => {
    console.log("Safety Inspection Data:", JSON.stringify(formData, null, 2));

    // Store in localStorage as well for dashboard demo
    const submissions = JSON.parse(localStorage.getItem("safetyInspections") || "[]");
    submissions.push(formData);
    localStorage.setItem("safetyInspections", JSON.stringify(submissions));

    btn.removeAttribute("loading");
    btn.removeAttribute("disabled");

    showToast("success", "Inspection Submitted", "Your safety inspection has been recorded successfully. Reference: SI-" + Date.now().toString(36).toUpperCase());

    // Scroll to top
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, 1500);
}

function saveDraft() {
  const formData = collectFormData();
  formData.metadata.isDraft = true;

  const drafts = JSON.parse(localStorage.getItem("safetyInspectionDrafts") || "[]");
  drafts.push(formData);
  localStorage.setItem("safetyInspectionDrafts", JSON.stringify(drafts));

  showToast("info", "Draft Saved", "Your inspection has been saved as a draft. You can resume it later.");
}

// ============================================================
// AUTO-FILL DATE/TIME
// ============================================================

function autoFillDateTime() {
  const now = new Date();
  const dateEl = document.getElementById("inspectionDate");
  const timeEl = document.getElementById("inspectionTime");

  // Format: YYYY-MM-DD
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  if (dateEl) dateEl.value = `${year}-${month}-${day}`;

  // Format: HH:MM
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  if (timeEl) timeEl.value = `${hours}:${minutes}`;
}

// ============================================================
// LISTEN FOR CHANGES TO UPDATE PROGRESS
// ============================================================

function initProgressListeners() {
  // Listen for input changes on the form
  const form = document.getElementById("safetyForm");
  form.addEventListener("input", updateProgress);
  form.addEventListener("change", updateProgress);

  // Listen for calcite-specific events
  form.addEventListener("calciteInputInput", updateProgress);
  form.addEventListener("calciteSelectChange", updateProgress);
  form.addEventListener("calciteSegmentedControlChange", updateProgress);
  form.addEventListener("calciteRatingChange", updateProgress);
  form.addEventListener("calciteInputDatePickerChange", updateProgress);
  form.addEventListener("calciteInputTimePickerChange", updateProgress);
}

// ============================================================
// INITIALIZE
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  // Wait for Calcite components to be ready
  customElements.whenDefined("calcite-input").then(() => {
    renderInspectionGrids();
    autoFillDateTime();
    initPhotoUpload();
    initSignaturePad();
    initCorrectiveActionsToggle();
    initProgressListeners();
    initMap();

    // Button handlers
    document.getElementById("captureLocationBtn").addEventListener("click", captureLocation);
    document.getElementById("submitBtn").addEventListener("click", submitForm);
    document.getElementById("saveDraftBtn").addEventListener("click", saveDraft);

    // Initial progress update
    updateProgress();
  });
});
