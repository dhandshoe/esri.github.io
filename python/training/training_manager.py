"""
Training Requirements and History Management

Manages training requirements, completion records, renewal tracking, and
compliance reporting for the ECMS. Supports linking training to obligations
and projects, tracking individual user completions, and generating training
matrices.

Requirements:
    - ArcGIS Pro 3.x with arcpy
    - Enterprise geodatabase with ECMS schema

Usage:
    from training.training_manager import create_training_requirement, get_overdue_training
"""

import csv
import logging
import sys
import uuid
from datetime import datetime, timedelta

try:
    import arcpy
except ImportError:
    print("ERROR: arcpy is not available. Run from ArcGIS Pro Python environment.")
    sys.exit(1)

logger = logging.getLogger("ecms_training")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TABLE_TRAINING_REQUIREMENTS = "TrainingRequirements"
TABLE_TRAINING_COMPLETIONS = "TrainingCompletions"

EXPIRING_SOON_DAYS = 30


# ---------------------------------------------------------------------------
# Training Requirements CRUD
# ---------------------------------------------------------------------------

def create_training_requirement(workspace, training_data):
    """Create a new training requirement record.

    Args:
        workspace: Path to geodatabase.
        training_data: Dictionary with keys:
            - RequirementName (str): Name of the training requirement.
            - Description (str, optional): Detailed description.
            - ProjectID (str): Related project.
            - ObligationID (str, optional): Related obligation.
            - Frequency (str): e.g., 'OneTime', 'Annual', 'Biennial'.
            - DueDate (datetime): When training must be completed.
            - AssignedTo (str, optional): Comma-separated user IDs.
            - CreatedBy (str): Username of creator.

    Returns:
        The generated RequirementID string, or None on failure.
    """
    table = f"{workspace}/{TABLE_TRAINING_REQUIREMENTS}"
    req_id = f"TRN-{uuid.uuid4().hex[:8].upper()}"

    fields = [
        "RequirementID", "RequirementName", "Description", "ProjectID",
        "ObligationID", "Frequency", "DueDate", "AssignedTo",
        "Status", "CreatedBy", "CreatedDate", "ModifiedDate",
    ]

    values = [
        req_id,
        training_data.get("RequirementName", ""),
        training_data.get("Description", ""),
        training_data.get("ProjectID", ""),
        training_data.get("ObligationID", ""),
        training_data.get("Frequency", "OneTime"),
        training_data.get("DueDate"),
        training_data.get("AssignedTo", ""),
        "Active",
        training_data.get("CreatedBy", "system"),
        datetime.utcnow(),
        datetime.utcnow(),
    ]

    try:
        with arcpy.da.InsertCursor(table, fields) as cursor:
            cursor.insertRow(values)
        logger.info(
            "Created training requirement %s: %s",
            req_id, training_data.get("RequirementName", ""),
        )
    except Exception as e:
        logger.error("Error creating training requirement: %s", e)
        return None

    return req_id


def update_training_requirement(workspace, req_id, updates):
    """Update fields on an existing training requirement.

    Args:
        workspace: Path to geodatabase.
        req_id: The RequirementID to update.
        updates: Dictionary of field names to new values.
    """
    table = f"{workspace}/{TABLE_TRAINING_REQUIREMENTS}"
    update_fields = list(updates.keys())
    all_fields = ["RequirementID"] + update_fields + ["ModifiedDate"]

    try:
        with arcpy.da.UpdateCursor(
            table, all_fields,
            where_clause=f"RequirementID = '{req_id}'"
        ) as cursor:
            for row in cursor:
                for i, field in enumerate(update_fields):
                    row[i + 1] = updates[field]
                row[-1] = datetime.utcnow()
                cursor.updateRow(row)
        logger.info("Updated training requirement %s: %s", req_id, list(updates.keys()))
    except Exception as e:
        logger.error("Error updating training requirement %s: %s", req_id, e)


# ---------------------------------------------------------------------------
# Training Completion
# ---------------------------------------------------------------------------

