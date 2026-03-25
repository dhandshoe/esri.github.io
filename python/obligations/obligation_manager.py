"""
Obligation Manager

Manages obligations and their relationships to drivers and tasks within the
ECMS geodatabase. Obligations represent regulatory or permit-driven
requirements that must be fulfilled, tracked, and verified through
linked tasks.

Requirements:
    - ArcGIS Pro 3.x with arcpy
    - Enterprise geodatabase with ECMS schema

Usage:
    from obligations.obligation_manager import create_obligation, get_obligations_for_driver
"""

import json
import logging
import os
import uuid
from datetime import datetime

try:
    import arcpy
except ImportError:
    raise ImportError(
        "arcpy is not available. Run from ArcGIS Pro Python environment."
    )

logger = logging.getLogger("ecms.obligations")

# ---------------------------------------------------------------------------
# Constants - Table Names
# ---------------------------------------------------------------------------

TABLE_OBLIGATIONS = "Obligations"
TABLE_OBLIGATION_TASKS = "ObligationTasks"
TABLE_DRIVERS = "ComplianceDrivers"
TABLE_TASKS = "Tasks"
TABLE_AUDIT_TRAIL = "AuditTrail"

# ---------------------------------------------------------------------------
# Constants - Field Names
# ---------------------------------------------------------------------------

OBLIGATION_FIELDS = [
    "ObligationID", "ObligationNumber", "ProjectID", "DriverID",
    "ObligationTitle", "ObligationDescription", "ObligationType",
    "Status", "Priority", "DueDate", "CompletionDate",
    "AssignedTo", "CreatedBy", "CreatedDate", "ModifiedDate",
    "Notes", "IsActive",
]

OBLIGATION_TASK_FIELDS = [
    "ObligationTaskID", "ObligationID", "TaskID", "LinkNotes",
    "LinkedDate", "LinkedBy",
]

# ---------------------------------------------------------------------------
# Constants - Status Values
# ---------------------------------------------------------------------------

STATUS_OPEN = "Open"
STATUS_IN_PROGRESS = "InProgress"
STATUS_COMPLETED = "Completed"
STATUS_OVERDUE = "Overdue"
STATUS_CANCELLED = "Cancelled"
STATUS_ON_HOLD = "OnHold"

VALID_STATUSES = [
    STATUS_OPEN, STATUS_IN_PROGRESS, STATUS_COMPLETED,
    STATUS_OVERDUE, STATUS_CANCELLED, STATUS_ON_HOLD,
]


# ---------------------------------------------------------------------------
# ID Generation
# ---------------------------------------------------------------------------

def generate_obligation_number(project_code, sequence):
    """Generate a formatted obligation ID.

    Args:
        project_code: Short project code string (e.g., 'GTP').
        sequence: Integer sequence number.

    Returns:
        Formatted obligation number like 'OBL-GTP-0001'.
    """
    return f"OBL-{project_code.upper()}-{sequence:04d}"


# ---------------------------------------------------------------------------
# Obligation CRUD
# ---------------------------------------------------------------------------

def create_obligation(workspace, obligation_data):
    """Create a new obligation record in the geodatabase.

    Args:
        workspace: Path to geodatabase.
        obligation_data: Dictionary containing obligation field values.
            Required keys: ProjectID, DriverID, ObligationTitle.

    Returns:
        The generated ObligationID string, or None on failure.
    """
    table = f"{workspace}/{TABLE_OBLIGATIONS}"
    obligation_id = str(uuid.uuid4())
    now = datetime.utcnow()

    row_values = [
        obligation_id,
        obligation_data.get("ObligationNumber", ""),
        obligation_data.get("ProjectID"),
        obligation_data.get("DriverID"),
        obligation_data.get("ObligationTitle"),
        obligation_data.get("ObligationDescription", ""),
        obligation_data.get("ObligationType", "Regulatory"),
        obligation_data.get("Status", STATUS_OPEN),
        obligation_data.get("Priority", "Medium"),
        obligation_data.get("DueDate"),
        obligation_data.get("CompletionDate"),
        obligation_data.get("AssignedTo", ""),
        obligation_data.get("CreatedBy", "system"),
        now,
        now,
        obligation_data.get("Notes", ""),
        obligation_data.get("IsActive", 1),
    ]

    try:
        with arcpy.da.InsertCursor(table, OBLIGATION_FIELDS) as cursor:
            cursor.insertRow(row_values)
        logger.info("Created obligation %s: %s",
                     obligation_id, obligation_data.get("ObligationTitle"))
        return obligation_id
    except Exception as e:
        logger.error("Error creating obligation: %s", e)
        return None


