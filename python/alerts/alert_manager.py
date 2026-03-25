"""
Alert Management System

Generates, dispatches, and manages compliance alerts based on evaluation
results. Supports email notifications via SMTP and alert logging to the
geodatabase AlertLog table.

Requirements:
    - ArcGIS Pro 3.x with arcpy
    - Enterprise geodatabase with ECMS schema
    - SMTP server for email notifications (optional)

Usage:
    python alert_manager.py --workspace path/to/connection.sde
    python alert_manager.py --config ../../config/service_config.json
"""

import argparse
import json
import logging
import smtplib
import sys
import uuid
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

try:
    import arcpy
except ImportError:
    print("ERROR: arcpy is not available. Run from ArcGIS Pro Python environment.")
    sys.exit(1)

logger = logging.getLogger("ecms.alerts")

# ---------------------------------------------------------------------------
# Severity Levels
# ---------------------------------------------------------------------------

SEVERITY_CRITICAL = "Critical"
SEVERITY_HIGH = "High"
SEVERITY_MEDIUM = "Medium"
SEVERITY_LOW = "Low"
SEVERITY_INFO = "Info"

SEVERITY_ORDER = {
    SEVERITY_CRITICAL: 0,
    SEVERITY_HIGH: 1,
    SEVERITY_MEDIUM: 2,
    SEVERITY_LOW: 3,
    SEVERITY_INFO: 4,
}


# ---------------------------------------------------------------------------
# Alert Generation
# ---------------------------------------------------------------------------

def determine_severity(risk_score, violations):
    """Determine alert severity based on risk score and violations.

    Args:
        risk_score: Integer 0-100.
        violations: List of violation strings.

    Returns:
        Severity string.
    """
    has_expiry = any("expired" in v.lower() for v in violations)
    has_trigger = any("trigger violated" in v.lower() for v in violations)

    if risk_score >= 80 or has_expiry:
        return SEVERITY_CRITICAL
    if risk_score >= 60 or has_trigger:
        return SEVERITY_HIGH
    if risk_score >= 40:
        return SEVERITY_MEDIUM
    if violations:
        return SEVERITY_LOW
    return SEVERITY_INFO


def generate_alert_message(permit_id, permit_name, status, violations):
    """Create a human-readable alert message.

    Args:
        permit_id: The permit identifier.
        permit_name: Display name of the permit.
        status: Compliance status string.
        violations: List of violation strings.

    Returns:
        Formatted message string.
    """
    lines = [f"Compliance Alert for {permit_name} ({permit_id})"]
    lines.append(f"Status: {status}")
    if violations:
        lines.append("Violations:")
        for v in violations:
            lines.append(f"  - {v}")
    return "\n".join(lines)


def create_alert(workspace, permit_id, severity, message):
    """Insert a new alert into the AlertLog table.

    Args:
        workspace: Path to geodatabase.
        permit_id: Related permit ID.
        severity: Severity level string.
        message: Alert message text.

    Returns:
        The generated AlertID string.
    """
    table = f"{workspace}/AlertLog"
    alert_id = f"ALT-{uuid.uuid4().hex[:8].upper()}"
    fields = [
        "AlertID", "RelatedPermitID", "Severity", "Message",
        "AlertStatus", "CreatedDate",
    ]

    try:
        with arcpy.da.InsertCursor(table, fields) as cursor:
            cursor.insertRow([
                alert_id, permit_id, severity, message,
                "Open", datetime.utcnow(),
            ])
        logger.info("Created alert %s for permit %s (%s)", alert_id, permit_id, severity)
    except Exception as e:
        logger.error("Error creating alert for %s: %s", permit_id, e)
        return None

    return alert_id


def acknowledge_alert(workspace, alert_id, user="system"):
    """Mark an alert as acknowledged.

    Args:
        workspace: Path to geodatabase.
        alert_id: The AlertID to acknowledge.
        user: Username acknowledging the alert.
    """
    table = f"{workspace}/AlertLog"
    fields = ["AlertID", "AlertStatus", "AcknowledgedDate", "AcknowledgedBy"]

    try:
        with arcpy.da.UpdateCursor(
            table, fields,
            where_clause=f"AlertID = '{alert_id}'"
        ) as cursor:
            for row in cursor:
                row[1] = "Acknowledged"
                row[2] = datetime.utcnow()
                row[3] = user
                cursor.updateRow(row)
        logger.info("Alert %s acknowledged by %s", alert_id, user)
    except Exception as e:
        logger.error("Error acknowledging alert %s: %s", alert_id, e)