def record_training_completion(workspace, req_id, user_id, user_name,
                               completion_date, evidence_path=None, score=None):
    """Record an individual training completion.

    Args:
        workspace: Path to geodatabase.
        req_id: The RequirementID that was completed.
        user_id: ID of the user who completed training.
        user_name: Display name of the user.
        completion_date: Date/time of completion.
        evidence_path: Optional path to certificate or evidence file.
        score: Optional numeric score or percentage.

    Returns:
        The generated CompletionID string, or None on failure.
    """
    table = f"{workspace}/{TABLE_TRAINING_COMPLETIONS}"
    completion_id = f"TCM-{uuid.uuid4().hex[:8].upper()}"

    fields = [
        "CompletionID", "RequirementID", "UserID", "UserName",
        "CompletionDate", "EvidencePath", "Score", "RecordedDate",
    ]

    values = [
        completion_id,
        req_id,
        user_id,
        user_name,
        completion_date,
        evidence_path or "",
        score,
        datetime.utcnow(),
    ]

    try:
        with arcpy.da.InsertCursor(table, fields) as cursor:
            cursor.insertRow(values)
        logger.info(
            "Recorded training completion %s: user=%s, requirement=%s",
            completion_id, user_id, req_id,
        )
    except Exception as e:
        logger.error("Error recording training completion: %s", e)
        return None

    return completion_id


# ---------------------------------------------------------------------------
# Query Functions
# ---------------------------------------------------------------------------

def get_training_for_obligation(workspace, obligation_id):
    """Get training requirements linked to an obligation.

    Args:
        workspace: Path to geodatabase.
        obligation_id: The ObligationID to filter on.

    Returns:
        List of training requirement dictionaries.
    """
    return _query_requirements(workspace, f"ObligationID = '{obligation_id}'")


def get_training_for_project(workspace, project_id):
    """Get training requirements for a project.

    Args:
        workspace: Path to geodatabase.
        project_id: The ProjectID to filter on.

    Returns:
        List of training requirement dictionaries.
    """
    return _query_requirements(workspace, f"ProjectID = '{project_id}'")


def get_training_history_for_user(workspace, user_id):
    """Get all training completion records for a user.

    Args:
        workspace: Path to geodatabase.
        user_id: The UserID to filter on.

    Returns:
        List of completion record dictionaries.
    """
    table = f"{workspace}/{TABLE_TRAINING_COMPLETIONS}"
    fields = [
        "CompletionID", "RequirementID", "UserID", "UserName",
        "CompletionDate", "EvidencePath", "Score", "RecordedDate",
    ]
    records = []

    try:
        with arcpy.da.SearchCursor(
            table, fields,
            where_clause=f"UserID = '{user_id}'",
            sql_clause=(None, "ORDER BY CompletionDate DESC"),
        ) as cursor:
            for row in cursor:
                records.append(dict(zip(fields, row)))
    except Exception as e:
        logger.error("Error querying training history for user %s: %s", user_id, e)

    return records


def _query_requirements(workspace, where_clause):
    """Internal helper to query training requirements.

    Args:
        workspace: Path to geodatabase.
        where_clause: SQL where clause string.

    Returns:
        List of training requirement dictionaries.
    """
    table = f"{workspace}/{TABLE_TRAINING_REQUIREMENTS}"
    fields = [
        "RequirementID", "RequirementName", "Description", "ProjectID",
        "ObligationID", "Frequency", "DueDate", "AssignedTo",
        "Status", "CreatedBy", "CreatedDate", "ModifiedDate",
    ]
    requirements = []

    try:
        with arcpy.da.SearchCursor(table, fields, where_clause=where_clause) as cursor:
            for row in cursor:
                requirements.append(dict(zip(fields, row)))
    except Exception as e:
        logger.error("Error querying training requirements (%s): %s", where_clause, e)

    return requirements


# ---------------------------------------------------------------------------
# Overdue and Renewal Tracking
# ---------------------------------------------------------------------------

