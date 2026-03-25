"""
Compliance Evaluation Engine

Evaluates permits against their conditions, triggers, and monitoring data
to determine compliance status and risk scores. Designed to run as a
scheduled task or be invoked by a geoprocessing service.

Requirements:
    - ArcGIS Pro 3.x with arcpy
    - Enterprise geodatabase with ECMS schema

Usage:
    python engine.py --workspace path/to/connection.sde
    python engine.py --config ../../config/service_config.json
"""

import argparse
import json
import logging
import sys
from datetime import datetime, timedelta

try:
    import arcpy
except ImportError:
    print("ERROR: arcpy is not available. Run from ArcGIS Pro Python environment.")
    sys.exit(1)

logger = logging.getLogger("ecms.compliance")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

EXPIRY_WARNING_DAYS = 90
HIGH_RISK_THRESHOLD = 75
RISK_WEIGHTS = {
    "expired": 40,
    "expiring_30": 30,
    "expiring_60": 20,
    "expiring_90": 10,
    "review_overdue": 15,
    "violation": 25,
    "alert_open": 5,
}

STATUS_COMPLIANT = "Compliant"
STATUS_NON_COMPLIANT = "NonCompliant"
STATUS_AT_RISK = "AtRisk"
STATUS_UNKNOWN = "Unknown"
STATUS_UNDER_REVIEW = "UnderReview"

OPERATORS = {
    "GreaterThan": lambda a, t: a > t,
    "LessThan": lambda a, t: a < t,
    "Equal": lambda a, t: a == t,
    "NotEqual": lambda a, t: a != t,
    "GreaterOrEqual": lambda a, t: a >= t,
    "LessOrEqual": lambda a, t: a <= t,
    "Between": lambda a, t: t[0] <= a <= t[1],
}


# ---------------------------------------------------------------------------
# Trigger Evaluation
# ---------------------------------------------------------------------------

def parse_threshold(value_str, operator):
    """Parse a threshold string into a numeric value or tuple."""
    if operator == "Between":
        parts = str(value_str).split(",")
        return (float(parts[0].strip()), float(parts[1].strip()))
    try:
        return float(value_str)
    except (ValueError, TypeError):
        return value_str


def evaluate_trigger(operator, threshold_str, actual_value):
    """Evaluate a single trigger condition against a measured value.

    Args:
        operator: Operator string (e.g., 'GreaterThan').
        threshold_str: Threshold value as string.
        actual_value: The measured value.

    Returns:
        True if the condition is VIOLATED (non-compliant).
    """
    if actual_value is None:
        return False

    threshold = parse_threshold(threshold_str, operator)
    op_func = OPERATORS.get(operator)
    if op_func is None:
        logger.warning("Unknown operator: %s", operator)
        return False

    try:
        return op_func(float(actual_value), threshold)
    except (ValueError, TypeError):
        return str(actual_value) == str(threshold) if operator == "Equal" else False


# ---------------------------------------------------------------------------
# Risk Score Calculation
# ---------------------------------------------------------------------------

def calculate_risk_score(permit_attrs, violation_count=0, alert_count=0):
    """Calculate a risk score (0-100) for a permit.

    Args:
        permit_attrs: Dictionary of permit attributes.
        violation_count: Number of current violations.
        alert_count: Number of open alerts.

    Returns:
        Integer risk score clamped to 0-100.
    """
    score = 0
    now = datetime.utcnow()

    exp_date = permit_attrs.get("ExpirationDate")
    if exp_date:
        if isinstance(exp_date, str):
            exp_date = datetime.fromisoformat(exp_date)
        days_left = (exp_date - now).days
        if days_left < 0:
            score += RISK_WEIGHTS["expired"]
        elif days_left <= 30:
            score += RISK_WEIGHTS["expiring_30"]
        elif days_left <= 60:
            score += RISK_WEIGHTS["expiring_60"]
        elif days_left <= 90:
            score += RISK_WEIGHTS["expiring_90"]

    review_date = permit_attrs.get("NextReviewDate")
    if review_date:
        if isinstance(review_date, str):
            review_date = datetime.fromisoformat(review_date)
        if now > review_date:
            score += RISK_WEIGHTS["review_overdue"]

    score += min(30, violation_count * RISK_WEIGHTS["violation"])
    score += min(15, alert_count * RISK_WEIGHTS["alert_open"])

    return min(100, score)


