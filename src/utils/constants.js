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
// Project Types
// ---------------------------------------------------------------------------

/** @enum {string} */
export const ProjectType = Object.freeze({
  GAS_TREATMENT: "GasTreatment",
  PIPELINE: "Pipeline",
  EXPORT_TERMINAL: "ExportTerminal",
  IMPORT_TERMINAL: "ImportTerminal",
  OTHER: "Other",
});

// ---------------------------------------------------------------------------
// Driver Types
// ---------------------------------------------------------------------------

/** @enum {string} */
export const DriverType = Object.freeze({
  PERMIT: "Permit",
  LAND_USE_AGREEMENT: "LandUseAgreement",
  REGULATORY_ORDER: "RegulatoryOrder",
  CONSENT: "Consent",
  AUTHORIZATION: "Authorization",
  CERTIFICATION: "Certification",
  LICENSE: "License",
  OTHER: "Other",
});

// ---------------------------------------------------------------------------
// Obligation Types
// ---------------------------------------------------------------------------

/** @enum {string} */
export const ObligationType = Object.freeze({
  CONTINUOUS: "Continuous",
  EVENT_DRIVEN: "EventDriven",
  DIRECT: "Direct",
  PERIODIC: "Periodic",
  CONDITIONAL: "Conditional",
  ONE_TIME: "OneTime",
});

// ---------------------------------------------------------------------------
// Obligation Status
// ---------------------------------------------------------------------------

/** @enum {string} */
export const ObligationStatus = Object.freeze({
  ACTIVE: "Active",
  COMPLETED: "Completed",
  OVERDUE: "Overdue",
  NOT_STARTED: "NotStarted",
  WAIVED: "Waived",
  SUPERSEDED: "Superseded",
});

// ---------------------------------------------------------------------------
// Task Status
// ---------------------------------------------------------------------------

/** @enum {string} */
export const TaskStatus = Object.freeze({
  NOT_STARTED: "NotStarted",
  IN_PROGRESS: "InProgress",
  COMPLETED: "Completed",
  OVERDUE: "Overdue",
  ON_HOLD: "OnHold",
  CANCELLED: "Cancelled",
});

// ---------------------------------------------------------------------------
// Task Types
// ---------------------------------------------------------------------------

/** @enum {string} */
export const TaskType = Object.freeze({
  MONITORING: "Monitoring",
  REPORTING: "Reporting",
  INSPECTION: "Inspection",
  SUBMISSION: "Submission",
  MAINTENANCE: "Maintenance",
  TRAINING: "Training",
  REVIEW: "Review",
  OTHER: "Other",
});

// ---------------------------------------------------------------------------
// MOC Status
// ---------------------------------------------------------------------------

/** @enum {string} */
export const MOCStatus = Object.freeze({
  INITIATED: "Initiated",
  UNDER_REVIEW: "UnderReview",
  APPROVED: "Approved",
  IMPLEMENTED: "Implemented",
  CLOSED: "Closed",
  REJECTED: "Rejected",
});

// ---------------------------------------------------------------------------
// Transmittal Direction
// ---------------------------------------------------------------------------

/** @enum {string} */
export const TransmittalDirection = Object.freeze({
  OUTGOING: "Outgoing",
  INCOMING: "Incoming",
});

// ---------------------------------------------------------------------------
// Stakeholder Types
// ---------------------------------------------------------------------------

/** @enum {string} */
export const StakeholderType = Object.freeze({
  LANDOWNER: "Landowner",
  AGENCY: "Agency",
  CONTRACTOR: "Contractor",
  COMMUNITY: "Community",
  TRIBAL: "Tribal",
  NGO: "NGO",
  GOVERNMENT: "Government",
  OTHER: "Other",
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
  [ComplianceStatus.COMPLIANT]: { fill: "#81D10B", outline: "#5a9208", rgba: [129, 209, 11, 0.6] },
  [ComplianceStatus.NON_COMPLIANT]: { fill: "#F43A4F", outline: "#c62839", rgba: [244, 58, 79, 0.6] },
  [ComplianceStatus.AT_RISK]: { fill: "#e09f3e", outline: "#c07b1a", rgba: [224, 159, 62, 0.6] },
  [ComplianceStatus.UNKNOWN]: { fill: "#adb5bd", outline: "#6c757d", rgba: [173, 181, 189, 0.6] },
  [ComplianceStatus.UNDER_REVIEW]: { fill: "#29C8C1", outline: "#1a9e98", rgba: [41, 200, 193, 0.6] },
});

