"""
Environmental Compliance Management System (ECMS) - Service Publisher

Publishes the ECMS geodatabase feature classes and tables as a hosted
feature service on ArcGIS Enterprise using the ArcGIS Python API and arcpy.

The script creates a single 'EnvironmentalCompliance' feature service
containing all spatial layers and non-spatial tables, with editing,
change tracking, and editor tracking enabled.

Workflow:
    1. Connect to ArcGIS Enterprise portal.
    2. Create a temporary ArcGIS Pro project with a map.
    3. Add all feature classes and tables from the geodatabase.
    4. Share as a web layer (feature service) to ArcGIS Enterprise.
    5. Configure service properties (editing, sync, tracking).

Requirements:
    - ArcGIS Pro 3.x with arcpy
    - arcgis (ArcGIS Python API) >= 2.2
    - Valid ArcGIS Enterprise portal credentials
    - Geodatabase schema already created (run geodatabase_schema.py first)

Usage:
    python publish_services.py --config ../../config/service_config.json
    python publish_services.py --config config.json --portal-url https://portal.example.com/portal
"""

import argparse
import json
import logging
import os
import shutil
import sys
import tempfile
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

try:
    from arcgis.gis import GIS
    from arcgis.features import FeatureLayerCollection
except ImportError:
    print(
        "ERROR: arcgis package is not available. Install with: "
        "conda install -c esri arcgis"
    )
    sys.exit(1)


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

LOG_FORMAT = "%(asctime)s [%(levelname)-8s] %(message)s"
LOG_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


