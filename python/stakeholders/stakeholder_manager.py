"""
Stakeholder and Complaint Management

Manages stakeholder records, complaints, and FERC-reportable incident tracking
within the ECMS geodatabase. Supports the full complaint lifecycle from
initial logging through resolution and regulatory reporting.

Requirements:
    - ArcGIS Pro 3.x with arcpy
    - Enterprise geodatabase with ECMS schema

Usage:
    from stakeholders.stakeholder_manager import create_stakeholder, create_complaint
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

logger = logging.getLogger("ecms_stakeholders")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TABLE_STAKEHOLDERS = "Stakeholders"
TABLE_COMPLAINTS = "Complaints"

COMPLAINT_STATUS_OPEN = "Open"
COMPLAINT_STATUS_UNDER_REVIEW = "UnderReview"
COMPLAINT_STATUS_RESOLVED = "Resolved"
COMPLAINT_STATUS_CLOSED = "Closed"


# ---------------------------------------------------------------------------
# Stakeholder CRUD
# ---------------------------------------------------------------------------

def create_stakeholder(workspace, stakeholder_data):
    """Create a new stakeholder record in the geodatabase.

    Args:
        workspace: Path to geodatabase.
        stakeholder_data: Dictionary with keys:
            - StakeholderName (str): Name of individual or organization.
            - StakeholderType (str): e.g., 'Landowner', 'Agency', 'Community'.
            - ProjectID (str): Related project.
            - ContactName (str, optional): Primary contact name.
            - ContactEmail (str, optional): Email address.
            - ContactPhone (str, optional): Phone number.
            - Address (str, optional): Mailing address.
            - Notes (str, optional): Additional notes.
            - CreatedBy (str): Username of creator.

    Returns:
        The generated StakeholderID string, or None on failure.
    """
    table = f"{workspace}/{TABLE_STAKEHOLDERS}"
    stakeholder_id = f"STK-{uuid.uuid4().hex[:8].upper()}"

    fields = [
        "StakeholderID", "StakeholderName", "StakeholderType", "ProjectID",
        "ContactName", "ContactEmail", "ContactPhone", "Address", "Notes",
        "CreatedBy", "CreatedDate", "ModifiedDate",
    ]

    values = [
        stakeholder_id,
        stakeholder_data.get("StakeholderName", ""),
        stakeholder_data.get("StakeholderType", ""),
        stakeholder_data.get("ProjectID", ""),
        stakeholder_data.get("ContactName", ""),
        stakeholder_data.get("ContactEmail", ""),
        stakeholder_data.get("ContactPhone", ""),
        stakeholder_data.get("Address", ""),
        stakeholder_data.get("Notes", ""),
        stakeholder_data.get("CreatedBy", "system"),
        datetime.utcnow(),
        datetime.utcnow(),
    ]

    try:
        with arcpy.da.InsertCursor(table, fields) as cursor:
            cursor.insertRow(values)
        logger.info(
            "Created stakeholder %s: %s (%s)",
            stakeholder_id,
            stakeholder_data.get("StakeholderName", ""),
            stakeholder_data.get("StakeholderType", ""),
        )
    except Exception as e:
        logger.error("Error creating stakeholder: %s", e)
        return None

    return stakeholder_id


def update_stakeholder(workspace, stakeholder_id, updates):
    """Update fields on an existing stakeholder record.

    Args:
        workspace: Path to geodatabase.
        stakeholder_id: The StakeholderID to update.
        updates: Dictionary of field names to new values.
    """
    table = f"{workspace}/{TABLE_STAKEHOLDERS}"
    update_fields = list(updates.keys())
    all_fields = ["StakeholderID"] + update_fields + ["ModifiedDate"]

    try:
        with arcpy.da.UpdateCursor(
            table, all_fields,
            where_clause=f"StakeholderID = '{stakeholder_id}'"
        ) as cursor:
            for row in cursor:
                for i, field in enumerate(update_fields):
                    row[i + 1] = updates[field]
                row[-1] = datetime.utcnow()
                cursor.updateRow(row)
        logger.info("Updated stakeholder %s: %s", stakeholder_id, list(updates.keys()))
    except Exception as e:
        logger.error("Error updating stakeholder %s: %s", stakeholder_id, e)


# ---------------------------------------------------------------------------
# Complaint Management
# ---------------------------------------------------------------------------

def create_complaint(workspace, complaint_data):
    """Log a new complaint record per FERC procedure.

    Args:
        workspace: Path to geodatabase.
        complaint_data: Dictionary with keys:
            - StakeholderID (str): Related stakeholder.
            - ProjectID (str): Related project.
            - ComplaintType (str): e.g., 'Noise', 'Access', 'Environmental'.
            - Description (str): Detailed description of the complaint.
            - ReceivedDate (datetime): When the complaint was received.
            - ReceivedBy (str): Username who received it.
            - FERCReportable (bool, optional): Whether FERC reporting required.
            - Location (str, optional): Location description.
            - Priority (str, optional): 'Low', 'Medium', 'High', 'Critical'.

    Returns:
        The generated ComplaintID string, or None on failure.
    """
    table = f"{workspace}/{TABLE_COMPLAINTS}"
    complaint_id = f"CMP-{uuid.uuid4().hex[:8].upper()}"

    fields = [
        "ComplaintID", "StakeholderID", "ProjectID", "ComplaintType",
        "Description", "ReceivedDate", "ReceivedBy", "FERCReportable",
        "Location", "Priority", "Status", "Resolution",
        "CreatedDate", "ModifiedDate",
    ]

    values = [
        complaint_id,
        complaint_data.get("StakeholderID", ""),
        complaint_data.get("ProjectID", ""),
        complaint_data.get("ComplaintType", ""),
        complaint_data.get("Description", ""),
        complaint_data.get("ReceivedDate", datetime.utcnow()),
        complaint_data.get("ReceivedBy", "system"),
        1 if complaint_data.get("FERCReportable") else 0,
        complaint_data.get("Location", ""),
        complaint_data.get("Priority", "Medium"),
        COMPLAINT_STATUS_OPEN,
        "",
        datetime.utcnow(),
        datetime.utcnow(),
    ]

    try:
        with arcpy.da.InsertCursor(table, fields) as cursor:
            cursor.insertRow(values)
        logger.info(
            "Created complaint %s for stakeholder %s (FERC reportable: %s)",
            complaint_id,
            complaint_data.get("StakeholderID", ""),
            complaint_data.get("FERCReportable", False),
        )
    except Exception as e:
        logger.error("Error creating complaint: %s", e)
        return None

    return complaint_id


def update_complaint_status(workspace, complaint_id, new_status, resolution=""):
    """Update the status and resolution of a complaint.

    Args:
        workspace: Path to geodatabase.
        complaint_id: The ComplaintID to update.
        new_status: The new status string.
        resolution: Optional resolution description.
    """
    table = f"{workspace}/{TABLE_COMPLAINTS}"
    fields = ["ComplaintID", "Status", "Resolution", "ModifiedDate"]

    try:
        with arcpy.da.UpdateCursor(
            table, fields,
            where_clause=f"ComplaintID = '{complaint_id}'"
        ) as cursor:
            for row in cursor:
                row[1] = new_status
                if resolution:
                    row[2] = resolution
                row[3] = datetime.utcnow()
                cursor.updateRow(row)
        logger.info(
            "Complaint %s status updated to %s", complaint_id, new_status,
        )
    except Exception as e:
        logger.error("Error updating complaint %s: %s", complaint_id, e)


# ---------------------------------------------------------------------------
# Query Functions
# ---------------------------------------------------------------------------

def get_stakeholders_for_project(workspace, project_id, type_filter=None):
    """Query stakeholders for a project.

    Args:
        workspace: Path to geodatabase.
        project_id: The ProjectID to filter on.
        type_filter: Optional StakeholderType to further filter results.

    Returns:
        List of stakeholder dictionaries.
    """
    where = f"ProjectID = '{project_id}'"
    if type_filter:
        where += f" AND StakeholderType = '{type_filter}'"

    return _query_stakeholders(workspace, where)


def get_complaints_for_stakeholder(workspace, stakeholder_id):
    """Get all complaints filed by or about a stakeholder.

    Args:
        workspace: Path to geodatabase.
        stakeholder_id: The StakeholderID to filter on.

    Returns:
        List of complaint dictionaries.
    """
    return _query_complaints(workspace, f"StakeholderID = '{stakeholder_id}'")


def get_open_complaints(workspace, project_id=None):
    """Get all open (unresolved) complaints.

    Args:
        workspace: Path to geodatabase.
        project_id: Optional project filter.

    Returns:
        List of open complaint dictionaries.
    """
    where = f"Status IN ('{COMPLAINT_STATUS_OPEN}', '{COMPLAINT_STATUS_UNDER_REVIEW}')"
    if project_id:
        where += f" AND ProjectID = '{project_id}'"

    return _query_complaints(workspace, where)


def get_ferc_reportable_complaints(workspace, project_id=None):
    """Get complaints that require FERC reporting.

    Args:
        workspace: Path to geodatabase.
        project_id: Optional project filter.

    Returns:
        List of FERC-reportable complaint dictionaries.
    """
    where = "FERCReportable = 1"
    if project_id:
        where += f" AND ProjectID = '{project_id}'"

    return _query_complaints(workspace, where)


def _query_stakeholders(workspace, where_clause):
    """Internal helper to query stakeholders with a where clause.

    Args:
        workspace: Path to geodatabase.
        where_clause: SQL where clause string.

    Returns:
        List of stakeholder dictionaries.
    """
    table = f"{workspace}/{TABLE_STAKEHOLDERS}"
    fields = [
        "StakeholderID", "StakeholderName", "StakeholderType", "ProjectID",
        "ContactName", "ContactEmail", "ContactPhone", "Address", "Notes",
        "CreatedBy", "CreatedDate", "ModifiedDate",
    ]
    records = []

    try:
        with arcpy.da.SearchCursor(table, fields, where_clause=where_clause) as cursor:
            for row in cursor:
                records.append(dict(zip(fields, row)))
    except Exception as e:
        logger.error("Error querying stakeholders (%s): %s", where_clause, e)

    return records


def _query_complaints(workspace, where_clause):
    """Internal helper to query complaints with a where clause.

    Args:
        workspace: Path to geodatabase.
        where_clause: SQL where clause string.

    Returns:
        List of complaint dictionaries.
    """
    table = f"{workspace}/{TABLE_COMPLAINTS}"
    fields = [
        "ComplaintID", "StakeholderID", "ProjectID", "ComplaintType",
        "Description", "ReceivedDate", "ReceivedBy", "FERCReportable",
        "Location", "Priority", "Status", "Resolution",
        "CreatedDate", "ModifiedDate",
    ]
    records = []

    try:
        with arcpy.da.SearchCursor(table, fields, where_clause=where_clause) as cursor:
            for row in cursor:
                records.append(dict(zip(fields, row)))
    except Exception as e:
        logger.error("Error querying complaints (%s): %s", where_clause, e)

    return records


# ---------------------------------------------------------------------------
# Summary / Reporting
# ---------------------------------------------------------------------------

def get_stakeholder_summary(workspace, project_id=None):
    """Get a summary of stakeholders grouped by type.

    Args:
        workspace: Path to geodatabase.
        project_id: Optional project filter.

    Returns:
        Dictionary mapping StakeholderType strings to counts.
    """
    table = f"{workspace}/{TABLE_STAKEHOLDERS}"
    where = f"ProjectID = '{project_id}'" if project_id else "1=1"

    summary = {}

    try:
        with arcpy.da.SearchCursor(
            table, ["StakeholderType"],
            where_clause=where,
        ) as cursor:
            for row in cursor:
                stype = row[0] or "Unknown"
                summary[stype] = summary.get(stype, 0) + 1
    except Exception as e:
        logger.error("Error generating stakeholder summary: %s", e)

    return summary