def update_obligation_status(workspace, obligation_id, new_status, reason=""):
    """Update the status of an obligation with audit trail.

    Args:
        workspace: Path to geodatabase.
        obligation_id: The ObligationID to update.
        new_status: New status value (must be in VALID_STATUSES).
        reason: Optional reason for the status change.

    Returns:
        True if updated successfully, False otherwise.
    """
    if new_status not in VALID_STATUSES:
        logger.error("Invalid status '%s'. Must be one of: %s",
                      new_status, VALID_STATUSES)
        return False

    table = f"{workspace}/{TABLE_OBLIGATIONS}"
    fields = ["ObligationID", "Status", "ModifiedDate", "Notes"]
    old_status = None

    try:
        with arcpy.da.UpdateCursor(
            table, fields,
            where_clause=f"ObligationID = '{obligation_id}'"
        ) as cursor:
            for row in cursor:
                old_status = row[1]
                row[1] = new_status
                row[2] = datetime.utcnow()
                if reason:
                    existing_notes = row[3] or ""
                    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
                    row[3] = f"{existing_notes}\n[{timestamp}] Status: {old_status} -> {new_status}. {reason}".strip()
                cursor.updateRow(row)
                logger.info("Updated obligation %s status: %s -> %s",
                            obligation_id, old_status, new_status)

        if old_status is not None:
            _log_audit(workspace, TABLE_OBLIGATIONS, obligation_id,
                       "Status", old_status, new_status)
            return True

        logger.warning("Obligation not found: %s", obligation_id)
        return False
    except Exception as e:
        logger.error("Error updating obligation %s: %s", obligation_id, e)
        return False


# ---------------------------------------------------------------------------
# Obligation Queries
# ---------------------------------------------------------------------------

def get_obligations_for_driver(workspace, driver_id):
    """Query all obligations linked to a specific compliance driver.

    Args:
        workspace: Path to geodatabase.
        driver_id: The DriverID to filter on.

    Returns:
        List of obligation dictionaries.
    """
    table = f"{workspace}/{TABLE_OBLIGATIONS}"
    obligations = []

    try:
        with arcpy.da.SearchCursor(
            table, OBLIGATION_FIELDS,
            where_clause=f"DriverID = '{driver_id}' AND IsActive = 1"
        ) as cursor:
            for row in cursor:
                obligations.append(dict(zip(OBLIGATION_FIELDS, row)))
    except Exception as e:
        logger.error("Error querying obligations for driver %s: %s",
                      driver_id, e)

    return obligations


def get_obligations_for_project(workspace, project_id):
    """Query all obligations for a specific project.

    Args:
        workspace: Path to geodatabase.
        project_id: The ProjectID to filter on.

    Returns:
        List of obligation dictionaries.
    """
    table = f"{workspace}/{TABLE_OBLIGATIONS}"
    obligations = []

    try:
        with arcpy.da.SearchCursor(
            table, OBLIGATION_FIELDS,
            where_clause=f"ProjectID = '{project_id}' AND IsActive = 1"
        ) as cursor:
            for row in cursor:
                obligations.append(dict(zip(OBLIGATION_FIELDS, row)))
    except Exception as e:
        logger.error("Error querying obligations for project %s: %s",
                      project_id, e)

    return obligations


# ---------------------------------------------------------------------------
# Obligation-Task Linking
# ---------------------------------------------------------------------------

def link_task_to_obligation(workspace, obligation_id, task_id, notes=""):
    """Create a junction record linking a task to an obligation.

    Args:
        workspace: Path to geodatabase.
        obligation_id: The ObligationID.
        task_id: The TaskID to link.
        notes: Optional notes about the link.

    Returns:
        The generated ObligationTaskID, or None on failure.
    """
    table = f"{workspace}/{TABLE_OBLIGATION_TASKS}"
    link_id = str(uuid.uuid4())
    now = datetime.utcnow()

    row_values = [
        link_id,
        obligation_id,
        task_id,
        notes,
        now,
        "system",
    ]

    try:
        with arcpy.da.InsertCursor(table, OBLIGATION_TASK_FIELDS) as cursor:
            cursor.insertRow(row_values)
        logger.info("Linked task %s to obligation %s", task_id, obligation_id)
        return link_id
    except Exception as e:
        logger.error("Error linking task %s to obligation %s: %s",
                      task_id, obligation_id, e)
        return None


