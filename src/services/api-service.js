/**
 * Service layer wrapping ArcGIS REST API calls to the feature service.
 * Provides CRUD operations, query helpers, batch updates, error handling, and token management.
 * @module services/api-service
 */

import { API, Defaults, Fields } from "../utils/constants.js";

// ---------------------------------------------------------------------------
// Internal State
// ---------------------------------------------------------------------------

let _token = null;
let _tokenExpiry = 0;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// ---------------------------------------------------------------------------
// Token Management
// ---------------------------------------------------------------------------

/**
 * Set the authentication token. Call this after the user signs in via IdentityManager.
 * @param {string} token - ArcGIS token string.
 * @param {number} [expiresAt=0] - Unix epoch ms when the token expires (0 = no expiry tracking).
 */
export function setToken(token, expiresAt = 0) {
  _token = token;
  _tokenExpiry = expiresAt;
}

/**
 * Retrieve the current token, if still valid.
 * @returns {string|null}
 */
export function getToken() {
  if (_tokenExpiry && Date.now() >= _tokenExpiry) {
    _token = null;
    return null;
  }
  return _token;
}

/**
 * Build standard request parameters (token + format).
 * @returns {Record<string, string>}
 */
function baseParams() {
  const params = { f: "json" };
  const token = getToken();
  if (token) params.token = token;
  return params;
}

// ---------------------------------------------------------------------------
// HTTP Helpers
// ---------------------------------------------------------------------------

/**
 * Internal fetch wrapper with retry logic.
 * @param {string} url
 * @param {RequestInit} [options]
 * @param {number} [retries]
 * @returns {Promise<any>}
 */
async function fetchWithRetry(url, options = {}, retries = MAX_RETRIES) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      if (data.error) {
        const msg = data.error.message || data.error.details?.join(", ") || "Unknown service error";
        throw new Error(`ArcGIS Error ${data.error.code}: ${msg}`);
      }
      return data;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }
  throw lastError;
}

/** @param {number} ms */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build a URL with query parameters.
 * @param {string} base
 * @param {Record<string, any>} params
 * @returns {string}
 */
function buildUrl(base, params) {
  const url = new URL(base);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  return url.toString();
}

/**
 * POST form-encoded data.
 * @param {string} url
 * @param {Record<string, any>} params
 * @returns {Promise<any>}
 */
