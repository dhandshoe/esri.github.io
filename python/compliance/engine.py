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
# Driver Evaluation
# ---------------------------------------------------------------------------

def evaluate_driver(workspace, driver_attrs):
    """Evaluate a regulatory driver's compliance status and risk score.

    Considers the driver's own expiration/review dates, plus the status
    of all linked obligations and their tasks.

    Args:
        workspace: Path to geodatabase.
        driver_attrs: Dictionary of driver attributes.

    Returns:
        dict with keys: driver_id, status, risk_score, violations,
        obligation_summary.
    """
    driver_id = driver_attrs.get("DriverID")
    violations = []
    obligation_summary = {"total": 0, "active": 0, "overdue": 0, "completed": 0}

    # Check driver expiration / review dates (same logic as permits)
    violation_count = 0
    alert_count = get_open_alert_count(workspace, driver_id)

    # Query obligations for this driver
    obl_table = f"{workspace}/Obligations"
    obl_fields = [
        "ObligationID", "ObligationNumber", "ObligationStatus",
        "DueDate", "Priority", "ObligationType",
    ]
    try:
        with arcpy.da.SearchCursor(
            obl_table, obl_fields,
            where_clause=f"DriverID = '{driver_id}'"
        ) as cursor:
            for row in cursor:
                obl = dict(zip(obl_fields, row))
                obligation_summary["total"] += 1

                obl_status = obl.get("ObligationStatus", "")
                if obl_status == "Completed":
                    obligation_summary["completed"] += 1
                elif obl_status == "Active":
                    obligation_summary["active"] += 1

                # Check if obligation is overdue
                due = obl.get("DueDate")
                if due and isinstance(due, datetime) and due < datetime.utcnow():
                    if obl_status not in ("Completed", "Waived", "Superseded"):
                        obligation_summary["overdue"] += 1
                        violations.append({
                            "type": "obligation_overdue",
                            "obligation_id": obl["ObligationID"],
                            "number": obl.get("ObligationNumber", ""),
                            "due_date": str(due),
                        })
                        violation_count += 1
    except Exception as e:
        logger.error("Error querying obligations for driver %s: %s", driver_id, e)

    # Calculate risk using same mechanism as permits
    risk = calculate_risk_score(driver_attrs, violation_count, alert_count)

    # Determine status
    if violation_count > 0 or obligation_summary["overdue"] > 0:
        status = STATUS_NON_COMPLIANT if risk >= HIGH_RISK_THRESHOLD else STATUS_AT_RISK
    elif risk > 0:
        status = STATUS_AT_RISK
    else:
        status = STATUS_COMPLIANT

    return {
        "driver_id": driver_id,
        "status": status,
        "risk_score": risk,
        "violations": violations,
        "obligation_summary": obligation_summary,
    }


def evaluate_all_drivers(workspace, project_id=None, update=True):
    """Evaluate all drivers, optionally filtered by project.

    Args:
        workspace: Path to geodatabase.
        project_id: Optional project filter.
        update: If True, writes results back to the Drivers table.

    Returns:
        List of evaluation result dicts.
    """
    table = f"{workspace}/Drivers"
    fields = [
        "DriverID", "DriverName", "DriverType", "DriverStatus",
        "ComplianceStatus", "RiskScore", "ExpirationDate",
        "NextReviewDate", "IssuingAgency", "ProjectID",
    ]

    where = "1=1"
    if project_id:
        where = f"ProjectID = '{project_id}'"

    results = []
    try:
        with arcpy.da.SearchCursor(table, fields, where_clause=where) as cursor:
            for row in cursor:
                attrs = dict(zip(fields, row))
                result = evaluate_driver(workspace, attrs)
                results.append(result)
    except Exception as e:
        logger.error("Error evaluating drivers: %s", e)
        return results

    if update and results:
        _update_driver_statuses(workspace, results)

    logger.info("Evaluated %d drivers: %d compliant, %d non-compliant, %d at-risk",
                len(results),
                sum(1 for r in results if r["status"] == STATUS_COMPLIANT),
                sum(1 for r in results if r["status"] == STATUS_NON_COMPLIANT),
                sum(1 for r in results if r["status"] == STATUS_AT_RISK))

    return results


def _update_driver_statuses(workspace, results):
    """Write evaluation results back to the Drivers table."""
    table = f"{workspace}/Drivers"
    update_fields = ["DriverID", "ComplianceStatus", "RiskScore"]
    status_map = {r["driver_id"]: r for r in results}
    try:
        with arcpy.da.UpdateCursor(table, update_fields) as cursor:
            for row in cursor:
                did = row[0]
                if did in status_map:
                    row[1] = status_map[did]["status"]
                    row[2] = status_map[did]["risk_score"]
                    cursor.updateRow(row)
        logger.info("Updated %d driver statuses.", len(status_map))
    except Exception as e:
        logger.error("Error updating driver statuses: %s", e)