def unlink_task_from_obligation(workspace, obligation_id, task_id):
    """Remove a junction record linking a task to an obligation.

    Args:
        workspace: Path to geodatabase.
        obligation_id: The ObligationID.
        task_id: The TaskID to unlink.

    Returns:
        True if the record was removed, False otherwise.
    """
    table = f"{workspace}/{TABLE_OBLIGATION_TASKS}"
    fields = ["ObligationID", "TaskID"]
    removed = False

    try:
        with arcpy.da.UpdateCursor(
            table, fields,
            where_clause=f"ObligationID = '{obligation_id}' AND TaskID = '{task_id}'"
        ) as cursor:
            for row in cursor:
                cursor.deleteRow()
                removed = True
                logger.info("Unlinked task %s from obligation %s",
                            task_id, obligation_id)

        if not removed:
            logger.warning("No link found between obligation %s and task %s",
                           obligation_id, task_id)
    except Exception as e:
        logger.error("Error unlinking task %s from obligation %s: %s",
                      task_id, obligation_id, e)

    return removed


def get_tasks_for_obligation(workspace, obligation_id):
    """Get all tasks linked to an obligation via the junction table.

    Args:
        workspace: Path to geodatabase.
        obligation_id: The ObligationID to query.

    Returns:
        List of task dictionaries.
    """
    junction_table = f"{workspace}/{TABLE_OBLIGATION_TASKS}"
    task_table = f"{workspace}/{TABLE_TASKS}"
    task_ids = []

    try:
        with arcpy.da.SearchCursor(
            junction_table, ["TaskID"],
            where_clause=f"ObligationID = '{obligation_id}'"
        ) as cursor:
            for row in cursor:
                task_ids.append(row[0])
    except Exception as e:
        logger.error("Error querying junction for obligation %s: %s",
                      obligation_id, e)
        return []

    if not task_ids:
        return []

    task_fields = [
        "TaskID", "TaskTitle", "Status", "DueDate",
        "CompletionDate", "AssignedTo", "Priority",
    ]
    tasks = []
    id_list = "','".join(task_ids)

    try:
        with arcpy.da.SearchCursor(
            task_table, task_fields,
            where_clause=f"TaskID IN ('{id_list}')"
        ) as cursor:
            for row in cursor:
                tasks.append(dict(zip(task_fields, row)))
    except Exception as e:
        logger.error("Error querying tasks for obligation %s: %s",
                      obligation_id, e)

    return tasks


def get_obligations_for_task(workspace, task_id):
    """Get all obligations linked to a specific task.

    Args:
        workspace: Path to geodatabase.
        task_id: The TaskID to query.

    Returns:
        List of obligation dictionaries.
    """
    junction_table = f"{workspace}/{TABLE_OBLIGATION_TASKS}"
    obligation_table = f"{workspace}/{TABLE_OBLIGATIONS}"
    obligation_ids = []

    try:
        with arcpy.da.SearchCursor(
            junction_table, ["ObligationID"],
            where_clause=f"TaskID = '{task_id}'"
        ) as cursor:
            for row in cursor:
                obligation_ids.append(row[0])
    except Exception as e:
        logger.error("Error querying junction for task %s: %s", task_id, e)
        return []

    if not obligation_ids:
        return []

    obligations = []
    id_list = "','".join(obligation_ids)

    try:
        with arcpy.da.SearchCursor(
            obligation_table, OBLIGATION_FIELDS,
            where_clause=f"ObligationID IN ('{id_list}')"
        ) as cursor:
            for row in cursor:
                obligations.append(dict(zip(OBLIGATION_FIELDS, row)))
    except Exception as e:
        logger.error("Error querying obligations for task %s: %s", task_id, e)

    return obligations


# ---------------------------------------------------------------------------
# Obligation Evaluation
# ---------------------------------------------------------------------------