export const SeverityColors = Object.freeze({
  [AlertSeverity.CRITICAL]: "#F43A4F",
  [AlertSeverity.HIGH]: "#F66172",
  [AlertSeverity.MEDIUM]: "#e09f3e",
  [AlertSeverity.LOW]: "#29C8C1",
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

  // Projects
  PROJECT_ID: "ProjectID",
  PROJECT_NAME: "ProjectName",
  PROJECT_TYPE: "ProjectType",
  PROJECT_STATUS: "ProjectStatus",

  // Drivers
  DRIVER_ID: "DriverID",
  DRIVER_NAME: "DriverName",
  DRIVER_TYPE: "DriverType",
  DRIVER_STATUS: "DriverStatus",
  DRIVER_DISPLAY_NAME: "DriverDisplayName",
  PERMIT_NUMBER: "PermitNumber",

  // Obligations
  OBLIGATION_ID: "ObligationID",
  OBLIGATION_NUMBER: "ObligationNumber",
  OBLIGATION_NAME: "ObligationName",
  OBLIGATION_TYPE: "ObligationType",
  OBLIGATION_STATUS: "ObligationStatus",

  // Tasks
  TASK_ID: "TaskID",
  TASK_NAME: "TaskName",
  TASK_TYPE: "TaskType",
  TASK_STATUS: "TaskStatus",
  TASK_DUE_DATE: "DueDate",
  TASK_COMPLETION_DATE: "CompletionDate",

  // Documents
  DOCUMENT_ID: "DocumentID",
  DOCUMENT_NAME: "DocumentName",
  DOCUMENT_DCN: "DCN",
  DOCUMENT_REVISION: "Revision",
  DOCUMENT_CATEGORY: "DocumentCategory",

  // Training
  TRAINING_REQ_ID: "TrainingReqID",
  TRAINING_NAME: "TrainingName",
  TRAINING_TYPE: "TrainingType",

  // MOC
  MOC_ID: "MOCID",
  MOC_NUMBER: "MOCNumber",
  MOC_TITLE: "MOCTitle",
  MOC_STATUS: "MOCStatus",

  // Transmittals
  TRANSMITTAL_ID: "TransmittalID",
  TRANSMITTAL_NUMBER: "TransmittalNumber",
  TRANSMITTAL_DIRECTION: "Direction",
  TRANSMITTAL_STATUS: "TransmittalStatus",

  // Stakeholders
  STAKEHOLDER_ID: "StakeholderID",
  STAKEHOLDER_NAME: "StakeholderName",
  STAKEHOLDER_TYPE: "StakeholderType",
  COMPLAINT_ID: "ComplaintID",
  COMPLAINT_STATUS: "ComplaintStatus",
});

// ---------------------------------------------------------------------------
// API / Service Configuration
// ---------------------------------------------------------------------------

export const API = Object.freeze({
  /** Base URL of the ArcGIS Enterprise portal. Override via window.__ECMS_CONFIG. */
  get PORTAL_URL() {
    return window.__ECMS_CONFIG?.portalUrl ?? "https://geomatics.worley.com/portal";
  },
  /** Base feature service URL. */
  get FEATURE_SERVICE_URL() {
    return window.__ECMS_CONFIG?.featureServiceUrl ?? "https://geomatics.worley.com/arcgisserver/rest/services/EnvironmentalCompliance/FeatureServer";
  },
  /** GP service for server-side compliance checks. */
  get GP_COMPLIANCE_URL() {
    return window.__ECMS_CONFIG?.gpComplianceUrl ?? "https://geomatics.worley.com/arcgisserver/rest/services/EnvironmentalCompliance/ComplianceCheck/GPServer/RunComplianceCheck";
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
    PROJECTS: 8,
    PROJECT_ACCESS: 9,
    DRIVERS: 10,
    DRIVER_AMENDMENTS: 11,
    DRIVER_POCS: 12,
    OBLIGATIONS: 13,
    OBLIGATION_TASK_JUNCTION: 14,
    TASKS: 15,
    COMPLETION_EVIDENCE: 16,
    DOCUMENTS: 17,
    TRAINING_REQUIREMENTS: 18,
    TRAINING_HISTORY: 19,
    MANAGEMENT_OF_CHANGE: 20,
    TRANSMITTALS: 21,
    TRANSMITTAL_DOCUMENTS: 22,
    STAKEHOLDERS: 23,
    STAKEHOLDER_COMPLAINTS: 24,
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
  MAP_CENTER: [-152.4937, 61.2181],
  /** Map default zoom level. */
  MAP_ZOOM: 6,
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
  DRIVER: "Driver",
  OBLIGATION: "Obligation",
  TASK: "Task",
  DOCUMENT: "Document",
  STAKEHOLDER: "Stakeholder",
});

export const NodeColors = Object.freeze({
  [NodeType.PERMIT]: "#003645",
  [NodeType.CONDITION]: "#29C8C1",
  [NodeType.TRIGGER]: "#e09f3e",
  [NodeType.ALERT]: "#F43A4F",
  [NodeType.ASSET]: "#6c757d",
  [NodeType.CONTACT]: "#7b2d8e",
  [NodeType.DRIVER]: "#335E6A",
  [NodeType.OBLIGATION]: "#F66172",
  [NodeType.TASK]: "#54D3CD",
  [NodeType.DOCUMENT]: "#66868F",
  [NodeType.STAKEHOLDER]: "#9ADA3C",
});