def resolve_alert(workspace, alert_id, user="system", resolution_note=""):
    """Mark an alert as resolved.

    Args:
        workspace: Path to geodatabase.
        alert_id: The AlertID to resolve.
        user: Username resolving the alert.
        resolution_note: Optional note about the resolution.
    """
    table = f"{workspace}/AlertLog"
    fields = ["AlertID", "AlertStatus", "ResolvedDate", "ResolvedBy", "ResolutionNote"]

    try:
        with arcpy.da.UpdateCursor(
            table, fields,
            where_clause=f"AlertID = '{alert_id}'"
        ) as cursor:
            for row in cursor:
                row[1] = "Resolved"
                row[2] = datetime.utcnow()
                row[3] = user
                row[4] = resolution_note
                cursor.updateRow(row)
        logger.info("Alert %s resolved by %s", alert_id, user)
    except Exception as e:
        logger.error("Error resolving alert %s: %s", alert_id, e)


# ---------------------------------------------------------------------------
# Alert Deduplication
# ---------------------------------------------------------------------------

def has_open_alert(workspace, permit_id, severity):
    """Check if an open alert already exists for a permit at the given severity.

    Args:
        workspace: Path to geodatabase.
        permit_id: Permit ID to check.
        severity: Severity level to check for.

    Returns:
        True if a matching open alert exists.
    """
    table = f"{workspace}/AlertLog"
    try:
        with arcpy.da.SearchCursor(
            table, ["AlertID"],
            where_clause=(
                f"RelatedPermitID = '{permit_id}' AND "
                f"Severity = '{severity}' AND "
                f"AlertStatus = 'Open'"
            ),
        ) as cursor:
            for _ in cursor:
                return True
    except Exception:
        pass
    return False


# ---------------------------------------------------------------------------
# Email Notifications
# ---------------------------------------------------------------------------

def send_email_notification(smtp_config, recipients, subject, body):
    """Send an email notification.

    Args:
        smtp_config: Dictionary with keys: host, port, username, password, from_addr, use_tls.
        recipients: List of email addresses.
        subject: Email subject.
        body: Email body text.
    """
    if not smtp_config or not recipients:
        logger.debug("Email skipped: no SMTP config or recipients.")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = smtp_config.get("from_addr", "ecms@example.com")
    msg["To"] = ", ".join(recipients)
    msg.attach(MIMEText(body, "plain"))

    try:
        server = smtplib.SMTP(
            smtp_config.get("host", "localhost"),
            smtp_config.get("port", 25),
        )
        if smtp_config.get("use_tls"):
            server.starttls()
        username = smtp_config.get("username")
        password = smtp_config.get("password")
        if username and password:
            server.login(username, password)
        server.sendmail(msg["From"], recipients, msg.as_string())
        server.quit()
        logger.info("Email sent to %s: %s", recipients, subject)
    except Exception as e:
        logger.error("Failed to send email: %s", e)


# ---------------------------------------------------------------------------
# Contact Lookup
# ---------------------------------------------------------------------------

def get_contacts_for_permit(workspace, permit_id):
    """Look up contacts associated with a permit via the junction table.

    Args:
        workspace: Path to geodatabase.
        permit_id: The permit ID.

    Returns:
        List of dictionaries with contact info.
    """
    junction = f"{workspace}/PermitContactJunction"
    contacts_table = f"{workspace}/ContactList"
    contact_ids = []

    try:
        with arcpy.da.SearchCursor(
            junction, ["ContactID"],
            where_clause=f"PermitID = '{permit_id}'",
        ) as cursor:
            for row in cursor:
                contact_ids.append(row[0])
    except Exception as e:
        logger.error("Error reading junction table: %s", e)
        return []

    if not contact_ids:
        return []

    contacts = []
    id_list = ", ".join(f"'{c}'" for c in contact_ids)
    fields = ["ContactID", "ContactName", "Email", "Phone", "Role"]

    try:
        with arcpy.da.SearchCursor(
            contacts_table, fields,
            where_clause=f"ContactID IN ({id_list})",
        ) as cursor:
            for row in cursor:
                contacts.append(dict(zip(fields, row)))
    except Exception as e:
        logger.error("Error reading contacts: %s", e)

    return contacts


