/**
 * Dynamic compliance symbology: renderers, visual variables, and Arcade expressions.
 * @module js/symbology-manager
 */

import { ComplianceStatus, StatusColors, StationStatus, ZoneType, Fields, Defaults } from "../utils/constants.js";

// ---------------------------------------------------------------------------
// Arcade Expressions
// ---------------------------------------------------------------------------

/** Arcade expression: evaluates whether a permit is expired. */
export const arcadeIsExpired = `
var expDate = $feature.${Fields.EXPIRATION_DATE};
if (IsEmpty(expDate)) return "Unknown";
var now = Now();
if (now > expDate) return "Expired";
var diff = DateDiff(expDate, now, 'days');
if (diff <= ${Defaults.EXPIRY_WARNING_DAYS}) return "ExpiringSoon";
return "Active";
`;

/** Arcade expression: days until next review. */
export const arcadeDaysUntilReview = `
var revDate = $feature.${Fields.NEXT_REVIEW_DATE};
if (IsEmpty(revDate)) return -1;
return Round(DateDiff(revDate, Now(), 'days'), 0);
`;

/** Arcade expression: rich popup content with compliance details. */
export const arcadePopupContent = `
var status = $feature.${Fields.COMPLIANCE_STATUS};
var risk = $feature.${Fields.RISK_SCORE};
var expDate = $feature.${Fields.EXPIRATION_DATE};
var revDate = $feature.${Fields.NEXT_REVIEW_DATE};

var result = "**Status:** " + status;
result += "\\n**Risk Score:** " + IIF(IsEmpty(risk), "N/A", Text(risk, "#"));
if (!IsEmpty(expDate)) {
  var daysLeft = Round(DateDiff(expDate, Now(), 'days'), 0);
  result += "\\n**Expiration:** " + Text(expDate, 'MMM D, Y');
  if (daysLeft < 0) {
    result += " (**EXPIRED**)";
  } else {
    result += " (" + daysLeft + " days remaining)";
  }
}
if (!IsEmpty(revDate)) {
  var revDays = Round(DateDiff(revDate, Now(), 'days'), 0);
  result += "\\n**Next Review:** " + Text(revDate, 'MMM D, Y');
  if (revDays < 0) {
    result += " (**OVERDUE**)";
  }
}
return result;
`;

// ---------------------------------------------------------------------------
// Permit Renderer (UniqueValueRenderer)
// ---------------------------------------------------------------------------

/**
 * Create the UniqueValueRenderer for the EnvironmentalPermits layer.
 * @returns {__esri.UniqueValueRendererProperties}
 */
