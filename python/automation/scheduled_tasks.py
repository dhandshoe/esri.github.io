"""
Scheduled Task Runner for ECMS

Orchestrates recurring compliance checks, alert processing, report generation,
and data maintenance. Designed to run as a Windows Task Scheduler job or
cron entry.

Requirements:
    - ArcGIS Pro 3.x with arcpy
    - Enterprise geodatabase with ECMS schema

Usage:
    python scheduled_tasks.py --config ../../config/service_config.json --task all
    python scheduled_tasks.py --workspace path/to/connection.sde --task evaluate
    python scheduled_tasks.py --config ../../config/service_config.json --task report
"""

import argparse
import csv
import json
import logging
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

try:
    import arcpy
except ImportError:
    print("ERROR: arcpy is not available. Run from ArcGIS Pro Python environment.")
    sys.exit(1)

# Resolve parent package imports
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from compliance.engine import evaluate_all_permits
from alerts.alert_manager import (
    process_evaluation_results,
    auto_resolve_stale_alerts,
)

logger = logging.getLogger("ecms.automation")

# ---------------------------------------------------------------------------
# Report Generation
# ---------------------------------------------------------------------------

def generate_compliance_report(workspace, output_dir):
    """Generate a CSV compliance summary report.

    Args:
        workspace: Path to geodatabase.
        output_dir: Directory to write report files.

    Returns:
        Path to the generated report file.
    """
    os.makedirs(output_dir, exist_ok=True)
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    report_path = os.path.join(output_dir, f"compliance_report_{timestamp}.csv")

    fc = f"{workspace}/EnvironmentalPermits"
    fields = [
        "PermitID", "PermitName", "PermitType", "ComplianceStatus",
        "RiskScore", "IssuingAgency", "ExpirationDate", "NextReviewDate",
    ]

    try:
        with open(report_path, "w", newline="", encoding="utf-8") as csvfile:
            writer = csv.writer(csvfile)
            writer.writerow(fields + ["DaysUntilExpiry"])

            with arcpy.da.SearchCursor(fc, fields) as cursor:
                now = datetime.utcnow()
                for row in cursor:
                    exp = row[6]
                    days_left = ""
                    if exp:
                        if isinstance(exp, str):
                            exp = datetime.fromisoformat(exp)
                        days_left = (exp - now).days

                    writer.writerow(list(row) + [days_left])

        logger.info("Report generated: %s", report_path)
        return report_path
    except Exception as e:
        logger.error("Error generating report: %s", e)
        return None


def generate_alert_summary(workspace, output_dir):
    """Generate a CSV of all open alerts.

    Args:
        workspace: Path to geodatabase.
        output_dir: Directory to write report files.

    Returns:
        Path to the generated file.
    """
    os.makedirs(output_dir, exist_ok=True)
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    report_path = os.path.join(output_dir, f"alert_summary_{timestamp}.csv")

    table = f"{workspace}/AlertLog"
    fields = [
        "AlertID", "RelatedPermitID", "Severity", "Message",
        "AlertStatus", "CreatedDate",
    ]

    try:
        with open(report_path, "w", newline="", encoding="utf-8") as csvfile:
            writer = csv.writer(csvfile)
            writer.writerow(fields)

            with arcpy.da.SearchCursor(
                table, fields,
                where_clause="AlertStatus IN ('Open', 'Acknowledged')",
                sql_clause=(None, "ORDER BY CreatedDate DESC"),
            ) as cursor:
                for row in cursor:
                    writer.writerow(row)

        logger.info("Alert summary generated: %s", report_path)
        return report_path
    except Exception as e:
        logger.error("Error generating alert summary: %s", e)
        return None


# ---------------------------------------------------------------------------
# Data Maintenance
# ---------------------------------------------------------------------------

def archive_old_monitoring_data(workspace, days_to_keep=365):
    """Delete monitoring data records older than a threshold.

    Records are expected to be archived to a separate store before this
    cleanup runs. This function only removes from the active table.

    Args:
        workspace: Path to geodatabase.
        days_to_keep: Records older than this are removed.

    Returns:
        Number of records deleted.
    """
    table = f"{workspace}/MonitoringData"
    cutoff = datetime.utcnow() - timedelta(days=days_to_keep)
    count = 0

    try:
        with arcpy.da.UpdateCursor(
            table, ["OBJECTID", "ReadingDate"],
            where_clause=f"ReadingDate < timestamp '{cutoff.strftime('%Y-%m-%d %H:%M:%S')}'",
        ) as cursor:
            for row in cursor:
                cursor.deleteRow()
                count += 1
        logger.info("Archived %d monitoring records older than %d days.", count, days_to_keep)
    except Exception as e:
        logger.error("Error archiving monitoring data: %s", e)

    return count