def configure_logging(log_dir=None):
    """Configure logging to console and optional file.

    Args:
        log_dir: Optional directory for log file output.

    Returns:
        logging.Logger instance.
    """
    logger = logging.getLogger("ecms_publish")
    logger.setLevel(logging.DEBUG)

    if not logger.handlers:
        console = logging.StreamHandler(sys.stdout)
        console.setLevel(logging.INFO)
        console.setFormatter(logging.Formatter(LOG_FORMAT, LOG_DATE_FORMAT))
        logger.addHandler(console)

    if log_dir:
        os.makedirs(log_dir, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        fh = logging.FileHandler(
            os.path.join(log_dir, f"ecms_publish_{ts}.log"), encoding="utf-8"
        )
        fh.setLevel(logging.DEBUG)
        fh.setFormatter(logging.Formatter(LOG_FORMAT, LOG_DATE_FORMAT))
        logger.addHandler(fh)

    return logger


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

def load_config(config_path):
    """Load service configuration from JSON.

    Args:
        config_path: Path to service_config.json.

    Returns:
        Parsed dict.

    Raises:
        FileNotFoundError: If file does not exist.
    """
    path = Path(config_path).resolve()
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {path}")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Portal connection
# ---------------------------------------------------------------------------

def connect_to_portal(portal_url, username=None, password=None, profile=None,
                      logger=None):
    """Establish a connection to ArcGIS Enterprise portal.

    Tries authentication in order: explicit credentials, named profile,
    then active Pro portal sign-in.

    Args:
        portal_url: Full URL to the ArcGIS Enterprise portal.
        username: Portal username (optional).
        password: Portal password (optional).
        profile: Named profile for the arcgis API (optional).
        logger: Logger instance.

    Returns:
        arcgis.gis.GIS connection object.

    Raises:
        RuntimeError: If connection cannot be established.
    """
    log = logger or logging.getLogger("ecms_publish")

    # Strategy 1: Explicit credentials
    if username and password:
        log.info("Connecting to portal with explicit credentials: %s", portal_url)
        gis = GIS(portal_url, username, password)
        log.info("Connected as: %s", gis.properties.user.username)
        return gis

    # Strategy 2: Named profile
    if profile:
        log.info("Connecting to portal with profile '%s': %s", profile, portal_url)
        try:
            gis = GIS(portal_url, profile=profile)
            log.info("Connected as: %s", gis.properties.user.username)
            return gis
        except Exception as exc:
            log.warning("Profile authentication failed: %s", exc)

    # Strategy 3: Active ArcGIS Pro sign-in
    log.info("Attempting connection via active ArcGIS Pro sign-in")
    try:
        gis = GIS("pro")
        log.info("Connected via Pro sign-in as: %s",
                 gis.properties.user.username)
        return gis
    except Exception as exc:
        log.warning("Pro sign-in failed: %s", exc)

    raise RuntimeError(
        "Could not connect to ArcGIS Enterprise. Provide valid credentials, "
        "a configured profile, or sign in through ArcGIS Pro."
    )


# ---------------------------------------------------------------------------
# Map and layer preparation
# ---------------------------------------------------------------------------

def _create_project_and_map(workspace, dataset_path, table_list, config, logger):
    """Create a temporary ArcGIS Pro project and populate a map with layers.

    Adds all feature classes from the feature dataset and all standalone
    tables to a new map within a temporary project.

    Args:
        workspace: Path to the enterprise geodatabase.
        dataset_path: Path to the feature dataset.
        table_list: List of table names to include.
        config: Service configuration dict.
        logger: Logger instance.

    Returns:
        Tuple of (project_path, map_name) for the created project.
    """
    temp_dir = tempfile.mkdtemp(prefix="ecms_publish_")
    project_path = os.path.join(temp_dir, "ECMS_Publish.aprx")
    map_name = "EnvironmentalCompliance"

    logger.info("Creating temporary project: %s", project_path)

    # Create a blank project by cloning the default template
    aprx = arcpy.mp.ArcGISProject("CURRENT")

    # If running standalone (no CURRENT project), create from scratch
    try:
        aprx = arcpy.mp.ArcGISProject("CURRENT")
    except Exception:
        # Create a minimal project file
        default_template = arcpy.mp.ArcGISProject(
            os.path.join(
                arcpy.GetInstallInfo()["InstallDir"],
                "Resources", "ProjectTemplates", "BlankProject.aptx"
            )
        )
        default_template.saveACopy(project_path)
        aprx = arcpy.mp.ArcGISProject(project_path)

    # Get or create the map
    existing_maps = [m.name for m in aprx.listMaps()]
    if map_name not in existing_maps:
        aprx.createMap(map_name, "MAP")
    target_map = aprx.listMaps(map_name)[0]

    logger.info("Adding feature classes from dataset: %s", dataset_path)

    # Add feature classes
    arcpy.env.workspace = dataset_path
    feature_classes = arcpy.ListFeatureClasses() or []
    for fc in feature_classes:
        fc_path = os.path.join(dataset_path, fc)
        target_map.addDataFromPath(fc_path)
        logger.info("  Added layer: %s", fc)

    # Add tables
    arcpy.env.workspace = workspace
    for table_name in table_list:
        table_path = os.path.join(workspace, table_name)
        if arcpy.Exists(table_path):
            target_map.addDataFromPath(table_path)
            logger.info("  Added table: %s", table_name)
        else:
            logger.warning("  Table not found, skipping: %s", table_name)

    aprx.saveACopy(project_path) if not os.path.exists(project_path) else aprx.save()
    logger.info("Project saved with %d layers and tables",
                len(feature_classes) + len(table_list))

    return project_path, map_name, temp_dir


# ---------------------------------------------------------------------------
# Service definition and publishing
# ---------------------------------------------------------------------------

def create_service_definition(project_path, map_name, config, logger):
    """Create a Service Definition (.sd) file from the project map.

    Args:
        project_path: Path to the .aprx project file.
        map_name: Name of the map within the project.
        config: Service configuration dict.
        logger: Logger instance.

    Returns:
        Path to the generated .sd file.
    """
    svc_config = config.get("service", {})
    service_name = svc_config.get("name", "EnvironmentalCompliance")
    folder_name = svc_config.get("folder", "EnvCompliance")
    summary = svc_config.get("description", "ECMS Feature Service")
    tags = ", ".join(svc_config.get("tags", ["Environmental", "Compliance"]))

    aprx = arcpy.mp.ArcGISProject(project_path)
    target_map = aprx.listMaps(map_name)[0]

    # Stage the service definition
    temp_dir = os.path.dirname(project_path)
    sddraft_path = os.path.join(temp_dir, f"{service_name}.sddraft")
    sd_path = os.path.join(temp_dir, f"{service_name}.sd")

    logger.info("Creating service definition draft: %s", sddraft_path)

    # Create the sharing draft for a feature service
    sharing_draft = target_map.getWebLayerSharingDraft(
        server_type="HOSTING_SERVER",
        service_type="FEATURE",
        service_name=service_name,
    )
    sharing_draft.summary = summary
    sharing_draft.tags = tags
    sharing_draft.description = summary
    sharing_draft.portalFolder = folder_name

    # Allow export and sync
    sharing_draft.overwriteExistingService = False

    sharing_draft.exportToSDDraft(sddraft_path)
    logger.info("Service definition draft created")

    # Modify the sddraft XML to enable capabilities
    _configure_sddraft(sddraft_path, config, logger)

    # Stage the service
    logger.info("Staging service definition: %s", sd_path)
    arcpy.server.StageService(sddraft_path, sd_path)
    logger.info("Service definition staged successfully")

    return sd_path


def _configure_sddraft(sddraft_path, config, logger):
    """Modify the .sddraft XML to enable editing and sync capabilities.

    Args:
        sddraft_path: Path to the .sddraft file.
        config: Service configuration dict.
        logger: Logger instance.
    """
    import xml.etree.ElementTree as ET

    svc_config = config.get("service", {})
    capabilities = svc_config.get(
        "capabilities", "Query,Create,Update,Delete,Editing,Sync"
    )
    max_records = svc_config.get("max_record_count", 2000)

    tree = ET.parse(sddraft_path)
    root = tree.getroot()

    # Enable feature access capabilities
    for svc_ext in root.iter("SVCConfiguration"):
        for type_name in svc_ext.iter("TypeName"):
            if type_name.text == "FeatureServer":
                for prop in svc_ext.iter("PropertySetProperty"):
                    key_elem = prop.find("Key")
                    val_elem = prop.find("Value")
                    if key_elem is not None and val_elem is not None:
                        if key_elem.text == "WebCapabilities":
                            val_elem.text = capabilities
                            logger.debug("  Set WebCapabilities: %s", capabilities)
                        elif key_elem.text == "maxRecordCount":
                            val_elem.text = str(max_records)
                            logger.debug("  Set maxRecordCount: %d", max_records)

    # Enable the FeatureServer extension
    for ext_type in root.iter("SVCExtension"):
        for type_name in ext_type.iter("TypeName"):
            if type_name.text == "FeatureServer":
                enabled = ext_type.find(".//Enabled")
                if enabled is not None:
                    enabled.text = "true"
                    logger.debug("  Enabled FeatureServer extension")

    tree.write(sddraft_path, xml_declaration=True, encoding="utf-8")
    logger.info("Service definition draft configured")


# ---------------------------------------------------------------------------
# Upload and publish
# ---------------------------------------------------------------------------

def upload_and_publish(gis, sd_path, config, logger):
    """Upload the service definition and publish as a feature service.

    Args:
        gis: Authenticated arcgis.gis.GIS connection.
        sd_path: Path to the .sd file.
        config: Service configuration dict.
        logger: Logger instance.

    Returns:
        arcgis.features.FeatureLayerCollection for the published service.
    """
    svc_config = config.get("service", {})
    service_name = svc_config.get("name", "EnvironmentalCompliance")
    folder_name = svc_config.get("folder", "EnvCompliance")
    tags = svc_config.get("tags", ["Environmental", "Compliance"])

    # Check for existing service definition item
    existing_items = gis.content.search(
        query=f'title:"{service_name}" AND type:"Service Definition"',
        item_type="Service Definition",
    )

    if existing_items:
        logger.warning(
            "Existing service definition found (ID: %s). "
            "Will upload as a new item to avoid overwriting.",
            existing_items[0].id,
        )

    # Upload the service definition
    logger.info("Uploading service definition to portal...")
    sd_item = gis.content.add(
        item_properties={
            "title": service_name,
            "type": "Service Definition",
            "tags": tags,
            "description": svc_config.get("description", ""),
        },
        data=sd_path,
        folder=folder_name,
    )
    logger.info("Service definition uploaded: %s (ID: %s)",
                sd_item.title, sd_item.id)

    # Publish the service
    logger.info("Publishing feature service...")
    feature_service_item = sd_item.publish()
    logger.info("Feature service published: %s (ID: %s)",
                feature_service_item.title, feature_service_item.id)
    logger.info("Service URL: %s", feature_service_item.url)

    # Wrap in FeatureLayerCollection
    flc = FeatureLayerCollection.fromitem(feature_service_item)

    return flc, feature_service_item


# ---------------------------------------------------------------------------
# Service configuration (post-publish)
# ---------------------------------------------------------------------------

def configure_service(flc, feature_service_item, config, gis, logger):
    """Apply post-publication configuration to the feature service.

    Enables editing, change tracking, editor tracking, and attachments
    on the published feature service.

    Args:
        flc: FeatureLayerCollection for the published service.
        feature_service_item: The portal item for the service.
        config: Service configuration dict.
        gis: Authenticated GIS connection.
        logger: Logger instance.
    """
    svc_config = config.get("service", {})

    # ---- Update service-level properties ----
    logger.info("Configuring service-level properties...")

    update_definition = {
        "capabilities": svc_config.get(
            "capabilities", "Query,Create,Update,Delete,Editing,Sync"
        ),
        "editorTrackingInfo": {
            "enableEditorTracking": svc_config.get("enable_editor_tracking", True),
            "enableOwnershipAccessControl": False,
            "allowOthersToQuery": True,
            "allowOthersToUpdate": False,
            "allowOthersToDelete": False,
            "allowAnonymousToQuery": False,
            "allowAnonymousToUpdate": False,
            "allowAnonymousToDelete": False,
        },
        "changeTrackingInfo": {
            "enableChangeTracking": svc_config.get("enable_change_tracking", True),
        },
        "syncEnabled": True,
        "syncCapabilities": {
            "supportsAsync": True,
            "supportsRegisteringExistingData": True,
            "supportsSyncDirectionControl": True,
            "supportsPerLayerSync": True,
            "supportsPerReplicaSync": True,
            "supportsAttachmentsSyncDirection": True,
            "supportsBiDirectionalSyncForServer": True,
        },
    }

    try:
        flc.manager.update_definition(update_definition)
        logger.info("  Service definition updated (editing, tracking, sync)")
    except Exception as exc:
        logger.error("  Failed to update service definition: %s", exc)

    # ---- Configure individual layers ----
    logger.info("Configuring individual layers...")

    for layer in flc.layers:
        layer_name = layer.properties.get("name", f"Layer {layer.properties.id}")
        logger.info("  Configuring layer: %s (index %d)",
                     layer_name, layer.properties.id)

        layer_update = {
            "hasAttachments": svc_config.get("enable_attachments", True),
            "editorTrackingInfo": {
                "enableEditorTracking": True,
                "creatorField": "created_user",
                "creationDateField": "created_date",
                "editorField": "last_edited_user",
                "editDateField": "last_edited_date",
                "realm": "",
                "allowOthersToUpdate": True,
                "allowOthersToDelete": True,
            },
        }

        try:
            layer.manager.update_definition(layer_update)
            logger.debug("    Layer configured successfully")
        except Exception as exc:
            logger.error("    Failed to configure layer '%s': %s",
                         layer_name, exc)

    # ---- Configure tables ----
    logger.info("Configuring tables...")

    for table in flc.tables:
        table_name = table.properties.get("name", f"Table {table.properties.id}")
        logger.info("  Configuring table: %s (index %d)",
                     table_name, table.properties.id)

        table_update = {
            "editorTrackingInfo": {
                "enableEditorTracking": True,
                "creatorField": "created_user",
                "creationDateField": "created_date",
                "editorField": "last_edited_user",
                "editDateField": "last_edited_date",
                "realm": "",
                "allowOthersToUpdate": True,
                "allowOthersToDelete": True,
            },
        }

        try:
            table.manager.update_definition(table_update)
            logger.debug("    Table configured successfully")
        except Exception as exc:
            logger.error("    Failed to configure table '%s': %s",
                         table_name, exc)

    # ---- Set sharing ----
    logger.info("Setting sharing permissions...")
    try:
        feature_service_item.share(org=True, everyone=False, groups=[])
        logger.info("  Shared with organization")
    except Exception as exc:
        logger.error("  Failed to set sharing: %s", exc)

    logger.info("Service configuration complete")


def verify_service(flc, config, logger):
    """Verify the published service matches expectations.

    Checks that all expected layers and tables are present and that
    key properties are correctly configured.

    Args:
        flc: FeatureLayerCollection for the published service.
        config: Service configuration dict.
        logger: Logger instance.

    Returns:
        True if all checks pass.
    """
    logger.info("Verifying published service...")
    all_ok = True

    # Check layer count
    expected_layers = config.get("layer_indices", {})
    expected_tables = config.get("table_indices", {})

    actual_layer_count = len(flc.layers)
    actual_table_count = len(flc.tables)

    logger.info("  Expected layers: %d, Found: %d",
                len(expected_layers), actual_layer_count)
    logger.info("  Expected tables: %d, Found: %d",
                len(expected_tables), actual_table_count)

    if actual_layer_count < len(expected_layers):
        logger.warning("  MISMATCH: fewer layers than expected")
        all_ok = False

    if actual_table_count < len(expected_tables):
        logger.warning("  MISMATCH: fewer tables than expected")
        all_ok = False

    # Check capabilities
    svc_props = flc.properties
    capabilities = svc_props.get("capabilities", "")
    logger.info("  Service capabilities: %s", capabilities)

    required_caps = {"Query", "Create", "Update", "Delete", "Editing"}
    actual_caps = {c.strip() for c in capabilities.split(",")}
    missing_caps = required_caps - actual_caps
    if missing_caps:
        logger.warning("  Missing capabilities: %s", missing_caps)
        all_ok = False

    # Check editor tracking
    et_info = svc_props.get("editorTrackingInfo", {})
    if et_info.get("enableEditorTracking"):
        logger.info("  Editor tracking: ENABLED")
    else:
        logger.warning("  Editor tracking: DISABLED (expected enabled)")
        all_ok = False

    # List all layers and tables
    logger.info("  Published layers:")
    for layer in flc.layers:
        logger.info("    [%d] %s (%s)",
                     layer.properties.id,
                     layer.properties.name,
                     layer.properties.geometryType)

    logger.info("  Published tables:")
    for table in flc.tables:
        logger.info("    [%d] %s", table.properties.id, table.properties.name)

    if all_ok:
        logger.info("  Verification: ALL CHECKS PASSED")
    else:
        logger.warning("  Verification: SOME CHECKS FAILED")

    return all_ok


# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

def cleanup_temp_files(temp_dir, logger):
    """Remove temporary project files.

    Args:
        temp_dir: Path to the temporary directory to remove.
        logger: Logger instance.
    """
    if temp_dir and os.path.exists(temp_dir):
        try:
            shutil.rmtree(temp_dir)
            logger.info("Cleaned up temporary directory: %s", temp_dir)
        except OSError as exc:
            logger.warning("Could not remove temp directory: %s", exc)


# ---------------------------------------------------------------------------
# Main workflow
# ---------------------------------------------------------------------------

def publish(config, portal_url=None, username=None, password=None,
            workspace_override=None, log_dir=None):
    """Execute the full publish workflow.

    Steps:
        1. Connect to ArcGIS Enterprise portal.
        2. Create a project with all layers and tables.
        3. Generate and stage the service definition.
        4. Upload and publish the feature service.
        5. Configure editing, tracking, and sync.
        6. Verify the published service.

    Args:
        config: Parsed service_config.json dict.
        portal_url: Portal URL override (optional).
        username: Portal username override (optional).
        password: Portal password override (optional).
        workspace_override: Geodatabase workspace override (optional).
        log_dir: Log output directory (optional).

    Returns:
        URL of the published feature service, or None on failure.
    """
    logger = configure_logging(log_dir)
    logger.info("=" * 70)
    logger.info("ECMS Service Publisher - Starting")
    logger.info("=" * 70)

    temp_dir = None

    try:
        # Resolve configuration values
        portal_cfg = config.get("portal", {})
        gdb_cfg = config.get("geodatabase", {})

        effective_portal = portal_url or portal_cfg.get("url", "")
        effective_user = username or portal_cfg.get("username", "")
        effective_pass = password or portal_cfg.get("password", "")
        effective_profile = portal_cfg.get("profile", "")
        workspace = workspace_override or gdb_cfg.get("workspace", "")
        dataset_name = gdb_cfg.get("feature_dataset", "EnvironmentalCompliance")
        dataset_path = os.path.join(workspace, dataset_name)

        if not effective_portal:
            raise RuntimeError(
                "Portal URL is required. Set it in config or pass --portal-url."
            )
        if not workspace or not arcpy.Exists(workspace):
            raise RuntimeError(
                f"Geodatabase workspace not found: {workspace}"
            )

        # Step 1: Connect
        logger.info("-" * 50)
        logger.info("STEP 1: Connecting to portal")
        logger.info("-" * 50)
        gis = connect_to_portal(
            effective_portal, effective_user, effective_pass,
            effective_profile, logger
        )

        # Step 2: Create project
        logger.info("-" * 50)
        logger.info("STEP 2: Preparing map and layers")
        logger.info("-" * 50)
        table_list = [
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
        project_path, map_name, temp_dir = _create_project_and_map(
            workspace, dataset_path, table_list, config, logger
        )

        # Step 3: Create service definition
        logger.info("-" * 50)
        logger.info("STEP 3: Creating service definition")
        logger.info("-" * 50)
        sd_path = create_service_definition(
            project_path, map_name, config, logger
        )

        # Step 4: Upload and publish
        logger.info("-" * 50)
        logger.info("STEP 4: Publishing feature service")
        logger.info("-" * 50)
        flc, fs_item = upload_and_publish(gis, sd_path, config, logger)

        # Step 5: Configure
        logger.info("-" * 50)
        logger.info("STEP 5: Configuring service properties")
        logger.info("-" * 50)
        configure_service(flc, fs_item, config, gis, logger)

        # Step 6: Verify
        logger.info("-" * 50)
        logger.info("STEP 6: Verifying published service")
        logger.info("-" * 50)
        verify_service(flc, config, logger)

        service_url = fs_item.url
        logger.info("=" * 70)
        logger.info("Publishing complete.")
        logger.info("Service URL: %s", service_url)
        logger.info("Item ID:     %s", fs_item.id)
        logger.info("=" * 70)

        return service_url

    except Exception:
        logger.error("Publishing failed:\n%s", traceback.format_exc())
        return None

    finally:
        cleanup_temp_files(temp_dir, logger)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_arguments():
    """Parse command-line arguments.

    Returns:
        argparse.Namespace with parsed arguments.
    """
    parser = argparse.ArgumentParser(
        description="ECMS Feature Service Publisher",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python publish_services.py --config ../../config/service_config.json\n"
            "  python publish_services.py --config config.json "
            "--portal-url https://portal.example.com/portal\n"
            "  python publish_services.py --config config.json "
            "--username admin --password secret\n"
        ),
    )
    parser.add_argument(
        "--config", "-c",
        required=True,
        help="Path to service_config.json",
    )
    parser.add_argument(
        "--portal-url",
        default=None,
        help="ArcGIS Enterprise portal URL (overrides config)",
    )
    parser.add_argument(
        "--username", "-u",
        default=None,
        help="Portal username (overrides config)",
    )
    parser.add_argument(
        "--password", "-p",
        default=None,
        help="Portal password (overrides config)",
    )
    parser.add_argument(
        "--workspace", "-w",
        default=None,
        help="Geodatabase workspace path (overrides config)",
    )
    parser.add_argument(
        "--log-dir",
        default=None,
        help="Directory for log file output",
    )
    return parser.parse_args()


def main():
    """Main CLI entry point."""
    args = parse_arguments()

    try:
        config = load_config(args.config)
    except (FileNotFoundError, json.JSONDecodeError) as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        sys.exit(1)

    service_url = publish(
        config,
        portal_url=args.portal_url,
        username=args.username,
        password=args.password,
        workspace_override=args.workspace,
        log_dir=args.log_dir,
    )

    sys.exit(0 if service_url else 1)


if __name__ == "__main__":
    main()
