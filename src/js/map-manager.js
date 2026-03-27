/**
 * Map initialization and management for the Environmental Compliance Management System.
 * @module js/map-manager
 */

import { API, Fields, Defaults } from "../utils/constants.js";
import {
  createPermitRenderer,
  createStationRenderer,
  createBoundaryRenderer,
  createPermitLabelClass,
  arcadePopupContent,
  applyComplianceSymbology,
} from "./symbology-manager.js";

// ---------------------------------------------------------------------------
// Module State
// ---------------------------------------------------------------------------

/** @type {__esri.MapView|null} */
let _view = null;

/** @type {__esri.Map|null} */
let _map = null;

/** @type {Record<string, __esri.FeatureLayer>} */
const _layers = {};

/** @type {__esri.Sketch|null} */
let _sketcWidget = null;

/** @type {Function[]} Popup action handlers registered externally. */
const _actionHandlers = {};

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize the map view and all layers.
 * @param {string} containerId - DOM element id for the MapView.
 * @param {object} [options]
 * @param {string} [options.webMapId] - Portal WebMap item ID (optional; otherwise builds from scratch).
 * @param {string} [options.portalUrl] - Portal URL override.
 * @param {string} [options.featureServiceUrl] - Feature service URL override.
 * @returns {Promise<__esri.MapView>}
 */
export async function initMap(containerId, options = {}) {
  const [
    { default: MapMod },
    { default: MapView },
    { default: FeatureLayer },
    { default: WebMap },
    { default: Basemap },
  ] = await Promise.all([
    import("https://js.arcgis.com/4.28/@arcgis/core/Map.js"),
    import("https://js.arcgis.com/4.28/@arcgis/core/views/MapView.js"),
    import("https://js.arcgis.com/4.28/@arcgis/core/layers/FeatureLayer.js"),
    import("https://js.arcgis.com/4.28/@arcgis/core/WebMap.js"),
    import("https://js.arcgis.com/4.28/@arcgis/core/Basemap.js"),
  ]);

  const serviceUrl = options.featureServiceUrl ?? API.FEATURE_SERVICE_URL;

  // Either load from WebMap or build programmatically
  if (options.webMapId) {
    _map = new WebMap({
      portalItem: { id: options.webMapId, portal: { url: options.portalUrl ?? API.PORTAL_URL } },
    });
  } else {
    _map = new MapMod({ basemap: "topo-vector" });
  }

  _view = new MapView({
    container: containerId,
    map: _map,
    center: Defaults.MAP_CENTER,
    zoom: Defaults.MAP_ZOOM,
    popup: {
      dockEnabled: true,
      dockOptions: { breakpoint: false, position: "bottom-right" },
    },
  });

  // --- Add Feature Layers ---
  const layerDefs = [
    { key: "permits", index: API.LAYERS.PERMITS, title: "Environmental Permits", renderer: createPermitRenderer(), labels: [createPermitLabelClass()] },
    { key: "conditions", index: API.LAYERS.CONDITIONS, title: "Permit Conditions", visible: false },
    { key: "triggers", index: API.LAYERS.TRIGGERS, title: "Compliance Triggers", visible: false },
    { key: "alerts", index: API.LAYERS.ALERTS, title: "Alerts", visible: false },
    { key: "stations", index: API.LAYERS.MONITORING_STATIONS, title: "Monitoring Stations", renderer: createStationRenderer() },
    { key: "boundaries", index: API.LAYERS.COMPLIANCE_BOUNDARIES, title: "Compliance Boundaries", renderer: createBoundaryRenderer() },
    { key: "contacts", index: API.LAYERS.CONTACTS, title: "Contacts", visible: false },
    { key: "auditLog", index: API.LAYERS.AUDIT_LOG, title: "Audit Log", visible: false },
  ];

  for (const def of layerDefs) {
    const layerProps = {
      url: `${serviceUrl}/${def.index}`,
      title: def.title,
      outFields: ["*"],
      visible: def.visible !== false,
    };
    if (def.renderer) layerProps.renderer = def.renderer;
    if (def.labels) layerProps.labelingInfo = def.labels;

    const layer = new FeatureLayer(layerProps);
    _layers[def.key] = layer;
    _map.add(layer);
  }

  // Configure popups for permit layer
  _layers.permits.popupTemplate = createPermitPopup();

  // Configure popups for stations
  _layers.stations.popupTemplate = {
    title: "{StationName} ({StationID})",
    content: [
      { type: "fields", fieldInfos: [
        { fieldName: Fields.STATION_STATUS, label: "Status" },
        { fieldName: Fields.LAST_READING, label: "Last Reading" },
        { fieldName: Fields.LAST_READING_DATE, label: "Reading Date", format: { dateFormat: "short-date-short-time" } },
      ] },
    ],
  };

  await _view.when();

  // Add widgets
  await addWidgets(_view);

  // Wire popup action handler
  _view.popup.on("trigger-action", (event) => {
    const handler = _actionHandlers[event.action.id];
    if (handler) {
      const feature = _view.popup.selectedFeature;
      handler(feature, event);
    }
  });

  return _view;
}

