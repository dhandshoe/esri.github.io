/**
 * Client-side compliance evaluation logic and GP service integration.
 * @module services/compliance-service
 */

import { API, Defaults, Fields, ComplianceStatus, Operator } from "../utils/constants.js";
import * as api from "./api-service.js";

// ---------------------------------------------------------------------------
// Server-Side Compliance Check (GP Service)
// ---------------------------------------------------------------------------

/**
 * Trigger a server-side compliance check via the configured GP service.
 * @param {string} [permitId] - Specific permit to evaluate; omit for all permits.
 * @returns {Promise<object>} GP job result containing updated statuses.
 */
export async function runServerComplianceCheck(permitId) {
  const params = { f: "json" };
  const token = api.getToken();
  if (token) params.token = token;
  if (permitId) params.PermitID = permitId;

  const submitUrl = `${API.GP_COMPLIANCE_URL}/submitJob`;
  const body = new URLSearchParams(params);

  const jobResponse = await fetch(submitUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const jobData = await jobResponse.json();

  if (jobData.error) {
    throw new Error(`GP submit error: ${jobData.error.message || JSON.stringify(jobData.error)}`);
  }

  const jobId = jobData.jobId;
  if (!jobId) {
    throw new Error("GP service did not return a jobId.");
  }

  return pollGPJob(jobId);
}

/**
 * Poll a GP job until completion.
 * @param {string} jobId
 * @returns {Promise<object>}
 */
async function pollGPJob(jobId) {
  const statusUrl = `${API.GP_COMPLIANCE_URL}/jobs/${jobId}`;
  const params = { f: "json" };
  const token = api.getToken();
  if (token) params.token = token;

  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 2000));

    const url = new URL(statusUrl);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const resp = await fetch(url.toString());
    const data = await resp.json();

    if (data.jobStatus === "esriJobSucceeded") {
      return data;
    }
    if (data.jobStatus === "esriJobFailed" || data.jobStatus === "esriJobCancelled") {
      throw new Error(`GP job ${data.jobStatus}: ${JSON.stringify(data.messages)}`);
    }
    // Still running – continue polling
  }
  throw new Error("GP job timed out after maximum polling attempts.");
}

// ---------------------------------------------------------------------------
// Client-Side Quick Evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate a single trigger condition against a measured value.
 * @param {string} operator - One of Operator enum values.
 * @param {number|string} threshold - Threshold value(s). For BETWEEN, use "low,high".
 * @param {number|string} actual - The measured / actual value.
 * @returns {boolean} True if the condition is VIOLATED (non-compliant).
 */
export function evaluateTrigger(operator, threshold, actual) {
  const num = Number(actual);
  const thresh = Number(threshold);

  switch (operator) {
    case Operator.GREATER_THAN:
      return num > thresh;
    case Operator.LESS_THAN:
      return num < thresh;
    case Operator.EQUAL:
      return String(actual) === String(threshold);
    case Operator.NOT_EQUAL:
      return String(actual) !== String(threshold);
    case Operator.GREATER_EQUAL:
      return num >= thresh;
    case Operator.LESS_EQUAL:
      return num <= thresh;
    case Operator.BETWEEN: {
      const [lo, hi] = String(threshold).split(",").map(Number);
      return num >= lo && num <= hi;
    }
    case Operator.CONTAINS:
      return String(actual).toLowerCase().includes(String(threshold).toLowerCase());
    default:
      return false;
  }
}

/**
 * Perform a quick client-side compliance evaluation for a permit.
 * Checks expiration, review dates, and linked trigger conditions.
 * @param {object} permitAttrs - Permit feature attributes.
 * @param {Array} conditions - Condition features linked to this permit.
 * @param {Array} triggers - Trigger features for the conditions.
 * @param {Record<string, any>} [currentReadings={}] - Current field readings keyed by field name.
 * @returns {{status: string, violations: Array<string>, riskScore: number}}
 */