def get_overdue_training(workspace, project_id=None):
    """Get training requirements that are past their due date.

    Args:
        workspace: Path to geodatabase.
        project_id: Optional project filter.

    Returns:
        List of overdue training requirement dictionaries.
    """
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    where = f"DueDate < '{now}' AND Status = 'Active'"
    if project_id:
        where += f" AND ProjectID = '{project_id}'"

    return _query_requirements(workspace, where)


def process_training_renewals(workspace):
    """Process auto-renewal training and flag expired certifications.

    For training requirements with a recurring frequency (Annual, Biennial),
    checks the most recent completion date against the frequency interval.
    If the interval has elapsed, marks the requirement status as 'Expired'.

    Args:
        workspace: Path to geodatabase.

    Returns:
        Number of requirements flagged as expired.
    """
    req_table = f"{workspace}/{TABLE_TRAINING_REQUIREMENTS}"
    comp_table = f"{workspace}/{TABLE_TRAINING_COMPLETIONS}"

    frequency_days = {
        "Annual": 365,
        "Biennial": 730,
    }

    # Get all active recurring requirements
    req_fields = ["RequirementID", "Frequency", "Status"]
    requirements = []

    try:
        with arcpy.da.SearchCursor(
            req_table, req_fields,
            where_clause="Status = 'Active' AND (Frequency = 'Annual' OR Frequency = 'Biennial')",
        ) as cursor:
            for row in cursor:
                requirements.append(dict(zip(req_fields, row)))
    except Exception as e:
        logger.error("Error querying recurring requirements: %s", e)
        return 0

    # For each requirement, check the latest completion
    expired_count = 0
    now = datetime.utcnow()

    for req in requirements:
        req_id = req["RequirementID"]
        interval = frequency_days.get(req["Frequency"], 365)

        latest_completion = None
        try:
            with arcpy.da.SearchCursor(
                comp_table, ["CompletionDate"],
                where_clause=f"RequirementID = '{req_id}'",
                sql_clause=(None, "ORDER BY CompletionDate DESC"),
            ) as cursor:
                for row in cursor:
                    latest_completion = row[0]
                    break
        except Exception as e:
            logger.error("Error checking completions for %s: %s", req_id, e)
            continue

        if latest_completion is None:
            # No completions at all; check if due date has passed
            continue

        if isinstance(latest_completion, str):
            latest_completion = datetime.fromisoformat(latest_completion)

        if (now - latest_completion).days > interval:
            # Flag as expired
            try:
                with arcpy.da.UpdateCursor(
                    req_table, ["RequirementID", "Status", "ModifiedDate"],
                    where_clause=f"RequirementID = '{req_id}'",
                ) as cursor:
                    for row in cursor:
                        row[1] = "Expired"
                        row[2] = datetime.utcnow()
                        cursor.updateRow(row)
                expired_count += 1
                logger.info("Training requirement %s flagged as expired.", req_id)
            except Exception as e:
                logger.error("Error expiring requirement %s: %s", req_id, e)

    logger.info("Training renewal processing complete. %d expired.", expired_count)
    return expired_count


# ---------------------------------------------------------------------------
# Compliance Summary
# ---------------------------------------------------------------------------

