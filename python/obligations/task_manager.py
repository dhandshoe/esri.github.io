"""
Task Manager

Manages the lifecycle of tasks within the ECMS geodatabase. Tasks represent
actionable items linked to obligations that must be completed, tracked, and
verified with evidence records.

Requirements:
    - ArcGIS Pro 3.x with arcpy
    - Enterprise geodatabase with ECMS schema

Usage:
    from obligations.task_manager import create_task, complete_task
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

logger = logging.getLogger("ecms.tasks")

# ---------------------------------------------------------------------------
# Constants - Table Names
# ---------------------------------------------------------------------------

TABLE_TASKS = "Tasks"
TABLE_TASK_EVIDENCE = "TaskEvidence"
TABLE_OBLIGATION_TASKS = "ObligationTasks"
TABLE_AUDIT_TRAIL = "AuditTrail"

# ---------------------------------------------------------------------------
# Constants - Field Names
# ---------------------------------------------------------------------------

TASK_FIELDS = [
    "TaskID", "TaskTitle", "TaskDescription", "ProjectID",
    "Status", "Priority", "DueDate", "CompletionDate",
    "AssignedTo", "CompletedBy", "CreatedBy", "CreatedDate",
    "ModifiedDate", "AutoRenewal", "RenewalFrequencyDays",
    "Notes", "IsActive",
]

EVIDENCE_FIELDS = [
    "EvidenceID", "TaskID", "EvidenceType", "EvidenceDescription",
    "FilePath", "CapturedBy", "CapturedDate", "Notes",
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

def generate_task_id(prefix="TSK"):
    """Generate a UUID-based task ID with a readable prefix.

    Args:
        prefix: Short prefix string (default 'TSK').

    Returns:
        Formatted task ID like 'TSK-a1b2c3d4'.
    """
    short_uuid = uuid.uuid4().hex[:8]
    return f"{prefix}-{short_uuid}"


# ---------------------------------------------------------------------------
# Task CRUD
# ---------------------------------------------------------------------------

def create_task(workspace, task_data):
    """Create a new task record in the geodatabase.

    Args:
        workspace: Path to geodatabase.
        task_data: Dictionary containing task field values.
            Required keys: TaskTitle, ProjectID.

    Returns:
        The generated TaskID string, or None on failure.
    """
    table = f"{workspace}/{TABLE_TASKS}"
    task_id = generate_task_id()
    now = datetime.utcnow()

    row_values = [
        task_id,
        task_data.get("TaskTitle"),
        task_data.get("TaskDescription", ""),
        task_data.get("ProjectID"),
        task_data.get("Status", STATUS_OPEN),
        task_data.get("Priority", "Medium"),
        task_data.get("DueDate"),
        task_data.get("CompletionDate"),
        task_data.get("AssignedTo", ""),
        task_data.get("CompletedBy", ""),
        task_data.get("CreatedBy", "system"),
        now,
        now,
        task_data.get("AutoRenewal", 0),
        task_data.get("RenewalFrequencyDays", 0),
        task_data.get("Notes", ""),
        task_data.get("IsActive", 1),
    ]

    try:
        with arcpy.da.InsertCursor(table, TASK_FIELDS) as cursor:
            cursor.insertRow(row_values)
        logger.info("Created task %s: %s", task_id, task_data.get("TaskTitle"))
        return task_id
    except Exception as e:
        logger.error("Error creating task: %s", e)
        return None


def update_task_status(workspace, task_id, new_status, completion_date=None):
    """Update the status of a task with audit trail.

    Args:
        workspace: Path to geodatabase.
        task_id: The TaskID to update.
        new_status: New status value (must be in VALID_STATUSES).
        completion_date: Optional completion date. Auto-set if status is
            Completed and not provided.

    Returns:
        True if updated successfully, False otherwise.
    """
    if new_status not in VALID_STATUSES:
        logger.error("Invalid status '%s'. Must be one of: %s",
                      new_status, VALID_STATUSES)
        return False

    table = f"{workspace}/{TABLE_TASKS}"
    fields = ["TaskID", "Status", "ModifiedDate", "CompletionDate"]
    old_status = None

    try:
        with arcpy.da.UpdateCursor(
            table, fields,
            where_clause=f"TaskID = '{task_id}'"
        ) as cursor:
            for row in cursor:
                old_status = row[1]
                row[1] = new_status
                row[2] = datetime.utcnow()
                if new_status == STATUS_COMPLETED:
                    row[3] = completion_date or datetime.utcnow()
                elif completion_date:
                    row[3] = completion_date
                cursor.updateRow(row)
                logger.info("Updated task %s status: %s -> %s",
                            task_id, old_status, new_status)

        if old_status is not None:
            _log_audit(workspace, TABLE_TASKS, task_id,
                       "Status", old_status, new_status)
            return True

        logger.warning("Task not found: %s", task_id)
        return False
    except Exception as e:
        logger.error("Error updating task %s: %s", task_id, e)
        return False


def complete_task(workspace, task_id, completed_by):
    """Mark a task as complete and set completion metadata.

    Args:
        workspace: Path to geodatabase.
        task_id: The TaskID to complete.
        completed_by: Username of the person completing the task.

    Returns:
        True if completed successfully, False otherwise.
    """
    table = f"{workspace}/{TABLE_TASKS}"
    fields = ["TaskID", "Status", "CompletionDate", "CompletedBy",
              "ModifiedDate", "AutoRenewal", "RenewalFrequencyDays",
              "Notes"]
    now = datetime.utcnow()
    old_status = None
    auto_renewal = 0
    renewal_days = 0

    try:
        with arcpy.da.UpdateCursor(
            table, fields,
            where_clause=f"TaskID = '{task_id}'"
        ) as cursor:
            for row in cursor:
                old_status = row[1]
                auto_renewal = row[5] or 0
                renewal_days = row[6] or 0
                row[1] = STATUS_COMPLETED
                row[2] = now
                row[3] = completed_by
                row[4] = now
                timestamp = now.strftime("%Y-%m-%d %H:%M")
                existing_notes = row[7] or ""
                row[7] = f"{existing_notes}\n[{timestamp}] Completed by {completed_by}.".strip()
                cursor.updateRow(row)
                logger.info("Task %s completed by %s", task_id, completed_by)

        if old_status is None:
            logger.warning("Task not found: %s", task_id)
            return False

        _log_audit(workspace, TABLE_TASKS, task_id,
                   "Status", old_status, STATUS_COMPLETED)

        # Handle auto-renewal if enabled
        if auto_renewal == 1 and renewal_days > 0:
            _create_renewal_task(workspace, task_id, renewal_days)

        return True
    except Exception as e:
        logger.error("Error completing task %s: %s", task_id, e)
        return False


# ---------------------------------------------------------------------------
# Task Queries
# ---------------------------------------------------------------------------

def get_tasks_for_project(workspace, project_id, status_filter=None):
    """Query all tasks for a specific project, optionally filtered by status.

    Args:
        workspace: Path to geodatabase.
        project_id: The ProjectID to filter on.
        status_filter: Optional status string or list of status strings.

    Returns:
        List of task dictionaries.
    """
    table = f"{workspace}/{TABLE_TASKS}"
    where = f"ProjectID = '{project_id}' AND IsActive = 1"

    if status_filter:
        if isinstance(status_filter, str):
            where += f" AND Status = '{status_filter}'"
        elif isinstance(status_filter, (list, tuple)):
            status_list = "','".join(status_filter)
            where += f" AND Status IN ('{status_list}')"

    tasks = []
    try:
        with arcpy.da.SearchCursor(
            table, TASK_FIELDS,
            where_clause=where
        ) as cursor:
            for row in cursor:
                tasks.append(dict(zip(TASK_FIELDS, row)))
    except Exception as e:
        logger.error("Error querying tasks for project %s: %s",
                      project_id, e)

    return tasks


def get_overdue_tasks(workspace, project_id=None):
    """Return tasks that are past their due date and not completed.

    Args:
        workspace: Path to geodatabase.
        project_id: Optional ProjectID filter.

    Returns:
        List of task dictionaries that are overdue.
    """
    table = f"{workspace}/{TABLE_TASKS}"
    now = datetime.utcnow()
    now_str = now.strftime("%Y-%m-%d %H:%M:%S")

    where = (
        f"DueDate < timestamp '{now_str}' "
        f"AND Status NOT IN ('Completed', 'Cancelled') "
        f"AND IsActive = 1"
    )
    if project_id:
        where += f" AND ProjectID = '{project_id}'"

    tasks = []
    try:
        with arcpy.da.SearchCursor(
            table, TASK_FIELDS,
            where_clause=where
        ) as cursor:
            for row in cursor:
                tasks.append(dict(zip(TASK_FIELDS, row)))
    except Exception as e:
        logger.error("Error querying overdue tasks: %s", e)

    logger.info("Found %d overdue tasks.", len(tasks))
    return tasks


# ---------------------------------------------------------------------------
# Auto-Renewal Processing
# ---------------------------------------------------------------------------

def process_auto_renewals(workspace):
    """Process all tasks with AutoRenewal enabled that have been completed.

    For each completed task with AutoRenewal=1, creates a new task with an
    updated due date based on the RenewalFrequencyDays field.

    Args:
        workspace: Path to geodatabase.

    Returns:
        List of newly created TaskID strings.
    """
    table = f"{workspace}/{TABLE_TASKS}"
    where = "AutoRenewal = 1 AND Status = 'Completed' AND IsActive = 1"
    new_task_ids = []

    completed_tasks = []
    try:
        with arcpy.da.SearchCursor(
            table, TASK_FIELDS,
            where_clause=where
        ) as cursor:
            for row in cursor:
                completed_tasks.append(dict(zip(TASK_FIELDS, row)))
    except Exception as e:
        logger.error("Error querying auto-renewal tasks: %s", e)
        return new_task_ids

    logger.info("Processing %d auto-renewal tasks...", len(completed_tasks))

    for task in completed_tasks:
        task_id = task.get("TaskID")
        renewal_days = task.get("RenewalFrequencyDays", 0)

        if not renewal_days or renewal_days <= 0:
            logger.warning("Task %s has AutoRenewal but no RenewalFrequencyDays.",
                           task_id)
            continue

        new_id = _create_renewal_task(workspace, task_id, renewal_days)
        if new_id:
            new_task_ids.append(new_id)
            # Deactivate the original task to prevent re-processing
            _deactivate_task(workspace, task_id)

    logger.info("Auto-renewal complete. %d new tasks created.", len(new_task_ids))
    return new_task_ids


def _create_renewal_task(workspace, source_task_id, renewal_days):
    """Create a renewal task based on a completed source task.

    Args:
        workspace: Path to geodatabase.
        source_task_id: The TaskID of the completed task to renew.
        renewal_days: Number of days for the new due date from today.

    Returns:
        The new TaskID, or None on failure.
    """
    table = f"{workspace}/{TABLE_TASKS}"
    source_attrs = None

    try:
        with arcpy.da.SearchCursor(
            table, TASK_FIELDS,
            where_clause=f"TaskID = '{source_task_id}'"
        ) as cursor:
            for row in cursor:
                source_attrs = dict(zip(TASK_FIELDS, row))
    except Exception as e:
        logger.error("Error reading source task %s for renewal: %s",
                      source_task_id, e)
        return None

    if source_attrs is None:
        logger.warning("Source task not found for renewal: %s", source_task_id)
        return None

    now = datetime.utcnow()
    from datetime import timedelta
    new_due_date = now + timedelta(days=renewal_days)

    new_task_data = {
        "TaskTitle": source_attrs.get("TaskTitle", ""),
        "TaskDescription": source_attrs.get("TaskDescription", ""),
        "ProjectID": source_attrs.get("ProjectID"),
        "Priority": source_attrs.get("Priority", "Medium"),
        "DueDate": new_due_date,
        "AssignedTo": source_attrs.get("AssignedTo", ""),
        "CreatedBy": "system",
        "AutoRenewal": source_attrs.get("AutoRenewal", 0),
        "RenewalFrequencyDays": renewal_days,
        "Notes": f"Auto-renewed from task {source_task_id}.",
    }

    new_id = create_task(workspace, new_task_data)
    if new_id:
        # Preserve obligation links from the source task
        _copy_obligation_links(workspace, source_task_id, new_id)
        logger.info("Created renewal task %s from %s (due %s)",
                     new_id, source_task_id, new_due_date.strftime("%Y-%m-%d"))

    return new_id


def _copy_obligation_links(workspace, source_task_id, new_task_id):
    """Copy obligation-task links from a source task to a new task.

    Args:
        workspace: Path to geodatabase.
        source_task_id: The original TaskID.
        new_task_id: The new TaskID to link.
    """
    junction_table = f"{workspace}/{TABLE_OBLIGATION_TASKS}"
    obligation_ids = []

    try:
        with arcpy.da.SearchCursor(
            junction_table, ["ObligationID"],
            where_clause=f"TaskID = '{source_task_id}'"
        ) as cursor:
            for row in cursor:
                obligation_ids.append(row[0])
    except Exception as e:
        logger.error("Error reading obligation links for task %s: %s",
                      source_task_id, e)
        return

    link_fields = [
        "ObligationTaskID", "ObligationID", "TaskID",
        "LinkNotes", "LinkedDate", "LinkedBy",
    ]
    now = datetime.utcnow()

    for oid in obligation_ids:
        try:
            with arcpy.da.InsertCursor(junction_table, link_fields) as cursor:
                cursor.insertRow([
                    str(uuid.uuid4()), oid, new_task_id,
                    f"Auto-linked from renewal of {source_task_id}.",
                    now, "system",
                ])
        except Exception as e:
            logger.error("Error linking renewed task %s to obligation %s: %s",
                          new_task_id, oid, e)


def _deactivate_task(workspace, task_id):
    """Set IsActive=0 on a task to prevent re-processing.

    Args:
        workspace: Path to geodatabase.
        task_id: The TaskID to deactivate.
    """
    table = f"{workspace}/{TABLE_TASKS}"
    fields = ["TaskID", "IsActive", "ModifiedDate"]

    try:
        with arcpy.da.UpdateCursor(
            table, fields,
            where_clause=f"TaskID = '{task_id}'"
        ) as cursor:
            for row in cursor:
                row[1] = 0
                row[2] = datetime.utcnow()
                cursor.updateRow(row)
                logger.info("Deactivated task %s after renewal.", task_id)
    except Exception as e:
        logger.error("Error deactivating task %s: %s", task_id, e)


# ---------------------------------------------------------------------------
# Evidence Management
# ---------------------------------------------------------------------------

def add_completion_evidence(workspace, task_id, evidence_data):
    """Add an evidence record for a task.

    Args:
        workspace: Path to geodatabase.
        task_id: The TaskID to attach evidence to.
        evidence_data: Dictionary containing evidence field values.
            Required keys: EvidenceType.

    Returns:
        The generated EvidenceID string, or None on failure.
    """
    table = f"{workspace}/{TABLE_TASK_EVIDENCE}"
    evidence_id = str(uuid.uuid4())
    now = datetime.utcnow()

    row_values = [
        evidence_id,
        task_id,
        evidence_data.get("EvidenceType", "Document"),
        evidence_data.get("EvidenceDescription", ""),
        evidence_data.get("FilePath", ""),
        evidence_data.get("CapturedBy", "system"),
        evidence_data.get("CapturedDate", now),
        evidence_data.get("Notes", ""),
    ]

    try:
        with arcpy.da.InsertCursor(table, EVIDENCE_FIELDS) as cursor:
            cursor.insertRow(row_values)
        logger.info("Added evidence %s to task %s", evidence_id, task_id)
        return evidence_id
    except Exception as e:
        logger.error("Error adding evidence to task %s: %s", task_id, e)
        return None


def get_evidence_for_task(workspace, task_id):
    """Query all evidence records for a specific task.

    Args:
        workspace: Path to geodatabase.
        task_id: The TaskID to query.

    Returns:
        List of evidence dictionaries.
    """
    table = f"{workspace}/{TABLE_TASK_EVIDENCE}"
    evidence = []

    try:
        with arcpy.da.SearchCursor(
            table, EVIDENCE_FIELDS,
            where_clause=f"TaskID = '{task_id}'"
        ) as cursor:
            for row in cursor:
                evidence.append(dict(zip(EVIDENCE_FIELDS, row)))
    except Exception as e:
        logger.error("Error querying evidence for task %s: %s", task_id, e)

    return evidence


# ---------------------------------------------------------------------------
# Task Metrics
# ---------------------------------------------------------------------------

def calculate_task_metrics(workspace, project_id=None):
    """Calculate task metrics including counts by status, overdue count,
    and completion rate.

    Args:
        workspace: Path to geodatabase.
        project_id: Optional ProjectID filter. Calculates for all if None.

    Returns:
        Dictionary with keys: by_status, total, overdue, completion_rate.
    """
    table = f"{workspace}/{TABLE_TASKS}"
    where = "IsActive = 1"
    if project_id:
        where += f" AND ProjectID = '{project_id}'"

    now = datetime.utcnow()
    by_status = {s: 0 for s in VALID_STATUSES}
    total = 0
    overdue = 0

    try:
        with arcpy.da.SearchCursor(
            table, ["Status", "DueDate"],
            where_clause=where
        ) as cursor:
            for row in cursor:
                status = row[0]
                due_date = row[1]
                total += 1
                if status in by_status:
                    by_status[status] += 1
                # Count overdue: past due and not completed/cancelled
                if (due_date and isinstance(due_date, datetime)
                        and now > due_date
                        and status not in (STATUS_COMPLETED, STATUS_CANCELLED)):
                    overdue += 1
    except Exception as e:
        logger.error("Error calculating task metrics: %s", e)

    completed = by_status.get(STATUS_COMPLETED, 0)
    completion_rate = (completed / total * 100.0) if total > 0 else 0.0

    metrics = {
        "by_status": by_status,
        "total": total,
        "overdue": overdue,
        "completion_rate": round(completion_rate, 1),
    }

    logger.info("Task metrics: %d total, %d overdue, %.1f%% complete.",
                 total, overdue, completion_rate)
    return metrics


# ---------------------------------------------------------------------------
# Audit Helper
# ---------------------------------------------------------------------------

def _log_audit(workspace, table_name, record_id, field_name,
               old_value, new_value, user="system"):
    """Insert an audit trail entry for task changes.

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
