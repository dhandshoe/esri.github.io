/**
 * "Knowledge Graph Lite" – force-directed relationship graph visualization.
 * Uses Canvas API with interactive nodes, zoom/pan, mini-map, and export.
 * @module js/relationship-graph
 */

import { NodeType, NodeColors, Fields, API } from "../utils/constants.js";
import * as apiService from "../services/api-service.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PHYSICS = {
  REPULSION: 5000,
  ATTRACTION: 0.005,
  DAMPING: 0.85,
  MAX_VELOCITY: 8,
  IDEAL_LENGTH: 150,
  ITERATIONS_PER_FRAME: 3,
};

const NODE_RADIUS = 22;
const LABEL_FONT = '11px "Avenir Next", sans-serif';

// ---------------------------------------------------------------------------
// Data Structures
// ---------------------------------------------------------------------------

/**
 * @typedef {{ id: string, type: string, label: string, x: number, y: number, vx: number, vy: number, data?: object }} GraphNode
 * @typedef {{ source: string, target: string, label: string }} GraphEdge
 */

// ---------------------------------------------------------------------------
// Module State
// ---------------------------------------------------------------------------

let _container = null;
let _canvas = null;
let _miniCanvas = null;
let _ctx = null;
let _miniCtx = null;

/** @type {GraphNode[]} */
let _nodes = [];
/** @type {GraphEdge[]} */
let _edges = [];

let _animFrame = null;
let _zoom = 1;
let _panX = 0;
let _panY = 0;
let _dragging = null;
let _isPanning = false;
let _lastMouse = { x: 0, y: 0 };
let _hoveredNode = null;
let _onNodeClick = null;
let _settled = false;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize the relationship graph.
 * @param {HTMLElement} container
 * @param {object} [options]
 * @param {Function} [options.onNodeClick] - Callback when a node is clicked.
 */
export function init(container, options = {}) {
  _container = container;
  _onNodeClick = options.onNodeClick ?? null;
  render();
}

function render() {
  if (!_container) return;

  _container.innerHTML = `
    <div class="graph-container" id="graph-root">
      <!-- Toolbar -->
      <div class="graph-toolbar">
        <calcite-button id="graph-zoom-in" icon-start="plus" appearance="outline" scale="s" round></calcite-button>
        <calcite-button id="graph-zoom-out" icon-start="minus" appearance="outline" scale="s" round></calcite-button>
        <calcite-button id="graph-fit" icon-start="extent" appearance="outline" scale="s" round></calcite-button>
        <calcite-button id="graph-export" icon-start="image" appearance="outline" scale="s" round></calcite-button>
      </div>

      <!-- Legend -->
      <div class="graph-legend">
        ${Object.entries(NodeColors).map(([type, color]) => `
          <div class="graph-legend-item">
            <div class="graph-legend-swatch" style="background:${color};"></div>
            <span>${type}</span>
          </div>
        `).join("")}
      </div>

      <!-- Filter -->
      <div style="position:absolute;bottom:8px;left:8px;z-index:2;">
        <calcite-input id="graph-filter" placeholder="Filter by permit ID..." scale="s" icon="search" clearable style="width:200px;"></calcite-input>
      </div>

      <!-- Canvases -->
      <canvas id="graph-canvas"></canvas>
      <canvas id="graph-minimap" class="graph-minimap"></canvas>
    </div>
  `;

  _canvas = _container.querySelector("#graph-canvas");
  _miniCanvas = _container.querySelector("#graph-minimap");
  _ctx = _canvas.getContext("2d");
  _miniCtx = _miniCanvas.getContext("2d");

  resizeCanvas();
  bindEvents();
}

