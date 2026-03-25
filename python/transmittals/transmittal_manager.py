"""
Transmittal Management

Manages transmittal records, document linking, and status tracking within the
ECMS geodatabase. Supports inbound and outbound transmittals with full
document attachment tracking.

Requirements:
    - ArcGIS Pro 3.x with arcpy
    - Enterprise geodatabase with ECMS schema

Usage:
    from transmittals.transmittal_manager import create_transmittal, add_document_to_transmittal
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

logger = logging.getLogger("ecms_transmittals")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TABLE_TRANSMITTALS = "Transmittals"
TABLE_TRANSMITTAL_DOCS = "TransmittalDocuments"

STATUS_DRAFT = "Draft"
STATUS_SENT = "Sent"
STATUS_RECEIVED = "Received"
STATUS_ACKNOWLEDGED = "Acknowledged"
STATUS_CLOSED = "Closed"

DIRECTION_INBOUND = "Inbound"
DIRECTION_OUTBOUND = "Outbound"


# ---------------------------------------------------------------------------
# Transmittal Number Generation
# ---------------------------------------------------------------------------

def generate_transmittal_number(project_code, direction, sequence):
    """Generate a transmittal tracking number.

    Args:
        project_code: Short project code (e.g., 'GTP').
        direction: 'IN' or 'OUT'.
        sequence: Integer sequence number.

    Returns:
        Formatted transmittal number, e.g. 'TRN-GTP-OUT-0001'.
    """
    return f"TRN-{project_code}-{direction}-{sequence:04d}"


# ---------------------------------------------------------------------------
# Transmittal CRUD
# ---------------------------------------------------------------------------

def create_transmittal(workspace, transmittal_data):
    """Create a new transmittal record in the geodatabase.

    Args:
        workspace: Path to geodatabase.
        transmittal_data: Dictionary with keys:
            - TransmittalNumber (str): Transmittal tracking number.
            - ProjectID (str): Related project.
            - Direction (str): 'Inbound' or 'Outbound'.
            - Subject (str): Subject line.
            - Sender (str): Name or organization of sender.
            - Recipient (str): Name or organization of recipient.
            - DueDate (datetime, optional): Expected response date.
            - Notes (str, optional): Additional notes.
            - CreatedBy (str): Username of creator.

    Returns:
        The generated TransmittalID string, or None on failure.
    """
    table = f"{workspace}/{TABLE_TRANSMITTALS}"
    transmittal_id = f"TRN-{uuid.uuid4().hex[:8].upper()}"

    fields = [
        "TransmittalID", "TransmittalNumber", "ProjectID", "Direction",
        "Subject", "Sender", "Recipient", "DueDate", "Notes",
        "Status", "CreatedBy", "CreatedDate", "ModifiedDate",
    ]

    values = [
        transmittal_id,
        transmittal_data.get("TransmittalNumber", ""),
        transmittal_data.get("ProjectID", ""),
        transmittal_data.get("Direction", DIRECTION_OUTBOUND),
        transmittal_data.get("Subject", ""),
        transmittal_data.get("Sender", ""),
        transmittal_data.get("Recipient", ""),
        transmittal_data.get("DueDate"),
        transmittal_data.get("Notes", ""),
        STATUS_DRAFT,
        transmittal_data.get("CreatedBy", "system"),
        datetime.utcnow(),
        datetime.utcnow(),
    ]

    try:
        with arcpy.da.InsertCursor(table, fields) as cursor:
            cursor.insertRow(values)
        logger.info(
            "Created transmittal %s (%s): %s",
            transmittal_id,
            transmittal_data.get("TransmittalNumber", ""),
            transmittal_data.get("Subject", ""),
        )
    except Exception as e:
        logger.error("Error creating transmittal: %s", e)
        return None

    return transmittal_id


def update_transmittal_status(workspace, transmittal_id, new_status):
    """Update the status of a transmittal.

    Args:
        workspace: Path to geodatabase.
        transmittal_id: The TransmittalID to update.
        new_status: The new status string.
    """
    table = f"{workspace}/{TABLE_TRANSMITTALS}"
    fields = ["TransmittalID", "Status", "ModifiedDate"]

    try:
        with arcpy.da.UpdateCursor(
            table, fields,
            where_clause=f"TransmittalID = '{transmittal_id}'"
        ) as cursor:
            for row in cursor:
                row[1] = new_status
                row[2] = datetime.utcnow()
                cursor.updateRow(row)
        logger.info("Transmittal %s status updated to %s", transmittal_id, new_status)
    except Exception as e:
        logger.error("Error updating transmittal %s status: %s", transmittal_id, e)


# ---------------------------------------------------------------------------
# Document Linking
# ---------------------------------------------------------------------------

def add_document_to_transmittal(workspace, transmittal_id, document_id,
                                 doc_name, file_path):
    """Link a document to a transmittal.

    Args:
        workspace: Path to geodatabase.
        transmittal_id: The TransmittalID to link to.
        document_id: The DocumentID being transmitted.
        doc_name: Display name of the document.
        file_path: Path to the transmitted file.

    Returns:
        The generated link record ID, or None on failure.
    """
    table = f"{workspace}/{TABLE_TRANSMITTAL_DOCS}"
    link_id = f"TRD-{uuid.uuid4().hex[:8].upper()}"

    fields = [
        "LinkID", "TransmittalID", "DocumentID", "DocumentName",
        "FilePath", "AddedDate",
    ]

    values = [
        link_id,
        transmittal_id,
        document_id,
        doc_name,
        file_path,
        datetime.utcnow(),
    ]

    try:
        with arcpy.da.InsertCursor(table, fields) as cursor:
            cursor.insertRow(values)
        logger.info(
            "Linked document %s to transmittal %s",
            document_id, transmittal_id,
        )
    except Exception as e:
        logger.error(
            "Error linking document %s to transmittal %s: %s",
            document_id, transmittal_id, e,
        )
        return None

    return link_id


# ---------------------------------------------------------------------------
# Query Functions
# ---------------------------------------------------------------------------

def get_transmittals_for_project(workspace, project_id, direction=None):
    """Query transmittals for a project.

    Args:
        workspace: Path to geodatabase.
        project_id: The ProjectID to filter on.
        direction: Optional direction filter ('Inbound' or 'Outbound').

    Returns:
        List of transmittal dictionaries.
    """
    where = f"ProjectID = '{project_id}'"
    if direction:
        where += f" AND Direction = '{direction}'"

    return _query_transmittals(workspace, where)


def get_documents_for_transmittal(workspace, transmittal_id):
    """Get all documents linked to a transmittal.

    Args:
        workspace: Path to geodatabase.
        transmittal_id: The TransmittalID to query.

    Returns:
        List of document link dictionaries.
    """
    table = f"{workspace}/{TABLE_TRANSMITTAL_DOCS}"
    fields = [
        "LinkID", "TransmittalID", "DocumentID", "DocumentName",
        "FilePath", "AddedDate",
    ]
    records = []

    try:
        with arcpy.da.SearchCursor(
            table, fields,
            where_clause=f"TransmittalID = '{transmittal_id}'"
        ) as cursor:
            for row in cursor:
                records.append(dict(zip(fields, row)))
    except Exception as e:
        logger.error(
            "Error querying documents for transmittal %s: %s",
            transmittal_id, e,
        )

    return records


def _query_transmittals(workspace, where_clause):
    """Internal helper to query transmittals with a where clause.

    Args:
        workspace: Path to geodatabase.
        where_clause: SQL where clause string.

    Returns:
        List of transmittal dictionaries.
    """
    table = f"{workspace}/{TABLE_TRANSMITTALS}"
    fields = [
        "TransmittalID", "TransmittalNumber", "ProjectID", "Direction",
        "Subject", "Sender", "Recipient", "DueDate", "Notes",
        "Status", "CreatedBy", "CreatedDate", "ModifiedDate",
    ]
    records = []

    try:
        with arcpy.da.SearchCursor(table, fields, where_clause=where_clause) as cursor:
            for row in cursor:
                records.append(dict(zip(fields, row)))
    except Exception as e:
        logger.error("Error querying transmittals (%s): %s", where_clause, e)

    return records


# ---------------------------------------------------------------------------
# Summary / Reporting
# ---------------------------------------------------------------------------

def get_transmittal_summary(workspace, project_id=None):
    """Get a summary of transmittals grouped by status and direction.

    Args:
        workspace: Path to geodatabase.
        project_id: Optional project filter.

    Returns:
        Dictionary with keys:
            - by_status: dict mapping status to count.
            - by_direction: dict mapping direction to count.
            - total: total count.
    """
    table = f"{workspace}/{TABLE_TRANSMITTALS}"
    where = f"ProjectID = '{project_id}'" if project_id else "1=1"

    by_status = {
        STATUS_DRAFT: 0,
        STATUS_SENT: 0,
        STATUS_RECEIVED: 0,
        STATUS_ACKNOWLEDGED: 0,
        STATUS_CLOSED: 0,
    }
    by_direction = {
        DIRECTION_INBOUND: 0,
        DIRECTION_OUTBOUND: 0,
    }
    total = 0

    try:
        with arcpy.da.SearchCursor(
            table, ["Status", "Direction"],
            where_clause=where,
        ) as cursor:
            for row in cursor:
                total += 1
                status = row[0]
                direction = row[1]
                if status in by_status:
                    by_status[status] += 1
                if direction in by_direction:
                    by_direction[direction] += 1
    except Exception as e:
        logger.error("Error generating transmittal summary: %s", e)

    return {
        "by_status": by_status,
        "by_direction": by_direction,
        "total": total,
    }
