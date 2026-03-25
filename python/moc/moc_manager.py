"""
Management of Change (MOC) Workflow

Manages MOC records, status transitions, and reporting within the ECMS
geodatabase. Enforces a defined workflow: Initiated -> UnderReview ->
Approved -> Implemented -> Closed, or Initiated -> Rejected.

Requirements:
    - ArcGIS Pro 3.x with arcpy
    - Enterprise geodatabase with ECMS schema

Usage:
    from moc.moc_manager import create_moc, update_moc_status
"""

import logging
import sys
import uuid
from datetime import datetime

try:
    import arcpy
except ImportError:
    print("ERROR: arcpy is not available. Run from ArcGIS Pro Python environment.")
    sys.exit(1)

logger = logging.getLogger("ecms_moc")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TABLE_MOC = "ManagementOfChange"

STATUS_INITIATED = "Initiated"
STATUS_UNDER_REVIEW = "UnderReview"
STATUS_APPROVED = "Approved"
STATUS_IMPLEMENTED = "Implemented"
STATUS_CLOSED = "Closed"
STATUS_REJECTED = "Rejected"

# Valid workflow transitions: current_status -> set of allowed next statuses
VALID_TRANSITIONS = {
    STATUS_INITIATED: {STATUS_UNDER_REVIEW, STATUS_REJECTED},
    STATUS_UNDER_REVIEW: {STATUS_APPROVED, STATUS_REJECTED},
    STATUS_APPROVED: {STATUS_IMPLEMENTED},
    STATUS_IMPLEMENTED: {STATUS_CLOSED},
}


# ---------------------------------------------------------------------------
# MOC Number Generation
# ---------------------------------------------------------------------------

def generate_moc_number(project_code, sequence):
    """Generate a Management of Change number.

    Args:
        project_code: Short project code (e.g., 'GTP').
        sequence: Integer sequence number.

    Returns:
        Formatted MOC number string, e.g. 'MOC-GTP-0001'.
    """
    return f"MOC-{project_code}-{sequence:04d}"


# ---------------------------------------------------------------------------
# MOC CRUD
# ---------------------------------------------------------------------------

def create_moc(workspace, moc_data):
    """Create a new MOC record in the geodatabase.

    Args:
        workspace: Path to geodatabase.
        moc_data: Dictionary with keys:
            - MOCNumber (str): Management of Change number.
            - Title (str): Short title for the change.
            - Description (str, optional): Detailed description.
            - ProjectID (str): Related project.
            - Initiator (str): Username of initiator.
            - ChangeType (str, optional): Type of change.
            - RiskLevel (str, optional): Risk assessment level.
            - AffectedAreas (str, optional): Areas impacted.

    Returns:
        The generated MOCID string, or None on failure.
    """
    table = f"{workspace}/{TABLE_MOC}"
    moc_id = f"MOC-{uuid.uuid4().hex[:8].upper()}"

    fields = [
        "MOCID", "MOCNumber", "Title", "Description", "ProjectID",
        "Initiator", "ChangeType", "RiskLevel", "AffectedAreas",
        "Status", "CreatedDate", "ModifiedDate",
    ]

    values = [
        moc_id,
        moc_data.get("MOCNumber", ""),
        moc_data.get("Title", ""),
        moc_data.get("Description", ""),
        moc_data.get("ProjectID", ""),
        moc_data.get("Initiator", "system"),
        moc_data.get("ChangeType", ""),
        moc_data.get("RiskLevel", ""),
        moc_data.get("AffectedAreas", ""),
        STATUS_INITIATED,
        datetime.utcnow(),
        datetime.utcnow(),
    ]

    try:
        with arcpy.da.InsertCursor(table, fields) as cursor:
            cursor.insertRow(values)
        logger.info(
            "Created MOC %s (%s): %s",
            moc_id, moc_data.get("MOCNumber", ""), moc_data.get("Title", ""),
        )
    except Exception as e:
        logger.error("Error creating MOC: %s", e)
        return None

    return moc_id


# ---------------------------------------------------------------------------
# Workflow Transitions
# ---------------------------------------------------------------------------