function resizeCanvas() {
  const root = _container.querySelector("#graph-root");
  if (!root || !_canvas) return;

  const rect = root.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  _canvas.width = rect.width * dpr;
  _canvas.height = rect.height * dpr;
  _canvas.style.width = rect.width + "px";
  _canvas.style.height = rect.height + "px";
  _ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Mini-map
  _miniCanvas.width = 160 * dpr;
  _miniCanvas.height = 100 * dpr;
  _miniCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ---------------------------------------------------------------------------
// Event Binding
// ---------------------------------------------------------------------------

function bindEvents() {
  _container.querySelector("#graph-zoom-in")?.addEventListener("click", () => { _zoom *= 1.2; draw(); });
  _container.querySelector("#graph-zoom-out")?.addEventListener("click", () => { _zoom /= 1.2; draw(); });
  _container.querySelector("#graph-fit")?.addEventListener("click", fitToView);
  _container.querySelector("#graph-export")?.addEventListener("click", exportImage);
  _container.querySelector("#graph-filter")?.addEventListener("calciteInputInput", (e) => handleFilter(e.target.value));

  if (!_canvas) return;

  _canvas.addEventListener("mousedown", onMouseDown);
  _canvas.addEventListener("mousemove", onMouseMove);
  _canvas.addEventListener("mouseup", onMouseUp);
  _canvas.addEventListener("mouseleave", onMouseUp);
  _canvas.addEventListener("wheel", onWheel, { passive: false });
  _canvas.addEventListener("dblclick", onDblClick);

  window.addEventListener("resize", () => { resizeCanvas(); draw(); });
}

// ---------------------------------------------------------------------------
// Mouse Interaction
// ---------------------------------------------------------------------------

function screenToWorld(sx, sy) {
  return {
    x: (sx - _panX) / _zoom,
    y: (sy - _panY) / _zoom,
  };
}

function findNodeAt(sx, sy) {
  const { x, y } = screenToWorld(sx, sy);
  return _nodes.find((n) => Math.hypot(n.x - x, n.y - y) <= NODE_RADIUS);
}

function onMouseDown(e) {
  const rect = _canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const node = findNodeAt(sx, sy);

  if (node) {
    _dragging = node;
    _canvas.style.cursor = "grabbing";
  } else {
    _isPanning = true;
    _lastMouse = { x: e.clientX, y: e.clientY };
    _canvas.style.cursor = "grabbing";
  }
}

function onMouseMove(e) {
  const rect = _canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;

  if (_dragging) {
    const { x, y } = screenToWorld(sx, sy);
    _dragging.x = x;
    _dragging.y = y;
    _dragging.vx = 0;
    _dragging.vy = 0;
    draw();
  } else if (_isPanning) {
    _panX += e.clientX - _lastMouse.x;
    _panY += e.clientY - _lastMouse.y;
    _lastMouse = { x: e.clientX, y: e.clientY };
    draw();
  } else {
    const node = findNodeAt(sx, sy);
    _hoveredNode = node;
    _canvas.style.cursor = node ? "pointer" : "grab";
    draw();
  }
}

function onMouseUp() {
  if (_dragging && _onNodeClick && !_isPanning) {
    // Treat as click if didn't move much
  }
  _dragging = null;
  _isPanning = false;
  _canvas.style.cursor = "grab";
}

function onWheel(e) {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  const rect = _canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  // Zoom toward mouse position
  _panX = mx - (mx - _panX) * delta;
  _panY = my - (my - _panY) * delta;
  _zoom *= delta;
  _zoom = Math.max(0.1, Math.min(5, _zoom));
  draw();
}

function onDblClick(e) {
  const rect = _canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const node = findNodeAt(sx, sy);
  if (node && _onNodeClick) {
    _onNodeClick(node);
  }
}

// ---------------------------------------------------------------------------
// Physics / Layout
// ---------------------------------------------------------------------------

function runPhysics() {
  const N = _nodes.length;

  for (let iter = 0; iter < PHYSICS.ITERATIONS_PER_FRAME; iter++) {
    // Repulsion (all pairs)
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const a = _nodes[i];
        const b = _nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy) || 1;
        const force = PHYSICS.REPULSION / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }

    // Attraction (edges)
    for (const edge of _edges) {
      const a = _nodes.find((n) => n.id === edge.source);
      const b = _nodes.find((n) => n.id === edge.target);
      if (!a || !b) continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dist = Math.hypot(dx, dy) || 1;
      const force = (dist - PHYSICS.IDEAL_LENGTH) * PHYSICS.ATTRACTION;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    // Apply velocity + damping
    let totalV = 0;
    for (const n of _nodes) {
      if (n === _dragging) continue;
      n.vx *= PHYSICS.DAMPING;
      n.vy *= PHYSICS.DAMPING;
      n.vx = Math.max(-PHYSICS.MAX_VELOCITY, Math.min(PHYSICS.MAX_VELOCITY, n.vx));
      n.vy = Math.max(-PHYSICS.MAX_VELOCITY, Math.min(PHYSICS.MAX_VELOCITY, n.vy));
      n.x += n.vx;
      n.y += n.vy;
      totalV += Math.abs(n.vx) + Math.abs(n.vy);
    }

    _settled = totalV < 0.5;
  }
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function draw() {
  if (!_ctx || !_canvas) return;

  const w = _canvas.clientWidth;
  const h = _canvas.clientHeight;

  _ctx.clearRect(0, 0, w, h);
  _ctx.save();
  _ctx.translate(_panX, _panY);
  _ctx.scale(_zoom, _zoom);

  // Edges
  for (const edge of _edges) {
    const a = _nodes.find((n) => n.id === edge.source);
    const b = _nodes.find((n) => n.id === edge.target);
    if (!a || !b) continue;

    _ctx.beginPath();
    _ctx.moveTo(a.x, a.y);
    _ctx.lineTo(b.x, b.y);
    _ctx.strokeStyle = "#ccc";
    _ctx.lineWidth = 1.5;
    _ctx.stroke();

    // Edge label
    if (edge.label) {
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      _ctx.fillStyle = "#999";
      _ctx.font = '9px "Avenir Next", sans-serif';
      _ctx.textAlign = "center";
      _ctx.textBaseline = "middle";
      _ctx.fillText(edge.label, mx, my - 6);
    }
  }

  // Nodes
  for (const node of _nodes) {
    const color = NodeColors[node.type] || "#666";
    const isHovered = node === _hoveredNode;

    _ctx.save();
    _ctx.translate(node.x, node.y);

    // Shadow for hovered
    if (isHovered) {
      _ctx.shadowColor = color;
      _ctx.shadowBlur = 12;
    }

    drawNodeShape(_ctx, node.type, NODE_RADIUS, color, isHovered);
    _ctx.restore();

    // Label below
    _ctx.fillStyle = "#333";
    _ctx.font = LABEL_FONT;
    _ctx.textAlign = "center";
    _ctx.textBaseline = "top";
    const label = node.label.length > 18 ? node.label.substring(0, 16) + "..." : node.label;
    _ctx.fillText(label, node.x, node.y + NODE_RADIUS + 4);
  }

  _ctx.restore();

  drawMiniMap(w, h);
}

/**
 * Draw a shaped node based on type.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} type
 * @param {number} r - Radius
 * @param {string} color
 * @param {boolean} highlight
 */
function drawNodeShape(ctx, type, r, color, highlight) {
  ctx.beginPath();

  switch (type) {
    case NodeType.PERMIT: // Hexagon
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        const x = r * Math.cos(angle);
        const y = r * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      break;

    case NodeType.CONDITION: // Rectangle
      ctx.rect(-r * 0.9, -r * 0.7, r * 1.8, r * 1.4);
      break;

    case NodeType.TRIGGER: // Diamond
      ctx.moveTo(0, -r);
      ctx.lineTo(r, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r, 0);
      ctx.closePath();
      break;

    case NodeType.ALERT: // Triangle
      ctx.moveTo(0, -r);
      ctx.lineTo(r, r * 0.7);
      ctx.lineTo(-r, r * 0.7);
      ctx.closePath();
      break;

    case NodeType.CONTACT: // Person icon (circle head + body arc)
      ctx.arc(0, -r * 0.3, r * 0.35, 0, 2 * Math.PI);
      ctx.moveTo(-r * 0.6, r * 0.8);
      ctx.quadraticCurveTo(-r * 0.6, 0, 0, r * 0.05);
      ctx.quadraticCurveTo(r * 0.6, 0, r * 0.6, r * 0.8);
      ctx.lineTo(-r * 0.6, r * 0.8);
      ctx.closePath();
      break;

    default: // Circle (Asset)
      ctx.arc(0, 0, r, 0, 2 * Math.PI);
      break;
  }

  ctx.fillStyle = highlight ? color : hexToRgba(color, 0.8);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = highlight ? 3 : 1.5;
  ctx.stroke();

  // Inner icon letter
  ctx.fillStyle = "#fff";
  ctx.font = 'bold 12px "Avenir Next", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(type.charAt(0), 0, type === NodeType.ALERT ? 2 : 0);
}

function drawMiniMap(mainW, mainH) {
  if (!_miniCtx || !_nodes.length) return;

  const mw = 160;
  const mh = 100;
  _miniCtx.clearRect(0, 0, mw, mh);
  _miniCtx.fillStyle = "rgba(255,255,255,0.9)";
  _miniCtx.fillRect(0, 0, mw, mh);

  // Compute bounds
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of _nodes) {
    minX = Math.min(minX, n.x);
    maxX = Math.max(maxX, n.x);
    minY = Math.min(minY, n.y);
    maxY = Math.max(maxY, n.y);
  }
  const pad = 50;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const scale = Math.min(mw / rangeX, mh / rangeY);

  // Edges
  _miniCtx.strokeStyle = "#ddd";
  _miniCtx.lineWidth = 0.5;
  for (const edge of _edges) {
    const a = _nodes.find((n) => n.id === edge.source);
    const b = _nodes.find((n) => n.id === edge.target);
    if (!a || !b) continue;
    _miniCtx.beginPath();
    _miniCtx.moveTo((a.x - minX) * scale, (a.y - minY) * scale);
    _miniCtx.lineTo((b.x - minX) * scale, (b.y - minY) * scale);
    _miniCtx.stroke();
  }

  // Nodes
  for (const n of _nodes) {
    _miniCtx.beginPath();
    _miniCtx.arc((n.x - minX) * scale, (n.y - minY) * scale, 2, 0, 2 * Math.PI);
    _miniCtx.fillStyle = NodeColors[n.type] || "#666";
    _miniCtx.fill();
  }

  // Viewport rectangle
  const vx = (-_panX / _zoom - minX) * scale;
  const vy = (-_panY / _zoom - minY) * scale;
  const vw = (mainW / _zoom) * scale;
  const vh = (mainH / _zoom) * scale;
  _miniCtx.strokeStyle = "#0077b6";
  _miniCtx.lineWidth = 1.5;
  _miniCtx.strokeRect(vx, vy, vw, vh);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load graph data for a specific permit and its relationships.
 * @param {string} permitId
 */
export async function loadForPermit(permitId) {
  _nodes = [];
  _edges = [];

  try {
    // Fetch permit
    const permits = await apiService.queryAllFeatures(API.LAYERS.PERMITS, {
      where: `${Fields.PERMIT_ID}='${permitId}'`,
    });

    if (!permits.length) return;

    const pa = permits[0].attributes;
    addNode(pa[Fields.PERMIT_ID], NodeType.PERMIT, pa[Fields.PERMIT_NAME] || pa[Fields.PERMIT_ID], pa);

    // Conditions
    const conditions = await apiService.getConditionsForPermit(permitId);
    for (const c of conditions) {
      const ca = c.attributes;
      const cid = ca[Fields.CONDITION_ID];
      addNode(cid, NodeType.CONDITION, ca[Fields.CONDITION_TEXT]?.substring(0, 30) || cid, ca);
      addEdge(permitId, cid, "has condition");

      // Triggers
      const triggers = await apiService.getTriggersForCondition(cid);
      for (const t of triggers) {
        const ta = t.attributes;
        const tid = ta[Fields.TRIGGER_ID];
        addNode(tid, NodeType.TRIGGER, `${ta[Fields.TRIGGER_FIELD]} ${ta[Fields.TRIGGER_OPERATOR]} ${ta[Fields.TRIGGER_VALUE]}`, ta);
        addEdge(cid, tid, "checked by");
      }
    }

    // Alerts
    const alerts = await apiService.getAlertsForPermit(permitId);
    for (const a of alerts) {
      const aa = a.attributes;
      const aid = aa[Fields.ALERT_ID] || String(aa[Fields.OBJECTID]);
      addNode(aid, NodeType.ALERT, aa[Fields.ALERT_MESSAGE]?.substring(0, 30) || aid, aa);
      addEdge(permitId, aid, "generated");
    }

    // Initial layout
    positionNodes();
    startSimulation();
  } catch (err) {
    console.error("Failed to load graph data:", err);
  }
}

/**
 * Set graph data directly.
 * @param {GraphNode[]} nodes
 * @param {GraphEdge[]} edges
 */
export function setData(nodes, edges) {
  _nodes = nodes;
  _edges = edges;
  positionNodes();
  startSimulation();
}

/**
 * Fit the view to show all nodes.
 */
export function fitToView() {
  if (!_nodes.length || !_canvas) return;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of _nodes) {
    minX = Math.min(minX, n.x);
    maxX = Math.max(maxX, n.x);
    minY = Math.min(minY, n.y);
    maxY = Math.max(maxY, n.y);
  }

  const pad = 60;
  const w = _canvas.clientWidth;
  const h = _canvas.clientHeight;
  const rangeX = (maxX - minX + 2 * pad) || 1;
  const rangeY = (maxY - minY + 2 * pad) || 1;
  _zoom = Math.min(w / rangeX, h / rangeY, 2);
  _panX = w / 2 - ((minX + maxX) / 2) * _zoom;
  _panY = h / 2 - ((minY + maxY) / 2) * _zoom;
  draw();
}