def generate_compliance_report(workspace, project_id=None, output_format="dict"):
    """Generate a comprehensive compliance report covering drivers, obligations, and tasks.

    Args:
        workspace: Path to geodatabase.
        project_id: Optional project filter.
        output_format: "dict" for Python dict, "csv" for CSV string.

    Returns:
        Compliance report data.
    """
    report = {
        "generated_at": datetime.utcnow().isoformat(),
        "project_id": project_id,
        "drivers": {"total": 0, "compliant": 0, "non_compliant": 0, "at_risk": 0},
        "obligations": {"total": 0, "active": 0, "overdue": 0, "completed": 0},
        "tasks": {"total": 0, "in_progress": 0, "overdue": 0, "completed": 0},
        "details": [],
    }

    # Driver summary
    driver_results = evaluate_all_drivers(workspace, project_id, update=False)
    report["drivers"]["total"] = len(driver_results)
    for r in driver_results:
        if r["status"] == STATUS_COMPLIANT:
            report["drivers"]["compliant"] += 1
        elif r["status"] == STATUS_NON_COMPLIANT:
            report["drivers"]["non_compliant"] += 1
        else:
            report["drivers"]["at_risk"] += 1
        report["details"].append(r)

    # Obligation summary
    obl_table = f"{workspace}/Obligations"
    obl_where = f"ProjectID = '{project_id}'" if project_id else "1=1"
    try:
        with arcpy.da.SearchCursor(
            obl_table, ["ObligationStatus", "DueDate"], where_clause=obl_where
        ) as cursor:
            for row in cursor:
                report["obligations"]["total"] += 1
                status = row[0] or ""
                if status == "Completed":
                    report["obligations"]["completed"] += 1
                elif status == "Active":
                    report["obligations"]["active"] += 1
                due = row[1]
                if due and isinstance(due, datetime) and due < datetime.utcnow():
                    if status not in ("Completed", "Waived", "Superseded"):
                        report["obligations"]["overdue"] += 1
    except Exception as e:
        logger.error("Error querying obligations for report: %s", e)

    # Task summary
    task_table = f"{workspace}/Tasks"
    task_where = f"ProjectID = '{project_id}'" if project_id else "1=1"
    try:
        with arcpy.da.SearchCursor(
            task_table, ["TaskStatus", "DueDate"], where_clause=task_where
        ) as cursor:
            for row in cursor:
                report["tasks"]["total"] += 1
                status = row[0] or ""
                if status == "Completed":
                    report["tasks"]["completed"] += 1
                elif status == "InProgress":
                    report["tasks"]["in_progress"] += 1
                due = row[1]
                if due and isinstance(due, datetime) and due < datetime.utcnow():
                    if status not in ("Completed", "Cancelled"):
                        report["tasks"]["overdue"] += 1
    except Exception as e:
        logger.error("Error querying tasks for report: %s", e)

    return report


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
    parser.add_argument(
        "--driver-id",
        help="Evaluate a single driver by ID.",
    )
    parser.add_argument(
        "--project-id",
        help="Filter evaluation to a specific project.",
    )
    parser.add_argument(
        "--report", action="store_true",
        help="Generate a comprehensive compliance report.",
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

    if args.report:
        # Comprehensive compliance report
        report = generate_compliance_report(
            workspace, project_id=args.project_id
        )
        print(json.dumps(report, indent=2, default=str))
    elif args.driver_id:
        # Single driver evaluation
        table = f"{workspace}/Drivers"
        fields = [
            "DriverID", "DriverName", "DriverType", "DriverStatus",
            "ComplianceStatus", "RiskScore", "ExpirationDate",
            "NextReviewDate", "IssuingAgency", "ProjectID",
        ]
        with arcpy.da.SearchCursor(
            table, fields,
            where_clause=f"DriverID = '{args.driver_id}'"
        ) as cursor:
            for row in cursor:
                attrs = dict(zip(fields, row))
                result = evaluate_driver(workspace, attrs)
                print(json.dumps(result, indent=2, default=str))
                return
        logger.error("Driver not found: %s", args.driver_id)
        sys.exit(1)
    elif args.permit_id:
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
        # Evaluate all permits and drivers
        permit_results = evaluate_all_permits(
            workspace, update=not args.no_update
        )
        driver_results = evaluate_all_drivers(
            workspace, project_id=args.project_id,
            update=not args.no_update
        )
        summary = {
            "permits": {
                "total": len(permit_results),
                "compliant": sum(1 for r in permit_results if r["status"] == STATUS_COMPLIANT),
                "non_compliant": sum(1 for r in permit_results if r["status"] == STATUS_NON_COMPLIANT),
                "at_risk": sum(1 for r in permit_results if r["status"] == STATUS_AT_RISK),
            },
            "drivers": {
                "total": len(driver_results),
                "compliant": sum(1 for r in driver_results if r["status"] == STATUS_COMPLIANT),
                "non_compliant": sum(1 for r in driver_results if r["status"] == STATUS_NON_COMPLIANT),
                "at_risk": sum(1 for r in driver_results if r["status"] == STATUS_AT_RISK),
            },
        }
        print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