def update_moc_status(workspace, moc_id, new_status, user, notes=""):
    """Transition an MOC to a new status with workflow validation.

    Validates that the transition is allowed according to the defined workflow
    before applying the update. Records the transition user and optional notes.

    Args:
        workspace: Path to geodatabase.
        moc_id: The MOCID to update.
        new_status: The target status string.
        user: Username performing the transition.
        notes: Optional notes about the transition.

    Returns:
        True if the transition was successful, False otherwise.
    """
    table = f"{workspace}/{TABLE_MOC}"

    # Read current status
    current_status = None
    try:
        with arcpy.da.SearchCursor(
            table, ["MOCID", "Status"],
            where_clause=f"MOCID = '{moc_id}'"
        ) as cursor:
            for row in cursor:
                current_status = row[1]
                break
    except Exception as e:
        logger.error("Error reading MOC %s: %s", moc_id, e)
        return False

    if current_status is None:
        logger.error("MOC %s not found.", moc_id)
        return False

    # Validate transition
    allowed = VALID_TRANSITIONS.get(current_status, set())
    if new_status not in allowed:
        logger.warning(
            "Invalid MOC transition for %s: %s -> %s (allowed: %s)",
            moc_id, current_status, new_status, allowed,
        )
        return False

    # Apply transition
    update_fields = [
        "MOCID", "Status", "ModifiedDate", "LastTransitionUser",
        "LastTransitionDate", "LastTransitionNotes",
    ]

    try:
        with arcpy.da.UpdateCursor(
            table, update_fields,
            where_clause=f"MOCID = '{moc_id}'"
        ) as cursor:
            for row in cursor:
                row[1] = new_status
                row[2] = datetime.utcnow()
                row[3] = user
                row[4] = datetime.utcnow()
                row[5] = notes
                cursor.updateRow(row)
        logger.info(
            "MOC %s transitioned %s -> %s by %s",
            moc_id, current_status, new_status, user,
        )
    except Exception as e:
        logger.error("Error updating MOC %s status: %s", moc_id, e)
        return False

    return True


# ---------------------------------------------------------------------------
# Query Functions
# ---------------------------------------------------------------------------

def get_mocs_for_project(workspace, project_id, status_filter=None):
    """Query MOC records for a project.

    Args:
        workspace: Path to geodatabase.
        project_id: The ProjectID to filter on.
        status_filter: Optional status string to further filter results.

    Returns:
        List of MOC dictionaries.
    """
    where = f"ProjectID = '{project_id}'"
    if status_filter:
        where += f" AND Status = '{status_filter}'"

    return _query_mocs(workspace, where)


def get_active_mocs(workspace):
    """Get all non-closed MOC records.

    Args:
        workspace: Path to geodatabase.

    Returns:
        List of MOC dictionaries with status other than Closed or Rejected.
    """
    where = f"Status NOT IN ('{STATUS_CLOSED}', '{STATUS_REJECTED}')"
    return _query_mocs(workspace, where)


def _query_mocs(workspace, where_clause):
    """Internal helper to query MOC records with a where clause.

    Args:
        workspace: Path to geodatabase.
        where_clause: SQL where clause string.

    Returns:
        List of MOC dictionaries.
    """
    table = f"{workspace}/{TABLE_MOC}"
    fields = [
        "MOCID", "MOCNumber", "Title", "Description", "ProjectID",
        "Initiator", "ChangeType", "RiskLevel", "AffectedAreas",
        "Status", "CreatedDate", "ModifiedDate",
    ]
    records = []

    try:
        with arcpy.da.SearchCursor(table, fields, where_clause=where_clause) as cursor:
            for row in cursor:
                records.append(dict(zip(fields, row)))
    except Exception as e:
        logger.error("Error querying MOCs (%s): %s", where_clause, e)

    return records


# ---------------------------------------------------------------------------
# Summary / Reporting
# ---------------------------------------------------------------------------

def get_moc_summary(workspace, project_id=None):
    """Get a summary of MOC counts grouped by status.

    Args:
        workspace: Path to geodatabase.
        project_id: Optional project filter.

    Returns:
        Dictionary mapping status strings to counts.
    """
    table = f"{workspace}/{TABLE_MOC}"
    where = f"ProjectID = '{project_id}'" if project_id else "1=1"

    summary = {
        STATUS_INITIATED: 0,
        STATUS_UNDER_REVIEW: 0,
        STATUS_APPROVED: 0,
        STATUS_IMPLEMENTED: 0,
        STATUS_CLOSED: 0,
        STATUS_REJECTED: 0,
    }

    try:
        with arcpy.da.SearchCursor(
            table, ["Status"],
            where_clause=where,
        ) as cursor:
            for row in cursor:
                status = row[0]
                if status in summary:
                    summary[status] += 1
    except Exception as e:
        logger.error("Error generating MOC summary: %s", e)

    return summary