def evaluate_obligation_status(workspace, obligation_id):
    """Evaluate whether an obligation is overdue or complete based on linked tasks.

    An obligation is considered:
    - Completed: all linked tasks are completed.
    - Overdue: the due date has passed and not all tasks are completed.
    - InProgress: at least one task is in progress.
    - Open: no tasks have started.

    Args:
        workspace: Path to geodatabase.
        obligation_id: The ObligationID to evaluate.

    Returns:
        Dictionary with keys: obligation_id, evaluated_status, task_summary.
    """
    table = f"{workspace}/{TABLE_OBLIGATIONS}"
    obligation_attrs = None

    try:
        with arcpy.da.SearchCursor(
            table, OBLIGATION_FIELDS,
            where_clause=f"ObligationID = '{obligation_id}'"
        ) as cursor:
            for row in cursor:
                obligation_attrs = dict(zip(OBLIGATION_FIELDS, row))
    except Exception as e:
        logger.error("Error reading obligation %s: %s", obligation_id, e)
        return None

    if obligation_attrs is None:
        logger.warning("Obligation not found: %s", obligation_id)
        return None

    tasks = get_tasks_for_obligation(workspace, obligation_id)
    now = datetime.utcnow()
    due_date = obligation_attrs.get("DueDate")

    total = len(tasks)
    completed = sum(1 for t in tasks if t.get("Status") == "Completed")
    in_progress = sum(1 for t in tasks if t.get("Status") == "InProgress")

    # Determine evaluated status
    if total > 0 and completed == total:
        evaluated_status = STATUS_COMPLETED
    elif due_date and isinstance(due_date, datetime) and now > due_date and completed < total:
        evaluated_status = STATUS_OVERDUE
    elif in_progress > 0 or completed > 0:
        evaluated_status = STATUS_IN_PROGRESS
    else:
        evaluated_status = STATUS_OPEN

    # Update the obligation status if it differs
    current_status = obligation_attrs.get("Status")
    if current_status != evaluated_status and current_status != STATUS_CANCELLED:
        update_obligation_status(
            workspace, obligation_id, evaluated_status,
            reason=f"Auto-evaluated: {completed}/{total} tasks completed."
        )

    return {
        "obligation_id": obligation_id,
        "evaluated_status": evaluated_status,
        "task_summary": {
            "total": total,
            "completed": completed,
            "in_progress": in_progress,
            "remaining": total - completed,
        },
    }


def evaluate_all_obligations(workspace, project_id=None):
    """Batch-evaluate all obligations, optionally filtered by project.

    Args:
        workspace: Path to geodatabase.
        project_id: Optional ProjectID to filter. Evaluates all if None.

    Returns:
        List of evaluation result dictionaries.
    """
    table = f"{workspace}/{TABLE_OBLIGATIONS}"
    where = "IsActive = 1"
    if project_id:
        where += f" AND ProjectID = '{project_id}'"

    obligation_ids = []
    try:
        with arcpy.da.SearchCursor(
            table, ["ObligationID"],
            where_clause=where
        ) as cursor:
            for row in cursor:
                obligation_ids.append(row[0])
    except Exception as e:
        logger.error("Error reading obligations for batch evaluation: %s", e)
        return []

    logger.info("Evaluating %d obligations...", len(obligation_ids))
    results = []

    for oid in obligation_ids:
        try:
            result = evaluate_obligation_status(workspace, oid)
            if result:
                results.append(result)
        except Exception as e:
            logger.error("Error evaluating obligation %s: %s", oid, e)
            results.append({
                "obligation_id": oid,
                "evaluated_status": "Error",
                "error": str(e),
            })

    logger.info(
        "Batch evaluation complete. %d obligations processed, %d overdue.",
        len(results),
        sum(1 for r in results if r.get("evaluated_status") == STATUS_OVERDUE),
    )
    return results


# ---------------------------------------------------------------------------
# Overdue and Summary Queries
# ---------------------------------------------------------------------------