/**
 * Export the graph as a PNG data URL.
 * @returns {string}
 */
export function exportImage() {
  if (!_canvas) return "";
  const dataUrl = _canvas.toDataURL("image/png");
  // Trigger download
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = "relationship-graph.png";
  a.click();
  return dataUrl;
}

/**
 * Destroy and clean up.
 */
export function destroy() {
  if (_animFrame) cancelAnimationFrame(_animFrame);
  _animFrame = null;
  _nodes = [];
  _edges = [];
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

function addNode(id, type, label, data) {
  if (_nodes.find((n) => n.id === id)) return;
  _nodes.push({ id, type, label, x: 0, y: 0, vx: 0, vy: 0, data });
}

function addEdge(source, target, label = "") {
  if (_edges.find((e) => e.source === source && e.target === target)) return;
  _edges.push({ source, target, label });
}

function positionNodes() {
  const cx = (_canvas?.clientWidth || 600) / 2 / (_zoom || 1);
  const cy = (_canvas?.clientHeight || 400) / 2 / (_zoom || 1);
  const angleStep = (2 * Math.PI) / (_nodes.length || 1);

  _nodes.forEach((n, i) => {
    const r = 100 + Math.random() * 80;
    n.x = cx + r * Math.cos(i * angleStep);
    n.y = cy + r * Math.sin(i * angleStep);
    n.vx = 0;
    n.vy = 0;
  });
}

function startSimulation() {
  _settled = false;
  if (_animFrame) cancelAnimationFrame(_animFrame);
  tick();
}

function tick() {
  if (!_settled) {
    runPhysics();
  }
  draw();
  _animFrame = requestAnimationFrame(tick);
}

function handleFilter(text) {
  if (!text) {
    // Reset opacity
    for (const n of _nodes) n._dimmed = false;
    draw();
    return;
  }
  const lower = text.toLowerCase();
  const matchIds = new Set();
  for (const n of _nodes) {
    if (n.label.toLowerCase().includes(lower) || n.id.toLowerCase().includes(lower)) {
      matchIds.add(n.id);
    }
  }
  // Also include directly connected nodes
  for (const e of _edges) {
    if (matchIds.has(e.source)) matchIds.add(e.target);
    if (matchIds.has(e.target)) matchIds.add(e.source);
  }
  for (const n of _nodes) {
    n._dimmed = !matchIds.has(n.id);
  }
  draw();
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