async function postForm(url, params) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) body.set(k, String(v));
  }
  return fetchWithRetry(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

// ---------------------------------------------------------------------------
// Layer URL Helper
// ---------------------------------------------------------------------------

/**
 * Get the full URL for a layer by its index.
 * @param {number} layerIndex
 * @returns {string}
 */
export function layerUrl(layerIndex) {
  return `${API.FEATURE_SERVICE_URL}/${layerIndex}`;
}

// ---------------------------------------------------------------------------
// Query Operations
// ---------------------------------------------------------------------------

/**
 * Query features from a layer.
 * @param {number} layerIndex - Layer index in the feature service.
 * @param {object} [options]
 * @param {string} [options.where="1=1"] - SQL where clause.
 * @param {string} [options.outFields="*"] - Comma-separated field list.
 * @param {boolean} [options.returnGeometry=false]
 * @param {string} [options.orderByFields]
 * @param {number} [options.resultRecordCount]
 * @param {number} [options.resultOffset]
 * @param {object} [options.geometry] - Spatial filter geometry JSON.
 * @param {string} [options.geometryType]
 * @param {string} [options.spatialRel="esriSpatialRelIntersects"]
 * @param {string} [options.outSR="4326"]
 * @param {string[]} [options.outStatistics]
 * @returns {Promise<{features: Array, exceededTransferLimit?: boolean}>}
 */
export async function queryFeatures(layerIndex, options = {}) {
  const {
    where = "1=1",
    outFields = "*",
    returnGeometry = false,
    orderByFields,
    resultRecordCount,
    resultOffset,
    geometry,
    geometryType,
    spatialRel = "esriSpatialRelIntersects",
    outSR = "4326",
    outStatistics,
  } = options;

  const params = {
    ...baseParams(),
    where,
    outFields,
    returnGeometry,
    outSR,
    spatialRel,
  };

  if (orderByFields) params.orderByFields = orderByFields;
  if (resultRecordCount != null) params.resultRecordCount = resultRecordCount;
  if (resultOffset != null) params.resultOffset = resultOffset;
  if (geometry) params.geometry = JSON.stringify(geometry);
  if (geometryType) params.geometryType = geometryType;
  if (outStatistics) params.outStatistics = JSON.stringify(outStatistics);

  const url = `${layerUrl(layerIndex)}/query`;
  return fetchWithRetry(buildUrl(url, params));
}

/**
 * Query features with pagination, returning all results.
 * @param {number} layerIndex
 * @param {object} [options] - Same as queryFeatures options.
 * @returns {Promise<Array>} All features.
 */
export async function queryAllFeatures(layerIndex, options = {}) {
  const allFeatures = [];
  let offset = 0;
  const pageSize = options.resultRecordCount || Defaults.PAGE_SIZE;
  let keepGoing = true;

  while (keepGoing) {
    const result = await queryFeatures(layerIndex, {
      ...options,
      resultRecordCount: pageSize,
      resultOffset: offset,
    });
    const features = result.features || [];
    allFeatures.push(...features);
    if (features.length < pageSize || !result.exceededTransferLimit) {
      keepGoing = false;
    } else {
      offset += pageSize;
    }
  }
  return allFeatures;
}

/**
 * Get feature count.
 * @param {number} layerIndex
 * @param {string} [where="1=1"]
 * @returns {Promise<number>}
 */
export async function queryCount(layerIndex, where = "1=1") {
  const params = { ...baseParams(), where, returnCountOnly: true };
  const url = `${layerUrl(layerIndex)}/query`;
  const result = await fetchWithRetry(buildUrl(url, params));
  return result.count ?? 0;
}

/**
 * Query for distinct values in a field.
 * @param {number} layerIndex
 * @param {string} field
 * @param {string} [where="1=1"]
 * @returns {Promise<any[]>}
 */
export async function queryDistinct(layerIndex, field, where = "1=1") {
  const result = await queryFeatures(layerIndex, {
    where,
    outFields: field,
    returnGeometry: false,
    orderByFields: field,
    returnDistinctValues: true,
  });
  return (result.features || []).map((f) => f.attributes[field]);
}

/**
 * Get a single feature by OBJECTID.
 * @param {number} layerIndex
 * @param {number} objectId
 * @param {boolean} [returnGeometry=false]
 * @returns {Promise<object|null>}
 */
export async function getFeature(layerIndex, objectId, returnGeometry = false) {
  const result = await queryFeatures(layerIndex, {
    where: `${Fields.OBJECTID}=${objectId}`,
    returnGeometry,
  });
  return result.features?.[0] ?? null;
}

// ---------------------------------------------------------------------------
// CRUD Operations
// ---------------------------------------------------------------------------

/**
 * Add features to a layer.
 * @param {number} layerIndex
 * @param {Array<{attributes: object, geometry?: object}>} features
 * @returns {Promise<{addResults: Array}>}
 */
export async function addFeatures(layerIndex, features) {
  const url = `${layerUrl(layerIndex)}/addFeatures`;
  return postForm(url, {
    ...baseParams(),
    features: JSON.stringify(features),
    rollbackOnFailure: true,
  });
}

/**
 * Update existing features.
 * @param {number} layerIndex
 * @param {Array<{attributes: object, geometry?: object}>} features - Must include OBJECTID.
 * @returns {Promise<{updateResults: Array}>}
 */
export async function updateFeatures(layerIndex, features) {
  const url = `${layerUrl(layerIndex)}/updateFeatures`;
  return postForm(url, {
    ...baseParams(),
    features: JSON.stringify(features),
    rollbackOnFailure: true,
  });
}

/**
 * Delete features by OBJECTID list.
 * @param {number} layerIndex
 * @param {number[]} objectIds
 * @returns {Promise<{deleteResults: Array}>}
 */
export async function deleteFeatures(layerIndex, objectIds) {
  const url = `${layerUrl(layerIndex)}/deleteFeatures`;
  return postForm(url, {
    ...baseParams(),
    objectIds: objectIds.join(","),
    rollbackOnFailure: true,
  });
}

/**
 * Delete features matching a where clause.
 * @param {number} layerIndex
 * @param {string} where
 * @returns {Promise<{deleteResults: Array}>}
 */
export async function deleteFeaturesByWhere(layerIndex, where) {
  const url = `${layerUrl(layerIndex)}/deleteFeatures`;
  return postForm(url, {
    ...baseParams(),
    where,
    rollbackOnFailure: true,
  });
}

// ---------------------------------------------------------------------------
// Batch Operations
// ---------------------------------------------------------------------------

/**
 * Apply edits in a single transaction (add + update + delete).
 * @param {number} layerIndex
 * @param {object} edits
 * @param {Array} [edits.adds]
 * @param {Array} [edits.updates]
 * @param {number[]} [edits.deletes]
 * @returns {Promise<object>}
 */
export async function applyEdits(layerIndex, { adds, updates, deletes } = {}) {
  const url = `${layerUrl(layerIndex)}/applyEdits`;
  const params = { ...baseParams(), rollbackOnFailure: true };
  if (adds?.length) params.adds = JSON.stringify(adds);
  if (updates?.length) params.updates = JSON.stringify(updates);
  if (deletes?.length) params.deletes = JSON.stringify(deletes);
  return postForm(url, params);
}

/**
 * Batch update a single attribute value across many features.
 * @param {number} layerIndex
 * @param {number[]} objectIds
 * @param {string} field
 * @param {any} value
 * @returns {Promise<{updateResults: Array}>}
 */
export async function batchUpdateField(layerIndex, objectIds, field, value) {
  const features = objectIds.map((oid) => ({
    attributes: { [Fields.OBJECTID]: oid, [field]: value },
  }));
  return updateFeatures(layerIndex, features);
}

// ---------------------------------------------------------------------------
// Entity-Specific Convenience Methods
// ---------------------------------------------------------------------------

/**
 * Query permits with optional filters.
 * @param {object} [filters]
 * @param {string} [filters.status]
 * @param {string} [filters.type]
 * @param {string} [filters.agency]
 * @param {string} [filters.search] - Free-text search across PermitID, PermitName.
 * @returns {Promise<Array>}
 */
export async function queryPermits(filters = {}) {
  const clauses = ["1=1"];
  if (filters.status) clauses.push(`${Fields.COMPLIANCE_STATUS}='${filters.status}'`);
  if (filters.type) clauses.push(`${Fields.PERMIT_TYPE}='${filters.type}'`);
  if (filters.agency) clauses.push(`${Fields.ISSUING_AGENCY}='${filters.agency}'`);
  if (filters.search) {
    const s = filters.search.replace(/'/g, "''");
    clauses.push(`(${Fields.PERMIT_ID} LIKE '%${s}%' OR ${Fields.PERMIT_NAME} LIKE '%${s}%')`);
  }

  return queryAllFeatures(API.LAYERS.PERMITS, {
    where: clauses.join(" AND "),
    returnGeometry: true,
    orderByFields: `${Fields.PERMIT_NAME} ASC`,
  });
}

/**
 * Get conditions linked to a permit.
 * @param {string} permitId
 * @returns {Promise<Array>}
 */
export async function getConditionsForPermit(permitId) {
  return queryAllFeatures(API.LAYERS.CONDITIONS, {
    where: `${Fields.PARENT_PERMIT_ID}='${permitId}'`,
  });
}

/**
 * Get triggers linked to a condition.
 * @param {string} conditionId
 * @returns {Promise<Array>}
 */
export async function getTriggersForCondition(conditionId) {
  return queryAllFeatures(API.LAYERS.TRIGGERS, {
    where: `${Fields.TRIGGER_CONDITION_ID}='${conditionId}'`,
  });
}

/**
 * Get alerts for a permit.
 * @param {string} permitId
 * @returns {Promise<Array>}
 */
export async function getAlertsForPermit(permitId) {
  return queryAllFeatures(API.LAYERS.ALERTS, {
    where: `${Fields.ALERT_PERMIT_ID}='${permitId}'`,
    orderByFields: `${Fields.ALERT_CREATED} DESC`,
  });
}

/**
 * Get all active alerts.
 * @returns {Promise<Array>}
 */
export async function getActiveAlerts() {
  return queryAllFeatures(API.LAYERS.ALERTS, {
    where: `${Fields.ALERT_STATUS} IN ('Open','Acknowledged')`,
    orderByFields: `${Fields.ALERT_CREATED} DESC`,
  });
}

/**
 * Acknowledge an alert.
 * @param {number} objectId
 * @returns {Promise<object>}
 */
export async function acknowledgeAlert(objectId) {
  return updateFeatures(API.LAYERS.ALERTS, [
    {
      attributes: {
        [Fields.OBJECTID]: objectId,
        [Fields.ALERT_STATUS]: "Acknowledged",
        [Fields.ALERT_ACKNOWLEDGED]: Date.now(),
      },
    },
  ]);
}

/**
 * Resolve an alert.
 * @param {number} objectId
 * @returns {Promise<object>}
 */
export async function resolveAlert(objectId) {
  return updateFeatures(API.LAYERS.ALERTS, [
    {
      attributes: {
        [Fields.OBJECTID]: objectId,
        [Fields.ALERT_STATUS]: "Resolved",
        [Fields.ALERT_RESOLVED]: Date.now(),
      },
    },
  ]);
}

/**
 * Query audit log entries.
 * @param {object} [filters]
 * @param {string} [filters.tableName]
 * @param {string} [filters.user]
 * @param {number} [filters.startDate] - Epoch ms.
 * @param {number} [filters.endDate] - Epoch ms.
 * @param {string} [filters.recordId]
 * @returns {Promise<Array>}
 */
export async function queryAuditLog(filters = {}) {
  const clauses = ["1=1"];
  if (filters.tableName) clauses.push(`${Fields.AUDIT_TABLE}='${filters.tableName}'`);
  if (filters.user) clauses.push(`${Fields.AUDIT_USER}='${filters.user}'`);
  if (filters.startDate) clauses.push(`${Fields.AUDIT_DATE}>=${filters.startDate}`);
  if (filters.endDate) clauses.push(`${Fields.AUDIT_DATE}<=${filters.endDate}`);
  if (filters.recordId) clauses.push(`${Fields.AUDIT_RECORD_ID}='${filters.recordId}'`);

  return queryAllFeatures(API.LAYERS.AUDIT_LOG, {
    where: clauses.join(" AND "),
    orderByFields: `${Fields.AUDIT_DATE} DESC`,
  });
}

/**
 * Query contacts.
 * @param {string} [where="1=1"]
 * @returns {Promise<Array>}
 */
export async function queryContacts(where = "1=1") {
  return queryAllFeatures(API.LAYERS.CONTACTS, { where });
}

/**
 * Get compliance status statistics (counts per status).
 * @returns {Promise<Record<string, number>>}
 */
export async function getComplianceStats() {
  const result = await queryFeatures(API.LAYERS.PERMITS, {
    where: "1=1",
    outFields: "",
    outStatistics: [
      {
        statisticType: "count",
        onStatisticField: Fields.OBJECTID,
        outStatisticFieldName: "cnt",
      },
    ],
    groupByFieldsForStatistics: Fields.COMPLIANCE_STATUS,
  });
  const stats = {};
  for (const f of result.features || []) {
    stats[f.attributes[Fields.COMPLIANCE_STATUS]] = f.attributes.cnt;
  }
  return stats;
}
