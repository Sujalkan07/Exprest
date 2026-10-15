/**
 * Utility functions for creating safe DOM nodes for map popups and markers.
 * All dynamic, provider-derived strings (station IDs, station names, arrival times,
 * status text, telemetry) are safely set via `textContent` or text nodes
 * to eliminate XSS vulnerabilities without relying on executable HTML strings.
 */

/**
 * Escapes HTML-sensitive characters (&, <, >, ", ') to prevent markup interpretation.
 */
export function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface StationPopupData {
  stationId: string;
  stationName?: string | null;
  etaStr?: string;
}

/**
 * Creates the DOM container for a station marker popup safely.
 * Dynamic station ID, name, and ETA are assigned via textContent.
 */
export function createStationPopupNode(
  data: StationPopupData,
  doc: Document = typeof document !== 'undefined' ? document : (globalThis as any).document
): HTMLDivElement {
  const container = doc.createElement('div');
  container.style.cssText =
    "font-family:'Inter', sans-serif;font-size:12px;padding:8px 12px;background:rgba(13,17,23,0.9);backdrop-filter:blur(8px);border-radius:8px;border:1px solid rgba(255,255,255,0.15);color:white;min-width:140px;";

  const titleDiv = doc.createElement('div');
  titleDiv.style.cssText = 'font-weight:700;font-size:13px;color:#f8fafc;margin-bottom:2px;';
  titleDiv.textContent = `${data.stationId} - ${data.stationName || ''}`;

  const etaDiv = doc.createElement('div');
  etaDiv.style.cssText = 'color:#94a3b8;font-size:11px;';
  etaDiv.textContent = `ETA ${data.etaStr || '--:--'}`;

  container.appendChild(titleDiv);
  container.appendChild(etaDiv);

  return container;
}

export interface TrainMarkerData {
  speed: number;
  heading: number;
  nextStationName?: string | null;
  nextEtaStr?: string;
}

/**
 * Creates the DOM container for the live train radar marker safely.
 * Static elements and SVG are built safely without innerHTML interpolation of user/provider data,
 * and dynamic labels (station name, ETA, speed, bearing) are assigned via textContent.
 */