def get_training_compliance_summary(workspace, project_id=None):
    """Get a summary of training compliance status.

    Args:
        workspace: Path to geodatabase.
        project_id: Optional project filter.

    Returns:
        Dictionary with keys: total, completed, overdue, expiring_soon.
    """
    table = f"{workspace}/{TABLE_TRAINING_REQUIREMENTS}"
    comp_table = f"{workspace}/{TABLE_TRAINING_COMPLETIONS}"
    now = datetime.utcnow()
    soon = now + timedelta(days=EXPIRING_SOON_DAYS)

    where = "Status IN ('Active', 'Expired')"
    if project_id:
        where += f" AND ProjectID = '{project_id}'"

    fields = ["RequirementID", "DueDate", "Status"]
    total = 0
    overdue = 0
    expiring_soon = 0

    try:
        with arcpy.da.SearchCursor(table, fields, where_clause=where) as cursor:
            for row in cursor:
                total += 1
                due_date = row[1]
                status = row[2]
                if due_date:
                    if isinstance(due_date, str):
                        due_date = datetime.fromisoformat(due_date)
                    if due_date < now:
                        overdue += 1
                    elif due_date <= soon:
                        expiring_soon += 1
                if status == "Expired":
                    overdue += 1
    except Exception as e:
        logger.error("Error generating training compliance summary: %s", e)

    # Count completed (distinct requirements with at least one completion)
    completed = 0
    comp_where = "1=1"
    try:
        completed_ids = set()
        with arcpy.da.SearchCursor(
            comp_table, ["RequirementID"],
        ) as cursor:
            for row in cursor:
                completed_ids.add(row[0])
        completed = len(completed_ids)
    except Exception as e:
        logger.error("Error counting completions: %s", e)

    return {
        "total": total,
        "completed": completed,
        "overdue": overdue,
        "expiring_soon": expiring_soon,
    }


# ---------------------------------------------------------------------------
# Training Matrix
# ---------------------------------------------------------------------------

def generate_training_matrix(workspace, project_id, output_path):
    """Generate a CSV training matrix of users vs requirements.

    Rows represent users, columns represent training requirements, and cells
    contain the completion date or 'Incomplete'.

    Args:
        workspace: Path to geodatabase.
        project_id: Project to generate the matrix for.
        output_path: File path for the output CSV.

    Returns:
        The output_path on success, or None on failure.
    """
    req_table = f"{workspace}/{TABLE_TRAINING_REQUIREMENTS}"
    comp_table = f"{workspace}/{TABLE_TRAINING_COMPLETIONS}"

    # Get requirements for the project
    requirements = []
    req_fields = ["RequirementID", "RequirementName"]

    try:
        with arcpy.da.SearchCursor(
            req_table, req_fields,
            where_clause=f"ProjectID = '{project_id}' AND Status IN ('Active', 'Expired')",
        ) as cursor:
            for row in cursor:
                requirements.append(dict(zip(req_fields, row)))
    except Exception as e:
        logger.error("Error reading requirements for matrix: %s", e)
        return None

    if not requirements:
        logger.warning("No training requirements found for project %s", project_id)
        return None

    req_ids = [r["RequirementID"] for r in requirements]
    id_list = ", ".join(f"'{rid}'" for rid in req_ids)

    # Get all completions for these requirements
    comp_fields = ["RequirementID", "UserID", "UserName", "CompletionDate"]
    completions = {}  # (user_id, req_id) -> completion_date
    users = {}  # user_id -> user_name

    try:
        with arcpy.da.SearchCursor(
            comp_table, comp_fields,
            where_clause=f"RequirementID IN ({id_list})",
        ) as cursor:
            for row in cursor:
                req_id = row[0]
                user_id = row[1]
                user_name = row[2]
                comp_date = row[3]
                users[user_id] = user_name
                key = (user_id, req_id)
                # Keep the latest completion
                if key not in completions or (comp_date and comp_date > completions[key]):
                    completions[key] = comp_date
    except Exception as e:
        logger.error("Error reading completions for matrix: %s", e)
        return None

    # Write CSV
    try:
        header = ["UserID", "UserName"] + [r["RequirementName"] for r in requirements]
        with open(output_path, "w", newline="") as csvfile:
            writer = csv.writer(csvfile)
            writer.writerow(header)
            for user_id, user_name in sorted(users.items(), key=lambda x: x[1]):
                row = [user_id, user_name]
                for req in requirements:
                    comp_date = completions.get((user_id, req["RequirementID"]))
                    if comp_date:
                        row.append(str(comp_date)[:10])
                    else:
                        row.append("Incomplete")
                writer.writerow(row)
        logger.info("Training matrix written to %s (%d users, %d requirements)",
                     output_path, len(users), len(requirements))
    except Exception as e:
        logger.error("Error writing training matrix: %s", e)
        return None

    return output_path