# ---------------------------------------------------------------------------
# Batch Alert Processing
# ---------------------------------------------------------------------------

def process_evaluation_results(workspace, results, smtp_config=None):
    """Process compliance evaluation results and generate alerts.

    Args:
        workspace: Path to geodatabase.
        results: List of evaluation result dicts from the compliance engine.
        smtp_config: Optional SMTP config dict for email notifications.

    Returns:
        List of created alert IDs.
    """
    created_alerts = []

    for result in results:
        permit_id = result.get("permit_id")
        status = result.get("status")
        violations = result.get("violations", [])
        risk_score = result.get("risk_score", 0)

        if status in ("Compliant", "Unknown") and not violations:
            continue

        severity = determine_severity(risk_score, violations)

        # Skip if there's already an open alert at this severity
        if has_open_alert(workspace, permit_id, severity):
            logger.debug(
                "Skipping duplicate alert for %s at severity %s",
                permit_id, severity,
            )
            continue

        message = generate_alert_message(
            permit_id,
            result.get("permit_name", permit_id),
            status,
            violations,
        )

        alert_id = create_alert(workspace, permit_id, severity, message)
        if alert_id:
            created_alerts.append(alert_id)

        # Send email for High and Critical alerts
        if severity in (SEVERITY_CRITICAL, SEVERITY_HIGH) and smtp_config:
            contacts = get_contacts_for_permit(workspace, permit_id)
            emails = [c["Email"] for c in contacts if c.get("Email")]
            if emails:
                send_email_notification(
                    smtp_config,
                    emails,
                    f"[ECMS {severity}] Compliance Alert - {permit_id}",
                    message,
                )

    logger.info(
        "Alert processing complete. %d new alerts created.", len(created_alerts)
    )
    return created_alerts


# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

def auto_resolve_stale_alerts(workspace, days_old=30):
    """Auto-resolve alerts older than a given number of days.

    Args:
        workspace: Path to geodatabase.
        days_old: Number of days after which open alerts are auto-resolved.

    Returns:
        Number of alerts resolved.
    """
    table = f"{workspace}/AlertLog"
    cutoff = datetime.utcnow() - __import__("datetime").timedelta(days=days_old)
    fields = ["AlertID", "AlertStatus", "CreatedDate", "ResolvedDate", "ResolvedBy"]
    count = 0

    try:
        with arcpy.da.UpdateCursor(
            table, fields,
            where_clause="AlertStatus = 'Open'",
        ) as cursor:
            for row in cursor:
                created = row[2]
                if created and created < cutoff:
                    row[1] = "AutoResolved"
                    row[3] = datetime.utcnow()
                    row[4] = "system"
                    cursor.updateRow(row)
                    count += 1
    except Exception as e:
        logger.error("Error auto-resolving alerts: %s", e)

    logger.info("Auto-resolved %d stale alerts.", count)
    return count


# ---------------------------------------------------------------------------
# CLI Entry Point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="ECMS Alert Manager - process evaluation results and send alerts."
    )
    parser.add_argument("--workspace", "-w", help="Path to geodatabase (.sde).")
    parser.add_argument("--config", "-c", help="Path to service_config.json.")
    parser.add_argument(
        "--results-file",
        help="Path to JSON file with evaluation results.",
    )
    parser.add_argument(
        "--auto-resolve-days", type=int, default=0,
        help="Auto-resolve alerts older than N days (0 = disabled).",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)-8s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    workspace = args.workspace
    smtp_config = None

    if not workspace and args.config:
        with open(args.config) as f:
            cfg = json.load(f)
        workspace = cfg.get("geodatabase", {}).get("connectionFile")
        smtp_config = cfg.get("smtp")

    if not workspace:
        logger.error("No workspace specified. Use --workspace or --config.")
        sys.exit(1)

    if args.auto_resolve_days > 0:
        auto_resolve_stale_alerts(workspace, args.auto_resolve_days)

    if args.results_file:
        with open(args.results_file) as f:
            results = json.load(f)
        process_evaluation_results(workspace, results, smtp_config)
    else:
        logger.info("No results file provided. Use --results-file to process alerts.")


if __name__ == "__main__":
    main()