// ---------------------------------------------------------------------------
// Popup Templates
// ---------------------------------------------------------------------------

/**
 * Create the rich popup template for the permits layer.
 * @returns {__esri.PopupTemplateProperties}
 */
function createPermitPopup() {
  return {
    title: "{PermitName} ({PermitID})",
    content: [
      {
        type: "expression",
        expressionInfo: {
          name: "compliance-details",
          title: "Compliance Details",
          expression: arcadePopupContent,
        },
      },
      {
        type: "fields",
        fieldInfos: [
          { fieldName: Fields.PERMIT_TYPE, label: "Type" },
          { fieldName: Fields.ISSUING_AGENCY, label: "Agency" },
          { fieldName: Fields.RESPONSIBLE_PARTY, label: "Responsible Party" },
          { fieldName: Fields.ISSUE_DATE, label: "Issue Date", format: { dateFormat: "short-date" } },
          { fieldName: Fields.EXPIRATION_DATE, label: "Expiration", format: { dateFormat: "short-date" } },
          { fieldName: Fields.NEXT_REVIEW_DATE, label: "Next Review", format: { dateFormat: "short-date" } },
          { fieldName: Fields.RISK_SCORE, label: "Risk Score", format: { digitSeparator: true, places: 0 } },
        ],
      },
    ],
    actions: [
      { id: "view-conditions", title: "View Conditions", icon: "list-check", type: "button" },
      { id: "run-compliance-check", title: "Run Compliance Check", icon: "check-circle", type: "button" },
      { id: "view-history", title: "View History", icon: "clock", type: "button" },
      { id: "edit-permit", title: "Edit Permit", icon: "pencil", type: "button" },
    ],
  };
}

// ---------------------------------------------------------------------------
// Widgets
// ---------------------------------------------------------------------------

/**
 * Add standard widgets to the view.
 * @param {__esri.MapView} view
 */