export function quickEvaluatePermit(permitAttrs, conditions = [], triggers = [], currentReadings = {}) {
  const violations = [];
  let riskScore = 0;
  const now = Date.now();

  // --- Check expiration ---
  const expDate = permitAttrs[Fields.EXPIRATION_DATE];
  if (expDate) {
    const expMs = typeof expDate === "number" ? expDate : new Date(expDate).getTime();
    if (now > expMs) {
      violations.push("Permit has expired.");
      riskScore += 50;
    } else {
      const daysUntilExpiry = (expMs - now) / 86_400_000;
      if (daysUntilExpiry <= Defaults.EXPIRY_WARNING_DAYS) {
        violations.push(`Permit expires in ${Math.ceil(daysUntilExpiry)} days.`);
        riskScore += 20;
      }
    }
  }

  // --- Check next review date ---
  const reviewDate = permitAttrs[Fields.NEXT_REVIEW_DATE];
  if (reviewDate) {
    const revMs = typeof reviewDate === "number" ? reviewDate : new Date(reviewDate).getTime();
    if (now > revMs) {
      violations.push("Review date has passed.");
      riskScore += 15;
    }
  }

  // --- Check triggers ---
  for (const trigger of triggers) {
    const ta = trigger.attributes ?? trigger;
    const field = ta[Fields.TRIGGER_FIELD];
    const op = ta[Fields.TRIGGER_OPERATOR];
    const value = ta[Fields.TRIGGER_VALUE];
    const actual = currentReadings[field];

    if (actual !== undefined && evaluateTrigger(op, value, actual)) {
      violations.push(`Trigger violated: ${field} ${op} ${value} (actual: ${actual})`);
      riskScore += 25;
    }
  }

  // Clamp score
  riskScore = Math.min(100, riskScore);

  // Determine status
  let status;
  if (violations.some((v) => v.includes("expired") || v.includes("Trigger violated"))) {
    status = ComplianceStatus.NON_COMPLIANT;
  } else if (violations.length > 0) {
    status = ComplianceStatus.AT_RISK;
  } else {
    status = ComplianceStatus.COMPLIANT;
  }

  return { status, violations, riskScore };
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

/**
 * Generate compliance summary statistics from an array of permit features.
 * @param {Array} permits - Permit features ({attributes}).
 * @returns {{
 *   total: number,
 *   byCounts: Record<string, number>,
 *   percentCompliant: number,
 *   avgRiskScore: number,
 *   upcomingExpirations: Array,
 *   activeViolations: number
 * }}
 */
export function generateComplianceSummary(permits) {
  const byCounts = {
    [ComplianceStatus.COMPLIANT]: 0,
    [ComplianceStatus.NON_COMPLIANT]: 0,
    [ComplianceStatus.AT_RISK]: 0,
    [ComplianceStatus.UNKNOWN]: 0,
    [ComplianceStatus.UNDER_REVIEW]: 0,
  };

  let totalRisk = 0;
  const upcomingExpirations = [];
  const now = Date.now();

  for (const p of permits) {
    const a = p.attributes ?? p;
    const status = a[Fields.COMPLIANCE_STATUS] || ComplianceStatus.UNKNOWN;
    byCounts[status] = (byCounts[status] || 0) + 1;
    totalRisk += a[Fields.RISK_SCORE] ?? 0;

    const exp = a[Fields.EXPIRATION_DATE];
    if (exp) {
      const expMs = typeof exp === "number" ? exp : new Date(exp).getTime();
      const daysLeft = (expMs - now) / 86_400_000;
      if (daysLeft > 0 && daysLeft <= Defaults.EXPIRY_WARNING_DAYS) {
        upcomingExpirations.push({ permit: a, daysLeft: Math.ceil(daysLeft) });
      }
    }
  }

  upcomingExpirations.sort((a, b) => a.daysLeft - b.daysLeft);

  const total = permits.length;
  const compliantCount = byCounts[ComplianceStatus.COMPLIANT] || 0;

  return {
    total,
    byCounts,
    percentCompliant: total > 0 ? Math.round((compliantCount / total) * 100) : 0,
    avgRiskScore: total > 0 ? Math.round(totalRisk / total) : 0,
    upcomingExpirations,
    activeViolations: byCounts[ComplianceStatus.NON_COMPLIANT] || 0,
  };
}

// ---------------------------------------------------------------------------
// Risk Score Calculation
// ---------------------------------------------------------------------------

/**
 * Calculate a risk score for a permit based on multiple factors.
 * @param {object} attrs - Permit attributes.
 * @param {number} violationCount - Number of current violations.
 * @param {number} alertCount - Number of open alerts.
 * @returns {number} Risk score 0–100.
 */
export function calculateRiskScore(attrs, violationCount = 0, alertCount = 0) {
  let score = 0;
  const now = Date.now();

  // Expiration proximity
  const exp = attrs[Fields.EXPIRATION_DATE];
  if (exp) {
    const expMs = typeof exp === "number" ? exp : new Date(exp).getTime();
    if (now > expMs) {
      score += 40;
    } else {
      const daysLeft = (expMs - now) / 86_400_000;
      if (daysLeft <= 30) score += 30;
      else if (daysLeft <= 60) score += 20;
      else if (daysLeft <= 90) score += 10;
    }
  }

  // Review overdue
  const rev = attrs[Fields.NEXT_REVIEW_DATE];
  if (rev) {
    const revMs = typeof rev === "number" ? rev : new Date(rev).getTime();
    if (now > revMs) score += 15;
  }

  // Violations
  score += Math.min(30, violationCount * 10);

  // Open alerts
  score += Math.min(15, alertCount * 5);

  return Math.min(100, score);
}
