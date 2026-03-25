/**
 * Application constants for the Environmental Compliance Management System.
 * @module utils/constants
 */

// ---------------------------------------------------------------------------
// Compliance Status
// ---------------------------------------------------------------------------

/** @enum {string} */
export const ComplianceStatus = Object.freeze({
  COMPLIANT: "Compliant",
  NON_COMPLIANT: "NonCompliant",
  AT_RISK: "AtRisk",
  UNKNOWN: "Unknown",
  UNDER_REVIEW: "UnderReview",
});

/** Human-readable labels keyed by ComplianceStatus value. */
export const ComplianceStatusLabels = Object.freeze({
  [ComplianceStatus.COMPLIANT]: "Compliant",
  [ComplianceStatus.NON_COMPLIANT]: "Non-Compliant",
  [ComplianceStatus.AT_RISK]: "At Risk",
  [ComplianceStatus.UNKNOWN]: "Unknown",
  [ComplianceStatus.UNDER_REVIEW]: "Under Review",
});

// ---------------------------------------------------------------------------
// Permit Types
// ---------------------------------------------------------------------------

/** @enum {string} */
export const PermitType = Object.freeze({
  AIR_QUALITY: "AirQuality",
  WATER_DISCHARGE: "WaterDischarge",
  WASTE_MANAGEMENT: "WasteManagement",
  STORMWATER: "Stormwater",
  WETLANDS: "Wetlands",
  ENDANGERED_SPECIES: "EndangeredSpecies",
  LAND_USE: "LandUse",
  NOISE: "Noise",
  HAZMAT: "HazMat",
  GENERAL: "General",
});

export const PermitTypeLabels = Object.freeze({
  [PermitType.AIR_QUALITY]: "Air Quality",
  [PermitType.WATER_DISCHARGE]: "Water Discharge",
  [PermitType.WASTE_MANAGEMENT]: "Waste Management",
  [PermitType.STORMWATER]: "Stormwater",
  [PermitType.WETLANDS]: "Wetlands",
  [PermitType.ENDANGERED_SPECIES]: "Endangered Species",
  [PermitType.LAND_USE]: "Land Use",
  [PermitType.NOISE]: "Noise",
  [PermitType.HAZMAT]: "Hazardous Materials",
  [PermitType.GENERAL]: "General",
});

// ---------------------------------------------------------------------------
// Alert Severity
// ---------------------------------------------------------------------------

/** @enum {string} */
export const AlertSeverity = Object.freeze({
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  INFO: "Info",
});

export const AlertSeverityIcons = Object.freeze({
  [AlertSeverity.CRITICAL]: "exclamation-mark-triangle-f",
  [AlertSeverity.HIGH]: "exclamation-mark-triangle",
  [AlertSeverity.MEDIUM]: "exclamation-mark-circle",
  [AlertSeverity.LOW]: "information",
  [AlertSeverity.INFO]: "lightbulb",
});

// ---------------------------------------------------------------------------
// Monitoring Station Status
// ---------------------------------------------------------------------------

/** @enum {string} */
export const StationStatus = Object.freeze({
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  ALARM: "Alarm",
  MAINTENANCE: "Maintenance",
});

// ---------------------------------------------------------------------------
// Boundary / Zone Types
// ---------------------------------------------------------------------------

/** @enum {string} */
export const ZoneType = Object.freeze({
  BUFFER: "Buffer",
  EXCLUSION: "Exclusion",
  MONITORING: "Monitoring",
  REMEDIATION: "Remediation",
  HABITAT: "Habitat",
});

// ---------------------------------------------------------------------------
// Condition / Trigger Operators
// ---------------------------------------------------------------------------

/** @enum {string} */
export const Operator = Object.freeze({
  GREATER_THAN: "GreaterThan",
  LESS_THAN: "LessThan",
  EQUAL: "Equal",
  NOT_EQUAL: "NotEqual",
  GREATER_EQUAL: "GreaterOrEqual",
  LESS_EQUAL: "LessOrEqual",
  BETWEEN: "Between",
  CONTAINS: "Contains",
});

export const OperatorLabels = Object.freeze({
  [Operator.GREATER_THAN]: ">",
  [Operator.LESS_THAN]: "<",
  [Operator.EQUAL]: "=",
  [Operator.NOT_EQUAL]: "!=",
  [Operator.GREATER_EQUAL]: ">=",
  [Operator.LESS_EQUAL]: "<=",
  [Operator.BETWEEN]: "Between",
  [Operator.CONTAINS]: "Contains",
});

// ---------------------------------------------------------------------------
// Color Mappings (match CSS custom properties)
// ---------------------------------------------------------------------------

export const StatusColors = Object.freeze({
  [ComplianceStatus.COMPLIANT]: { fill: "#2d6a4f", outline: "#1b4332", rgba: [45, 106, 79, 0.6] },
  [ComplianceStatus.NON_COMPLIANT]: { fill: "#d00000", outline: "#9d0208", rgba: [208, 0, 0, 0.6] },
  [ComplianceStatus.AT_RISK]: { fill: "#e09f3e", outline: "#e36414", rgba: [224, 159, 62, 0.6] },
  [ComplianceStatus.UNKNOWN]: { fill: "#adb5bd", outline: "#6c757d", rgba: [173, 181, 189, 0.6] },
  [ComplianceStatus.UNDER_REVIEW]: { fill: "#0077b6", outline: "#023e8a", rgba: [0, 119, 182, 0.6] },
});

export const SeverityColors = Object.freeze({
  [AlertSeverity.CRITICAL]: "#d00000",
  [AlertSeverity.HIGH]: "#e36414",
  [AlertSeverity.MEDIUM]: "#e09f3e",
  [AlertSeverity.LOW]: "#0077b6",
  [AlertSeverity.INFO]: "#adb5bd",
});

