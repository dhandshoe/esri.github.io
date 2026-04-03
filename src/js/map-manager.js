/**
 * Map initialization and management for the Environmental Compliance Management System.
 * Uses the AMD require() from the ArcGIS JS API 4.29 script tag loaded in app.html.
 * @module js/map-manager
 */

import { API, Fields, Defaults } from "../utils/constants.js";

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
let _sketchWidget = null;

/** @type {Record<string, Function>} Popup action handlers registered externally. */
const _actionHandlers = {};

// ---------------------------------------------------------------------------
// AMD Module Loader Helper
// ---------------------------------------------------------------------------

/**
 * Load ArcGIS AMD modules via the global require() provided by the API script tag.
 * @param {string[]} moduleIds - e.g. ["esri/Map", "esri/views/MapView"]
 * @returns {Promise<any[]>}
 */
function loadModules(moduleIds) {
  return new Promise((resolve, reject) => {
    if (typeof window.require !== "function") {
      reject(new Error("ArcGIS JS API not loaded. Ensure the script tag is present in app.html."));
      return;
    }
    window.require(moduleIds, (...modules) => resolve(modules), (err) => reject(err));
  });
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize the map view and all layers.
 * @param {string} containerId - DOM element id for the MapView.
 * @param {object} [options]
 * @param {string} [options.webMapId] - Portal WebMap item ID (optional).
 * @param {string} [options.portalUrl] - Portal URL override.
 * @param {string} [options.featureServiceUrl] - Feature service URL override.
 * @returns {Promise<__esri.MapView>}
 */
export async function initMap(containerId, options = {}) {
  const [Map, MapView, FeatureLayer, WebMap] = await loadModules([
    "esri/Map",
    "esri/views/MapView",
    "esri/layers/FeatureLayer",
    "esri/WebMap",
  ]);

  const config = window.__ECMS_CONFIG || {};
  const serviceUrl = options.featureServiceUrl || config.featureServiceUrl || API.FEATURE_SERVICE_URL;

  // Either load from WebMap or build programmatically
  if (options.webMapId) {
    _map = new WebMap({
      portalItem: {
        id: options.webMapId,
        portal: { url: options.portalUrl || config.portalUrl || API.PORTAL_URL },
      },
    });
  } else {
    _map = new Map({ basemap: "topo-vector" });
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

  // --- Add Feature Layers (gracefully handle failures) ---
  const layerDefs = [
    { key: "permits", index: API.LAYERS.PERMITS, title: "Environmental Permits" },
    { key: "conditions", index: API.LAYERS.CONDITIONS, title: "Permit Conditions", visible: false },
    { key: "triggers", index: API.LAYERS.TRIGGERS, title: "Compliance Triggers", visible: false },
    { key: "alerts", index: API.LAYERS.ALERTS, title: "Alerts", visible: false },
    { key: "stations", index: API.LAYERS.MONITORING_STATIONS, title: "Monitoring Stations" },
    { key: "boundaries", index: API.LAYERS.COMPLIANCE_BOUNDARIES, title: "Compliance Boundaries" },
    { key: "contacts", index: API.LAYERS.CONTACTS, title: "Contacts", visible: false },
    { key: "auditLog", index: API.LAYERS.AUDIT_LOG, title: "Audit Log", visible: false },
  ];

  for (const def of layerDefs) {
    try {
      const layer = new FeatureLayer({
        url: `${serviceUrl}/${def.index}`,
        title: def.title,
        outFields: ["*"],
        visible: def.visible !== false,
      });
      _layers[def.key] = layer;
      _map.add(layer);
    } catch (err) {
      console.warn(`ECMS: Could not add layer "${def.title}":`, err.message);
    }
  }

  // Configure popups for permit layer
  if (_layers.permits) {
    _layers.permits.popupTemplate = createPermitPopup();
  }

  // Configure popups for stations
  if (_layers.stations) {
    _layers.stations.popupTemplate = {
      title: "{StationName} ({StationID})",
      content: [
        {
          type: "fields",
          fieldInfos: [
            { fieldName: Fields.STATION_STATUS, label: "Status" },
            { fieldName: Fields.LAST_READING, label: "Last Reading" },
            { fieldName: Fields.LAST_READING_DATE, label: "Reading Date", format: { dateFormat: "short-date-short-time" } },
          ],
        },
      ],
    };
  }

  await _view.when();

  // Add widgets
  await addWidgets(_view);

  // Wire popup action handler
  if (_view.popup && typeof _view.popup.on === "function") {
    _view.popup.on("trigger-action", (event) => {
      const handler = _actionHandlers[event.action.id];
      if (handler) {
        handler(_view.popup.selectedFeature, event);
      }
    });
  }

  return _view;
}

// ---------------------------------------------------------------------------
// Popup Templates
// ---------------------------------------------------------------------------

function createPermitPopup() {
  return {
    title: "{PermitName} ({PermitID})",
    content: [
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

async function addWidgets(view) {
  const [Home, Zoom, Compass, ScaleBar, Legend, Search, Sketch, GraphicsLayer] = await loadModules([
    "esri/widgets/Home",
    "esri/widgets/Zoom",
    "esri/widgets/Compass",
    "esri/widgets/ScaleBar",
    "esri/widgets/Legend",
    "esri/widgets/Search",
    "esri/widgets/Sketch",
    "esri/layers/GraphicsLayer",
  ]);

  view.ui.add(new Home({ view }), "top-left");
  view.ui.add(new Zoom({ view }), "top-left");
  view.ui.add(new Compass({ view }), "top-left");
  view.ui.add(new ScaleBar({ view, unit: "dual" }), "bottom-left");
  view.ui.add(new Legend({ view }), "bottom-right");

  // Search – configured to search permits if layer exists
  const searchSources = [];
  if (_layers.permits) {
    searchSources.push({
      layer: _layers.permits,
      searchFields: [Fields.PERMIT_ID, Fields.PERMIT_NAME, Fields.ISSUING_AGENCY],
      displayField: Fields.PERMIT_NAME,
      exactMatch: false,
      outFields: ["*"],
      name: "Permits",
      placeholder: "Search permits by ID, name, or agency",
    });
  }

  const search = new Search({
    view,
    includeDefaultSources: true,
    sources: searchSources,
  });
  view.ui.add(search, "top-right");

  // Sketch for creating permit boundaries
  const sketchLayer = new GraphicsLayer({ title: "Sketched Boundaries" });
  view.map.add(sketchLayer);

  _sketchWidget = new Sketch({
    view,
    layer: sketchLayer,
    creationMode: "single",
    availableCreateTools: ["polygon", "rectangle", "circle"],
    visibleElements: {
      createTools: { point: false, polyline: false },
      selectionTools: { "lasso-selection": false, "rectangle-selection": false },
    },
  });
  view.ui.add(_sketchWidget, "top-right");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getView() {
  return _view;
}

export function getLayer(key) {
  return _layers[key];
}

export function getAllLayers() {
  return { ..._layers };
}

export function toggleLayer(key, visible) {
  const layer = _layers[key];
  if (layer) {
    layer.visible = visible ?? !layer.visible;
  }
}

export function onPopupAction(actionId, handler) {
  _actionHandlers[actionId] = handler;
}

export async function zoomTo(target, options = {}) {
  if (!_view) return;
  await _view.goTo(target, { duration: 800, ...options });
}

export async function highlightFeatures(layerKey, objectIds) {
  if (!_view || !_layers[layerKey]) return null;
  try {
    const layerView = await _view.whenLayerView(_layers[layerKey]);
    return layerView.highlight(objectIds);
  } catch {
    return null;
  }
}

export function refreshLayer(layerKey) {
  _layers[layerKey]?.refresh();
}

export async function exportMapImage() {
  if (!_view) throw new Error("MapView not initialized.");
  const screenshot = await _view.takeScreenshot({ format: "png", quality: 90 });
  return screenshot.dataUrl;
}

export function getSketchWidget() {
  return _sketchWidget;
}

export function refreshLayers() {
  for (const layer of Object.values(_layers)) {
    try { layer.refresh(); } catch { /* layer may not be loaded */ }
  }
}

export async function searchFeatures(query) {
  const layer = _layers.permits;
  if (!layer) return [];
  try {
    const escaped = query.replace(/'/g, "''");
    const result = await layer.queryFeatures({
      where: `${Fields.PERMIT_NAME} LIKE '%${escaped}%' OR ${Fields.PERMIT_ID} LIKE '%${escaped}%' OR ${Fields.ISSUING_AGENCY} LIKE '%${escaped}%'`,
      outFields: ["*"],
      returnGeometry: true,
    });
    return result.features || [];
  } catch {
    return [];
  }
}

export async function zoomToFeature(feature) {
  if (!_view || !feature?.geometry) return;
  await _view.goTo({ target: feature.geometry, zoom: 14 }, { duration: 800 });
}

export function openPopup(feature) {
  if (!_view || !feature) return;
  _view.popup.open({ features: [feature], location: feature.geometry });
}

export function filterByStatus(status) {
  const layer = _layers.permits;
  if (!layer) return;
  layer.definitionExpression = status
    ? `${Fields.COMPLIANCE_STATUS} = '${status}'`
    : "";
}

export async function zoomToPermit(permitId) {
  const layer = _layers.permits;
  if (!_view || !layer) return;
  try {
    const result = await layer.queryFeatures({
      where: `${Fields.PERMIT_ID} = '${permitId.replace(/'/g, "''")}'`,
      outFields: ["*"],
      returnGeometry: true,
    });
    if (result.features?.length > 0) {
      await zoomToFeature(result.features[0]);
      openPopup(result.features[0]);
    }
  } catch {
    console.warn("ECMS: Could not zoom to permit", permitId);
  }
}

export function destroy() {
  if (_view) {
    _view.destroy();
    _view = null;
  }
  _map = null;
}

export async function applyAllSymbology() {
  if (!_view) return;
  // Dynamic import of symbology to avoid circular dependency at load time
  try {
    const { applyComplianceSymbology } = await import("./symbology-manager.js");
    for (const layer of Object.values(_layers)) {
      try {
        const lv = await _view.whenLayerView(layer);
        applyComplianceSymbology(lv);
      } catch { /* layer may not be loaded */ }
    }
  } catch { /* symbology module not available */ }
}
