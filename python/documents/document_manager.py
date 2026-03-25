"""
Document Lifecycle Management

Manages document creation, revision control, archival, and search within the
ECMS geodatabase. Each document is assigned a unique Document Control Number
(DCN) and maintains a full revision history.

Requirements:
    - ArcGIS Pro 3.x with arcpy
    - Enterprise geodatabase with ECMS schema

Usage:
    from documents.document_manager import create_document, search_documents
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

logger = logging.getLogger("ecms_documents")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TABLE_DOCUMENTS = "Documents"
TABLE_TRANSMITTAL_DOCS = "TransmittalDocuments"


# ---------------------------------------------------------------------------
# DCN Generation
# ---------------------------------------------------------------------------

def generate_dcn(project_code, category, sequence):
    """Generate a Document Control Number.

    Args:
        project_code: Short project code (e.g., 'GTP').
        category: Document category code (e.g., 'RPT', 'DWG', 'SPC').
        sequence: Integer sequence number.

    Returns:
        Formatted DCN string, e.g. 'DCN-GTP-RPT-0001'.
    """
    return f"DCN-{project_code}-{category}-{sequence:04d}"


# ---------------------------------------------------------------------------
# Document CRUD
# ---------------------------------------------------------------------------

def create_document(workspace, doc_data):
    """Create a new document record in the geodatabase.

    Args:
        workspace: Path to geodatabase.
        doc_data: Dictionary with keys:
            - DocumentName (str): Display name.
            - DCN (str): Document Control Number.
            - ProjectID (str): Related project ID.
            - DriverID (str, optional): Related regulatory driver.
            - ObligationID (str, optional): Related obligation.
            - TaskID (str, optional): Related task.
            - Category (str): Document category.
            - NativeFilePath (str, optional): Path to native/editable file.
            - FinalFilePath (str, optional): Path to final/published file.
            - CreatedBy (str): Username of creator.

    Returns:
        The generated DocumentID string, or None on failure.
    """
    table = f"{workspace}/{TABLE_DOCUMENTS}"
    document_id = f"DOC-{uuid.uuid4().hex[:8].upper()}"

    fields = [
        "DocumentID", "DocumentName", "DCN", "ProjectID",
        "DriverID", "ObligationID", "TaskID", "Category",
        "RevisionNumber", "NativeFilePath", "FinalFilePath",
        "Status", "CreatedBy", "CreatedDate", "ModifiedDate",
    ]

    values = [
        document_id,
        doc_data.get("DocumentName", ""),
        doc_data.get("DCN", ""),
        doc_data.get("ProjectID", ""),
        doc_data.get("DriverID", ""),
        doc_data.get("ObligationID", ""),
        doc_data.get("TaskID", ""),
        doc_data.get("Category", ""),
        1,
        doc_data.get("NativeFilePath", ""),
        doc_data.get("FinalFilePath", ""),
        "Draft",
        doc_data.get("CreatedBy", "system"),
        datetime.utcnow(),
        datetime.utcnow(),
    ]

    try:
        with arcpy.da.InsertCursor(table, fields) as cursor:
            cursor.insertRow(values)
        logger.info("Created document %s (%s)", document_id, doc_data.get("DCN", ""))
    except Exception as e:
        logger.error("Error creating document: %s", e)
        return None

    return document_id


def update_document(workspace, document_id, updates):
    """Update fields on an existing document record.

    Args:
        workspace: Path to geodatabase.
        document_id: The DocumentID to update.
        updates: Dictionary of field names to new values.
    """
    table = f"{workspace}/{TABLE_DOCUMENTS}"
    update_fields = list(updates.keys())
    all_fields = ["DocumentID"] + update_fields + ["ModifiedDate"]

    try:
        with arcpy.da.UpdateCursor(
            table, all_fields,
            where_clause=f"DocumentID = '{document_id}'"
        ) as cursor:
            for row in cursor:
                for i, field in enumerate(update_fields):
                    row[i + 1] = updates[field]
                row[-1] = datetime.utcnow()
                cursor.updateRow(row)
        logger.info("Updated document %s: %s", document_id, list(updates.keys()))
    except Exception as e:
        logger.error("Error updating document %s: %s", document_id, e)


# ---------------------------------------------------------------------------
# Revision Control
# ---------------------------------------------------------------------------

def create_revision(workspace, document_id, new_native_path=None,
                    new_final_path=None, revised_by=""):
    """Create a new revision of a document.

    Reads the current document record, increments the revision number, and
    inserts a new record with updated file paths. The previous revision's
    status is set to 'Superseded'.

    Args:
        workspace: Path to geodatabase.
        document_id: The DocumentID to revise.
        new_native_path: Updated native file path (or keeps existing).
        new_final_path: Updated final file path (or keeps existing).
        revised_by: Username creating the revision.

    Returns:
        The new DocumentID for the revision, or None on failure.
    """
    table = f"{workspace}/{TABLE_DOCUMENTS}"
    fields = [
        "DocumentID", "DocumentName", "DCN", "ProjectID",
        "DriverID", "ObligationID", "TaskID", "Category",
        "RevisionNumber", "NativeFilePath", "FinalFilePath",
        "Status", "CreatedBy",
    ]

    # Read current document
    current = None
    try:
        with arcpy.da.SearchCursor(
            table, fields,
            where_clause=f"DocumentID = '{document_id}'"
        ) as cursor:
            for row in cursor:
                current = dict(zip(fields, row))
                break
    except Exception as e:
        logger.error("Error reading document %s for revision: %s", document_id, e)
        return None

    if not current:
        logger.error("Document %s not found.", document_id)
        return None

    # Mark current revision as superseded
    try:
        with arcpy.da.UpdateCursor(
            table, ["DocumentID", "Status"],
            where_clause=f"DocumentID = '{document_id}'"
        ) as cursor:
            for row in cursor:
                row[1] = "Superseded"
                cursor.updateRow(row)
    except Exception as e:
        logger.error("Error superseding document %s: %s", document_id, e)

    # Create new revision record
    new_id = f"DOC-{uuid.uuid4().hex[:8].upper()}"
    new_rev = (current.get("RevisionNumber") or 0) + 1
    insert_fields = fields + ["CreatedDate", "ModifiedDate"]

    values = [
        new_id,
        current.get("DocumentName", ""),
        current.get("DCN", ""),
        current.get("ProjectID", ""),
        current.get("DriverID", ""),
        current.get("ObligationID", ""),
        current.get("TaskID", ""),
        current.get("Category", ""),
        new_rev,
        new_native_path or current.get("NativeFilePath", ""),
        new_final_path or current.get("FinalFilePath", ""),
        "Draft",
        revised_by or current.get("CreatedBy", "system"),
        datetime.utcnow(),
        datetime.utcnow(),
    ]

    try:
        with arcpy.da.InsertCursor(table, insert_fields) as cursor:
            cursor.insertRow(values)
        logger.info(
            "Created revision %d for document %s -> %s",
            new_rev, document_id, new_id,
        )
    except Exception as e:
        logger.error("Error creating revision for %s: %s", document_id, e)
        return None

    return new_id


# ---------------------------------------------------------------------------
# Query Functions
# ---------------------------------------------------------------------------

def get_documents_for_driver(workspace, driver_id):
    """Query documents linked to a regulatory driver.

    Args:
        workspace: Path to geodatabase.
        driver_id: The DriverID to filter on.

    Returns:
        List of document dictionaries.
    """
    return _query_documents(workspace, f"DriverID = '{driver_id}'")


def get_documents_for_obligation(workspace, obligation_id):
    """Query documents linked to an obligation.

    Args:
        workspace: Path to geodatabase.
        obligation_id: The ObligationID to filter on.

    Returns:
        List of document dictionaries.
    """
    return _query_documents(workspace, f"ObligationID = '{obligation_id}'")


def get_documents_for_task(workspace, task_id):
    """Query documents linked to a task.

    Args:
        workspace: Path to geodatabase.
        task_id: The TaskID to filter on.

    Returns:
        List of document dictionaries.
    """
    return _query_documents(workspace, f"TaskID = '{task_id}'")


def get_documents_for_project(workspace, project_id):
    """Query all documents for a project.

    Args:
        workspace: Path to geodatabase.
        project_id: The ProjectID to filter on.

    Returns:
        List of document dictionaries.
    """
    return _query_documents(workspace, f"ProjectID = '{project_id}'")


def _query_documents(workspace, where_clause):
    """Internal helper to query documents with a where clause.

    Args:
        workspace: Path to geodatabase.
        where_clause: SQL where clause string.

    Returns:
        List of document dictionaries.
    """
    table = f"{workspace}/{TABLE_DOCUMENTS}"
    fields = [
        "DocumentID", "DocumentName", "DCN", "ProjectID",
        "DriverID", "ObligationID", "TaskID", "Category",
        "RevisionNumber", "NativeFilePath", "FinalFilePath",
        "Status", "CreatedBy", "CreatedDate", "ModifiedDate",
    ]
    documents = []

    try:
        with arcpy.da.SearchCursor(table, fields, where_clause=where_clause) as cursor:
            for row in cursor:
                documents.append(dict(zip(fields, row)))
    except Exception as e:
        logger.error("Error querying documents (%s): %s", where_clause, e)

    return documents


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------

def search_documents(workspace, query, project_id=None):
    """Search documents by name or DCN.

    Args:
        workspace: Path to geodatabase.
        query: Search string to match against DocumentName or DCN.
        project_id: Optional project filter.

    Returns:
        List of matching document dictionaries.
    """
    where = (
        f"(DocumentName LIKE '%{query}%' OR DCN LIKE '%{query}%')"
    )
    if project_id:
        where += f" AND ProjectID = '{project_id}'"

    return _query_documents(workspace, where)


# ---------------------------------------------------------------------------
# Document History
# ---------------------------------------------------------------------------

def get_document_history(workspace, document_id):
    """Get all revisions of a document by looking up its DCN.

    Retrieves the DCN for the given document, then returns all document
    records sharing that DCN, ordered by revision number.

    Args:
        workspace: Path to geodatabase.
        document_id: Any DocumentID in the revision chain.

    Returns:
        List of document dictionaries ordered by revision number.
    """
    table = f"{workspace}/{TABLE_DOCUMENTS}"

    # First, get the DCN for this document
    dcn = None
    try:
        with arcpy.da.SearchCursor(
            table, ["DCN"],
            where_clause=f"DocumentID = '{document_id}'"
        ) as cursor:
            for row in cursor:
                dcn = row[0]
                break
    except Exception as e:
        logger.error("Error reading DCN for %s: %s", document_id, e)
        return []

    if not dcn:
        logger.warning("No DCN found for document %s", document_id)
        return []

    # Query all revisions with the same DCN
    fields = [
        "DocumentID", "DocumentName", "DCN", "ProjectID",
        "DriverID", "ObligationID", "TaskID", "Category",
        "RevisionNumber", "NativeFilePath", "FinalFilePath",
        "Status", "CreatedBy", "CreatedDate", "ModifiedDate",
    ]
    revisions = []

    try:
        with arcpy.da.SearchCursor(
            table, fields,
            where_clause=f"DCN = '{dcn}'",
            sql_clause=(None, "ORDER BY RevisionNumber ASC"),
        ) as cursor:
            for row in cursor:
                revisions.append(dict(zip(fields, row)))
    except Exception as e:
        logger.error("Error querying document history for DCN %s: %s", dcn, e)

    return revisions


# ---------------------------------------------------------------------------
# Archive
# ---------------------------------------------------------------------------

def archive_document(workspace, document_id, archived_by):
    """Set a document's status to Archived.

    Args:
        workspace: Path to geodatabase.
        document_id: The DocumentID to archive.
        archived_by: Username performing the archival.
    """
    table = f"{workspace}/{TABLE_DOCUMENTS}"
    fields = ["DocumentID", "Status", "ModifiedDate"]

    try:
        with arcpy.da.UpdateCursor(
            table, fields,
            where_clause=f"DocumentID = '{document_id}'"
        ) as cursor:
            for row in cursor:
                row[1] = "Archived"
                row[2] = datetime.utcnow()
                cursor.updateRow(row)
        logger.info("Document %s archived by %s", document_id, archived_by)
    except Exception as e:
        logger.error("Error archiving document %s: %s", document_id, e)