// ---------------------------------------------------------------------------
// Field Names  (feature service attribute fields)
// ---------------------------------------------------------------------------

export const Fields = Object.freeze({
  // Permits
  PERMIT_ID: "PermitID",
  PERMIT_NAME: "PermitName",
  PERMIT_TYPE: "PermitType",
  COMPLIANCE_STATUS: "ComplianceStatus",
  RISK_SCORE: "RiskScore",
  ISSUE_DATE: "IssueDate",
  EXPIRATION_DATE: "ExpirationDate",
  NEXT_REVIEW_DATE: "NextReviewDate",
  ISSUING_AGENCY: "IssuingAgency",
  RESPONSIBLE_PARTY: "ResponsibleParty",
  DESCRIPTION: "Description",
  OBJECTID: "OBJECTID",

  // Conditions
  CONDITION_ID: "ConditionID",
  CONDITION_TEXT: "ConditionText",
  CONDITION_TYPE: "ConditionType",
  PARENT_PERMIT_ID: "ParentPermitID",

  // Triggers
  TRIGGER_ID: "TriggerID",
  TRIGGER_FIELD: "TriggerField",
  TRIGGER_OPERATOR: "TriggerOperator",
  TRIGGER_VALUE: "TriggerValue",
  TRIGGER_CONDITION_ID: "TriggerConditionID",

  // Alerts
  ALERT_ID: "AlertID",
  ALERT_SEVERITY: "Severity",
  ALERT_MESSAGE: "Message",
  ALERT_STATUS: "AlertStatus",
  ALERT_CREATED: "CreatedDate",
  ALERT_ACKNOWLEDGED: "AcknowledgedDate",
  ALERT_RESOLVED: "ResolvedDate",
  ALERT_PERMIT_ID: "RelatedPermitID",

  // Monitoring Stations
  STATION_ID: "StationID",
  STATION_NAME: "StationName",
  STATION_STATUS: "StationStatus",
  LAST_READING: "LastReading",
  LAST_READING_DATE: "LastReadingDate",

  // Contacts
  CONTACT_ID: "ContactID",
  CONTACT_NAME: "ContactName",
  CONTACT_EMAIL: "Email",
  CONTACT_PHONE: "Phone",
  CONTACT_ROLE: "Role",

  // Audit
  AUDIT_ID: "AuditID",
  AUDIT_TABLE: "TableName",
  AUDIT_RECORD_ID: "RecordID",
  AUDIT_FIELD: "FieldName",
  AUDIT_OLD_VALUE: "OldValue",
  AUDIT_NEW_VALUE: "NewValue",
  AUDIT_USER: "EditUser",
  AUDIT_DATE: "EditDate",
  AUDIT_ACTION: "Action",
});

// ---------------------------------------------------------------------------
// API / Service Configuration
// ---------------------------------------------------------------------------

export const API = Object.freeze({
  /** Base URL of the ArcGIS Enterprise portal. Override via window.__ECMS_CONFIG. */
  get PORTAL_URL() {
    return window.__ECMS_CONFIG?.portalUrl ?? "https://enterprise.example.com/portal";
  },
  /** Base feature service URL. */
  get FEATURE_SERVICE_URL() {
    return window.__ECMS_CONFIG?.featureServiceUrl ?? "https://enterprise.example.com/server/rest/services/ECMS/FeatureServer";
  },
  /** GP service for server-side compliance checks. */
  get GP_COMPLIANCE_URL() {
    return window.__ECMS_CONFIG?.gpComplianceUrl ?? "https://enterprise.example.com/server/rest/services/ECMS/ComplianceCheck/GPServer/RunComplianceCheck";
  },
  /** Layer indices within the feature service. */
  LAYERS: Object.freeze({
    PERMITS: 0,
    CONDITIONS: 1,
    TRIGGERS: 2,
    ALERTS: 3,
    MONITORING_STATIONS: 4,
    COMPLIANCE_BOUNDARIES: 5,
    CONTACTS: 6,
    AUDIT_LOG: 7,
  }),
});

// ---------------------------------------------------------------------------
// Default Thresholds
// ---------------------------------------------------------------------------

export const Defaults = Object.freeze({
  /** Number of days before expiration that triggers "At Risk" status. */
  EXPIRY_WARNING_DAYS: 90,
  /** Risk score above which a permit is flagged. */
  HIGH_RISK_THRESHOLD: 75,
  /** Maximum number of results per query page. */
  PAGE_SIZE: 100,
  /** Dashboard auto-refresh interval in milliseconds. */
  REFRESH_INTERVAL_MS: 300_000, // 5 minutes
  /** Map default center [longitude, latitude]. */
  MAP_CENTER: [-98.5795, 39.8283],
  /** Map default zoom level. */
  MAP_ZOOM: 5,
});

// ---------------------------------------------------------------------------
// Graph Node Types (relationship visualization)
// ---------------------------------------------------------------------------

export const NodeType = Object.freeze({
  PERMIT: "Permit",
  CONDITION: "Condition",
  TRIGGER: "Trigger",
  ALERT: "Alert",
  ASSET: "Asset",
  CONTACT: "Contact",
});

export const NodeColors = Object.freeze({
  [NodeType.PERMIT]: "#2d6a4f",
  [NodeType.CONDITION]: "#0077b6",
  [NodeType.TRIGGER]: "#e09f3e",
  [NodeType.ALERT]: "#d00000",
  [NodeType.ASSET]: "#6c757d",
  [NodeType.CONTACT]: "#7b2d8e",
});