# ---------------------------------------------------------------------------
# Permit Evaluation
# ---------------------------------------------------------------------------

def get_conditions_for_permit(workspace, permit_id):
    """Query PermitConditions table for a given permit.

    Args:
        workspace: Path to geodatabase.
        permit_id: The PermitID to filter on.

    Returns:
        List of condition dictionaries.
    """
    table = f"{workspace}/PermitConditions"
    conditions = []
    fields = ["ConditionID", "ConditionType", "ConditionText", "IsActive"]

    try:
        with arcpy.da.SearchCursor(
            table, fields,
            where_clause=f"ParentPermitID = '{permit_id}' AND IsActive = 1"
        ) as cursor:
            for row in cursor:
                conditions.append(dict(zip(fields, row)))
    except Exception as e:
        logger.error("Error querying conditions for %s: %s", permit_id, e)

    return conditions


def get_triggers_for_condition(workspace, condition_id):
    """Query ComplianceTriggers for a given condition.

    Args:
        workspace: Path to geodatabase.
        condition_id: The ConditionID to filter on.

    Returns:
        List of trigger dictionaries.
    """
    table = f"{workspace}/ComplianceTriggers"
    triggers = []
    fields = ["TriggerID", "TriggerField", "TriggerOperator", "TriggerValue", "IsActive"]

    try:
        with arcpy.da.SearchCursor(
            table, fields,
            where_clause=f"TriggerConditionID = '{condition_id}' AND IsActive = 1"
        ) as cursor:
            for row in cursor:
                triggers.append(dict(zip(fields, row)))
    except Exception as e:
        logger.error("Error querying triggers for %s: %s", condition_id, e)

    return triggers


def get_latest_readings(workspace, station_id=None):
    """Get the most recent monitoring readings.

    Args:
        workspace: Path to geodatabase.
        station_id: Optional station ID filter.

    Returns:
        Dictionary mapping field names to their latest values.
    """
    table = f"{workspace}/MonitoringData"
    readings = {}
    fields = ["ParameterName", "MeasuredValue", "ReadingDate", "StationID"]
    where = f"StationID = '{station_id}'" if station_id else "1=1"

    try:
        with arcpy.da.SearchCursor(
            table, fields, where_clause=where,
            sql_clause=(None, "ORDER BY ReadingDate DESC")
        ) as cursor:
            for row in cursor:
                param = row[0]
                if param not in readings:
                    readings[param] = row[1]
    except Exception as e:
        logger.error("Error querying monitoring data: %s", e)

    return readings


def get_open_alert_count(workspace, permit_id):
    """Count open (unresolved) alerts for a permit."""
    table = f"{workspace}/AlertLog"
    try:
        with arcpy.da.SearchCursor(
            table, ["OBJECTID"],
            where_clause=f"RelatedPermitID = '{permit_id}' AND AlertStatus = 'Open'"
        ) as cursor:
            return sum(1 for _ in cursor)
    except Exception:
        return 0