async function addWidgets(view) {
  const [
    { default: Home },
    { default: Zoom },
    { default: Compass },
    { default: ScaleBar },
    { default: Legend },
    { default: Search },
    { default: Sketch },
    { default: GraphicsLayer },
  ] = await Promise.all([
    import("https://js.arcgis.com/4.28/@arcgis/core/widgets/Home.js"),
    import("https://js.arcgis.com/4.28/@arcgis/core/widgets/Zoom.js"),
    import("https://js.arcgis.com/4.28/@arcgis/core/widgets/Compass.js"),
    import("https://js.arcgis.com/4.28/@arcgis/core/widgets/ScaleBar.js"),
    import("https://js.arcgis.com/4.28/@arcgis/core/widgets/Legend.js"),
    import("https://js.arcgis.com/4.28/@arcgis/core/widgets/Search.js"),
    import("https://js.arcgis.com/4.28/@arcgis/core/widgets/Sketch.js"),
    import("https://js.arcgis.com/4.28/@arcgis/core/layers/GraphicsLayer.js"),
  ]);

  // Home
  view.ui.add(new Home({ view }), "top-left");

  // Zoom
  view.ui.add(new Zoom({ view }), "top-left");

  // Compass
  view.ui.add(new Compass({ view }), "top-left");

  // Scale bar
  view.ui.add(new ScaleBar({ view, unit: "dual" }), "bottom-left");

  // Legend
  const legend = new Legend({ view });
  view.ui.add(legend, "bottom-right");

  // Search – configured to search permits
  const search = new Search({
    view,
    includeDefaultSources: true,
    sources: [
      {
        layer: _layers.permits,
        searchFields: [Fields.PERMIT_ID, Fields.PERMIT_NAME, Fields.ISSUING_AGENCY],
        displayField: Fields.PERMIT_NAME,
        exactMatch: false,
        outFields: ["*"],
        name: "Permits",
        placeholder: "Search permits by ID, name, or agency",
      },
    ],
  });
  view.ui.add(search, "top-right");

  // Sketch for creating permit boundaries
  const sketchLayer = new GraphicsLayer({ title: "Sketched Boundaries" });
  view.map.add(sketchLayer);

  _sketcWidget = new Sketch({
    view,
    layer: sketchLayer,
    creationMode: "single",
    availableCreateTools: ["polygon", "rectangle", "circle"],
    visibleElements: {
      createTools: { point: false, polyline: false },
      selectionTools: { "lasso-selection": false, "rectangle-selection": false },
    },
  });
  view.ui.add(_sketcWidget, "top-right");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the current MapView.
 * @returns {__esri.MapView|null}
 */
export function getView() {
  return _view;
}

/**
 * Get a layer by key name.
 * @param {string} key - One of: permits, conditions, triggers, alerts, stations, boundaries, contacts, auditLog.
 * @returns {__esri.FeatureLayer|undefined}
 */
export function getLayer(key) {
  return _layers[key];
}

/**
 * Get all layers.
 * @returns {Record<string, __esri.FeatureLayer>}
 */
export function getAllLayers() {
  return { ..._layers };
}

/**
 * Toggle layer visibility.
 * @param {string} key
 * @param {boolean} [visible]
 */
export function toggleLayer(key, visible) {
  const layer = _layers[key];
  if (layer) {
    layer.visible = visible ?? !layer.visible;
  }
}

/**
 * Register a handler for a popup action.
 * @param {string} actionId
 * @param {(feature: __esri.Graphic, event: any) => void} handler
 */
export function onPopupAction(actionId, handler) {
  _actionHandlers[actionId] = handler;
}

/**
 * Zoom the view to a specific feature or geometry.
 * @param {__esri.Geometry|__esri.Graphic} target
 * @param {object} [options]
 */
export async function zoomTo(target, options = {}) {
  if (!_view) return;
  await _view.goTo(target, { duration: 800, ...options });
}

/**
 * Highlight features on a layer view.
 * @param {string} layerKey
 * @param {number[]} objectIds
 * @returns {Promise<__esri.Handle|null>}
 */
export async function highlightFeatures(layerKey, objectIds) {
  if (!_view || !_layers[layerKey]) return null;
  const layerView = await _view.whenLayerView(_layers[layerKey]);
  return layerView.highlight(objectIds);
}

/**
 * Refresh a layer by re-querying.
 * @param {string} layerKey
 */
export function refreshLayer(layerKey) {
  _layers[layerKey]?.refresh();
}

/**
 * Export the current map view as a printable image / screenshot.
 * @returns {Promise<string>} Data URL of the screenshot.
 */
export async function exportMapImage() {
  if (!_view) throw new Error("MapView not initialized.");
  const screenshot = await _view.takeScreenshot({ format: "png", quality: 90 });
  return screenshot.dataUrl;
}

/**
 * Get the Sketch widget instance for external use.
 * @returns {__esri.Sketch|null}
 */
export function getSketchWidget() {
  return _sketcWidget;
}

/**
 * Refresh all layers.
 */
export function refreshLayers() {
  for (const layer of Object.values(_layers)) {
    layer.refresh();
  }
}

/**
 * Search features across the permits layer.
 * @param {string} query
 * @returns {Promise<__esri.Graphic[]>}
 */
export async function searchFeatures(query) {
  const layer = _layers.permits;
  if (!layer) return [];
  const result = await layer.queryFeatures({
    where: `${Fields.PERMIT_NAME} LIKE '%${query.replace(/'/g, "''")}%' OR ${Fields.PERMIT_ID} LIKE '%${query.replace(/'/g, "''")}%' OR ${Fields.ISSUING_AGENCY} LIKE '%${query.replace(/'/g, "''")}%'`,
    outFields: ["*"],
    returnGeometry: true,
  });
  return result.features || [];
}

/**
 * Zoom to a specific feature and open its popup.
 * @param {__esri.Graphic} feature
 */
export async function zoomToFeature(feature) {
  if (!_view || !feature?.geometry) return;
  await _view.goTo({ target: feature.geometry, zoom: 14 }, { duration: 800 });
}

/**
 * Open the popup for a feature.
 * @param {__esri.Graphic} feature
 */
export function openPopup(feature) {
  if (!_view || !feature) return;
  _view.popup.open({ features: [feature], location: feature.geometry });
}

/**
 * Filter the permits layer by compliance status.
 * @param {string|null} status - Status value or null to clear filter.
 */
export function filterByStatus(status) {
  const layer = _layers.permits;
  if (!layer) return;
  layer.definitionExpression = status
    ? `${Fields.COMPLIANCE_STATUS} = '${status}'`
    : "";
}

/**
 * Zoom to a permit by its ID.
 * @param {string} permitId
 */
export async function zoomToPermit(permitId) {
  const layer = _layers.permits;
  if (!_view || !layer) return;
  const result = await layer.queryFeatures({
    where: `${Fields.PERMIT_ID} = '${permitId.replace(/'/g, "''")}'`,
    outFields: ["*"],
    returnGeometry: true,
  });
  if (result.features?.length > 0) {
    await zoomToFeature(result.features[0]);
    openPopup(result.features[0]);
  }
}

/**
 * Destroy the map view and release resources.
 */
export function destroy() {
  if (_view) {
    _view.destroy();
    _view = null;
  }
  _map = null;
}

/**
 * Apply compliance symbology to all applicable layer views.
 */
export async function applyAllSymbology() {
  if (!_view) return;
  for (const layer of Object.values(_layers)) {
    try {
      const lv = await _view.whenLayerView(layer);
      applyComplianceSymbology(lv);
    } catch {
      // Layer may not be loaded yet
    }
  }
}