export function createPermitRenderer() {
  const sc = StatusColors;

  return {
    type: "unique-value",
    field: Fields.COMPLIANCE_STATUS,
    defaultSymbol: {
      type: "simple-fill",
      color: sc[ComplianceStatus.UNKNOWN].rgba,
      outline: { color: sc[ComplianceStatus.UNKNOWN].outline, width: 1, style: "dot" },
    },
    defaultLabel: "Unknown",
    uniqueValueInfos: [
      {
        value: ComplianceStatus.COMPLIANT,
        label: "Compliant",
        symbol: {
          type: "simple-fill",
          color: sc[ComplianceStatus.COMPLIANT].rgba,
          outline: { color: sc[ComplianceStatus.COMPLIANT].outline, width: 1.5, style: "solid" },
        },
      },
      {
        value: ComplianceStatus.NON_COMPLIANT,
        label: "Non-Compliant",
        symbol: {
          type: "simple-fill",
          color: sc[ComplianceStatus.NON_COMPLIANT].rgba,
          style: "backward-diagonal",
          outline: { color: sc[ComplianceStatus.NON_COMPLIANT].outline, width: 2.5, style: "solid" },
        },
      },
      {
        value: ComplianceStatus.AT_RISK,
        label: "At Risk",
        symbol: {
          type: "simple-fill",
          color: sc[ComplianceStatus.AT_RISK].rgba,
          outline: { color: "#e36414", width: 1.5, style: "dash" },
        },
      },
      {
        value: ComplianceStatus.UNKNOWN,
        label: "Unknown",
        symbol: {
          type: "simple-fill",
          color: sc[ComplianceStatus.UNKNOWN].rgba,
          outline: { color: sc[ComplianceStatus.UNKNOWN].outline, width: 1, style: "dot" },
        },
      },
      {
        value: ComplianceStatus.UNDER_REVIEW,
        label: "Under Review",
        symbol: {
          type: "simple-fill",
          color: sc[ComplianceStatus.UNDER_REVIEW].rgba,
          outline: { color: sc[ComplianceStatus.UNDER_REVIEW].outline, width: 1.5, style: "solid" },
        },
      },
    ],
    visualVariables: [
      {
        type: "opacity",
        field: Fields.RISK_SCORE,
        stops: [
          { value: 0, opacity: 0.3 },
          { value: 50, opacity: 0.6 },
          { value: 100, opacity: 0.95 },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Monitoring Station Renderer
// ---------------------------------------------------------------------------

/**
 * Create the renderer for MonitoringStations (point layer).
 * @returns {__esri.UniqueValueRendererProperties}
 */
export function createStationRenderer() {
  return {
    type: "unique-value",
    field: Fields.STATION_STATUS,
    defaultSymbol: {
      type: "simple-marker",
      size: 10,
      color: "#adb5bd",
      outline: { color: "#fff", width: 1 },
    },
    uniqueValueInfos: [
      {
        value: StationStatus.ACTIVE,
        label: "Active",
        symbol: {
          type: "simple-marker",
          style: "circle",
          size: 10,
          color: "#2d6a4f",
          outline: { color: "#fff", width: 1.5 },
        },
      },
      {
        value: StationStatus.INACTIVE,
        label: "Inactive",
        symbol: {
          type: "simple-marker",
          style: "circle",
          size: 8,
          color: "#adb5bd",
          outline: { color: "#fff", width: 1 },
        },
      },
      {
        value: StationStatus.ALARM,
        label: "Alarm",
        symbol: {
          type: "simple-marker",
          style: "diamond",
          size: 14,
          color: "#d00000",
          outline: { color: "#fff", width: 2 },
        },
      },
      {
        value: StationStatus.MAINTENANCE,
        label: "Maintenance",
        symbol: {
          type: "simple-marker",
          style: "square",
          size: 10,
          color: "#e09f3e",
          outline: { color: "#fff", width: 1 },
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Compliance Boundary Renderer
// ---------------------------------------------------------------------------

/**
 * Create the renderer for ComplianceBoundaries (polygon layer).
 * @returns {__esri.UniqueValueRendererProperties}
 */
export function createBoundaryRenderer() {
  return {
    type: "unique-value",
    field: "ZoneType",
    defaultSymbol: {
      type: "simple-fill",
      color: [200, 200, 200, 0.2],
      outline: { color: [100, 100, 100], width: 1, style: "solid" },
    },
    uniqueValueInfos: [
      {
        value: ZoneType.BUFFER,
        label: "Buffer Zone",
        symbol: {
          type: "simple-fill",
          color: [0, 119, 182, 0.15],
          style: "forward-diagonal",
          outline: { color: "#0077b6", width: 1.5, style: "dash" },
        },
      },
      {
        value: ZoneType.EXCLUSION,
        label: "Exclusion Zone",
        symbol: {
          type: "simple-fill",
          color: [208, 0, 0, 0.15],
          style: "cross",
          outline: { color: "#d00000", width: 2, style: "solid" },
        },
      },
      {
        value: ZoneType.MONITORING,
        label: "Monitoring Zone",
        symbol: {
          type: "simple-fill",
          color: [224, 159, 62, 0.12],
          outline: { color: "#e09f3e", width: 1, style: "dot" },
        },
      },
      {
        value: ZoneType.REMEDIATION,
        label: "Remediation Zone",
        symbol: {
          type: "simple-fill",
          color: [123, 45, 142, 0.15],
          style: "backward-diagonal",
          outline: { color: "#7b2d8e", width: 1.5, style: "dash-dot" },
        },
      },
      {
        value: ZoneType.HABITAT,
        label: "Habitat Zone",
        symbol: {
          type: "simple-fill",
          color: [45, 106, 79, 0.12],
          outline: { color: "#2d6a4f", width: 1, style: "long-dash" },
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Label Configurations
// ---------------------------------------------------------------------------

/**
 * Create label class for the permits layer showing ID and status.
 * @returns {__esri.LabelClassProperties}
 */
export function createPermitLabelClass() {
  return {
    labelExpressionInfo: {
      expression: `$feature.${Fields.PERMIT_ID} + TextFormatting.NewLine + $feature.${Fields.COMPLIANCE_STATUS}`,
    },
    symbol: {
      type: "text",
      color: "#1b4332",
      haloColor: "white",
      haloSize: 1.5,
      font: { size: 10, weight: "bold", family: "Avenir Next" },
    },
    labelPlacement: "always-horizontal",
    minScale: 50000,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply the full compliance symbology suite to a layer view's layer.
 * Detects layer type and applies the appropriate renderer.
 * @param {__esri.LayerView} layerView
 */
export function applyComplianceSymbology(layerView) {
  const layer = layerView?.layer;
  if (!layer) return;

  const title = (layer.title || "").toLowerCase();

  if (title.includes("permit")) {
    layer.renderer = createPermitRenderer();
    layer.labelingInfo = [createPermitLabelClass()];
  } else if (title.includes("station") || title.includes("monitor")) {
    layer.renderer = createStationRenderer();
  } else if (title.includes("boundar") || title.includes("zone")) {
    layer.renderer = createBoundaryRenderer();
  }
}

/**
 * Update a layer's renderer to highlight specific values in a field.
 * Useful for ad-hoc filtering or highlighting.
 * @param {__esri.FeatureLayer} layer
 * @param {string} field
 * @param {string[]} values - Values to highlight.
 */
export function updateSymbology(layer, field, values) {
  if (!layer || !field || !values?.length) return;

  const existing = layer.renderer?.clone?.() ?? layer.renderer;
  if (existing?.type !== "unique-value") return;

  // Adjust opacity: full opacity for matching values, dim others
  const clone = existing.clone();
  if (clone.uniqueValueInfos) {
    for (const info of clone.uniqueValueInfos) {
      const match = values.includes(info.value);
      if (info.symbol?.color) {
        const c = info.symbol.color.clone ? info.symbol.color.clone() : info.symbol.color;
        if (c.a !== undefined) {
          c.a = match ? 0.9 : 0.15;
          info.symbol.color = c;
        }
      }
    }
  }
  layer.renderer = clone;
}

/**
 * Apply a brief flash effect on a layer view for newly non-compliant features.
 * Uses featureEffect to highlight features matching the given OBJECTIDs.
 * @param {__esri.FeatureLayerView} layerView
 * @param {number[]} objectIds
 */
export function flashNonCompliantFeatures(layerView, objectIds) {
  if (!layerView || !objectIds?.length) return;

  const idList = objectIds.join(",");
  layerView.featureEffect = {
    filter: {
      where: `${Fields.OBJECTID} IN (${idList})`,
    },
    includedEffect: "bloom(1.5, 0.5px, 0.2) drop-shadow(3px, 3px, 3px, red)",
    excludedEffect: "opacity(0.4)",
  };

  // Remove effect after 5 seconds
  setTimeout(() => {
    if (layerView.featureEffect) {
      layerView.featureEffect = null;
    }
  }, 5000);
}