def evaluate_permit(workspace, permit_attrs):
    """Evaluate a single permit's compliance status.

    Args:
        workspace: Path to geodatabase.
        permit_attrs: Dictionary of permit attributes.

    Returns:
        Dictionary with keys: status, risk_score, violations.
    """
    permit_id = permit_attrs.get("PermitID")
    violations = []

    # Check expiration
    now = datetime.utcnow()
    exp_date = permit_attrs.get("ExpirationDate")
    if exp_date:
        if isinstance(exp_date, str):
            exp_date = datetime.fromisoformat(exp_date)
        if now > exp_date:
            violations.append(f"Permit {permit_id} has expired.")
        elif (exp_date - now).days <= EXPIRY_WARNING_DAYS:
            violations.append(
                f"Permit {permit_id} expires in {(exp_date - now).days} days."
            )

    # Check review date
    review_date = permit_attrs.get("NextReviewDate")
    if review_date:
        if isinstance(review_date, str):
            review_date = datetime.fromisoformat(review_date)
        if now > review_date:
            violations.append(f"Permit {permit_id} review is overdue.")

    # Evaluate conditions and triggers
    conditions = get_conditions_for_permit(workspace, permit_id)
    readings = get_latest_readings(workspace)
    trigger_violations = 0

    for condition in conditions:
        triggers = get_triggers_for_condition(workspace, condition["ConditionID"])
        for trigger in triggers:
            field = trigger["TriggerField"]
            actual = readings.get(field)
            if actual is not None and evaluate_trigger(
                trigger["TriggerOperator"], trigger["TriggerValue"], actual
            ):
                trigger_violations += 1
                violations.append(
                    f"Trigger violated: {field} {trigger['TriggerOperator']} "
                    f"{trigger['TriggerValue']} (actual: {actual})"
                )

    alert_count = get_open_alert_count(workspace, permit_id)

    risk_score = calculate_risk_score(
        permit_attrs,
        violation_count=trigger_violations,
        alert_count=alert_count,
    )

    # Determine status
    if any("expired" in v.lower() or "Trigger violated" in v for v in violations):
        status = STATUS_NON_COMPLIANT
    elif violations:
        status = STATUS_AT_RISK
    else:
        status = STATUS_COMPLIANT

    return {
        "status": status,
        "risk_score": risk_score,
        "violations": violations,
    }


# ---------------------------------------------------------------------------
# Batch Evaluation
# ---------------------------------------------------------------------------

def evaluate_all_permits(workspace, update=True):
    """Evaluate all permits in the geodatabase.

    Args:
        workspace: Path to geodatabase.
        update: If True, write updated status and risk scores back.

    Returns:
        List of evaluation result dictionaries.
    """
    fc = f"{workspace}/EnvironmentalPermits"
    fields = [
        "PermitID", "PermitName", "PermitType", "ComplianceStatus",
        "RiskScore", "ExpirationDate", "NextReviewDate", "IssuingAgency",
    ]
    results = []

    logger.info("Starting compliance evaluation for all permits...")

    permits = []
    try:
        with arcpy.da.SearchCursor(fc, fields) as cursor:
            for row in cursor:
                permits.append(dict(zip(fields, row)))
    except Exception as e:
        logger.error("Error reading permits: %s", e)
        return results

    for permit_attrs in permits:
        permit_id = permit_attrs["PermitID"]
        try:
            result = evaluate_permit(workspace, permit_attrs)
            result["permit_id"] = permit_id
            result["permit_name"] = permit_attrs.get("PermitName", "")
            results.append(result)

            logger.info(
                "  %s: status=%s, risk=%d, violations=%d",
                permit_id, result["status"], result["risk_score"],
                len(result["violations"]),
            )
        except Exception as e:
            logger.error("Error evaluating permit %s: %s", permit_id, e)
            results.append({
                "permit_id": permit_id,
                "status": STATUS_UNKNOWN,
                "risk_score": 0,
                "violations": [],
                "error": str(e),
            })

    if update:
        _update_permit_statuses(workspace, results)

    logger.info(
        "Evaluation complete. %d permits processed, %d non-compliant.",
        len(results),
        sum(1 for r in results if r["status"] == STATUS_NON_COMPLIANT),
    )
    return results