def archive_old_audit_entries(workspace, days_to_keep=730):
    """Remove audit trail entries older than a threshold.

    Args:
        workspace: Path to geodatabase.
        days_to_keep: Records older than this are removed.

    Returns:
        Number of records deleted.
    """
    table = f"{workspace}/AuditTrail"
    cutoff = datetime.utcnow() - timedelta(days=days_to_keep)
    count = 0

    try:
        with arcpy.da.UpdateCursor(
            table, ["OBJECTID", "EditDate"],
            where_clause=f"EditDate < timestamp '{cutoff.strftime('%Y-%m-%d %H:%M:%S')}'",
        ) as cursor:
            for row in cursor:
                cursor.deleteRow()
                count += 1
        logger.info("Archived %d audit entries older than %d days.", count, days_to_keep)
    except Exception as e:
        logger.error("Error archiving audit entries: %s", e)

    return count


def update_station_statuses(workspace):
    """Flag monitoring stations as inactive if no data received recently.

    Stations with no readings in the last 7 days are marked Inactive.

    Args:
        workspace: Path to geodatabase.

    Returns:
        Number of stations updated.
    """
    station_fc = f"{workspace}/MonitoringStations"
    data_table = f"{workspace}/MonitoringData"
    threshold = datetime.utcnow() - timedelta(days=7)
    count = 0

    # Get stations with recent data
    active_stations = set()
    try:
        with arcpy.da.SearchCursor(
            data_table, ["StationID", "ReadingDate"],
        ) as cursor:
            for row in cursor:
                if row[1] and row[1] >= threshold:
                    active_stations.add(row[0])
    except Exception as e:
        logger.error("Error reading monitoring data: %s", e)
        return 0

    # Update station statuses
    try:
        with arcpy.da.UpdateCursor(
            station_fc, ["StationID", "StationStatus"],
        ) as cursor:
            for row in cursor:
                station_id = row[0]
                current_status = row[1]
                if station_id in active_stations and current_status == "Inactive":
                    row[1] = "Active"
                    cursor.updateRow(row)
                    count += 1
                elif station_id not in active_stations and current_status == "Active":
                    row[1] = "Inactive"
                    cursor.updateRow(row)
                    count += 1
        logger.info("Updated %d station statuses.", count)
    except Exception as e:
        logger.error("Error updating station statuses: %s", e)

    return count


# ---------------------------------------------------------------------------
# Task Orchestration
# ---------------------------------------------------------------------------

TASKS = {
    "evaluate": "Run compliance evaluation on all permits",
    "alerts": "Process evaluation results and generate alerts",
    "report": "Generate compliance and alert reports",
    "maintenance": "Archive old data and update station statuses",
    "all": "Run all tasks in sequence",
}


def run_task(task_name, workspace, config=None):
    """Run a named task.

    Args:
        task_name: One of the TASKS keys.
        workspace: Path to geodatabase.
        config: Optional parsed config dict.
    """
    report_dir = "reports"
    smtp_config = None
    if config:
        report_dir = config.get("reportDirectory", "reports")
        smtp_config = config.get("smtp")

    logger.info("=" * 60)
    logger.info("Running task: %s", task_name)
    logger.info("=" * 60)

    if task_name in ("evaluate", "all"):
        results = evaluate_all_permits(workspace, update=True)
        # Save results for alert processing
        results_path = os.path.join(report_dir, "latest_results.json")
        os.makedirs(report_dir, exist_ok=True)
        with open(results_path, "w") as f:
            json.dump(results, f, indent=2, default=str)

    if task_name in ("alerts", "all"):
        results_path = os.path.join(report_dir, "latest_results.json")
        if os.path.exists(results_path):
            with open(results_path) as f:
                results = json.load(f)
            process_evaluation_results(workspace, results, smtp_config)
            auto_resolve_stale_alerts(workspace, days_old=30)
        else:
            logger.warning("No evaluation results found. Run 'evaluate' first.")

    if task_name in ("report", "all"):
        generate_compliance_report(workspace, report_dir)
        generate_alert_summary(workspace, report_dir)

    if task_name in ("maintenance", "all"):
        archive_old_monitoring_data(workspace, days_to_keep=365)
        archive_old_audit_entries(workspace, days_to_keep=730)
        update_station_statuses(workspace)

    logger.info("Task '%s' complete.", task_name)


# ---------------------------------------------------------------------------
# CLI Entry Point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="ECMS Scheduled Task Runner",
    )
    parser.add_argument("--workspace", "-w", help="Path to geodatabase (.sde).")
    parser.add_argument("--config", "-c", help="Path to service_config.json.")
    parser.add_argument(
        "--task", "-t",
        choices=list(TASKS.keys()),
        default="all",
        help=f"Task to run. Choices: {', '.join(TASKS.keys())}",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)-8s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    workspace = args.workspace
    config = None

    if not workspace and args.config:
        with open(args.config) as f:
            config = json.load(f)
        workspace = config.get("geodatabase", {}).get("connectionFile")

    if not workspace:
        logger.error("No workspace specified. Use --workspace or --config.")
        sys.exit(1)

    arcpy.env.workspace = workspace
    run_task(args.task, workspace, config)


if __name__ == "__main__":
    main()