def get_overdue_obligations(workspace, project_id=None):
    """Return obligations that are past their due date and not completed.

    Args:
        workspace: Path to geodatabase.
        project_id: Optional ProjectID filter.

    Returns:
        List of obligation dictionaries that are overdue.
    """
    table = f"{workspace}/{TABLE_OBLIGATIONS}"
    now = datetime.utcnow()
    now_str = now.strftime("%Y-%m-%d %H:%M:%S")

    where = (
        f"DueDate < timestamp '{now_str}' "
        f"AND Status NOT IN ('Completed', 'Cancelled') "
        f"AND IsActive = 1"
    )
    if project_id:
        where += f" AND ProjectID = '{project_id}'"

    obligations = []
    try:
        with arcpy.da.SearchCursor(
            table, OBLIGATION_FIELDS,
            where_clause=where
        ) as cursor:
            for row in cursor:
                obligations.append(dict(zip(OBLIGATION_FIELDS, row)))
    except Exception as e:
        logger.error("Error querying overdue obligations: %s", e)

    logger.info("Found %d overdue obligations.", len(obligations))
    return obligations


def get_obligation_summary(workspace, project_id=None):
    """Return obligation counts grouped by status.

    Args:
        workspace: Path to geodatabase.
        project_id: Optional ProjectID filter.

    Returns:
        Dictionary with status names as keys and counts as values,
        plus a 'total' key.
    """
    table = f"{workspace}/{TABLE_OBLIGATIONS}"
    where = "IsActive = 1"
    if project_id:
        where += f" AND ProjectID = '{project_id}'"

    summary = {s: 0 for s in VALID_STATUSES}
    summary["total"] = 0

    try:
        with arcpy.da.SearchCursor(
            table, ["Status"],
            where_clause=where
        ) as cursor:
            for row in cursor:
                status = row[0]
                summary["total"] += 1
                if status in summary:
                    summary[status] += 1
    except Exception as e:
        logger.error("Error generating obligation summary: %s", e)

    return summary


# ---------------------------------------------------------------------------
# Checklist Generation
# ---------------------------------------------------------------------------

def generate_obligation_checklist(workspace, obligation_id, output_path):
    """Generate a JSON checklist for field use from an obligation and its tasks.

    Args:
        workspace: Path to geodatabase.
        obligation_id: The ObligationID.
        output_path: File path for the output JSON checklist.

    Returns:
        The output_path on success, None on failure.
    """
    table = f"{workspace}/{TABLE_OBLIGATIONS}"
    obligation_attrs = None

    try:
        with arcpy.da.SearchCursor(
            table, OBLIGATION_FIELDS,
            where_clause=f"ObligationID = '{obligation_id}'"
        ) as cursor:
            for row in cursor:
                obligation_attrs = dict(zip(OBLIGATION_FIELDS, row))
    except Exception as e:
        logger.error("Error reading obligation %s: %s", obligation_id, e)
        return None

    if obligation_attrs is None:
        logger.warning("Obligation not found: %s", obligation_id)
        return None

    tasks = get_tasks_for_obligation(workspace, obligation_id)

    checklist = {
        "obligation_id": obligation_id,
        "obligation_number": obligation_attrs.get("ObligationNumber", ""),
        "title": obligation_attrs.get("ObligationTitle", ""),
        "description": obligation_attrs.get("ObligationDescription", ""),
        "due_date": str(obligation_attrs.get("DueDate", "")),
        "status": obligation_attrs.get("Status", ""),
        "generated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
        "tasks": [],
    }

    for task in tasks:
        checklist["tasks"].append({
            "task_id": task.get("TaskID", ""),
            "title": task.get("TaskTitle", ""),
            "status": task.get("Status", ""),
            "due_date": str(task.get("DueDate", "")),
            "assigned_to": task.get("AssignedTo", ""),
            "completed": task.get("Status") == "Completed",
        })

    try:
        output_dir = os.path.dirname(output_path)
        if output_dir and not os.path.exists(output_dir):
            os.makedirs(output_dir)
        with open(output_path, "w") as f:
            json.dump(checklist, f, indent=2, default=str)
        logger.info("Generated checklist at %s", output_path)
        return output_path
    except Exception as e:
        logger.error("Error writing checklist to %s: %s", output_path, e)
        return None


# ---------------------------------------------------------------------------
# Audit Helper
# ---------------------------------------------------------------------------

def _log_audit(workspace, table_name, record_id, field_name,
               old_value, new_value, user="system"):
    """Insert an audit trail entry for obligation changes.

    Args:
        workspace: Path to geodatabase.
        table_name: Name of the table being modified.
        record_id: ID of the modified record.
        field_name: Name of the modified field.
        old_value: Previous value.
        new_value: New value.
        user: Username performing the action.
    """
    table = f"{workspace}/{TABLE_AUDIT_TRAIL}"
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