export function createTrainMarkerNode(
  data: TrainMarkerData,
  doc: Document = typeof document !== 'undefined' ? document : (globalThis as any).document
): HTMLDivElement {
  const trainRoot = doc.createElement('div');
  trainRoot.className = 'train-marker-root';
  trainRoot.style.cssText =
    'display:flex; flex-direction:column; align-items:center; z-index:50; pointer-events:auto;';

  // --- Core Radar Ping & Direction Indicator ---
  const coreDiv = doc.createElement('div');
  coreDiv.id = 'train-marker-core';
  coreDiv.style.cssText =
    'position:relative;display:flex;align-items:center;justify-content:center;cursor:pointer;';

  const pingCircle = doc.createElement('div');
  pingCircle.style.cssText =
    'position:absolute;width:60px;height:60px;border-radius:50%;border:1px solid rgba(0, 229, 255, 0.4);animation:ping 2.5s cubic-bezier(0, 0, 0.2, 1) infinite;';

  const ringCircle = doc.createElement('div');
  ringCircle.style.cssText =
    'position:absolute;width:40px;height:40px;border-radius:50%;border:2px solid rgba(0, 229, 255, 0.8);';

  const headingDiv = doc.createElement('div');
  headingDiv.style.cssText = `position:relative;width:30px;height:30px;border-radius:50%;background:#0d1117;display:flex;align-items:center;justify-content:center;transform:rotate(${data.heading}deg);`;

  const arrowSvg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  arrowSvg.setAttribute('width', '16');
  arrowSvg.setAttribute('height', '16');
  arrowSvg.setAttribute('viewBox', '0 0 24 24');
  arrowSvg.setAttribute('fill', '#ffffff');

  const arrowPath = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
  arrowPath.setAttribute('d', 'M12 2L22 22L12 18L2 22L12 2Z');
  arrowPath.setAttribute('fill', 'white');
  arrowSvg.appendChild(arrowPath);
  headingDiv.appendChild(arrowSvg);

  coreDiv.appendChild(pingCircle);
  coreDiv.appendChild(ringCircle);
  coreDiv.appendChild(headingDiv);
  trainRoot.appendChild(coreDiv);

  // --- Dynamic Labels Container ---
  const labelsContainer = doc.createElement('div');
  labelsContainer.style.cssText =
    'margin-top:8px; display:flex; flex-direction:column; align-items:center;';

  // 1. Next Station & ETA badge
  const nextHaltBadge = doc.createElement('div');
  nextHaltBadge.style.cssText =
    'background:rgba(13,17,23,0.85);backdrop-filter:blur(4px);border:1px solid #00e5ff;border-radius:6px;padding:4px 8px;display:flex;align-items:center;gap:6px;box-shadow:0 4px 12px rgba(0,229,255,0.15); margin-bottom:4px;';

  const haltIcon = doc.createElement('span');
  haltIcon.className = 'material-symbols-outlined';
  haltIcon.style.cssText = 'font-size:14px;color:#00e5ff;';
  haltIcon.textContent = 'my_location';

  const haltCol = doc.createElement('div');
  haltCol.style.cssText = 'display:flex;flex-direction:column;line-height:1.2;';

  const haltName = doc.createElement('span');
  haltName.style.cssText =
    'font-size:10px;font-weight:700;color:white;text-transform:uppercase;';
  haltName.textContent = data.nextStationName || 'Unknown';

  const haltEta = doc.createElement('span');
  haltEta.style.cssText = 'font-size:9px;color:#00e5ff;font-weight:600;';
  haltEta.textContent = `ETA — ${data.nextEtaStr || '--:--'}`;

  haltCol.appendChild(haltName);
  haltCol.appendChild(haltEta);
  nextHaltBadge.appendChild(haltIcon);
  nextHaltBadge.appendChild(haltCol);
  labelsContainer.appendChild(nextHaltBadge);

  // 2. Telemetry (Speed & Bearing) badge
  const speedBadge = doc.createElement('div');
  speedBadge.style.cssText =
    'background:rgba(13,17,23,0.95);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:4px 8px;display:flex;align-items:center;gap:6px;';

  const pulseDot = doc.createElement('div');
  pulseDot.style.cssText =
    'width:6px;height:6px;border-radius:50%;background:#00e5ff;box-shadow:0 0 6px #00e5ff;';

  const speedCol = doc.createElement('div');
  speedCol.style.cssText = 'display:flex;flex-direction:column;line-height:1.1;';

  const brandTag = doc.createElement('span');
  brandTag.style.cssText = 'font-size:9px;color:#94a3b8;font-weight:700;';
  brandTag.textContent = '#RAJDHANI';

  const telemetryLine = doc.createElement('span');
  telemetryLine.style.cssText = 'font-size:12px;font-weight:800;color:white;';

  const speedNum = doc.createTextNode(`${data.speed} `);

  const speedUnit = doc.createElement('span');
  speedUnit.style.cssText = 'font-size:9px;color:#00e5ff;';
  speedUnit.textContent = 'km/h';

  const bearingText = doc.createElement('span');
  bearingText.style.cssText = 'font-size:9px;color:#94a3b8;font-weight:600;margin-left:4px;';
  bearingText.textContent = `BEARING ${data.heading}°`;

  telemetryLine.appendChild(speedNum);
  telemetryLine.appendChild(speedUnit);
  telemetryLine.appendChild(doc.createTextNode(' '));
  telemetryLine.appendChild(bearingText);

  speedCol.appendChild(brandTag);
  speedCol.appendChild(telemetryLine);
  speedBadge.appendChild(pulseDot);
  speedBadge.appendChild(speedCol);
  labelsContainer.appendChild(speedBadge);

  trainRoot.appendChild(labelsContainer);

  const pingStyle = doc.createElement('style');
  pingStyle.textContent =
    '@keyframes ping{0%{transform:scale(0.8);opacity:1} 100%{transform:scale(1.8);opacity:0}}';
  trainRoot.appendChild(pingStyle);

  return trainRoot;
}
