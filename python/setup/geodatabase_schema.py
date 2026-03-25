"""
Environmental Compliance Management System (ECMS) - Geodatabase Schema Setup

Creates the complete enterprise geodatabase schema for the ECMS, including
feature classes, tables, coded value domains, relationship classes, and
editor tracking configuration.

This script is idempotent: it checks for the existence of each schema
object before attempting creation, making it safe to re-run.

Requirements:
    - ArcGIS Pro 3.x with arcpy
    - ArcGIS Enterprise geodatabase connection (.sde file)
    - Database user must have CREATE privileges

Usage:
    python geodatabase_schema.py --config ../../config/service_config.json
    python geodatabase_schema.py --workspace path/to/connection.sde
"""

import argparse
import json
import logging
import os
import sys
import traceback
from datetime import datetime
from pathlib import Path

try:
    import arcpy
except ImportError:
    print(
        "ERROR: arcpy is not available. This script must be run from an "
        "ArcGIS Pro Python environment."
    )
    sys.exit(1)


# ---------------------------------------------------------------------------
# Logging setup
# ---------------------------------------------------------------------------

LOG_FORMAT = "%(asctime)s [%(levelname)-8s] %(message)s"
LOG_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


def configure_logging(log_dir=None):
    """Configure console and optional file logging.

    Args:
        log_dir: Directory for log files. If None, logs to console only.

    Returns:
        logging.Logger configured for the module.
    """
    logger = logging.getLogger("ecms_schema")
    logger.setLevel(logging.DEBUG)

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(logging.Formatter(LOG_FORMAT, LOG_DATE_FORMAT))
    logger.addHandler(console_handler)

    if log_dir:
        os.makedirs(log_dir, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        log_file = os.path.join(log_dir, f"ecms_schema_{timestamp}.log")
        file_handler = logging.FileHandler(log_file, encoding="utf-8")
        file_handler.setLevel(logging.DEBUG)
        file_handler.setFormatter(logging.Formatter(LOG_FORMAT, LOG_DATE_FORMAT))
        logger.addHandler(file_handler)
        logger.info("Log file: %s", log_file)

    return logger


# ---------------------------------------------------------------------------
# Configuration loader
# ---------------------------------------------------------------------------

def load_config(config_path):
    """Load and validate the service configuration JSON file.

    Args:
        config_path: Absolute or relative path to service_config.json.

    Returns:
        dict with the parsed configuration.

    Raises:
        FileNotFoundError: If the config file does not exist.
        json.JSONDecodeError: If the file is not valid JSON.
    """
    config_path = Path(config_path).resolve()
    if not config_path.exists():
        raise FileNotFoundError(f"Configuration file not found: {config_path}")

    with open(config_path, "r", encoding="utf-8") as fh:
        config = json.load(fh)

    required_keys = ["geodatabase", "coded_domains", "field_mappings",
                     "table_field_mappings", "relationship_classes"]
    for key in required_keys:
        if key not in config:
            raise KeyError(f"Missing required config key: '{key}'")

    return config


# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------

def _object_exists(workspace, name, data_type=None):
    """Check whether a geodatabase object already exists.

    Args:
        workspace: Path to the geodatabase or .sde connection.
        name: Name of the object (feature class, table, domain, etc.).
        data_type: Optional arcpy data type filter.

    Returns:
        True if the object exists, False otherwise.
    """
    if data_type == "GPCodedValueDomain":
        return name in [d.name for d in arcpy.da.ListDomains(workspace)]
    full_path = os.path.join(workspace, name)
    return arcpy.Exists(full_path)


def _dataset_exists(workspace, dataset_name):
    """Check whether a feature dataset exists in the geodatabase.

    Args:
        workspace: Path to the geodatabase.
        dataset_name: Name of the feature dataset.

    Returns:
        True if the dataset exists.
    """
    return arcpy.Exists(os.path.join(workspace, dataset_name))


def _relationship_exists(workspace, rel_name):
    """Check whether a relationship class already exists.

    Args:
        workspace: Path to the geodatabase.
        rel_name: Relationship class name.

    Returns:
        True if the relationship class exists.
    """
    return arcpy.Exists(os.path.join(workspace, rel_name))


# ---------------------------------------------------------------------------
# Domain creation
# ---------------------------------------------------------------------------

def create_coded_domains(workspace, domain_definitions, logger):
    """Create all coded value domains defined in the configuration.

    Each domain is created only if it does not already exist.  Existing
    domains are left untouched so that production data is never disrupted.

    Args:
        workspace: Path to the enterprise geodatabase.
        domain_definitions: Dict mapping domain names to their definitions,
            each containing 'description', 'field_type', and 'values'.
        logger: Logger instance.

    Returns:
        int count of domains created.
    """
    created = 0
    existing_domains = [d.name for d in arcpy.da.ListDomains(workspace)]

    for domain_name, definition in domain_definitions.items():
        if domain_name in existing_domains:
            logger.info("Domain already exists, skipping: %s", domain_name)
            continue

        field_type = definition.get("field_type", "TEXT")
        description = definition.get("description", "")

        try:
            arcpy.management.CreateDomain(
                in_workspace=workspace,
                domain_name=domain_name,
                domain_description=description,
                field_type=field_type,
                domain_type="CODED",
            )
            logger.info("Created domain: %s", domain_name)

            for code, desc in definition.get("values", {}).items():
                arcpy.management.AddCodedValueToDomain(
                    in_workspace=workspace,
                    domain_name=domain_name,
                    code=code,
                    code_description=desc,
                )
            logger.debug("  Added %d coded values to %s",
                         len(definition.get("values", {})), domain_name)
            created += 1

        except arcpy.ExecuteError:
            logger.error("Failed to create domain '%s': %s",
                         domain_name, arcpy.GetMessages(2))
        except Exception:
            logger.error("Unexpected error creating domain '%s': %s",
                         domain_name, traceback.format_exc())

    return created


# ---------------------------------------------------------------------------
# Feature dataset
# ---------------------------------------------------------------------------

def create_feature_dataset(workspace, dataset_name, spatial_ref_wkid, logger):
    """Create a feature dataset if it does not already exist.

    Args:
        workspace: Path to the enterprise geodatabase.
        dataset_name: Name for the feature dataset.
        spatial_ref_wkid: WKID for the spatial reference.
        logger: Logger instance.

    Returns:
        Full path to the feature dataset.
    """
    dataset_path = os.path.join(workspace, dataset_name)

    if _dataset_exists(workspace, dataset_name):
        logger.info("Feature dataset already exists: %s", dataset_name)
        return dataset_path

    sr = arcpy.SpatialReference(spatial_ref_wkid)
    try:
        arcpy.management.CreateFeatureDataset(
            out_dataset_path=workspace,
            out_name=dataset_name,
            spatial_reference=sr,
        )
        logger.info("Created feature dataset: %s (WKID %d)",
                     dataset_name, spatial_ref_wkid)
    except arcpy.ExecuteError:
        logger.error("Failed to create feature dataset '%s': %s",
                     dataset_name, arcpy.GetMessages(2))
        raise

    return dataset_path


# ---------------------------------------------------------------------------
# Field creation helpers
# ---------------------------------------------------------------------------

_ARCPY_FIELD_TYPE_MAP = {
    "TEXT": "TEXT",
    "FLOAT": "FLOAT",
    "DOUBLE": "DOUBLE",
    "SHORT": "SHORT",
    "LONG": "LONG",
    "DATE": "DATE",
    "GUID": "GUID",
    "GLOBALID": "GLOBALID",
}


def _add_fields(target_path, field_definitions, workspace, logger):
    """Add fields to a feature class or table from a list of definitions.

    Each field dict may contain: name, type, length, alias, nullable, domain.
    GlobalID and editor tracking fields are handled separately.

    Args:
        target_path: Full path to the feature class or table.
        field_definitions: List of field definition dicts.
        workspace: Geodatabase workspace (for domain assignment).
        logger: Logger instance.
    """
    existing_fields = {f.name.upper() for f in arcpy.ListFields(target_path)}

    for field_def in field_definitions:
        fname = field_def["name"]
        if fname.upper() in existing_fields:
            logger.debug("  Field already exists, skipping: %s", fname)
            continue

        ftype = _ARCPY_FIELD_TYPE_MAP.get(field_def.get("type", "TEXT"), "TEXT")
        alias = field_def.get("alias", fname)
        length = field_def.get("length", None)
        nullable = "NULLABLE" if field_def.get("nullable", True) else "NON_NULLABLE"
        domain_name = field_def.get("domain", "")

        try:
            add_params = {
                "in_table": target_path,
                "field_name": fname,
                "field_type": ftype,
                "field_alias": alias,
                "field_is_nullable": nullable,
            }
            if length and ftype == "TEXT":
                add_params["field_length"] = length
            if domain_name:
                add_params["field_domain"] = domain_name

            arcpy.management.AddField(**add_params)
            logger.debug("  Added field: %s (%s)", fname, ftype)

        except arcpy.ExecuteError:
            logger.error("  Failed to add field '%s': %s",
                         fname, arcpy.GetMessages(2))


def _add_globalid(target_path, logger):
    """Add a GlobalID field if not already present.

    Args:
        target_path: Full path to the feature class or table.
        logger: Logger instance.
    """
    existing_fields = {f.name.upper() for f in arcpy.ListFields(target_path)}
    if "GLOBALID" not in existing_fields:
        try:
            arcpy.management.AddGlobalIDs(target_path)
            logger.debug("  Added GlobalID field")
        except arcpy.ExecuteError:
            logger.warning("  Could not add GlobalID: %s", arcpy.GetMessages(2))


def _enable_editor_tracking(target_path, logger):
    """Enable editor tracking on a feature class or table.

    Uses standard Esri editor tracking field names:
    created_user, created_date, last_edited_user, last_edited_date.

    Args:
        target_path: Full path to the feature class or table.
        logger: Logger instance.
    """
    try:
        arcpy.management.EnableEditorTracking(
            in_dataset=target_path,
            creator_field="created_user",
            creation_date_field="created_date",
            last_editor_field="last_edited_user",
            last_edit_date_field="last_edited_date",
            add_fields="ADD_FIELDS",
            record_dates_in="UTC",
        )
        logger.debug("  Enabled editor tracking")
    except arcpy.ExecuteError:
        logger.warning("  Could not enable editor tracking: %s",
                        arcpy.GetMessages(2))


# ---------------------------------------------------------------------------
# Feature class creation
# ---------------------------------------------------------------------------

_GEOMETRY_TYPE_MAP = {
    "POINT": "POINT",
    "POLYLINE": "POLYLINE",
    "POLYGON": "POLYGON",
}


def create_feature_class(dataset_path, fc_name, geometry_type, field_defs,
                         workspace, logger):
    """Create a single feature class with fields, GlobalID, and editor tracking.

    Args:
        dataset_path: Path to the feature dataset (or geodatabase).
        fc_name: Feature class name.
        geometry_type: One of POINT, POLYLINE, POLYGON.
        field_defs: List of field definition dicts from configuration.
        workspace: Root geodatabase workspace.
        logger: Logger instance.

    Returns:
        Full path to the created (or existing) feature class.
    """
    fc_path = os.path.join(dataset_path, fc_name)

    if arcpy.Exists(fc_path):
        logger.info("Feature class already exists: %s", fc_name)
    else:
        try:
            arcpy.management.CreateFeatureclass(
                out_path=dataset_path,
                out_name=fc_name,
                geometry_type=geometry_type,
                has_m="DISABLED",
                has_z="DISABLED",
            )
            logger.info("Created feature class: %s (%s)", fc_name, geometry_type)
        except arcpy.ExecuteError:
            logger.error("Failed to create feature class '%s': %s",
                         fc_name, arcpy.GetMessages(2))
            raise

    _add_fields(fc_path, field_defs, workspace, logger)
    _add_globalid(fc_path, logger)
    _enable_editor_tracking(fc_path, logger)

    return fc_path


# ---------------------------------------------------------------------------
# Table creation
# ---------------------------------------------------------------------------

def create_table(workspace, table_name, field_defs, logger):
    """Create a non-spatial table with fields, GlobalID, and editor tracking.

    Args:
        workspace: Path to the enterprise geodatabase.
        table_name: Table name.
        field_defs: List of field definition dicts from configuration.
        logger: Logger instance.

    Returns:
        Full path to the created (or existing) table.
    """
    table_path = os.path.join(workspace, table_name)

    if arcpy.Exists(table_path):
        logger.info("Table already exists: %s", table_name)
    else:
        try:
            arcpy.management.CreateTable(
                out_path=workspace,
                out_name=table_name,
            )
            logger.info("Created table: %s", table_name)
        except arcpy.ExecuteError:
            logger.error("Failed to create table '%s': %s",
                         table_name, arcpy.GetMessages(2))
            raise

    _add_fields(table_path, field_defs, workspace, logger)
    _add_globalid(table_path, logger)
    _enable_editor_tracking(table_path, logger)

    return table_path


# ---------------------------------------------------------------------------
# Relationship class creation
# ---------------------------------------------------------------------------

def create_relationship_classes(workspace, dataset_path, rel_definitions, logger):
    """Create all relationship classes defined in the configuration.

    Supports ONE_TO_MANY and MANY_TO_MANY (attributed) relationships.

    Args:
        workspace: Path to the enterprise geodatabase.
        dataset_path: Path to the feature dataset.
        rel_definitions: List of relationship class definition dicts.
        logger: Logger instance.

    Returns:
        int count of relationship classes created.
    """
    created = 0

    for rel_def in rel_definitions:
        rel_name = rel_def["name"]

        if _relationship_exists(workspace, rel_name):
            logger.info("Relationship class already exists: %s", rel_name)
            continue

        origin_name = rel_def["origin"]
        dest_name = rel_def["destination"]
        cardinality = rel_def.get("cardinality", "ONE_TO_MANY")

        # Resolve full paths -- feature classes live in the dataset,
        # tables live directly in the workspace.
        origin_path = os.path.join(dataset_path, origin_name)
        if not arcpy.Exists(origin_path):
            origin_path = os.path.join(workspace, origin_name)

        dest_path = os.path.join(dataset_path, dest_name)
        if not arcpy.Exists(dest_path):
            dest_path = os.path.join(workspace, dest_name)

        if not arcpy.Exists(origin_path):
            logger.warning("Origin '%s' not found, skipping relationship '%s'",
                           origin_name, rel_name)
            continue
        if not arcpy.Exists(dest_path):
            logger.warning("Destination '%s' not found, skipping relationship '%s'",
                           dest_name, rel_name)
            continue

        try:
            if cardinality == "MANY_TO_MANY":
                # Attributed relationship using a junction table
                junction_name = rel_def.get("junction_table", f"{rel_name}_Junction")
                junction_path = os.path.join(workspace, junction_name)

                if not arcpy.Exists(junction_path):
                    logger.warning(
                        "Junction table '%s' not found for M:N relationship '%s'. "
                        "Ensure it was created beforehand.", junction_name, rel_name
                    )
                    continue

                arcpy.management.CreateRelationshipClass(
                    origin_table=origin_path,
                    destination_table=dest_path,
                    out_relationship_class=os.path.join(workspace, rel_name),
                    relationship_type="COMPOSITE",
                    forward_label=rel_def.get("forward_label", rel_name),
                    backward_label=rel_def.get("backward_label", rel_name),
                    message_direction="NONE",
                    cardinality="MANY_TO_MANY",
                    attributed="ATTRIBUTED",
                    origin_primary_key=rel_def.get("origin_key", "PermitID"),
                    origin_foreign_key=rel_def.get("junction_origin_key", "PermitID"),
                    destination_primary_key=rel_def.get("destination_key", "ContactID"),
                    destination_foreign_key=rel_def.get("junction_destination_key", "ContactID"),
                )
            else:
                arcpy.management.CreateRelationshipClass(
                    origin_table=origin_path,
                    destination_table=dest_path,
                    out_relationship_class=os.path.join(workspace, rel_name),
                    relationship_type="COMPOSITE",
                    forward_label=rel_def.get("forward_label", rel_name),
                    backward_label=rel_def.get("backward_label", rel_name),
                    message_direction="NONE",
                    cardinality="ONE_TO_MANY",
                    attributed="NONE",
                    origin_primary_key=rel_def.get("origin_key", ""),
                    origin_foreign_key=rel_def.get("destination_key", ""),
                )

            logger.info("Created relationship class: %s (%s)",
                        rel_name, cardinality)
            created += 1

        except arcpy.ExecuteError:
            logger.error("Failed to create relationship '%s': %s",
                         rel_name, arcpy.GetMessages(2))
        except Exception:
            logger.error("Unexpected error creating relationship '%s': %s",
                         rel_name, traceback.format_exc())

    return created


# ---------------------------------------------------------------------------
# Main schema builder
# ---------------------------------------------------------------------------

def build_schema(config, workspace_override=None, log_dir=None):
    """Orchestrate the complete geodatabase schema creation.

    This is the primary entry point. It performs the following steps in order:
        1. Validate the workspace connection.
        2. Create coded value domains.
        3. Create the feature dataset.
        4. Create feature classes (with fields, GlobalID, editor tracking).
        5. Create non-spatial tables.
        6. Create relationship classes.

    Args:
        config: Parsed configuration dict (from service_config.json).
        workspace_override: Optional workspace path that overrides the config.
        log_dir: Optional directory for log file output.

    Returns:
        True if schema creation completed without fatal errors.

    Raises:
        RuntimeError: If the workspace is unreachable.
    """
    logger = configure_logging(log_dir)
    logger.info("=" * 70)
    logger.info("ECMS Geodatabase Schema Builder - Starting")
    logger.info("=" * 70)

    # Resolve workspace
    workspace = workspace_override or config["geodatabase"]["workspace"]
    if not arcpy.Exists(workspace):
        raise RuntimeError(
            f"Workspace does not exist or is not accessible: {workspace}"
        )

    arcpy.env.workspace = workspace
    arcpy.env.overwriteOutput = False  # safety: never overwrite in production
    logger.info("Workspace: %s", workspace)

    gdb_config = config["geodatabase"]
    sr_wkid = gdb_config["spatial_reference"]["wkid"]
    dataset_name = gdb_config.get("feature_dataset", "EnvironmentalCompliance")

    success = True

    # ------------------------------------------------------------------
    # Step 1: Coded Value Domains
    # ------------------------------------------------------------------
    logger.info("-" * 50)
    logger.info("STEP 1: Creating coded value domains")
    logger.info("-" * 50)

    domain_count = create_coded_domains(
        workspace, config["coded_domains"], logger
    )
    logger.info("Domains created: %d", domain_count)

    # ------------------------------------------------------------------
    # Step 2: Feature Dataset
    # ------------------------------------------------------------------
    logger.info("-" * 50)
    logger.info("STEP 2: Creating feature dataset")
    logger.info("-" * 50)

    dataset_path = create_feature_dataset(workspace, dataset_name, sr_wkid, logger)

    # ------------------------------------------------------------------
    # Step 3: Feature Classes
    # ------------------------------------------------------------------
    logger.info("-" * 50)
    logger.info("STEP 3: Creating feature classes")
    logger.info("-" * 50)

    feature_classes = {
        "EnvironmentalPermits": "POLYGON",
        "MonitoringStations": "POINT",
        "ComplianceBoundaries": "POLYGON",
        "InspectionLocations": "POINT",
    }

    for fc_name, geom_type in feature_classes.items():
        field_defs = config["field_mappings"].get(fc_name, [])
        try:
            create_feature_class(
                dataset_path, fc_name, geom_type, field_defs, workspace, logger
            )
        except Exception:
            logger.error("Fatal error creating '%s': %s",
                         fc_name, traceback.format_exc())
            success = False

    # Environmental Assets -- three geometry variants sharing the same fields
    asset_field_defs = config["field_mappings"].get("EnvironmentalAssets", [])
    asset_variants = {
        "EnvironmentalAssets_Point": "POINT",
        "EnvironmentalAssets_Line": "POLYLINE",
        "EnvironmentalAssets_Polygon": "POLYGON",
    }

    for fc_name, geom_type in asset_variants.items():
        try:
            create_feature_class(
                dataset_path, fc_name, geom_type, asset_field_defs,
                workspace, logger
            )
        except Exception:
            logger.error("Fatal error creating '%s': %s",
                         fc_name, traceback.format_exc())
            success = False

    # ------------------------------------------------------------------
    # Step 4: Non-spatial Tables
    # ------------------------------------------------------------------
    logger.info("-" * 50)
    logger.info("STEP 4: Creating non-spatial tables")
    logger.info("-" * 50)

    table_names = [
        "PermitConditions",
        "ComplianceTriggers",
        "MonitoringData",
        "ContactList",
        "AlertLog",
        "AuditTrail",
        "PermitDocuments",
        "SpatialLinks",
        "PermitContactJunction",
    ]

    for table_name in table_names:
        field_defs = config["table_field_mappings"].get(table_name, [])
        try:
            create_table(workspace, table_name, field_defs, logger)
        except Exception:
            logger.error("Fatal error creating table '%s': %s",
                         table_name, traceback.format_exc())
            success = False

    # ------------------------------------------------------------------
    # Step 5: Relationship Classes
    # ------------------------------------------------------------------
    logger.info("-" * 50)
    logger.info("STEP 5: Creating relationship classes")
    logger.info("-" * 50)

    rel_count = create_relationship_classes(
        workspace, dataset_path,
        config.get("relationship_classes", []),
        logger
    )
    logger.info("Relationship classes created: %d", rel_count)

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    logger.info("=" * 70)
    if success:
        logger.info("Schema creation completed successfully.")
    else:
        logger.warning("Schema creation completed with errors. "
                       "Review the log for details.")
    logger.info("=" * 70)

    return success


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def parse_arguments():
    """Parse command-line arguments.

    Returns:
        argparse.Namespace with parsed arguments.
    """
    parser = argparse.ArgumentParser(
        description="ECMS Geodatabase Schema Builder",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python geodatabase_schema.py --config ../../config/service_config.json\n"
            "  python geodatabase_schema.py --config config.json --workspace C:\\data\\env.sde\n"
            "  python geodatabase_schema.py --config config.json --log-dir ./logs\n"
        ),
    )
    parser.add_argument(
        "--config", "-c",
        required=True,
        help="Path to service_config.json",
    )
    parser.add_argument(
        "--workspace", "-w",
        default=None,
        help="Override the geodatabase workspace path from config",
    )
    parser.add_argument(
        "--log-dir",
        default=None,
        help="Directory for log file output (optional)",
    )
    return parser.parse_args()


def main():
    """Main entry point for CLI execution."""
    args = parse_arguments()

    try:
        config = load_config(args.config)
    except (FileNotFoundError, KeyError, json.JSONDecodeError) as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        sys.exit(1)

    try:
        ok = build_schema(
            config,
            workspace_override=args.workspace,
            log_dir=args.log_dir,
        )
        sys.exit(0 if ok else 1)
    except RuntimeError as exc:
        print(f"Runtime error: {exc}", file=sys.stderr)
        sys.exit(2)
    except Exception:
        print(f"Unhandled error:\n{traceback.format_exc()}", file=sys.stderr)
        sys.exit(3)


if __name__ == "__main__":
    main()