def _update_permit_statuses(workspace, results):
    """Write evaluation results back to the permits feature class."""
    fc = f"{workspace}/EnvironmentalPermits"
    update_fields = ["PermitID", "ComplianceStatus", "RiskScore"]

    status_map = {r["permit_id"]: r for r in results if "error" not in r}

    try:
        with arcpy.da.UpdateCursor(fc, update_fields) as cursor:
            for row in cursor:
                pid = row[0]
                if pid in status_map:
                    row[1] = status_map[pid]["status"]
                    row[2] = status_map[pid]["risk_score"]
                    cursor.updateRow(row)
        logger.info("Updated %d permit statuses.", len(status_map))
    except Exception as e:
        logger.error("Error updating permit statuses: %s", e)


# ---------------------------------------------------------------------------
# Audit Trail
# ---------------------------------------------------------------------------

def log_audit_entry(workspace, table_name, record_id, field_name,
                    old_value, new_value, user="system"):
    """Insert an audit trail entry.

    Args:
        workspace: Path to geodatabase.
        table_name: Name of the table being modified.
        record_id: ID of the modified record.
        field_name: Name of the modified field.
        old_value: Previous value.
        new_value: New value.
        user: Username performing the action.
    """
    table = f"{workspace}/AuditTrail"
    fields = [
        "TableName", "RecordID", "FieldName",
        "OldValue", "NewValue", "EditUser", "EditDate", "Action",
    ]
    try:
        with arcpy.da.InsertCursor(table, fields) as cursor:
            cursor.insertRow([
                table_name, record_id, field_name,
                str(old_value), str(new_value), user,
                datetime.utcnow(), "Update",
            ])
    except Exception as e:
        logger.error("Error writing audit entry: %s", e)


# ---------------------------------------------------------------------------
# CLI Entry Point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Run ECMS compliance evaluation."
    )
    parser.add_argument(
        "--workspace", "-w",
        help="Path to enterprise geodatabase connection (.sde).",
    )
    parser.add_argument(
        "--config", "-c",
        help="Path to service_config.json (reads workspace from config).",
    )
    parser.add_argument(
        "--no-update", action="store_true",
        help="Evaluate only; do not write status updates back.",
    )
    parser.add_argument(
        "--permit-id",
        help="Evaluate a single permit by ID.",
    )

    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)-8s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # Resolve workspace
    workspace = args.workspace
    if not workspace and args.config:
        with open(args.config) as f:
            cfg = json.load(f)
        workspace = cfg.get("geodatabase", {}).get("connectionFile")

    if not workspace:
        logger.error("No workspace specified. Use --workspace or --config.")
        sys.exit(1)

    if not arcpy.Exists(workspace):
        logger.error("Workspace does not exist: %s", workspace)
        sys.exit(1)

    arcpy.env.workspace = workspace

    if args.permit_id:
        # Single permit evaluation
        fc = f"{workspace}/EnvironmentalPermits"
        fields = [
            "PermitID", "PermitName", "PermitType", "ComplianceStatus",
            "RiskScore", "ExpirationDate", "NextReviewDate", "IssuingAgency",
        ]
        with arcpy.da.SearchCursor(
            fc, fields,
            where_clause=f"PermitID = '{args.permit_id}'"
        ) as cursor:
            for row in cursor:
                attrs = dict(zip(fields, row))
                result = evaluate_permit(workspace, attrs)
                print(json.dumps(result, indent=2, default=str))
                return

        logger.error("Permit not found: %s", args.permit_id)
        sys.exit(1)
    else:
        results = evaluate_all_permits(workspace, update=not args.no_update)
        summary = {
            "total": len(results),
            "compliant": sum(1 for r in results if r["status"] == STATUS_COMPLIANT),
            "non_compliant": sum(1 for r in results if r["status"] == STATUS_NON_COMPLIANT),
            "at_risk": sum(1 for r in results if r["status"] == STATUS_AT_RISK),
        }
        print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
