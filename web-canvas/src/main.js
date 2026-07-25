// imp/web-canvas/src/main.js
// Bootstraps world + game loop (dsr/use/ecs-loop.dsr). Glue/I-O layer.
// @ds b28b7af6 27fa3caa ec8cb052 ab1e4f02 c95ca496 48c4fc99 b433f1bc d2e8a84c 5fb1ff09 c83f4c1e ca07d970 d6cebf86 2b3e71e0 3ddf8f67 1f3abc43 cbc1225a 7ce238da c4073e51 ee07d6da 8869f043 07320d39 f51831f5 8d0ca6a8 d867989f 975ca168 bd354b7a 906be50b 91e32235 55c13a4f 10baf178 22fd3ab4 e6be3c03 0eef2d19 e001d967 cff27cd5 7b9a7984 ad8d81d8 31cb7a0d 579e4888 e699c42d e6ecfbdd 1e66d817 a3e394a8 98224ab9 e9fb3705 fcdfb2b7 0c8d4e2a 6f1b0a3c 39305789 2e91f6d4 b9136c2e c5a92431 c656f0ec e42a7c19 a2d5936f 73b91e4c ed2b4f19
// @ia 3983084a

import { CAMERA, DEBUG, ENERGY, EXHALE, FISH, FLOW_MAP, JOYSTICK, LOOP, MOUTH, PLAYER, REGIME, SHRED, SIZE_DELTA_LABEL, SWIM, SYNC, VIEWPORT_FISH_CAPACITY, WORLD_MAP } from './constants.js';
import { advanceBubbles, emitBubble, makeBubble, makeWorld } from './world.js';
import { buildFlowField, sampleFlowField } from './flow.js'; // @fix:6a7b8c9d
import { BURST_ENDURANCE_SIZE_THRESHOLDS, availableSpeedLevelForSize, burstEnergyFactorOf, requestExhale, runExhaleCycle, serializeFish, speedCapOf, technicalRadiusOf } from './fish.js';
import { createControlModeState, createInput, keySteer, pointerSteer, joystickSteer, speedLevel, speedLevelToControlMagnitude } from './controls.js';
import { buildToroidalRenderWorld, fishFinTipPositions, loadFishGeometry, loadShredGeometry, render, viewportCapacityForZoom, viewportToWorld, viewportZoomForCapacity, visualFishTurnRadians, worldToViewport } from './render.js';
import { dist, normalize, scale, v } from './vec.js';
import { createClientNet, createDangerMapSocket } from './client-net.js';
import { syncOpacityAt } from './protocol.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const hud = document.getElementById('hud');
const playerMetrics = document.getElementById('player-metrics');
const playerColorIndicator = document.getElementById('player-color-indicator');
const playerSizeValue = document.getElementById('player-size-value');
const playerName = document.getElementById('player-name');
const playerSpeedMetric = document.getElementById('player-speed-metric');
const playerSpeedPercent = document.getElementById('player-speed-percent');
const playerSpeedReal = document.getElementById('player-speed-real');
const hudEaten = document.getElementById('eaten');
const hudStatus = document.getElementById('status');
const lifetimeBar = document.getElementById('lifetime-bar');
const worldFishCount = document.getElementById('world-fish-count');
const worldFishArea = document.getElementById('world-fish-area');
const worldNutrientCount = document.getElementById('world-nutrient-count');
const worldNutrientArea = document.getElementById('world-nutrient-area');
const worldScaleValue = document.getElementById('world-scale');
const worldSyncValue = document.getElementById('world-sync');
const worldSyncRateValue = document.getElementById('world-sync-rate');
const worldDynamicRateValue = document.getElementById('world-dynamic-rate');
const worldControlRateValue = document.getElementById('world-control-rate');
const worldCalcMsValue = document.getElementById('world-calc-ms');
const worldSyncCycleMsValue = document.getElementById('world-sync-cycle-ms');
const startupSplash = document.getElementById('startup-splash');
const joinPanel = document.getElementById('join');
const joinForm = document.getElementById('join-form');
const joinName = document.getElementById('join-name');
const joinColor = document.getElementById('join-color');
const joinFishPreview = document.querySelector('.join-fish-preview object');
const joinCornerDecoration = document.querySelector('.join-corner-decoration');
const joinLogo = document.querySelector('.join-bait object');
const JOIN_LOGO_LIVELINESS = {
    rotationDeg: 3.4,
    timingScale: 0.5,
};
const joinTier = document.getElementById('join-tier');
const leaveButton = document.getElementById('leave-game');
const gameMenuToggle = document.getElementById('game-menu-toggle');
const gameMenu = document.getElementById('game-menu');
const worldMapToggle = document.getElementById('world-map-toggle');
const syncSegmentsToggle = document.getElementById('sync-segments-toggle');
const flowMapToggle = document.getElementById('flow-map-toggle');
const flowVectorsToggle = document.getElementById('flow-vectors-toggle');
const dangerMapToggle = document.getElementById('danger-map-toggle');
const infoPanelToggle = document.getElementById('info-panel-toggle');
const decorativeSparksTestToggle = document.getElementById('decorative-sparks-test-toggle');
const worldMap = document.getElementById('world-map');
const worldInfo = document.getElementById('world-info');
const flowInfoPanel = document.getElementById('flow-info-panel');
const recordsPanel = document.getElementById('records-panel');
const flowMetricWindow = document.getElementById('flow-metric-window');
const flowMetricBuild = document.getElementById('flow-metric-build');
const flowMetricRgb = document.getElementById('flow-metric-rgb');
const flowMetricSurface = document.getElementById('flow-metric-surface');
const flowMetricSample = document.getElementById('flow-metric-sample');
const flowMetricCycle = document.getElementById('flow-metric-cycle');
const flowMetricShape = document.getElementById('flow-metric-shape');
const userRecordRows = document.getElementById('user-record-rows');
const npcRecordRows = document.getElementById('npc-record-rows');
const debugModeToggle = document.getElementById('debug-mode-toggle');
const controlModes = document.getElementById('control-modes');
const controlModeButtons = [...document.querySelectorAll('[data-control-mode]')];
const controlHelp = document.getElementById('control-help');
const viewportFishCapacitySelect = document.getElementById('viewport-fish-capacity-select');
const viewportScaleWidget = document.getElementById('viewport-scale-widget');
const viewportScaleTrack = viewportScaleWidget?.querySelector('.viewport-scale-track');
const viewportScaleMarker = document.getElementById('viewport-scale-marker');
const viewportLeftControls = document.getElementById('viewport-left-controls'); // @fix:6a7b8c9d
const viewportControlTools = document.getElementById('viewport-control-tools');
const uiLayoutToggle = document.getElementById('ui-layout-toggle');
const controlLayoutToggle = document.getElementById('control-layout-toggle');
const controlLayoutToast = document.getElementById('control-layout-toast');
const burstEnduranceRows = document.getElementById('burst-endurance-rows');
const joystickPanel = document.getElementById('joystick-panel');
const touchSpeedMetric = document.getElementById('touch-speed-metric');
const touchSpeedValue = document.getElementById('touch-speed-value');
const touchSpeedMode = document.getElementById('touch-speed-mode');
const joystickBase = document.getElementById('joystick-base');
const joystickBurstBase = document.getElementById('joystick-burst-base');
const joystickBurstRings = document.getElementById('joystick-burst-rings');
const joystickKnob = document.getElementById('joystick-knob');
const joystickCurrentBurstRing = document.getElementById('joystick-current-burst-ring');
const dualRightJoystickPanel = document.getElementById('dual-right-joystick-panel');
const dualRightJoystickBase = document.getElementById('dual-right-joystick-base');
const dualRightJoystickVector = document.getElementById('dual-right-joystick-vector');
const dualRightJoystickKnob = document.getElementById('dual-right-joystick-knob');
const dualBurstPanel = document.getElementById('dual-burst-panel');
const dualBurstSurface = document.getElementById('dual-burst-surface');
const dualBurstArcMuted = document.getElementById('dual-burst-arc-muted');
const dualBurstArcBase = document.getElementById('dual-burst-arc-base');
const dualBurstArcActiveClipSector = document.getElementById('dual-burst-active-clip-sector');
const dualBurstPinLine = document.getElementById('dual-burst-pin-line');
const dualBurstNumber = document.getElementById('dual-burst-number');
const dualBurstPreviewMarker = document.getElementById('dual-burst-preview-marker');
const dualBurstHandle = document.getElementById('dual-burst-handle');
const dualBurstHandleLevel = document.getElementById('dual-burst-handle-level');
const dualBurstNumberHit = document.getElementById('dual-burst-number-hit'); // @fix:dual-burst-grip
const dualBurstArcHit = document.getElementById('dual-burst-arc-hit'); // @fix:dual-burst-grip
let joystickAvailableLevel = REGIME.speedLevels;
let joystickRenderedAvailabilityLevel = null;
let joystickCurrentBurstRingLevel = null;
let touchSpeedMetricUiKey = null;
const appVersion = document.getElementById('app-version');

let state = { world: makeWorld(), currentUserFishId: null };
let resizeFrame = 0;
let resizeDebounceTimer = 0; // @fix:c7e2a914
const RESIZE_DEBOUNCE_MS = 90; // @fix:c7e2a914
const snapshotBuffer = [];
const clientSyncRenderPositions = new Map(); // @fix:b3d7e9a2
const clientBubbles = [];
const clientFinSparks = []; // @fix:4f8a2c71
const clientBubbleEmitters = new Map();
const clientFishDecor = new Map();
const VIEWPORT_CAMERA_ZOOM_STORAGE_KEY = 'selfish-bait.viewport-camera-zoom'; // @fix:394756ee
const cameraPan = { x: 0, y: 0 };
let cameraZoom = loadCameraZoom(); // @fix:394756ee
let cameraPanPointerId = null;
let cameraPanLastPoint = null;
let cameraGestureMode = null;
let cameraGestureStartZoom = null;
let cameraPointers = new Map();
let pinchStartDistance = null;
let viewportFishCapacityUiKey = null; // @fix:394756ee
let viewportScaleWidgetKey = null; // @fix:394756ee
let viewportScalePointerId = null; // @fix:394756ee
let serializeKeyLatch = false;
let lastSentInputKey = null;
let lastInputFlushAt = 0;
const CONTROL_HEARTBEAT_MS = 900; // @ds:multiplayer.control-heartbeat
const VIEWPORT_FISH_CAPACITY_STORAGE_KEY = 'selfish-bait.viewport-fish-capacity'; // @fix:a64e9b31
const CONTROL_LAYOUT_POSITION_STORAGE_KEY = 'selfish-bait.control-layout-positions'; // @fix:control-viewport-layout
const controlLayoutPositions = loadControlLayoutPositions(); // @fix:control-viewport-layout
let gameMenuOpen = false;
let worldMapVisible = false;
let debugMode = false;
let syncSegmentsVisible = false;
let flowMapVisible = false; // @fix:6a7b8c9d
let flowMapBitmap = null; // @fix:6a7b8c9d
let flowMapField = null; // @fix:4e9b2c71
let flowMapFrameSerial = 0; // @fix:4e9b2c71
let flowMapLocalEnabled = false; // @fix:6a7b8c9d
let flowMapSurface = null; // @fix:6a7b8c9d
let flowMapLastBuildAt = 0; // @fix:6a7b8c9d
let flowMapBuildMs = 0; // @fix:6a7b8c9d
let flowMapBuildFishCount = 0; // @fix:6a7b8c9d
const flowCycleMetrics = { windowStartedAt: 0, cycles: 0, totalMs: 0, buildMs: 0, rgbEncodeMs: 0, surfaceMs: 0, rawSampleMs: 0, rawSampleCount: 0 }; // @fix:6a7b8c9d
let flowMetricsSnapshot = null; // @fix:6a7b8c9d
const INFO_PANEL_MODES = ['world', 'flow', 'records', 'none']; // @fix:6a7b8c9d
let infoPanelMode = 'none'; // @fix:6a7b8c9d
let recordsPanelUpdatedAt = 0; // @fix:6a7b8c9d
let recordsPanelKey = ''; // @fix:6a7b8c9d
const recordFirstSeenAt = new Map(); // @fix:6a7b8c9d
let uiLayoutEditMode = false; // @fix:f1c6a8d4
let joystickRelocationLocked = false; // @fix:52cd6e6c
const CONTROL_LAYOUT_MODES = ['joystick', 'dual-joystick', 'touch']; // @fix:70871bc5
let controlLayoutMode = 'joystick'; // @fix:70871bc5
let controlLayoutToastTimer = 0; // @fix:70871bc5
let touchSpeedPointerId = null; // @fix:f1c6a8d4
let touchSpeedDragOffset = null; // @fix:f1c6a8d4
let dualRightJoystickPointerId = null; // @fix:dual-right-grip
let dualRightJoystickLayoutDragOffset = null; // @fix:dual-right-grip
let dualBurstPointerId = null; // @fix:dual-burst-grip
let dualBurstLayoutDragOffset = null; // @fix:control-viewport-layout
let dualBurstGesture = null; // @fix:dual-burst-grip
let dualBurstArcAvailabilityLevel = null; // @fix:dual-burst-grip
let dualBurstScale = null; // @fix:dual-burst-grip
let dualBurstPinLineOpacity = null; // @fix:dual-burst-grip
let dualBurstVisualKey = null; // @fix:dual-burst-grip
const FLOW_MAP_LOCAL_UPDATE_MS = 100; // @fix:6a7b8c9d
let flowVectorsVisible = false; // @fix:5f2a8c71
let flowVectorsResetPending = false; // @fix:5f2a8c71
const clientShredSpin = new Map(); // @fix:4e9b2c71
const clientShredLayerStates = new Map(); // @fix:4f8a2c71
const clientShredEatCueCounters = new Map(); // @fix:4f8a2c71
let dangerMapVisible = false;
let dangerMapBitmap = null;
const dangerMapNet = createDangerMapSocket(bitmap => { dangerMapBitmap?.close?.(); dangerMapBitmap = bitmap; });
let worldCalculationMs = null;
let syncCycleMs = null;
let lastMeasuredSyncCycle = null;
let lastMeasuredSyncCycleAt = null;
const syncCycleIntervalsMs = [];
let debugPositionTraces = [];
let debugReceivedQuadrants = new Map();
const receivedQuadrantsByCycle = new Map();
const receivedQuadrantAverages = [];
const debugSyncCellHistories = new Map();
let debugSyncOpenCycle = null;
let debugSyncOpenCells = new Set();
let latestAbsoluteServerPositions = new Map();
let lastDebugTraceAt = 0;
let lastVisibleState = state;
let entrySessionReady = false;
let startupSplashReady = false;
let decorativeSparkTestTapCount = 0;
let decorativeSparkTestTapTimer = 0;
let burstEnduranceTableKey = '';
let viewportFishCapacity = loadViewportFishCapacity(); // @fix:a64e9b31
let net = null;
const controlMode = createControlModeState();
const sizeDeltaLabelState = {
    fishId: null,
    lastSize: null,
    remainder: 0,
    labels: [],
};
// ds:b28b7af6
async function init(){
    resize();
    showAppVersion();
    await loadFishGeometry();
    await loadShredGeometry();
}

// @fix:control-viewport-layout
function loadControlLayoutPositions(){
    const result = {};
    try{
        const parsed = JSON.parse(window.localStorage.getItem(CONTROL_LAYOUT_POSITION_STORAGE_KEY) || '{}');
        for( const key of ['joystick', 'dualRight', 'dualBurst', 'touchSpeed'] ){
            const position = parsed?.[key];
            const dualEdgePosition = key === 'dualRight'
                ? Number.isFinite(position?.rightPx) && Number.isFinite(position?.bottomPx)
                : key === 'dualBurst'
                    ? Number.isFinite(position?.leftPx) && Number.isFinite(position?.bottomPx)
                    : false;
            if( dualEdgePosition ){
                result[key] = key === 'dualRight'
                    ? {
                        rightPx: Math.max(0, Number(position.rightPx)),
                        bottomPx: Math.max(0, Number(position.bottomPx)),
                    }
                    : {
                        leftPx: Math.max(0, Number(position.leftPx)),
                        bottomPx: Math.max(0, Number(position.bottomPx)),
                    };
            }else if( Number.isFinite(position?.x) && Number.isFinite(position?.y) ){
                // Keep the old normalized form readable for one migration pass;
                // the first restore converts it to edge-pixel anchors.
                result[key] = {
                    x: Math.max(0, Math.min(1, Number(position.x))),
                    y: Math.max(0, Math.min(1, Number(position.y))),
                };
            }
            if( result[key] ){
                result[`${key}Custom`] = parsed?.[`${key}Custom`] === true;
            }
        }
    }catch{
        // In-memory defaults remain usable when storage is unavailable.
    }
    return result;
}

// @fix:control-viewport-layout
function controlViewportSize(){
    return {
        width: Math.max(1, window.visualViewport?.width || window.innerWidth),
        height: Math.max(1, window.visualViewport?.height || window.innerHeight),
    };
}

// @fix:control-viewport-layout
function rememberControlCenter(key, center){
    const viewport = controlViewportSize();
    if( key === 'dualRight' || key === 'dualBurst' ){
        // Dual grips are edge-anchored. Store the actual CSS-pixel margin,
        // not a viewport percentage, so a rotation keeps the same side/bottom
        // placement while the 30vmin footprint is recalculated by CSS.
        const panel = key === 'dualRight' ? dualRightJoystickPanel : dualBurstPanel;
        const rect = panel?.getBoundingClientRect();
        if( rect && rect.width > 0 && rect.height > 0 ){
            controlLayoutPositions[key] = key === 'dualRight'
                ? {
                    rightPx: Math.max(0, viewport.width - rect.right),
                    bottomPx: Math.max(0, viewport.height - rect.bottom),
                }
                : {
                    leftPx: Math.max(0, rect.left),
                    bottomPx: Math.max(0, viewport.height - rect.bottom),
                };
            return;
        }
    }
    const normalizedX = center.x / viewport.width;
    const normalizedY = center.y / viewport.height;
    controlLayoutPositions[key] = {
        x: Math.max(0, Math.min(1, key === 'dualRight' ? 1 - normalizedX : normalizedX)),
        y: Math.max(0, Math.min(1, key === 'dualRight' || key === 'dualBurst' ? 1 - normalizedY : normalizedY)),
    };
}

// @fix:control-viewport-layout
function markControlPositionCustom(key){
    controlLayoutPositions[`${key}Custom`] = true;
}

// @fix:control-viewport-layout
function persistControlLayoutPositions(){
    try{
        window.localStorage.setItem(CONTROL_LAYOUT_POSITION_STORAGE_KEY, JSON.stringify(controlLayoutPositions));
    }catch{
        // The current in-memory position remains active for this session.
    }
}

// @fix:control-viewport-layout
function rememberedControlCenter(key){
    const position = controlLayoutPositions[key];
    if( !position ) return null;
    const viewport = controlViewportSize();
    if( key === 'dualRight' && Number.isFinite(position.rightPx) && Number.isFinite(position.bottomPx) ){
        const rect = dualRightJoystickPanel?.getBoundingClientRect();
        if( rect && rect.width > 0 && rect.height > 0 ){
            return v(
                viewport.width - position.rightPx - rect.width / 2,
                viewport.height - position.bottomPx - rect.height / 2,
            );
        }
    }
    if( key === 'dualBurst' && Number.isFinite(position.leftPx) && Number.isFinite(position.bottomPx) ){
        const rect = dualBurstPanel?.getBoundingClientRect();
        if( rect && rect.width > 0 && rect.height > 0 ){
            return v(
                position.leftPx + rect.width / 2,
                viewport.height - position.bottomPx - rect.height / 2,
            );
        }
    }
    return v(
        (key === 'dualRight' ? 1 - position.x : position.x) * viewport.width,
        (key === 'dualRight' || key === 'dualBurst' ? 1 - position.y : position.y) * viewport.height,
    );
}

// @fix:control-viewport-layout
function rememberCurrentControlCenter(key, element){
    if( !element || element.hidden ) return;
    const rect = element.getBoundingClientRect();
    if( rect.width <= 0 || rect.height <= 0 ) return;
    if( !controlLayoutPositions[key] ){
        rememberControlCenter(key, v(rect.left + rect.width / 2, rect.top + rect.height / 2));
    }
}

// ds:b28b7af6 @fix:c7e2a914
function resize(){
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || window.innerWidth));
    const height = Math.max(1, Math.round(rect.height || window.innerHeight));
    const changed = canvas.width !== width || canvas.height !== height;
    if( changed ){
        canvas.width = width;
        canvas.height = height;
        clampCameraPanToSafeArea(); // @fix:32ef3d51
    }
    dualBurstScale = null; // @fix:dual-burst-grip
    restoreControlLayoutPositions(); // @fix:control-viewport-layout
}

// @fix:c7e2a914
function scheduleResize(){
    if( resizeDebounceTimer ) window.clearTimeout(resizeDebounceTimer);
    resizeDebounceTimer = window.setTimeout(() => {
        resizeDebounceTimer = 0;
        if( resizeFrame ) cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => {
            resizeFrame = 0;
            resize();
            // Mobile browsers can commit the new visual viewport one frame after
            // the orientation event; sample the final CSS box as well.
            requestAnimationFrame(resize);
        });
    }, RESIZE_DEBOUNCE_MS);
}

// @ds:3a980720
function getWorldMapTop(){
    const hudBottom = hud?.getBoundingClientRect().bottom || 0;
    const metricsBottom = playerMetrics?.hidden ? 0 : (playerMetrics?.getBoundingClientRect().bottom || 0);
    return Math.ceil(Math.max(hudBottom, metricsBottom) + WORLD_MAP.overlayGapPx);
}

const input = createInput(canvas);
net = createClientNet({
    onSnapshot(message){
        if( state.currentUserFishId !== message.currentUserFishId ){ // @fix:32ef3d51
            lastSentInputKey = null;
            cameraPan.x = 0;
            cameraPan.y = 0;
        }
        state.world = message.world;
        state.currentUserFishId = message.currentUserFishId;
        trackRecordFishAppearance(message.world, message.receivedAt ?? performance.now()); // @fix:6a7b8c9d
        updateWorldSyncMetrics(message);
        if( document.activeElement !== viewportFishCapacitySelect ) updateViewportFishCapacityUi(); // @fix:394756ee
        if( debugMode && Number.isInteger(message.syncDiagnostics?.cellX) && Number.isInteger(message.syncDiagnostics?.cellY) ){
            const key = `${message.syncDiagnostics.cellX}:${message.syncDiagnostics.cellY}`;
            debugReceivedQuadrants.set(key, {
                cellX: message.syncDiagnostics.cellX,
                cellY: message.syncDiagnostics.cellY,
                receivedAt: message.receivedAt ?? performance.now(),
            });
        }
        if( message.syncDiagnostics?.absolute ){
            latestAbsoluteServerPositions = new Map(
                (message.syncDiagnostics.fish || []).map(row => [row.id, row.serverPos]).filter(([, pos]) => pos)
            );
        }
        snapshotBuffer.push({
            receivedAt: message.receivedAt ?? performance.now(),
            world: message.world,
            currentUserFishId: message.currentUserFishId,
        });
        while( snapshotBuffer.length > 6 ) snapshotBuffer.shift();
    },
    // @ds:e7c2a901
    onSyncRate(message){
        updateSyncRate(message.rate);
    },
    onEventRates(rates){
        updateEventRates(rates);
    },
    onPerformanceMetrics(metrics){
        updateWorldPerformanceMetrics(metrics.worldCalculationMs, syncCycleMs);
    },
    onEvent(message){
        hudStatus.textContent = message.status || message.event || 'event';
        if( message.event === 'rj' ){
            closeFlowMapTransport(); // @fix:4e9b2c71
            state.currentUserFishId = null;
            lastSentInputKey = null;
            lastInputFlushAt = 0;
            showNewJoinForm();
        }
        if( message.leaveSucceeded ){
            state.currentUserFishId = null;
            lastSentInputKey = null;
            lastInputFlushAt = 0;
            showNewJoinForm();
        }
        if( message.event === 'wrn' ){
            setJoinedUiState(true);
        }
    },
    onStatus(status){
        hudStatus.textContent = status;
    },
    onInitialCommunication(message){
        if( message.kind === 'new' && !net?.isJoined ){
            showNewJoinForm();
        }
    },
    onIdentity(){
        lastSentInputKey = null;
        lastInputFlushAt = 0;
        setJoinedUiState(true, { sessionReady: true });
        revealGameSurface();
    },
});

function updateWorldSyncMetrics(message){
    const scale = Number(message.world?.scale);
    if( worldScaleValue ) worldScaleValue.textContent = Number.isFinite(scale) && scale > 0 ? scale.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') : '—';
    const diagnostics = message.syncDiagnostics;
    if( diagnostics && Number.isInteger(diagnostics.cycle) && Number.isInteger(diagnostics.cellX) && Number.isInteger(diagnostics.cellY) ){
        const cycle = diagnostics.cycle;
        recordDebugSyncCell(cycle, diagnostics.cellX, diagnostics.cellY);
        const cells = receivedQuadrantsByCycle.get(cycle) || new Set();
        cells.add(`${diagnostics.cellX}:${diagnostics.cellY}`);
        receivedQuadrantsByCycle.set(cycle, cells);
        const previousCycles = [...receivedQuadrantsByCycle.keys()].filter(value => value < cycle).sort((a, b) => a - b);
        for( const completedCycle of previousCycles ){
            receivedQuadrantAverages.push(receivedQuadrantsByCycle.get(completedCycle).size);
            receivedQuadrantsByCycle.delete(completedCycle);
        }
        while( receivedQuadrantAverages.length > 20 ) receivedQuadrantAverages.shift();
    }
    const cycle = diagnostics?.cycle ?? [...receivedQuadrantsByCycle.keys()].sort((a, b) => b - a)[0];
    const average = receivedQuadrantAverages.length > 0
        ? receivedQuadrantAverages.reduce((sum, count) => sum + count, 0) / receivedQuadrantAverages.length
        : 0;
    if( worldSyncValue ) worldSyncValue.textContent = `${Number.isInteger(cycle) ? cycle : '—'} · ${average.toFixed(2)}`;
    const receivedAt = Number(message.receivedAt);
    if( Number.isInteger(cycle) && cycle > (lastMeasuredSyncCycle ?? -1) && Number.isFinite(receivedAt) ){
        if( lastMeasuredSyncCycleAt !== null ){
            syncCycleIntervalsMs.push(Math.max(0, receivedAt - lastMeasuredSyncCycleAt));
            while( syncCycleIntervalsMs.length > 20 ) syncCycleIntervalsMs.shift();
            syncCycleMs = syncCycleIntervalsMs.reduce((sum, interval) => sum + interval, 0) / syncCycleIntervalsMs.length;
        }
        lastMeasuredSyncCycle = cycle;
        lastMeasuredSyncCycleAt = receivedAt;
        updateWorldPerformanceMetrics(worldCalculationMs, syncCycleMs);
    }
}

// @ds:4d8c2f1a @ds:6e3b91c7
function updateWorldPerformanceMetrics(worldMs, syncMs){
    const worldValue = worldMs === null || worldMs === undefined ? NaN : Number(worldMs);
    const syncValue = syncMs === null || syncMs === undefined ? NaN : Number(syncMs);
    if( Number.isFinite(worldValue) && worldValue >= 0 ){
        worldCalculationMs = worldValue;
        if( worldCalcMsValue ) worldCalcMsValue.textContent = `${worldValue.toFixed(2)} ms`;
    }
    if( Number.isFinite(syncValue) && syncValue >= 0 ){
        syncCycleMs = syncValue;
        if( worldSyncCycleMsValue ) worldSyncCycleMsValue.textContent = `${syncValue.toFixed(2)} ms`;
    }
}

function recordDebugSyncCell(cycle, cellX, cellY){
    if( debugSyncOpenCycle === null ){
        debugSyncOpenCycle = cycle;
    }else if( cycle > debugSyncOpenCycle ){
        completeDebugSyncCycle(debugSyncOpenCycle, debugSyncOpenCells);
        for( let missedCycle = debugSyncOpenCycle + 1; missedCycle < cycle; missedCycle++ ){
            completeDebugSyncCycle(missedCycle, new Set());
        }
        debugSyncOpenCycle = cycle;
        debugSyncOpenCells = new Set();
    }else if( cycle < debugSyncOpenCycle ){
        return;
    }
    debugSyncOpenCells.add(`${cellX}:${cellY}`);
}

function completeDebugSyncCycle(cycle, receivedCells){
    const windowSize = Math.max(1, DEBUG.cellSyncWindowCycles);
    for( const [key, history] of debugSyncCellHistories ){
        history.push(receivedCells.has(key) ? 1 : 0);
        while( history.length > windowSize ) history.shift();
    }
    for( const key of receivedCells ){
        if( debugSyncCellHistories.has(key) ) continue;
        const history = Array(Math.max(0, windowSize - 1)).fill(0);
        history.push(1);
        debugSyncCellHistories.set(key, history);
    }
}

function debugSyncCellAverages(){
    return [...debugSyncCellHistories].map(([key, history]) => {
        const [cellX, cellY] = key.split(':').map(Number);
        return {
            cellX,
            cellY,
            ratio: history.reduce((sum, received) => sum + received, 0) / Math.max(1, DEBUG.cellSyncWindowCycles),
        };
    });
}

function currentUserFish(world = state.world, currentUserFishId = state.currentUserFishId){
    const id = currentUserFishId ?? net?.currentUserFishId;
    return (world.fish || []).find(f => f.id === id && f.ownerKind === 'user') || null;
}

canvas.addEventListener('click', e =>{
    if( !state ) return;
    const rect = canvas.getBoundingClientRect();
    const clickState = lastVisibleState || state;
    const followed = currentUserFish(clickState.world, clickState.currentUserFishId);
    const clickPos = viewportToWorld(v(e.clientX - rect.left, e.clientY - rect.top), clickState.world, followed, canvas, { viewportFishCapacity, cameraZoom, cameraPan });
    const renderWorld = buildToroidalRenderWorld(clickState.world, followed);
    const projectedFish = (renderWorld.fish || []).find(candidate => candidate && dist(clickPos, candidate.pos) <= candidate.radius);
    const fish = projectedFish ? (state.world.fish || []).find(candidate => candidate.id === projectedFish.id) : null;
    if( fish ) console.log(serializeFish(fish)); // ds:2e1570ed
});
window.addEventListener('resize', scheduleResize);
window.addEventListener('orientationchange', scheduleResize);
window.visualViewport?.addEventListener('resize', scheduleResize);
const canvasResizeObserver = typeof ResizeObserver === 'function'
    ? new ResizeObserver(scheduleResize)
    : null;
canvasResizeObserver?.observe(canvas);

// @ds:c9f4b821 @ia:d2c6a901
const JOIN_PROFILE_STORAGE_KEY = 'fish.joinProfile';
const generatedJoinDefaults = {
    name: `fish-${Math.floor(Math.random() * 900 + 100)}`,
    color: `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`,
};
const savedJoinProfile = loadJoinProfilePreferences();
if( joinName ) joinName.value = savedJoinProfile.userName || generatedJoinDefaults.name;
if( joinColor ) joinColor.value = savedJoinProfile.userColor || generatedJoinDefaults.color;
syncJoinFishPreview(); // @ds:277a51d7
if( joinName ) joinName.addEventListener('input', saveJoinProfileDraft);
if( joinColor ) joinColor.addEventListener('input', saveJoinProfileDraft);
if( joinFishPreview ) joinFishPreview.addEventListener('load', syncJoinFishPreview);
if( joinCornerDecoration ) joinCornerDecoration.addEventListener('load', animateJoinCornerDecoration);
if( joinLogo ) joinLogo.addEventListener('load', animateJoinLogo);
setJoinedUiState(false);
startEntryFlow();
if( joinForm ){
    joinForm.addEventListener('submit', e =>{
        e.preventDefault();
        const userName = joinName.value.trim() || 'fish';
        const userColor = joinColor.value;
        saveJoinProfilePreferences({ userName, userColor });
        net.join({
            userName,
            userColor,
            userTier: joinTier.checked ? 'paid' : 'free',
        });
        setJoinedUiState(false, { sessionReady: true });
    });
}

function syncJoinFishPreview(){
    if( !joinColor || !joinFishPreview ) return;
    joinColor.style.setProperty('--join-swatch-ring', swatchRingFor(joinColor.value));
    joinColor.closest('.join-colour-swatch')?.style.setProperty('--join-swatch-color', joinColor.value);
    const fishSvg = joinFishPreview.contentDocument?.documentElement;
    if( !fishSvg ) return;
    fishSvg.style.color = joinColor.value;
    if( fishSvg.querySelector('#join-preview-cruise-motion') ) return;
    const motionStyle = fishSvg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'style');
    motionStyle.id = 'join-preview-cruise-motion';
    motionStyle.textContent = `
        @keyframes joinPreviewTail { 0%, 100% { transform: rotate(-3.5deg); } 50% { transform: rotate(3.5deg); } }
        @keyframes joinPreviewBottomFin { 0%, 100% { transform: skewX(-4deg) scaleY(.98); } 50% { transform: skewX(4deg) scaleY(1.04); } }
        @keyframes joinPreviewSmallFin { 0%, 100% { transform: skewX(-2deg) scaleY(.98); } 50% { transform: skewX(2deg) scaleY(1.05); } }
        @keyframes joinPreviewTopFin { 0%, 100% { transform: skewX(3deg) scaleY(1.01); } 50% { transform: skewX(-3deg) scaleY(.99); } }
        #fin_back { transform-box: fill-box; transform-origin: 0% 50%; animation: joinPreviewTail 1.396s ease-in-out infinite; }
        #fin_bottom { transform-box: fill-box; transform-origin: 50% 0%; animation: joinPreviewBottomFin 1.396s ease-in-out infinite; }
        #fin_bottom_small { transform-box: fill-box; transform-origin: 50% 0%; animation: joinPreviewSmallFin 1.396s ease-in-out infinite; }
        #fin_bottom_top { transform-box: fill-box; transform-origin: 50% 100%; animation: joinPreviewTopFin 1.396s ease-in-out infinite; }
    `;
    fishSvg.append(motionStyle);
}

function animateJoinCornerDecoration(){
    const decorationSvg = joinCornerDecoration?.contentDocument?.documentElement;
    if( !decorationSvg || decorationSvg.querySelector('#join-decoration-motion') ) return;
    const motionStyle = decorationSvg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'style');
    motionStyle.id = 'join-decoration-motion';
    motionStyle.textContent = `
        @keyframes joinDecorationLayerOne { from { transform: rotate(-1.8deg); } to { transform: rotate(1.8deg); } }
        @keyframes joinDecorationLayerTwo { from { transform: rotate(1.25deg); } to { transform: rotate(-1.25deg); } }
        path:nth-of-type(1) { transform-box: view-box; transform-origin: 50% 50%; animation: joinDecorationLayerOne 5.2s ease-in-out infinite alternate; }
        path:nth-of-type(2) { transform-box: view-box; transform-origin: 50% 50%; animation: joinDecorationLayerTwo 6.4s ease-in-out infinite alternate; }
    `;
    decorationSvg.append(motionStyle);
}

function animateJoinLogo(){
    const logoSvg = joinLogo?.contentDocument?.documentElement;
    if( !logoSvg || logoSvg.querySelector('#join-logo-motion') ) return;
    const motionStyle = logoSvg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'style');
    motionStyle.id = 'join-logo-motion';
    const { rotationDeg, timingScale } = JOIN_LOGO_LIVELINESS;
    const duration = seconds => `${(seconds * timingScale).toFixed(2)}s`;
    const turn = factor => `${(rotationDeg * factor).toFixed(2)}deg`;
    motionStyle.textContent = `
        @keyframes joinLogoLayerOne { from { transform: rotate(-${turn(1)}); } to { transform: rotate(${turn(1)}); } }
        @keyframes joinLogoLayerTwo { from { transform: rotate(${turn(.74)}); } to { transform: rotate(-${turn(.74)}); } }
        @keyframes joinLogoLayerThree { from { transform: rotate(-${turn(.85)}); } to { transform: rotate(${turn(.85)}); } }
        @keyframes joinLogoLayerFour { from { transform: rotate(${turn(.65)}); } to { transform: rotate(-${turn(.65)}); } }
        @keyframes joinLogoLayerFive { from { transform: rotate(-${turn(.76)}); } to { transform: rotate(${turn(.76)}); } }
        path { transform-box: view-box; transform-origin: 39px 39px; animation-timing-function: ease-in-out; animation-iteration-count: infinite; animation-direction: alternate; }
        path:nth-of-type(1) { animation-name: joinLogoLayerOne; animation-duration: ${duration(5.4)}; }
        path:nth-of-type(2) { animation-name: joinLogoLayerTwo; animation-duration: ${duration(6.2)}; }
        path:nth-of-type(3) { animation-name: joinLogoLayerThree; animation-duration: ${duration(7.1)}; }
        path:nth-of-type(4) { animation-name: joinLogoLayerFour; animation-duration: ${duration(5.8)}; }
        path:nth-of-type(5) { animation-name: joinLogoLayerFive; animation-duration: ${duration(6.7)}; }
    `;
    logoSvg.append(motionStyle);
}

function swatchRingFor(color){
    const channel = offset => parseInt(color.slice(offset, offset + 2), 16) / 255;
    const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
    return luminance < 0.42 ? 'rgba(229, 244, 255, 0.92)' : 'rgba(2, 22, 53, 0.82)';
}

function loadJoinProfilePreferences(){
    try{
        const stored = JSON.parse(window.localStorage.getItem(JOIN_PROFILE_STORAGE_KEY) || '{}');
        return {
            userName: typeof stored.userName === 'string' ? stored.userName.slice(0, 24) : '',
            userColor: /^#[0-9a-f]{6}$/i.test(stored.userColor || '') ? stored.userColor : '',
        };
    }catch{
        return { userName: '', userColor: '' };
    }
}

function saveJoinProfilePreferences({ userName, userColor }){
    const preferences = {};
    if( userName !== generatedJoinDefaults.name ) preferences.userName = userName;
    if( userColor.toLowerCase() !== generatedJoinDefaults.color.toLowerCase() ) preferences.userColor = userColor;
    try{
        window.localStorage.setItem(JOIN_PROFILE_STORAGE_KEY, JSON.stringify(preferences));
    }catch{
        // Local preference storage is optional and does not affect joining.
    }
}

// @fix:7d3e91a4
function saveJoinProfileDraft(){
    saveJoinProfilePreferences({
        userName: joinName.value.trim() || 'fish',
        userColor: joinColor.value,
    });
    syncJoinFishPreview();
}

// @ds:7f1a2c63 @ds:b6e39d14 @ia:4a8d0f72
function startEntryFlow(){
    const finishSplash = () =>{
        if( startupSplashReady ) return;
        startupSplashReady = true;
        if( net?.temporaryConnectionCode || net?.isJoined ) return;
        showNewJoinForm();
    };
    if( !startupSplash ){
        finishSplash();
        return;
    }
    startupSplash.addEventListener('animationend', event =>{
        if( event.animationName === 'startupSplashReveal' ) finishSplash();
    }, { once: true });
    const reducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
    window.setTimeout(finishSplash, reducedMotion ? 0 : 1100);
}

// @ds:b6e39d14 @ia:4a8d0f72
function showNewJoinForm(){
    if( !startupSplashReady ) return;
    startupSplash?.classList.remove('is-game');
    setJoinedUiState(false, { showJoinForm: true, sessionReady: true });
    if( joinName ) joinName.focus();
}

// @ds:b6e39d14 @ia:4a8d0f72
function revealGameSurface(){
    startupSplash?.classList.add('is-game');
}

if( leaveButton ){
    leaveButton.addEventListener('click', handleLeaveGameButton);
}
if( gameMenuToggle ){
    gameMenuToggle.addEventListener('click', toggleGameMenu);
    gameMenuToggle.setAttribute('aria-expanded', 'false');
}
if( worldMapToggle ){
    worldMapToggle.addEventListener('click', toggleWorldMap);
    worldMapToggle.setAttribute('aria-pressed', 'false');
}
// @ds:f3a1c7d9 @ds:b9e5d274
function toggleSyncSegments(){
    syncSegmentsVisible = !syncSegmentsVisible;
    if( syncSegmentsToggle ){
        syncSegmentsToggle.setAttribute('aria-pressed', String(syncSegmentsVisible));
        syncSegmentsToggle.classList.toggle('is-active', syncSegmentsVisible);
    }
}

// @ds:b9e5d274 @ds:e6d3b9a1
function toggleDangerMapUnderlay(){
    dangerMapVisible = !dangerMapVisible;
    if( dangerMapToggle ){
        dangerMapToggle.setAttribute('aria-pressed', String(dangerMapVisible));
        dangerMapToggle.classList.toggle('is-active', dangerMapVisible);
    }
    syncDangerMapTransport();
}

// @fix:6a7b8c9d
function setInfoPanelMode(mode){
    infoPanelMode = INFO_PANEL_MODES.includes(mode) ? mode : 'none';
    if( worldInfo ) worldInfo.hidden = infoPanelMode !== 'world';
    if( flowInfoPanel ) flowInfoPanel.hidden = infoPanelMode !== 'flow';
    if( recordsPanel ) recordsPanel.hidden = infoPanelMode !== 'records';
    if( infoPanelToggle ){
        const secondaryPanelActive = infoPanelMode === 'flow' || infoPanelMode === 'records';
        infoPanelToggle.setAttribute('aria-pressed', String(secondaryPanelActive));
        infoPanelToggle.setAttribute('aria-label', infoPanelMode === 'none'
            ? 'Show information panel'
            : `Information panel: ${infoPanelMode}`);
        infoPanelToggle.classList.toggle('is-active', secondaryPanelActive);
    }
    if( infoPanelMode === 'flow' ) updateFlowMetricsPanel();
    if( infoPanelMode === 'records' ) updateRecordsPanel(lastVisibleState?.world || state.world, true);
}

// @fix:6a7b8c9d
function toggleInfoPanel(){
    const index = INFO_PANEL_MODES.indexOf(infoPanelMode);
    setInfoPanelMode(INFO_PANEL_MODES[(index + 1) % INFO_PANEL_MODES.length]);
}

// @fix:entry-screen-reset
function resetEntryScreenPanels(){
    gameMenuOpen = false;
    infoPanelMode = 'none';
    debugMode = false;
    syncSegmentsVisible = false;
    worldMapVisible = false;
    flowMapVisible = false;
    flowVectorsVisible = false;
    dangerMapVisible = false;
    flowVectorsResetPending = false;
    debugPositionTraces.length = 0;
    setInfoPanelMode('none');
    updateWorldMapUi();
    if( syncSegmentsToggle ){
        syncSegmentsToggle.setAttribute('aria-pressed', 'false');
        syncSegmentsToggle.classList.remove('is-active');
    }
    if( flowMapToggle ){
        flowMapToggle.setAttribute('aria-pressed', 'false');
        flowMapToggle.classList.remove('is-active');
    }
    if( flowVectorsToggle ){
        flowVectorsToggle.setAttribute('aria-pressed', 'false');
        flowVectorsToggle.classList.remove('is-active');
    }
    if( dangerMapToggle ){
        dangerMapToggle.setAttribute('aria-pressed', 'false');
        dangerMapToggle.classList.remove('is-active');
    }
    syncDiagnosticMapTransport();
    updateGameMenu();
}

// @fix:4f8a2c71
function queueDecorativeTestSparks(){
    decorativeSparkTestTapCount = Math.min(3, decorativeSparkTestTapCount + 1);
    if( decorativeSparkTestTapTimer ) window.clearTimeout(decorativeSparkTestTapTimer);
    decorativeSparkTestTapTimer = window.setTimeout(() => {
        const tapCount = decorativeSparkTestTapCount;
        decorativeSparkTestTapCount = 0;
        decorativeSparkTestTapTimer = 0;
        const multiplier = tapCount >= 3 ? 4 : tapCount === 2 ? 2 : 1;
        spawnDecorativeTestSparks(multiplier);
    }, Math.max(100, Number(DEBUG.decorativeSparkTestTapWindowMs) || 350));
}

function spawnDecorativeTestSparks(multiplier = 1){
    const visibleState = lastVisibleState || state;
    const world = visibleState?.world || state.world;
    const followed = currentUserFish(world, visibleState?.currentUserFishId || state.currentUserFishId)
        || world?.fish?.[0];
    if( !world || !followed || !canvas || canvas.width <= 0 || canvas.height <= 0 ) return;

    for( let i = clientFinSparks.length - 1; i >= 0; i-- ){
        if( clientFinSparks[i]?.kind === 'decorative-test-grid' ) clientFinSparks.splice(i, 1);
    }

    const topLeft = viewportToWorld(
        { x: 0, y: 0 },
        world,
        followed,
        canvas,
        { viewportFishCapacity, cameraZoom, cameraPan },
    );
    const bottomRight = viewportToWorld(
        { x: canvas.width, y: canvas.height },
        world,
        followed,
        canvas,
        { viewportFishCapacity, cameraZoom, cameraPan },
    );
    const width = Math.max(1e-6, bottomRight.x - topLeft.x);
    const height = Math.max(1e-6, bottomRight.y - topLeft.y);
    const count = Math.max(1, Math.floor(Number(DEBUG.decorativeSparkTestCount) || 1000))
        * Math.max(1, Math.min(4, Number(multiplier) || 1));
    const columns = Math.max(1, Math.ceil(Math.sqrt(count * width / height)));
    const rows = Math.max(1, Math.ceil(count / columns));
    const life = Math.max(0.1, Number(DEBUG.decorativeSparkTestLifeSeconds) || 20);
    const now = performance.now();

    for( let index = 0; index < count; index++ ){
        const column = index % columns;
        const row = Math.floor(index / columns);
        const sizePx = 1 + Math.random() * 2;
        clientFinSparks.push({
            id: `decorative-test:${now}:${index}`,
            kind: 'decorative-test-grid',
            pos: {
                x: wrapValue(topLeft.x + (column + 0.5) / columns * width, world.width),
                y: wrapValue(topLeft.y + (row + 0.5) / rows * height, world.height),
            },
            vel: { x: 0, y: 0 },
            age: 0,
            life,
            initialSizePx: sizePx,
            minSizePx: sizePx,
            shrinkDuration: 0,
            sizePx,
            alphaScale: 1,
            shape: ['circle', 'square', 'triangle'][Math.floor(Math.random() * 3)],
            alpha: 0,
        });
    }
}

// @fix:f1c6a8d4
function updateControlLayoutToolsUi(announce = false){
    const labels = {
        joystick: 'Control mode: one joystick',
        touch: 'Control mode: touch',
        'dual-joystick': 'Control mode: two grips',
    };
    const names = {
        joystick: 'Joystick',
        touch: 'Touch',
        'dual-joystick': 'Two grips',
    };
    const icons = {
        joystick: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
        touch: '<path d="M8 11V6a2 2 0 0 1 4 0v5M12 10V5a2 2 0 0 1 4 0v7M16 10V7a2 2 0 0 1 4 0v7c0 4-2 7-7 7h-1c-3 0-5-2-7-5l-2-3a2 2 0 0 1 3-2l2 2"/>',
        'dual-joystick': '<circle cx="7" cy="12" r="4"/><circle cx="17" cy="12" r="4"/><path d="M7 5v3M7 16v3M2 12h3M9 12h-2M17 5v3M17 16v3M14 12h3M22 12h-3"/>',
    };
    if( uiLayoutToggle ){
        const toolActive = controlLayoutMode === 'joystick' ? joystickRelocationLocked : uiLayoutEditMode;
        uiLayoutToggle.setAttribute('aria-pressed', String(toolActive));
        uiLayoutToggle.classList.toggle('is-active', toolActive);
        uiLayoutToggle.setAttribute('aria-label', controlLayoutMode === 'joystick'
            ? (joystickRelocationLocked ? 'Unlock joystick position' : 'Lock joystick position')
            : (uiLayoutEditMode ? 'Finish moving controls' : 'Move controls'));
        const svg = uiLayoutToggle.querySelector('svg');
        if( svg ) svg.innerHTML = controlLayoutMode === 'joystick'
            ? (joystickRelocationLocked
                ? '<rect x="6" y="10" width="12" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'
                : '<rect x="6" y="10" width="12" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.2-2.4"/>')
            : '<path d="M12 3v18M3 12h18"/><path d="m12 3-2 3M12 3l2 3M12 21l-2-3M12 21l2-3M3 12l3-2M3 12l3 2M21 12l-3-2M21 12l-3 2"/>';
    }
    if( controlLayoutToggle ){
        controlLayoutToggle.setAttribute('aria-label', labels[controlLayoutMode]);
        controlLayoutToggle.setAttribute('aria-pressed', String(controlLayoutMode !== 'joystick'));
        controlLayoutToggle.setAttribute('data-control-layout', controlLayoutMode);
        controlLayoutToggle.classList.toggle('is-active', controlLayoutMode !== 'joystick');
        const svg = controlLayoutToggle.querySelector('svg');
        if( svg ) svg.innerHTML = icons[controlLayoutMode];
    }
    if( touchSpeedMetric ){
        touchSpeedMetric.style.pointerEvents = controlLayoutMode === 'touch' && uiLayoutEditMode ? 'auto' : 'none';
        touchSpeedMetric.classList.toggle('is-editable', controlLayoutMode === 'touch' && uiLayoutEditMode);
    }
    if( announce && controlLayoutToast ){
        controlLayoutToast.textContent = names[controlLayoutMode];
        controlLayoutToast.classList.add('is-visible');
        window.clearTimeout(controlLayoutToastTimer);
        controlLayoutToastTimer = window.setTimeout(() => controlLayoutToast.classList.remove('is-visible'), 2000);
    }
}

// @fix:f1c6a8d4
function toggleUiLayoutEditMode(){
    if( controlLayoutMode === 'joystick' ){
        joystickRelocationLocked = !joystickRelocationLocked;
        if( joystickRelocationLocked ){
            uiLayoutEditMode = false;
            input.joystick.active = false;
            input.joystick.vector = v(0, 0);
            input.joystick.rawVector = v(0, 0);
            if( joystickKnob ) joystickKnob.style.transform = 'translate(-50%, -50%)';
        }
    }else{
        uiLayoutEditMode = !uiLayoutEditMode;
    }
    updateControlLayoutToolsUi();
}

// @fix:70871bc5
function cycleControlLayoutMode(){
    const index = CONTROL_LAYOUT_MODES.indexOf(controlLayoutMode);
    controlLayoutMode = CONTROL_LAYOUT_MODES[(index + 1) % CONTROL_LAYOUT_MODES.length];
    setControlMode(controlLayoutMode === 'touch' ? 'touch' : 'joystick', { announce: false, preserveLayoutMode: true });
    updateControlLayoutToolsUi(true);
}

// @fix:6a7b8c9d
function toggleFlowMap(){
    flowMapVisible = !flowMapVisible;
    if( flowMapVisible ){
        worldMapVisible = true;
        updateWorldMapUi();
    }
    if( flowMapToggle ){
        flowMapToggle.setAttribute('aria-pressed', String(flowMapVisible));
        flowMapToggle.classList.toggle('is-active', flowMapVisible);
    }
    syncDiagnosticMapTransport();
}

// @fix:5f2a8c71
function toggleFlowVectors(){
    flowVectorsVisible = !flowVectorsVisible;
    if( flowVectorsVisible ){
        openFlowMapTransport(); // @fix:6a7b8c9d
        flowVectorsResetPending = true;
        resetClientFlowCrosses();
    }else if( !flowMapVisible ){
        closeFlowMapTransport(); // @fix:6a7b8c9d
    }
    if( flowVectorsToggle ){
        flowVectorsToggle.setAttribute('aria-pressed', String(flowVectorsVisible));
        flowVectorsToggle.classList.toggle('is-active', flowVectorsVisible);
    }
}

// @fix:1f5d8c42
function syncDangerMapTransport(){
    syncDiagnosticMapTransport();
}

// @fix:6a7b8c9d
function syncDiagnosticMapTransport(){
    if( dangerMapVisible ){
        dangerMapNet.open();
    }else{
        dangerMapNet.close();
        dangerMapBitmap?.close?.();
        dangerMapBitmap = null;
    }
    if( flowMapVisible || flowVectorsVisible ) openFlowMapTransport();
    else closeFlowMapTransport();
}

// @fix:4e9b2c71
function openFlowMapTransport(){
    if( flowMapLocalEnabled ) return;
    flowMapLocalEnabled = true;
    flowMapLastBuildAt = 0;
}

// @fix:4e9b2c71
function closeFlowMapTransport(){
    if( !flowMapLocalEnabled ) return;
    flowMapLocalEnabled = false;
    flowMapBitmap?.close?.();
    flowMapBitmap = null;
    flowMapField = null;
    flowMapSurface = null;
    flowVelocitySamples.clear();
    flowMapLastBuildAt = 0;
    flowMapFrameSerial++;
}

if( syncSegmentsToggle ) syncSegmentsToggle.addEventListener('click', toggleSyncSegments);
if( flowMapToggle ) flowMapToggle.addEventListener('click', toggleFlowMap);
if( flowVectorsToggle ) flowVectorsToggle.addEventListener('click', toggleFlowVectors);
if( dangerMapToggle ) dangerMapToggle.addEventListener('click', toggleDangerMapUnderlay);
if( infoPanelToggle ) infoPanelToggle.addEventListener('click', toggleInfoPanel);
if( decorativeSparksTestToggle ) decorativeSparksTestToggle.addEventListener('click', queueDecorativeTestSparks);
if( uiLayoutToggle ) uiLayoutToggle.addEventListener('click', toggleUiLayoutEditMode);
if( controlLayoutToggle ) controlLayoutToggle.addEventListener('click', cycleControlLayoutMode);
if( debugModeToggle ){
    debugModeToggle.addEventListener('click', toggleDebugMode);
    debugModeToggle.setAttribute('aria-pressed', 'false');
}
setupViewportFishCapacity();
setupViewportScaleWidget(); // @fix:394756ee
setupTouchSpeedMetricDrag(); // @fix:f1c6a8d4
setupControlModes();
setupCameraPan(); // @fix:32ef3d51
setupJoystickControls();
setupDualRightJoystickControls(); // @fix:dual-right-grip
setupDualBurstJoystickControls(); // @fix:dual-burst-grip
setInfoPanelMode('none'); // @fix:6a7b8c9d
updateControlLayoutToolsUi(); // @fix:f1c6a8d4
window.addEventListener('keydown', e =>{
    if( e.key === '`' || e.key === '~' ){
        e.preventDefault();
        toggleDebugMode();
    }
});

// @ds:8d13f6a2
async function showAppVersion(){
    if( !appVersion ) return;
    try{
        const response = await fetch('/version.json', { cache: 'no-store' });
        if( !response.ok ) throw new Error('version unavailable');
        const data = await response.json();
        appVersion.textContent = `version: ${data.version || fallbackVersion()}`;
    }catch{
        appVersion.textContent = `version: ${fallbackVersion()}`;
    }
}

function fallbackVersion(){
    return `${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}-unknown`;
}

// @ds:9772e9ac
function setJoinedUiState(joined, { showJoinForm = false, sessionReady = entrySessionReady } = {}){
    entrySessionReady = Boolean(sessionReady);
    const joinVisible = entrySessionReady && !joined && showJoinForm;
    const gameControlsVisible = entrySessionReady && joined;
    if( gameMenuToggle ) gameMenuToggle.hidden = !entrySessionReady;
    if( worldMapToggle ) worldMapToggle.hidden = !gameControlsVisible;
    if( infoPanelToggle ) infoPanelToggle.hidden = !gameControlsVisible;
    if( decorativeSparksTestToggle ) decorativeSparksTestToggle.hidden = !gameControlsVisible;
    if( !gameControlsVisible ) resetEntryScreenPanels(); // @fix:entry-screen-reset
    if( !entrySessionReady ){
        gameMenuOpen = false;
        if( gameMenu ) gameMenu.hidden = true;
    }
    if( leaveButton ){
        leaveButton.textContent = joined ? 'Выйти' : 'Войти';
        leaveButton.hidden = !entrySessionReady || joinVisible;
    }
    if( joinPanel ) joinPanel.hidden = !joinVisible;
    if( controlModes ) controlModes.hidden = !gameControlsVisible;
    if( controlHelp ) controlHelp.hidden = !gameControlsVisible;
    if( viewportLeftControls ) viewportLeftControls.hidden = !gameControlsVisible;
    if( !gameControlsVisible ){
        uiLayoutEditMode = false;
        resetDualRightJoystick();
        resetDualBurstJoystick();
        updateControlLayoutToolsUi();
    }
    updateJoystickPanelVisibility();
    updateTouchSpeedMetric(null, 0);
    updatePlayerMetricsVisibility(currentUserFish());
    updateGameMenu();
    updateWorldMapUi();
}

// @ds:9772e9ac
function handleLeaveGameButton(){
    if( net.isJoined ){
        net.leave();
        return;
    }
    setJoinedUiState(false, { showJoinForm: true, sessionReady: true });
    if( joinName ) joinName.focus();
}

let last = performance.now();
// ds:b28b7af6
function frame(now){
    let dt = (now - last) / 1000;
    last = now;
    dt = Math.min(dt, LOOP.maxDt);   // clamp — ecs-loop.dsr

    const visibleState = renderState(now);
    updateViewportScaleWidget(); // @fix:394756ee
    clampCameraPanToSafeArea(); // @fix:32ef3d51
    applyClientFishDecor(visibleState.world, clientBubbles, clientFinSparks, dt, Math.random); // @fix:4f8a2c71
    updateClientFlowField(visibleState.world, now); // @fix:6a7b8c9d
    advanceClientShredRotation(visibleState.world, dt, flowMapField); // @fix:4e9b2c71
    if( flowVectorsVisible ) advanceClientFlowCrosses(flowMapField, dt); // @fix:5f2a8c71
    advanceClientFinSparks(visibleState.world, clientFinSparks, dt, flowMapField); // @fix:4f8a2c71
    logFlowCycleMetrics(); // @fix:6a7b8c9d
    updateSizeDeltaLabels(visibleState.world, dt);
    lastVisibleState = visibleState;
    advanceClientBubbles(clientBubbles, clientBubbleEmitters, visibleState.world, dt, Math.random);
    if( debugMode ) recordDebugPositionTraces(now, visibleState.world);
    render(ctx, {
        ...visibleState,
        viewportFishCapacity,
        cameraZoom,
        cameraPan,
        clientBubbles,
        finSparks: clientFinSparks, // @fix:4f8a2c71
        sizeDeltaLabels: sizeDeltaLabelState.labels,
        debug: {
            enabled: debugMode,
            dangerMapUnderlay: debugMode && dangerMapVisible,
            flowMapUnderlay: debugMode && flowMapVisible, // @fix:6a7b8c9d
            positionTraces: debugPositionTraces,
            receivedQuadrants: [...debugReceivedQuadrants.values()],
            cellSyncAverages: debugSyncCellAverages(),
            now,
        },
        cellSyncAverages: debugSyncCellAverages(),
        syncSegmentsVisible,
        flowMapVisible,
        flowMapBitmap: flowMapVisible ? flowMapBitmap : null,
        flowVectorsVisible,
        flowVectorField: flowVectorsVisible ? flowMapField : null,
        dangerMapVisible,
        dangerMapBitmap: dangerMapVisible ? dangerMapBitmap : null,
        worldMapVisible,
        worldMapTop: getWorldMapTop(),
    });
    sendInputIfChanged(now);

    const serializePressed = input.keys.has('i') || input.keys.has('I');
    if( serializePressed && !serializeKeyLatch ){
        const fish = currentUserFish();
        if( fish ) console.log(serializeFish(fish));
    }
    serializeKeyLatch = serializePressed;

    const fish = currentUserFish();
    updatePlayerSizeMetric(fish);
    updatePlayerNameMetric(fish);
    updatePlayerSpeedMetric(fish);
    updatePlayerMetricsVisibility(fish);
    updateJoystickBurstAvailability(fish);
    updateDualBurstJoystickVisual(fish, now); // @fix:dual-burst-grip
    hudEaten.textContent = `${fish ? fish.eatenFishCount : 0}`;
    updatePlayerLifetimeBar(fish);
    updateWorldSnapshotInfo(state.world);
    updateRecordsPanel(state.world);
    updateGameMenu();
    if( fish ) hudStatus.textContent = fish.userTier === 'paid' ? 'paid' : 'free';

    requestAnimationFrame(frame);
}

// @ds:c5a92431 @ia:32288dfb
function updatePlayerNameMetric(fish){
    if( !playerName ) return;
    playerName.textContent = fish?.userName || '-';
    if( playerColorIndicator ) playerColorIndicator.style.setProperty('--player-color', fish?.userColor || '#75d4e6');
}

// @ds:b9136c2e
function updatePlayerSizeMetric(fish){
    if( !playerSizeValue ) return;
    playerSizeValue.textContent = fish ? fish.size.toFixed(1) : '-';
}

// @ds:c656f0ec
function updatePlayerSpeedMetric(fish){
    if( !playerSpeedMetric || !playerSpeedPercent || !playerSpeedReal ) return;
    const speed = fish ? Math.hypot(fish.vel?.x || 0, fish.vel?.y || 0) : 0;
    const displayed = Number(speed.toFixed(2));
    const level = Math.max(0, Math.min(REGIME.speedLevels, Math.floor(Number(fish?.speedLevel) || 0)));
    const visible = entrySessionReady && net?.isJoined && fish && level > 0;
    playerSpeedMetric.classList.toggle('is-visible', Boolean(visible));
    playerSpeedMetric.setAttribute('aria-hidden', visible ? 'false' : 'true');
    playerSpeedReal.textContent = displayed.toFixed(2);
    if( !fish || level <= 0 ){
        playerSpeedPercent.textContent = '0';
        playerSpeedPercent.style.color = '#11b8ee';
        updateTouchSpeedMetric(fish, level);
        return;
    }

    playerSpeedPercent.textContent = String(level);
    playerSpeedPercent.style.color = level > REGIME.cruiseMaxSpeedLevel
        ? burstSpeedColor(level)
        : '#11b8ee';
    updateTouchSpeedMetric(fish, level);
}

// @ds:c656f0ec
function updateTouchSpeedMetric(fish, level = Math.max(0, Math.min(REGIME.speedLevels, Math.floor(Number(fish?.speedLevel) || 0)))){
    if( !touchSpeedMetric || !touchSpeedValue || !touchSpeedMode ) return;
    const visible = Boolean(entrySessionReady && net?.isJoined && controlMode.active === 'touch' && fish);
    const burst = level > REGIME.cruiseMaxSpeedLevel;
    const editable = controlLayoutMode === 'touch' && uiLayoutEditMode;
    const key = `${visible}|${level}|${editable}`;
    if( key === touchSpeedMetricUiKey ) return;
    touchSpeedMetricUiKey = key;
    touchSpeedMetric.hidden = !visible;
    touchSpeedMetric.classList.toggle('is-burst', burst);
    touchSpeedMetric.style.pointerEvents = editable ? 'auto' : 'none';
    touchSpeedValue.textContent = String(level);
    touchSpeedMode.textContent = burst ? 'burst' : 'cruise';
    touchSpeedValue.style.color = burst ? burstSpeedColor(level) : '#11b8ee';
}

function burstSpeedColor(percent){
    const t = Math.max(0, Math.min(1, (percent - 1) / 98));
    return mixHexColor('#ffb14c', '#ff4f62', t);
}

// @ds:e41821af
function joystickCurrentSpeedColor(speedLevel){
    return speedLevel <= REGIME.cruiseMaxSpeedLevel ? '#4da3ff' : burstSpeedColor(speedLevel);
}

function mixHexColor(from, to, t){
    const a = parseHexColor(from);
    const b = parseHexColor(to);
    const channel = index => Math.round(a[index] + (b[index] - a[index]) * t);
    return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

function parseHexColor(hex){
    const value = hex.replace('#', '');
    return [
        parseInt(value.slice(0, 2), 16),
        parseInt(value.slice(2, 4), 16),
        parseInt(value.slice(4, 6), 16),
    ];
}

// @ds:2e91f6d4 @ds:b9136c2e
function updatePlayerMetricsVisibility(fish){
    if( !playerMetrics ) return;
    playerMetrics.hidden = !(entrySessionReady && net?.isJoined && fish);
}

// @ds:2e91f6d4
function updatePlayerLifetimeBar(fish){
    if( !lifetimeBar ) return;
    if( !fish ){
        lifetimeBar.style.transform = 'scaleX(0)';
        return;
    }
    const activeAge = Math.max(0, fish.playerActiveAge || 0);
    const lifetimeLimit = fish.lifetimeMode === 'lowSize'
        ? PLAYER.lowSizeMaxLifetimeSeconds
        : PLAYER.maxLifetimeSeconds;
    const ratio = Math.max(0, Math.min(1, 1 - activeAge / lifetimeLimit));
    const inFryStage = fish.fryAge !== null && fish.fryAge !== undefined;
    const remainingSeconds = Math.max(0, lifetimeLimit - activeAge);
    lifetimeBar.style.transform = `scaleX(${ratio.toFixed(3)})`;
    lifetimeBar.style.background = lifetimeBarColor(remainingSeconds, inFryStage);
}

function lifetimeBarColor(remainingSeconds, inFryStage){
    if( inFryStage ) return '#9edcff';
    if( remainingSeconds < 3 ) return '#ff5b5b';
    if( remainingSeconds < 10 ) return '#ffd84d';
    return '#7bd88f';
}

// @ds:e42a7c19
function updateWorldSnapshotInfo(world){
    const fishItems = world?.fish || [];
    const nutrientItems = world?.shreds || [];
    if( worldFishCount ) worldFishCount.textContent = formatCount(fishItems.length);
    if( worldFishArea ) worldFishArea.textContent = formatNutrition(sumFishNutrition(fishItems));
    if( worldNutrientCount ) worldNutrientCount.textContent = formatCount(nutrientItems.length);
    if( worldNutrientArea ) worldNutrientArea.textContent = formatNutrition(sumNutrientNutrition(nutrientItems, world));
}

// @fix:6a7b8c9d
function updateFlowMetricsPanel(snapshot = flowMetricsSnapshot){
    if( !snapshot ) return;
    const formatMs = value => Number.isFinite(value) ? `${value.toFixed(3)} ms` : '—';
    if( flowMetricWindow ) flowMetricWindow.textContent = snapshot.cycles > 0 ? `${snapshot.cycles} cycles / 5 s` : 'no completed cycles';
    if( flowMetricBuild ) flowMetricBuild.textContent = formatMs(snapshot.avgRawBuildMs);
    if( flowMetricRgb ) flowMetricRgb.textContent = formatMs(snapshot.avgRgbEncodeMs);
    if( flowMetricSurface ) flowMetricSurface.textContent = formatMs(snapshot.avgSurfaceMs);
    if( flowMetricSample ) flowMetricSample.textContent = `${formatMs(snapshot.avgRawSampleMs)} (${snapshot.rawSamples || 0})`;
    if( flowMetricCycle ) flowMetricCycle.textContent = formatMs(snapshot.avgCycleMs);
    if( flowMetricShape ) flowMetricShape.textContent = `${snapshot.cycles || 0} / ${snapshot.cells || 0}`;
}

// @fix:6a7b8c9d
function updateRecordsPanel(world, force = false){
    if( !recordsPanel || recordsPanel.hidden ) return;
    const now = performance.now();
    if( !force && now - recordsPanelUpdatedAt < 250 ) return;
    const fish = [...(world?.fish || [])].sort((a, b) => (Number(b?.size) || 0) - (Number(a?.size) || 0));
    const key = fish.map(item => [item.id, item.ownerKind, item.userName, item.size, item.eatenFishCount, Math.floor(recordLifetimeSeconds(item, now))].join(':')).join('|');
    if( !force && key === recordsPanelKey ) return;
    recordsPanelUpdatedAt = now;
    recordsPanelKey = key;
    const rowsFor = ownerKind => fish
        .filter(item => item.ownerKind === ownerKind)
        .map(item => `<tr><td>${escapeRecordText(recordLabel(item))}</td><td>${formatRecordSize(item.size)}</td><td>${formatCount(item.eatenFishCount)}</td><td>${formatFishLifetime(recordLifetimeSeconds(item, now))}</td></tr>`)
        .join('');
    if( userRecordRows ) userRecordRows.innerHTML = rowsFor('user') || '<tr><td colspan="4">—</td></tr>';
    if( npcRecordRows ) npcRecordRows.innerHTML = rowsFor('npc') || '<tr><td colspan="4">—</td></tr>';
}

// @fix:6a7b8c9d
function trackRecordFishAppearance(world, seenAt){
    const timestamp = Number.isFinite(seenAt) ? seenAt : performance.now();
    const visibleIds = new Set();
    for( const fish of world?.fish || [] ){
        if( fish?.id === undefined || fish?.id === null ) continue;
        visibleIds.add(fish.id);
        if( !recordFirstSeenAt.has(fish.id) ) recordFirstSeenAt.set(fish.id, timestamp);
    }
    for( const id of recordFirstSeenAt.keys() ){
        if( !visibleIds.has(id) ) recordFirstSeenAt.delete(id);
    }
}

function recordLifetimeSeconds(fish, now = performance.now()){
    const firstSeenAt = recordFirstSeenAt.get(fish?.id);
    if( Number.isFinite(firstSeenAt) ) return Math.max(0, (now - firstSeenAt) / 1000);
    return Math.max(0, Number(fish?.age) || 0);
}

function recordLabel(fish){
    if( fish?.ownerKind === 'user' ) return fish.userName || `user-${fish.id ?? '—'}`;
    return `#${fish?.id ?? '—'}`;
}

function formatRecordSize(size){
    const value = Number(size);
    return Number.isFinite(value) ? value.toFixed(1) : '—';
}

function formatFishLifetime(age){
    const seconds = Math.max(0, Number(age) || 0);
    if( seconds < 60 ) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function escapeRecordText(value){
    return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

// @ds:e7c2a901
function updateSyncRate(rate){
    if( !worldSyncRateValue ) return;
    const value = Number(rate);
    worldSyncRateValue.textContent = Number.isFinite(value) && value >= 0 ? `${Math.round(value)} B/s` : '—';
}

// @ds:e7c2a901
function updateEventRates(rates = {}){
    const dynamic = Number(rates.dynamic);
    const control = Number(rates.control);
    if( worldDynamicRateValue ) worldDynamicRateValue.textContent = `${Number.isFinite(dynamic) ? Math.max(0, Math.round(dynamic)) : 0} Ev/s`;
    if( worldControlRateValue ) worldControlRateValue.textContent = `${Number.isFinite(control) ? Math.max(0, Math.round(control)) : 0} Ev/s`;
}

function sumFishNutrition(fishItems){
    return fishItems.reduce((sum, fish) =>{
        const size = Number(fish?.size);
        return Number.isFinite(size) ? sum + Math.max(0, size) : sum;
    }, 0);
}

function sumNutrientNutrition(nutrientItems, world){
    const worldScale = Math.max(1e-6, Number(world?.scale) || 1);
    const baseRadius = FISH.nominalStartDiameter / 2 / worldScale;
    const baseFishArea = Math.PI * baseRadius * baseRadius;
    return nutrientItems.reduce((sum, nutrient) =>{
        const area = Number(nutrient?.geometricArea);
        if( !Number.isFinite(area) || area <= 0 ) return sum;
        const layers = Array.isArray(nutrient?.remainingLayers)
            ? nutrient.remainingLayers
            : SHRED.layerOrder.flat();
        const layerFraction = layers.reduce((layerSum, layer) => layerSum + (SHRED.layerFractions[layer] || 0), 0);
        return sum + area / Math.max(1e-6, baseFishArea) * layerFraction * SHRED.nutritionMultiplier;
    }, 0);
}

function formatCount(value){
    return String(Math.max(0, Number(value) || 0));
}

function formatNutrition(value){
    const nutrition = Math.max(0, Number(value) || 0);
    if( nutrition >= 1000 ) return `${Math.round(nutrition / 100) / 10}k`;
    return nutrition.toFixed(0);
}

// @ds:e559831a @ds:7b9a7984
function renderState(now){
    const latest = snapshotBuffer[snapshotBuffer.length - 1];
    if( !latest ) return state;

    return {
        ...state,
        currentUserFishId: latest.currentUserFishId,
        world: extrapolateWorld(latest.world, now),
    };
}

// @ds:8c663384
function extrapolateWorld(world, now){
    const shreds = (world.shreds || []).map(shred => extrapolateShred(shred, now, world.width, world.height)).filter(object => object.syncOpacity > 0);
    const fish = (world.fish || []).map(fish => extrapolateFish(fish, now, world.width, world.height)).filter(object => object.syncOpacity > 0);
    const liveKeys = new Set([
        ...fish.map(object => `fish:${object.id}`),
        ...shreds.map(object => `shred:${object.id}`),
    ]);
    for( const key of clientSyncRenderPositions.keys() ) if( !liveKeys.has(key) ) clientSyncRenderPositions.delete(key);
    return {
        ...world,
        bubbles: world.bubbles || [],
        shreds,
        fish,
    };
}

// @ds:8b62d9ce @ds:8c663384
function extrapolateShred(shred, now, worldWidth, worldHeight){
    const elapsedSeconds = Math.max(0, (now - (shred._syncBaseAt ?? now)) / 1000);
    const targetPos = {
        x: wrapValue(shred.pos.x + (shred.vel?.x || 0) * elapsedSeconds, worldWidth),
        y: wrapValue(shred.pos.y + (shred.vel?.y || 0) * elapsedSeconds, worldHeight),
    };
    return {
        ...shred,
        syncOpacity: syncOpacityAt(shred, now),
        pos: smoothSyncedPosition(`shred:${shred.id}`, targetPos, now, worldWidth, worldHeight), // @fix:b3d7e9a2
    };
}

// @fix:6a7b8c9d
function updateClientFlowField(world, now){
    const decorativeFlowNeeded = clientFinSparks.length > 0;
    if( (!flowMapLocalEnabled && !decorativeFlowNeeded) || (!flowMapVisible && !flowVectorsVisible && !decorativeFlowNeeded) || !world?.fish?.length ) return;
    if( cameraPointers.size > 0 ) return; // keep touch gestures free of flow rebuild work
    if( flowMapLastBuildAt && now - flowMapLastBuildAt < FLOW_MAP_LOCAL_UPDATE_MS ) return;
    const startedAt = performance.now();
    const elapsedSeconds = flowMapLastBuildAt > 0
        ? Math.max(0.016, (now - flowMapLastBuildAt) / 1000)
        : 1 / 30;
    const fish = world.fish.map(candidate => {
        const previous = flowVelocitySamples.get(candidate.id);
        const velocity = {
            x: Number(candidate.vel?.x) || 0,
            y: Number(candidate.vel?.y) || 0,
        };
        const previousVelocity = previous || null;
        const previousSpeed = previousVelocity
            ? Math.hypot(previousVelocity.x || 0, previousVelocity.y || 0)
            : Math.hypot(velocity.x, velocity.y);
        const currentSpeed = Math.hypot(velocity.x, velocity.y);
        const prevAccel = previous
            ? { x: (velocity.x - previous.x) / elapsedSeconds, y: (velocity.y - previous.y) / elapsedSeconds }
            : (candidate.prevAccel || { x: 0, y: 0 });
        flowVelocitySamples.set(candidate.id, velocity);
        return {
            ...candidate,
            prevAccel,
            previousSpeed,
            speedDecreasing: currentSpeed < previousSpeed - Math.max(1e-6, SHRED.flowSpeedDropEpsilon),
        };
    });
    const buildStartedAt = performance.now();
    const field = buildFlowField({ ...world, fish });
    const buildMs = performance.now() - buildStartedAt;
    const encodeStartedAt = performance.now();
    field.pixels = encodeClientFlowFieldPixels(field);
    const rgbEncodeMs = performance.now() - encodeStartedAt;
    const fieldLength = field.columns * field.rows;
    const sameGrid = flowMapField
        && field.columns === flowMapField.columns
        && field.rows === flowMapField.rows;
    field.crossAngles = sameGrid && flowMapField.crossAngles?.length === fieldLength
        ? flowMapField.crossAngles
        : new Float32Array(fieldLength);
    field.crossVelocities = sameGrid && flowMapField.crossVelocities?.length === fieldLength
        ? flowMapField.crossVelocities
        : new Float32Array(fieldLength);
    flowMapField = field;
    const surfaceStartedAt = performance.now();
    flowMapBitmap = updateClientFlowMapSurface(field);
    const surfaceMs = performance.now() - surfaceStartedAt;
    flowMapLastBuildAt = now;
    flowMapBuildMs = performance.now() - startedAt;
    flowMapBuildFishCount = fish.length;
    flowCycleMetrics.cycles++;
    flowCycleMetrics.totalMs += flowMapBuildMs;
    flowCycleMetrics.buildMs += buildMs;
    flowCycleMetrics.rgbEncodeMs += rgbEncodeMs;
    flowCycleMetrics.surfaceMs += surfaceMs;
}

// @fix:6a7b8c9d
function logFlowCycleMetrics(){
    const now = performance.now();
    if( !flowCycleMetrics.windowStartedAt ) flowCycleMetrics.windowStartedAt = now;
    if( now - flowCycleMetrics.windowStartedAt < 5000 ) return;
    const cycles = flowCycleMetrics.cycles;
    const snapshot = {
        cycles,
        fish: flowMapBuildFishCount,
        cells: flowMapField ? flowMapField.columns * flowMapField.rows : 0,
        avgCycleMs: cycles > 0 ? flowCycleMetrics.totalMs / cycles : null,
        avgRawBuildMs: cycles > 0 ? flowCycleMetrics.buildMs / cycles : null,
        avgRgbEncodeMs: cycles > 0 ? flowCycleMetrics.rgbEncodeMs / cycles : null,
        avgSurfaceMs: cycles > 0 ? flowCycleMetrics.surfaceMs / cycles : null,
        avgRawSampleMs: flowCycleMetrics.rawSampleCount > 0 ? flowCycleMetrics.rawSampleMs / flowCycleMetrics.rawSampleCount : null,
        rawSamples: flowCycleMetrics.rawSampleCount,
    };
    flowMetricsSnapshot = snapshot;
    updateFlowMetricsPanel(snapshot);
    console.info('[flow-map timings]', {
        ...snapshot,
        avgCycleMs: snapshot.avgCycleMs === null ? null : Number(snapshot.avgCycleMs.toFixed(3)),
        avgRawBuildMs: snapshot.avgRawBuildMs === null ? null : Number(snapshot.avgRawBuildMs.toFixed(3)),
        avgRgbEncodeMs: snapshot.avgRgbEncodeMs === null ? null : Number(snapshot.avgRgbEncodeMs.toFixed(3)),
        avgSurfaceMs: snapshot.avgSurfaceMs === null ? null : Number(snapshot.avgSurfaceMs.toFixed(3)),
        avgRawSampleMs: snapshot.avgRawSampleMs === null ? null : Number(snapshot.avgRawSampleMs.toFixed(5)),
        updateMs: FLOW_MAP_LOCAL_UPDATE_MS,
    });
    flowCycleMetrics.windowStartedAt = now;
    flowCycleMetrics.cycles = 0;
    flowCycleMetrics.totalMs = 0;
    flowCycleMetrics.buildMs = 0;
    flowCycleMetrics.rgbEncodeMs = 0;
    flowCycleMetrics.surfaceMs = 0;
    flowCycleMetrics.rawSampleMs = 0;
    flowCycleMetrics.rawSampleCount = 0;
}

const flowVelocitySamples = new Map(); // @fix:6a7b8c9d

// @fix:6a7b8c9d
function encodeClientFlowFieldPixels(field){
    const pixels = new Uint8ClampedArray(field.columns * field.rows * 4);
    const maxImpulse = Math.max(1, Number(field.maxImpulse) || SHRED.flowMapMaxImpulse);
    for( let index = 0; index < field.columns * field.rows; index++ ){
        const x = field.flowX[index] || 0;
        const y = field.flowY[index] || 0;
        const magnitude = Math.hypot(x, y);
        const angular = Math.max(-1, Math.min(1, Number(field.flowAngular?.[index]) || 0));
        const offset = index * 4;
        const angle = magnitude > 1e-6 ? (Math.atan2(y, x) + Math.PI) / (Math.PI * 2) : 0;
        const encodedAngle = Math.max(0, Math.min(65535, Math.round(angle * 65535)));
        pixels[offset] = encodedAngle >> 8;
        pixels[offset + 1] = encodedAngle & 255;
        pixels[offset + 2] = angular < 0
            ? Math.max(0, Math.min(127, Math.round(127 + angular * 127)))
            : Math.max(127, Math.min(255, Math.round(127 + angular * 128)));
        pixels[offset + 3] = Math.max(0, Math.min(255, Math.round(magnitude / maxImpulse * 255)));
    }
    return pixels;
}

// @fix:6a7b8c9d
function updateClientFlowMapSurface(field){
    if( typeof document === 'undefined' || !field?.pixels ) return null;
    if( !flowMapSurface || flowMapSurface.width !== field.columns || flowMapSurface.height !== field.rows ){
        flowMapSurface = document.createElement('canvas');
        flowMapSurface.width = field.columns;
        flowMapSurface.height = field.rows;
    }
    const context = flowMapSurface.getContext('2d');
    if( !context ) return flowMapSurface;
    const imageData = context.createImageData(field.columns, field.rows);
    imageData.data.set(field.pixels);
    context.putImageData(imageData, 0, 0);
    return flowMapSurface;
}

// @fix:4e9b2c71
function handleFlowMapFrame(bitmap){
    const serial = ++flowMapFrameSerial;
    flowMapBitmap?.close?.();
    flowMapBitmap = bitmap;
    decodeFlowMapBitmap(bitmap).then(field => {
        if( serial !== flowMapFrameSerial ) return;
        if( field && flowMapField && field.columns === flowMapField.columns && field.rows === flowMapField.rows ){
            field.crossAngles = flowMapField.crossAngles;
            field.crossVelocities = flowMapField.crossVelocities;
        }
        flowMapField = field;
        if( flowVectorsResetPending ){
            resetClientFlowCrosses();
            flowVectorsResetPending = false;
        }
    }).catch(() => {
        if( serial === flowMapFrameSerial ) flowMapField = null;
    });
}

// @fix:4e9b2c71
async function decodeFlowMapBitmap(bitmap){
    if( !bitmap?.width || !bitmap?.height ) return null;
    let surface;
    if( typeof OffscreenCanvas === 'function' ) surface = new OffscreenCanvas(bitmap.width, bitmap.height);
    else{
        surface = document.createElement('canvas');
        surface.width = bitmap.width;
        surface.height = bitmap.height;
    }
    const context = surface.getContext('2d', { willReadFrequently: true });
    if( !context ) return null;
    context.clearRect(0, 0, bitmap.width, bitmap.height);
    context.drawImage(bitmap, 0, 0);
    const length = bitmap.width * bitmap.height;
    return {
        columns: bitmap.width,
        rows: bitmap.height,
        pixels: context.getImageData(0, 0, bitmap.width, bitmap.height).data,
        crossAngles: new Float32Array(length),
        crossVelocities: new Float32Array(length),
    };
}

// @fix:5f2a8c71
function resetClientFlowCrosses(){
    if( !flowMapField ) return;
    flowMapField.crossAngles?.fill(0);
    flowMapField.crossVelocities?.fill(0);
}

// @fix:5f2a8c71
function advanceClientFlowCrosses(field, dt){
    if( !field || !Number.isFinite(dt) || dt <= 0 ) return;
    const length = field.columns * field.rows;
    if( field.crossAngles?.length !== length ) field.crossAngles = new Float32Array(length);
    if( field.crossVelocities?.length !== length ) field.crossVelocities = new Float32Array(length);
    const stride = Math.max(1, Math.floor(FLOW_MAP.vectorStrideCells));
    for( let y = 0; y < field.rows; y += stride ) for( let x = 0; x < field.columns; x += stride ){
        const index = y * field.columns + x;
        const alpha = field.pixels[index * 4 + 3] || 0;
        const byte = field.pixels[index * 4 + 2] || 127;
        const angular = alpha > 0 ? (byte <= 127 ? byte / 127 - 1 : (byte - 127) / 128) : 0;
        const velocity = field.crossVelocities[index] + angular * SHRED.flowAngularImpulseStrength * dt;
        field.crossVelocities[index] = velocity * Math.exp(-SHRED.flowAngularDrag * dt);
        field.crossAngles[index] += field.crossVelocities[index] * dt;
    }
}

// @fix:4e9b2c71
function advanceClientShredRotation(world, dt, field){
    if( !world || !Number.isFinite(dt) || dt <= 0 ) return;
    const seen = new Set();
    for( const shred of world.shreds || [] ){
        if( !shred?.pos || !Number.isFinite(shred.id) ) continue;
        const id = shred.id;
        seen.add(id);
        const spin = clientShredSpin.get(id) || { angle: 0, velocity: 0 };
        const impulse = field ? sampleAngularFlow(field, shred.pos) : 0;
        spin.velocity += impulse * SHRED.flowAngularImpulseStrength * dt;
        spin.velocity *= Math.exp(-SHRED.flowAngularDrag * dt);
        spin.angle += spin.velocity * dt;
        shred.renderRotation = spin.angle;
        clientShredSpin.set(id, spin);
    }
    for( const id of clientShredSpin.keys() ) if( !seen.has(id) ) clientShredSpin.delete(id);
}

// @fix:4e9b2c71
function sampleAngularFlow(field, position){
    const cellSize = FISH.nominalStartDiameter / 4;
    const gridX = position.x / cellSize - 0.5;
    const gridY = position.y / cellSize - 0.5;
    const x0 = Math.floor(gridX);
    const y0 = Math.floor(gridY);
    const tx = gridX - x0;
    const ty = gridY - y0;
    const at = (x, y) => {
        const wrappedX = ((x % field.columns) + field.columns) % field.columns;
        const wrappedY = ((y % field.rows) + field.rows) % field.rows;
        const pixel = (wrappedY * field.columns + wrappedX) * 4;
        if( (field.pixels[pixel + 3] || 0) === 0 ) return 0;
        const byte = field.pixels[pixel + 2];
        return byte <= 127 ? byte / 127 - 1 : (byte - 127) / 128;
    };
    return at(x0, y0) * (1 - tx) * (1 - ty)
        + at(x0 + 1, y0) * tx * (1 - ty)
        + at(x0, y0 + 1) * (1 - tx) * ty
        + at(x0 + 1, y0 + 1) * tx * ty;
}

// @fix:4f8a2c71
function sampleLinearFlow(field, position){
    if( !field || !position || !field.columns || !field.rows || !field.pixels ) return { x: 0, y: 0 };
    const cellSize = FISH.nominalStartDiameter / 4;
    const gridX = position.x / cellSize - 0.5;
    const gridY = position.y / cellSize - 0.5;
    const x0 = Math.floor(gridX);
    const y0 = Math.floor(gridY);
    const tx = gridX - x0;
    const ty = gridY - y0;
    const at = (x, y) => {
        const wrappedX = ((x % field.columns) + field.columns) % field.columns;
        const wrappedY = ((y % field.rows) + field.rows) % field.rows;
        const pixel = (wrappedY * field.columns + wrappedX) * 4;
        const magnitude = (field.pixels[pixel + 3] || 0) / 255 * SHRED.flowMapMaxImpulse;
        if( magnitude <= 1e-6 ) return { x: 0, y: 0 };
        const encodedAngle = ((field.pixels[pixel] || 0) * 256) + (field.pixels[pixel + 1] || 0);
        const angle = encodedAngle / 65535 * Math.PI * 2 - Math.PI;
        return { x: Math.cos(angle) * magnitude, y: Math.sin(angle) * magnitude };
    };
    const a = at(x0, y0);
    const b = at(x0 + 1, y0);
    const c = at(x0, y0 + 1);
    const d = at(x0 + 1, y0 + 1);
    return {
        x: a.x * (1 - tx) * (1 - ty) + b.x * tx * (1 - ty) + c.x * (1 - tx) * ty + d.x * tx * ty,
        y: a.y * (1 - tx) * (1 - ty) + b.y * tx * (1 - ty) + c.y * (1 - tx) * ty + d.y * tx * ty,
    };
}

function extrapolateFish(fish, now, worldWidth, worldHeight){
    const elapsedSeconds = Math.max(0, (now - (fish._syncBaseAt ?? now)) / 1000);
    const targetPos = {
        x: wrapValue(fish.pos.x + (fish.vel?.x || 0) * elapsedSeconds, worldWidth),
        y: wrapValue(fish.pos.y + (fish.vel?.y || 0) * elapsedSeconds, worldHeight),
    };
    return {
        ...fish,
        syncOpacity: syncOpacityAt(fish, now),
        pos: smoothSyncedPosition(`fish:${fish.id}`, targetPos, now, worldWidth, worldHeight), // @fix:b3d7e9a2
    };
}

// @fix:b3d7e9a2
function smoothSyncedPosition(key, target, now, worldWidth, worldHeight){
    if( !target || !Number.isFinite(target.x) || !Number.isFinite(target.y) ) return target;
    const previous = clientSyncRenderPositions.get(key);
    if( !previous || previous.width !== worldWidth || previous.height !== worldHeight ){
        clientSyncRenderPositions.set(key, { pos: { ...target }, lastAt: now, width: worldWidth, height: worldHeight });
        return { ...target };
    }
    const elapsed = Math.max(0, Math.min(0.2, (now - previous.lastAt) / 1000));
    const response = 1 - Math.exp(-SYNC.renderSmoothingRate * elapsed);
    previous.pos.x = wrapValue(previous.pos.x + toroidalDelta(target.x - previous.pos.x, worldWidth) * response, worldWidth);
    previous.pos.y = wrapValue(previous.pos.y + toroidalDelta(target.y - previous.pos.y, worldHeight) * response, worldHeight);
    previous.lastAt = now;
    return { ...previous.pos };
}

function wrapValue(value, size){
    if( !Number.isFinite(size) || size <= 0 ) return value;
    return ((value % size) + size) % size;
}

// @ds:975ca168 @ds:bd354b7a @ds:3ddf8f67 @ds:a44b9d2c @fn:a9a3ed12 @ia:9c0d1e2f @ia:3a4b5c6e
function applyClientFishDecor(world, bubbles, finSparks, dt, rng){
    emitShredEatSparks(world, finSparks, rng); // @fix:4f8a2c71
    const visibleFishIds = visibleDecorFishIds(world);
    for( const fishId of clientFishDecor.keys() ){
        if( !visibleFishIds.has(fishId) ) clientFishDecor.delete(fishId);
    }
    for( const fish of world.fish || [] ){
        if( !visibleFishIds.has(fish.id) ) continue;
        const decor = clientFishDecor.get(fish.id) || makeClientDecor(fish);
        updateClientDecorState(decor, fish, dt, bubbles, finSparks, rng);
        clientFishDecor.set(fish.id, decor);
        fish.exhale = decor.exhale;
        fish.visualScale = decor.visualScale;
        runExhaleCycle(fish, bubbles, rng, dt);
        decor.visualScale = fish.visualScale;
        fish.swimPhase = decor.swimPhase;
        fish.burstKick = decor.burstKick;
        fish.mouthOpen = decor.mouthOpen;
        fish.mouthSuctionImpulse = decor.mouthSuctionImpulse; // @fix:6a7b8c9d
        updateClientFishOrientation(decor, fish); // @fix:c13e07b3
        const inertialBraking = !fish.mode || fish.mode === 'cruise' && Number(fish.speedLevel || 0) === 0;
        const targetTilt = fish.mode === 'burst' && !inertialBraking
            ? visualFishTurnRadians(fish)
            : 0; // @fix:ab4142d8
        const tiltResponse = 1 - Math.exp(-SWIM.visualTiltResponse * Math.max(0, dt));
        decor.visualTilt += (targetTilt - decor.visualTilt) * tiltResponse;
        fish.visualTilt = decor.visualTilt;
        if( decor.shredBurstHold > 0 ) fish.mode = 'burst'; // @ds:a2d5936f
        if( decor.eatingCruiseHold > 0 ) fish.mode = 'cruise'; // @ds:975ca168
    }
}

// @fix:4f8a2c71
function emitShredEatSparks(world, finSparks, rng){
    if( !world || !Array.isArray(finSparks) || typeof rng !== 'function' ) return;
    const currentStates = new Map();
    const changedPositions = [];
    for( const shred of world.shreds || [] ){
        if( !shred?.pos || !Number.isFinite(shred.id) ) continue;
        const layers = Array.isArray(shred.remainingLayers) ? shred.remainingLayers : [];
        const current = {
            layerCount: layers.length,
            layerKey: layers.join('|'),
            color: shred.sourceColor || '#d6b84f',
            pos: { x: shred.pos.x, y: shred.pos.y },
        };
        currentStates.set(shred.id, current);
        const previous = clientShredLayerStates.get(shred.id);
        if( previous && current.layerCount < previous.layerCount ) changedPositions.push({ position: current.pos, color: current.color });
    }

    const missingPositions = [];
    for( const [shredId, previous] of clientShredLayerStates ){
        if( !currentStates.has(shredId) ) missingPositions.push({ position: previous.pos, color: previous.color });
    }

    let confirmedEatCount = 0;
    const fishIds = new Set();
    for( const fish of world.fish || [] ){
        if( !Number.isFinite(fish.id) ) continue;
        fishIds.add(fish.id);
        const currentCue = Math.max(0, Math.floor(Number(fish.shredEatCueCounter) || 0));
        const previousCue = clientShredEatCueCounters.get(fish.id);
        if( previousCue !== undefined && currentCue > previousCue ) confirmedEatCount += currentCue - previousCue;
        clientShredEatCueCounters.set(fish.id, currentCue);
    }
    for( const fishId of clientShredEatCueCounters.keys() ){
        if( !fishIds.has(fishId) ) clientShredEatCueCounters.delete(fishId);
    }

    const eventPositions = changedPositions.slice(0, confirmedEatCount);
    const missingEvents = Math.max(0, confirmedEatCount - eventPositions.length);
    for( let i = 0; i < missingEvents && i < missingPositions.length; i++ ) eventPositions.push(missingPositions[i]);
    for( const event of eventPositions ) emitShredEatSparkBurst(event.position, event.color, finSparks, rng);
    clientShredLayerStates.clear();
    for( const [shredId, current] of currentStates ) clientShredLayerStates.set(shredId, current);
}

// @fix:4f8a2c71
function emitShredEatSparkBurst(position, color, finSparks, rng){
    const minCount = Math.max(1, Math.floor(Number(SWIM.finSparkShredEatMinCount) || 2));
    const maxCount = Math.max(minCount, Math.floor(Number(SWIM.finSparkShredEatMaxCount) || minCount));
    const count = minCount + Math.floor(rng() * (maxCount - minCount + 1));
    const minImpulse = Math.max(0, Number(SWIM.finSparkShredEatImpulseMin) || 0);
    const maxImpulse = Math.max(minImpulse, Number(SWIM.finSparkShredEatImpulseMax) || minImpulse);
    const jitterRadius = Math.max(0, Number(SWIM.finSparkShredEatStartJitterWorldUnits) || 0);
    const life = Math.max(0.1, Number(SWIM.finSparkShredEatLifeSeconds) || 10);
    const minSizePx = Math.max(0.1, Number(SWIM.finSparkShredEatMinSizePx) || 1.5);
    const maxSizePx = Math.max(minSizePx, Number(SWIM.finSparkShredEatMaxSizePx) || minSizePx);
    const alphaScale = Math.max(0, Number(SWIM.finSparkShredEatAlpha) || 0)
        / Math.max(1e-6, Number(SWIM.finSparkAlpha) || 1);
    const minAngularVelocity = Math.max(0, Number(SWIM.finSparkShredEatInitialAngularVelocityMin) || 0);
    const maxAngularVelocity = Math.max(minAngularVelocity,
        Number(SWIM.finSparkShredEatInitialAngularVelocityMax) || minAngularVelocity);
    const shapes = Array.isArray(SWIM.finSparkShredEatShapes) && SWIM.finSparkShredEatShapes.length
        ? SWIM.finSparkShredEatShapes
        : ['circle'];
    for( let i = 0; i < count; i++ ){
        const angle = rng() * Math.PI * 2;
        const impulse = minImpulse + rng() * (maxImpulse - minImpulse);
        const jitterAngle = rng() * Math.PI * 2;
        const jitter = rng() * jitterRadius;
        const sizePx = minSizePx + rng() * (maxSizePx - minSizePx);
        const sizeRatio = (sizePx - minSizePx) / Math.max(1e-6, maxSizePx - minSizePx);
        const shrinkDuration = life * 0.5 * sizeRatio;
        const angularVelocity = (minAngularVelocity
            + rng() * (maxAngularVelocity - minAngularVelocity)) * (rng() < 0.5 ? -1 : 1);
        finSparks.push({
            id: `shred-eat:${performance.now()}:${finSparks.length}`,
            kind: 'shred-eat',
            pos: {
                x: position.x + Math.cos(jitterAngle) * jitter,
                y: position.y + Math.sin(jitterAngle) * jitter,
            },
            vel: { x: Math.cos(angle) * impulse, y: Math.sin(angle) * impulse },
            age: 0,
            life,
            initialSizePx: sizePx,
            minSizePx,
            shrinkDuration,
            sizePx,
            alphaScale,
            color: color || '#d6b84f',
            shape: shapes[Math.min(shapes.length - 1, Math.floor(rng() * shapes.length))],
            rotation: rng() * Math.PI * 2,
            angularVelocity,
            alpha: 0,
        });
    }
}

// @fix:4f8a2c71
function visibleDecorFishIds(world){
    const fishes = world?.fish || [];
    if( !fishes.length ) return new Set();
    const followed = currentUserFish(world) || fishes[0];
    const viewport = worldToViewport(world, followed, canvas, { viewportFishCapacity, cameraZoom });
    const halfWidth = canvas.width / Math.max(1e-6, viewport.scale) / 2;
    const halfHeight = canvas.height / Math.max(1e-6, viewport.scale) / 2;
    const margin = FISH.nominalStartDiameter * 2;
    return new Set(fishes.filter(fish => {
        if( (fish.syncOpacity ?? 1) <= 0 || !fish?.pos ) return false;
        const dx = toroidalDelta(fish.pos.x - followed.pos.x, world.width);
        const dy = toroidalDelta(fish.pos.y - followed.pos.y, world.height);
        return Math.abs(dx) <= halfWidth + margin + (fish.radius || 0)
            && Math.abs(dy) <= halfHeight + margin + (fish.radius || 0);
    }).map(fish => fish.id));
}

function toroidalDelta(value, size){
    if( !Number.isFinite(size) || size <= 0 ) return value;
    return ((value + size * 0.5) % size + size) % size - size * 0.5;
}

function makeClientDecor(fish){
    return {
        swimPhase: 0,
        visualTilt: 0, // @fix:6e2a9c41
        burstKick: 0,
        wasBurstSwimming: false,
        lastFinExtremeSide: 0, // @fix:4f8a2c71
        wasBurstActive: fish.mode === 'burst',
        lastBurstSpeedLevel: fish.mode === 'burst' ? Math.floor(Number(fish.speedLevel) || 0) : 0, // @fix:4f8a2c71
        lastDirection: null,
        lastMotionSample: null,
        lastVelocity: null,
        brakingDirection: null,
        brakingIntensity: { x: 0, y: 0 },
        visualFacing: fish.movementFacing ?? fish.facing ?? 1,
        visualDirection: null,
        visualScale: fish.visualScale || 1,
        exhale: {
            requested: false,
            requestedRedRatio: 0,
            redRatio: 0,
            stage: 'idle',
            t: 0,
            emitTimer: 0,
            emitCount: 0,
            emitTotal: 0,
        },
        mouthOpen: 0,
        mouthSuctionImpulse: 0, // @fix:6a7b8c9d
        mouthHold: 0,
        mouthEatenSize: 0,
        shredBurstHold: 0,
        eatingCruiseHold: 0,
        lastEatenFishCount: fish.eatenFishCount || 0,
        lastShredEatCueCounter: 0,
        lastSize: fish.size || 1,
    };
}

// @fix:c13e07b3
function updateClientFishOrientation(decor, fish){
    const velocity = v(Number(fish.vel?.x) || 0, Number(fish.vel?.y) || 0);
    const speed = Math.hypot(velocity.x, velocity.y);
    const sample = fish._syncCycle ?? null;
    if( decor.lastVelocity && (sample === null || sample !== decor.lastMotionSample) ){
        const braking = v(velocity.x - decor.lastVelocity.x, velocity.y - decor.lastVelocity.y);
        const brakingMagnitude = Math.hypot(braking.x, braking.y);
        const brakingAgainstMotion = braking.x * velocity.x + braking.y * velocity.y < 0;
        if( fish.reverseFacing && brakingMagnitude > 1e-4 && brakingAgainstMotion ){
            decor.brakingDirection = normalize(braking);
            decor.brakingIntensity = { x: Math.abs(braking.x), y: Math.abs(braking.y) };
        }
    }
    decor.lastVelocity = velocity;
    decor.lastMotionSample = sample;
    const movementFacing = fish.movementFacing ?? fish.facing ?? decor.visualFacing ?? 1;
    if( speed <= FISH.facingThreshold ){
        decor.visualDirection = null;
        decor.visualFacing = movementFacing;
        return;
    }
    if( !fish.reverseFacing ){
        decor.brakingDirection = null;
        decor.brakingIntensity = { x: 0, y: 0 };
        decor.visualDirection = velocity;
        decor.visualFacing = movementFacing;
        return;
    }
    const fallback = scale(normalize(velocity), -1);
    const direction = decor.brakingDirection || fallback;
    decor.visualDirection = direction;
    // Keep vertical motion readable without forcing a horizontal flip from
    // tiny X-axis noise; the tilt carries the dominant Y-axis direction.
    const brakingX = decor.brakingIntensity?.x || Math.abs(velocity.x);
    const brakingY = decor.brakingIntensity?.y || Math.abs(velocity.y);
    const horizontalBraking = brakingX > 1e-4 && brakingX >= brakingY;
    decor.visualFacing = horizontalBraking
        ? (direction.x < 0 ? -1 : 1)
        : movementFacing;
}

function updateClientDecorState(decor, fish, dt, bubbles, finSparks, rng){
    const previousMouthOpen = Math.max(0, Number(decor.mouthOpen) || 0);
    const impulseDecay = Math.exp(-Math.max(0, Number(dt) || 0) / Math.max(1e-6, MOUTH.suctionImpulseSeconds));
    decor.mouthSuctionImpulse = Math.max(0, (Number(decor.mouthSuctionImpulse) || 0) * impulseDecay);
    const speed = Math.hypot(fish.vel?.x || 0, fish.vel?.y || 0);
    const burstActive = fish.mode === 'burst';
    const burstSwimming = burstActive && speed > FISH.facingThreshold;
    const burstSpeedLevel = Math.floor(Number(fish.speedLevel) || 0);
    if( burstActive && burstSpeedLevel !== decor.lastBurstSpeedLevel ){
        emitFinSparks(fish, finSparks, rng, finAnimationIntensity(fish, decor)); // @fix:4f8a2c71
    }
    decor.lastBurstSpeedLevel = burstActive ? burstSpeedLevel : 0;
    if( burstActive !== decor.wasBurstActive ) emitMotionCueBubbles(fish, bubbles, rng); // @ds:3ddf8f67
    decor.wasBurstActive = burstActive;
    const direction = speed > FISH.facingThreshold ? normalize(fish.vel) : null;
    if( direction && decor.lastDirection && directionTurnDegrees(decor.lastDirection, direction) > 100 ){
        emitMotionCueBubbles(fish, bubbles, rng); // @ds:3ddf8f67
    }
    if( direction ) decor.lastDirection = direction;
    if( burstSwimming && !decor.wasBurstSwimming ) decor.burstKick = 1;
    decor.wasBurstSwimming = burstSwimming;
    decor.burstKick = Math.max(0, decor.burstKick - dt * SWIM.kickDecay);
    decor.swimPhase += dt * (SWIM.basePhaseRate + speed * SWIM.speedPhaseRate);
    const finExtremeSide = burstSwimming ? burstFinExtremeSide(decor.swimPhase) : 0;
    if( finExtremeSide && finExtremeSide !== decor.lastFinExtremeSide ){
        emitBurstExtremeFinSparks(fish, finSparks, rng, finAnimationIntensity(fish, decor)); // @fix:4f8a2c71
    }
    decor.lastFinExtremeSide = finExtremeSide;

    const eatenCount = fish.eatenFishCount || 0;
    if( eatenCount > decor.lastEatenFishCount ){
        requestExhale({ exhale: decor.exhale }, { redBubbleRatio: EXHALE.eatingRedBubbleRatio }); // @ds:a44b9d2c
        decor.eatingCruiseHold = Math.max(decor.eatingCruiseHold, MOUTH.eatingCruiseHoldSeconds); // @ds:975ca168
    }
    decor.lastEatenFishCount = eatenCount;
    const shredCueCounter = fish.shredEatCueCounter || 0;
    if( shredCueCounter > decor.lastShredEatCueCounter ){
        decor.shredBurstHold = Math.max(decor.shredBurstHold, SHRED.mouthCueSeconds);
        decor.mouthHold = Math.max(decor.mouthHold, SHRED.mouthCueSeconds);
        decor.mouthEatenSize = Math.max(decor.mouthEatenSize, fish.size || 1);
    }
    decor.lastShredEatCueCounter = shredCueCounter;
    decor.lastSize = fish.size || decor.lastSize;

    if( decor.eatingCruiseHold > 0 ) decor.eatingCruiseHold = Math.max(0, decor.eatingCruiseHold - dt);
    if( decor.shredBurstHold > 0 ) decor.shredBurstHold = Math.max(0, decor.shredBurstHold - dt);
    if( decor.mouthHold > 0 ) decor.mouthHold = Math.max(0, decor.mouthHold - dt);
    if( decor.mouthEatenSize > 0 ) decor.mouthEatenSize = Math.max(0, decor.mouthEatenSize - dt * Math.max(1, fish.size || 1) * 2);

    const closeForEating = decor.eatingCruiseHold > 0;
    const chaseOpen = burstSwimming && !closeForEating ? MOUTH.chaseOpenRatio : 0;
    const eatOpen = decor.mouthHold > 0 ? Math.min(1, decor.mouthEatenSize / Math.max(1, fish.size || 1)) : 0;
    decor.mouthOpen = closeForEating ? 0 : Math.max(chaseOpen, eatOpen);
    if( previousMouthOpen <= 0 && decor.mouthOpen > 0 ) decor.mouthSuctionImpulse = decor.mouthOpen;
}

// @fix:4f8a2c71
function finAnimationIntensity(fish, decor){
    const burstBlend = fish?.mode === 'burst' ? 1 : 0;
    const burstKick = Math.max(0, Math.min(1, Number(decor?.burstKick) || 0));
    const amplitude = SWIM.finBaseSwing + SWIM.finBurstSwing * (burstBlend + burstKick);
    const maximum = SWIM.finBaseSwing + SWIM.finBurstSwing * 2;
    return maximum > 0 ? Math.max(0, Math.min(1, amplitude / maximum)) : 0;
}

// @fix:4f8a2c71
function burstFinExtremeSide(swimPhase){
    const signal = Math.sin(swimPhase + Math.PI * 0.55);
    const threshold = Math.max(0, Math.min(1, Number(SWIM.finSparkBurstExtremeThreshold) || 0.88));
    if( signal >= threshold ) return 1;
    if( signal <= -threshold ) return -1;
    return 0;
}

// @fix:4f8a2c71
function emitBurstExtremeFinSparks(fish, finSparks, rng, animationIntensity){
    const maxBurstLevel = Math.max(1, Math.min(100, Number(REGIME.speedLevels) || 99));
    const speedLevel = Math.max(0, Math.min(maxBurstLevel, Math.floor(Number(fish?.speedLevel) || 0)));
    const chance = Math.min(1, speedLevel / maxBurstLevel * SWIM.finSparkBurstExtremeMaxChance);
    emitFinSparks(fish, finSparks, rng, animationIntensity, {
        chance,
        minCount: SWIM.finSparkBurstExtremeMinCount,
        maxCount: SWIM.finSparkBurstExtremeMaxCount,
        minSizePx: SWIM.finSparkBurstExtremeMinSizePx,
        maxSizePx: SWIM.finSparkBurstExtremeMaxSizePx,
    });
}

// @fix:4f8a2c71
function emitFinSparks(fish, finSparks, rng, animationIntensity = 1, options = {}){
    if( !Array.isArray(finSparks) || !fish?.pos || (fish.syncOpacity ?? 1) <= 0 ) return;
    const tips = fishFinTipPositions(fish);
    const chance = Math.max(0, Math.min(1, Number(options.chance ?? SWIM.finSparkChance) || 0));
    if( !tips.length || rng() > chance ) return;
    const countRange = sizeScaledFinSparkCountRange(
        fish,
        options.minCount ?? SWIM.finSparkMinCount,
        options.maxCount ?? SWIM.finSparkMaxCount,
    );
    const countMin = countRange.min;
    const resolvedCountMax = countRange.max;
    const minSizePx = Number(options.minSizePx ?? SWIM.finSparkMinSizePx) || SWIM.finSparkMinSizePx;
    const maxSizePx = Math.max(minSizePx, Number(options.maxSizePx ?? SWIM.finSparkMaxSizePx) || minSizePx);
    const count = countMin + Math.floor(rng() * (resolvedCountMax - countMin + 1));
    const alphaScale = 0.45 + 0.55 * Math.max(0, Math.min(1, Number(animationIntensity) || 0));
    for( let i = 0; i < count; i++ ){
        const tip = tips[i % tips.length];
        const finPass = Math.floor(i / tips.length);
        const finPasses = Math.max(1, Math.ceil(count / tips.length));
        const edgeProgress = finPasses <= 1 ? 1 : 1 - finPass / (finPasses - 1);
        const baseRatio = Math.max(0, Math.min(1, Number(SWIM.finSparkTrailingEdgeBaseRatio) || 0.5));
        const edgeRatio = baseRatio + (1 - baseRatio) * edgeProgress;
        const edgeOffset = {
            x: tip.offset.x * edgeRatio,
            y: tip.offset.y * edgeRatio,
        };
        const sizePx = minSizePx + rng() * (maxSizePx - minSizePx);
        const sizeRatio = (sizePx - minSizePx) / Math.max(1e-6, maxSizePx - minSizePx);
        const life = SWIM.finSparkSmallLifeSeconds + (SWIM.finSparkLargeLifeSeconds - SWIM.finSparkSmallLifeSeconds) * sizeRatio;
        const jitterRadius = rng() * SWIM.finSparkStartJitterWorldUnits;
        const jitterAngle = rng() * Math.PI * 2;
        finSparks.push({
            id: `${fish.id}:${performance.now()}:${finSparks.length}`,
            pos: {
                x: fish.pos.x + edgeOffset.x + Math.cos(jitterAngle) * jitterRadius,
                y: fish.pos.y + edgeOffset.y + Math.sin(jitterAngle) * jitterRadius,
            },
            vel: { x: 0, y: 0 },
            age: 0,
            life,
            initialSizePx: sizePx,
            minSizePx,
            shrinkDuration: life * 0.5 * sizeRatio,
            sizePx,
            alphaScale,
            alpha: 0,
        });
    }
}

// @fix:4f8a2c71
function sizeScaledFinSparkCountRange(fish, baseMin, baseMax){
    const minimum = Math.max(1, Math.floor(Number(baseMin) || 1));
    const maximum = Math.max(minimum, Math.floor(Number(baseMax) || minimum));
    const size = Math.max(1, Number(fish?.size) || 1);
    const size5Min = Math.max(minimum, Math.floor(Number(SWIM.finSparkSize5MinCount) || minimum));
    const size5Max = Math.max(size5Min, Math.floor(Number(SWIM.finSparkSize5MaxCount) || size5Min));
    const size10Min = Math.max(size5Min, Math.floor(Number(SWIM.finSparkSize10MinCount) || size5Min));
    const size10Max = Math.max(size10Min, Math.floor(Number(SWIM.finSparkSize10MaxCount) || size10Min));
    if( size <= 1 ) return { min: minimum, max: maximum };
    if( size <= 5 ){
        const t = (size - 1) / 4;
        return {
            min: Math.max(1, Math.round(minimum + (size5Min - minimum) * t)),
            max: Math.max(1, Math.round(maximum + (size5Max - maximum) * t)),
        };
    }
    const t = Math.min(1, (size - 5) / 5);
    return {
        min: Math.max(1, Math.round(size5Min + (size10Min - size5Min) * t)),
        max: Math.max(1, Math.round(size5Max + (size10Max - size5Max) * t)),
    };
}

// @fix:4f8a2c71
function advanceClientFinSparks(world, finSparks, dt, field){
    if( !Array.isArray(finSparks) || !world || !Number.isFinite(dt) || dt <= 0 ) return;
    for( let i = finSparks.length - 1; i >= 0; i-- ){
        const spark = finSparks[i];
        spark.age += dt;
        if( spark.age >= spark.life ){
            finSparks.splice(i, 1);
            continue;
        }
        const sampleStartedAt = performance.now();
        const flow = field?.flowX && field?.flowY
            ? sampleFlowField(field, spark.pos, world)
            : sampleLinearFlow(field, spark.pos);
        flowCycleMetrics.rawSampleMs += performance.now() - sampleStartedAt;
        flowCycleMetrics.rawSampleCount++;
        spark.vel.x += flow.x * SWIM.finSparkFlowResponse * dt;
        spark.vel.y += flow.y * SWIM.finSparkFlowResponse * dt;
        if( spark.shape && spark.shape !== 'circle' ){
            const angularImpulse = field ? sampleAngularFlow(field, spark.pos) : 0;
            spark.angularVelocity = (Number(spark.angularVelocity) || 0)
                + angularImpulse * SHRED.flowAngularImpulseStrength * dt;
            spark.angularVelocity *= Math.exp(-SHRED.flowAngularDrag * dt);
            spark.rotation = (Number(spark.rotation) || 0) + spark.angularVelocity * dt;
        }
        const speed = Math.hypot(spark.vel.x, spark.vel.y);
        const viscosity = Math.max(0, Number(SWIM.finSparkViscosityBase) || 0)
            + speed * Math.max(0, Number(SWIM.finSparkViscositySpeedFactor) || 0);
        const drag = Math.exp(-viscosity * dt);
        spark.vel.x *= drag;
        spark.vel.y *= drag;
        spark.pos.x = wrapValue(spark.pos.x + spark.vel.x * dt, world.width);
        spark.pos.y = wrapValue(spark.pos.y + spark.vel.y * dt, world.height);
        const birthDuration = Math.max(1e-6, Number(SWIM.finSparkBirthSeconds) || 0.1);
        const birthAlpha = Math.max(0, Math.min(1, spark.age / birthDuration));
        const alphaBase = SWIM.finSparkAlpha * Math.max(0, Math.min(1, Number(spark.alphaScale) || 1));
        const shrinkDuration = Math.max(0, Number(spark.shrinkDuration) || 0);
        if( shrinkDuration > 0 && spark.age < shrinkDuration ){
            const shrinkProgress = spark.age / shrinkDuration;
            const minSizePx = Number(spark.minSizePx) || SWIM.finSparkMinSizePx;
            spark.sizePx = spark.initialSizePx - (spark.initialSizePx - minSizePx) * shrinkProgress;
            spark.alpha = alphaBase * birthAlpha;
        }else{
            spark.sizePx = Number(spark.minSizePx) || SWIM.finSparkMinSizePx;
            const fadeDuration = Math.max(1e-6, spark.life - shrinkDuration);
            spark.alpha = alphaBase * birthAlpha * (1 - Math.max(0, spark.age - shrinkDuration) / fadeDuration);
        }
    }
}

// @ds:3ddf8f67 @ds:d6cebf86
function emitMotionCueBubbles(fish, bubbles, rng){
    if( !Array.isArray(bubbles) ) return;
    const count = 1 + Math.floor(rng() * 2);
    for( let i = 0; i < count; i++ ) bubbles.push(makeBubble(fish, rng));
}

function directionTurnDegrees(a, b){
    const dot = Math.max(-1, Math.min(1, (a.x || 0) * (b.x || 0) + (a.y || 0) * (b.y || 0)));
    return Math.acos(dot) * 180 / Math.PI;
}

// @ds:c2d7f4a1
function updateSizeDeltaLabels(visibleWorld, dt){
    const fish = currentUserFish(visibleWorld, state.currentUserFishId);
    advanceSizeDeltaLabelLifetimes(dt);
    if( !fish ){
        resetSizeDeltaLabelState();
        return;
    }
    if( sizeDeltaLabelState.fishId !== fish.id ){
        resetSizeDeltaLabelState(fish);
        return;
    }

    const currentSize = Number.isFinite(fish.size) ? fish.size : sizeDeltaLabelState.lastSize;
    if( !Number.isFinite(currentSize) ) return;
    const inStartGrowth = fish.fryAge !== null && fish.fryAge !== undefined && currentSize <= PLAYER.startSize;
    if( inStartGrowth ){
        sizeDeltaLabelState.lastSize = currentSize;
        sizeDeltaLabelState.remainder = 0;
        return;
    }
    const previousSize = fish.fryAge !== null && fish.fryAge !== undefined
        ? Math.max(sizeDeltaLabelState.lastSize, PLAYER.startSize)
        : sizeDeltaLabelState.lastSize;
    const delta = currentSize - previousSize;
    sizeDeltaLabelState.lastSize = currentSize;
    sizeDeltaLabelState.remainder += delta;

    const step = SIZE_DELTA_LABEL.step;
    let emitted = 0;
    let guard = 0;
    while( Math.abs(sizeDeltaLabelState.remainder) + 1e-9 >= step && guard < 100 ){
        const chunk = Math.sign(sizeDeltaLabelState.remainder) * step;
        emitted += chunk;
        sizeDeltaLabelState.remainder -= chunk;
        guard++;
    }
    if( Math.abs(emitted) >= step ){
        sizeDeltaLabelState.labels.push({
            fishId: fish.id,
            value: Number(emitted.toFixed(1)),
            age: 0,
            life: SIZE_DELTA_LABEL.lifeSeconds,
            yOffset: 0,
        });
    }
}

function resetSizeDeltaLabelState(fish = null){
    sizeDeltaLabelState.fishId = fish?.id ?? null;
    sizeDeltaLabelState.lastSize = Number.isFinite(fish?.size) ? fish.size : null;
    sizeDeltaLabelState.remainder = 0;
    sizeDeltaLabelState.labels = [];
}

function advanceSizeDeltaLabelLifetimes(dt){
    for( const label of sizeDeltaLabelState.labels ){
        label.age += dt;
        const t = Math.max(0, Math.min(1, label.age / label.life));
        label.yOffset = -SIZE_DELTA_LABEL.risePx * t;
    }
    sizeDeltaLabelState.labels = sizeDeltaLabelState.labels.filter(label => label.age < label.life);
}

// @ds:93b8abba @ds:10baf178 @ds:b43d2f95
function buildInputPayload(){
    const fish = currentUserFish();
    const activeInputMode = controlLayoutMode === 'dual-joystick' ? 'dual-joystick' : controlMode.active;
    let accel = keySteer(input.keys);
    const keyboardAccel = Boolean(accel);
    if( joystickBase ) joystickBase.classList.toggle('is-keyboard-control', keyboardAccel); // @fix:5d9e3a71
    if( activeInputMode === 'dual-joystick' && dualRightJoystickBase ){
        const rect = dualRightJoystickBase.getBoundingClientRect();
        const knobRadius = Math.max(0, (dualRightJoystickKnob?.getBoundingClientRect().width || JOYSTICK.dualKnobDiameterPx) / 2);
        const radius = Math.max(1, rect.width / 2 - knobRadius);
        // Keyboard direction is the same directional command as the right
        // grip. Keep the visual grip in sync without mutating pointer state.
        renderDualRightJoystick(keyboardAccel ? normalize(accel) : (input.rightJoystick.active ? input.rightJoystick.vector : v(0, 0)), radius);
    }
    if( !accel ){
        if( controlMode.active === 'pointer' && fish && input.pointer.active ){
            const worldPointer = viewportToWorld(input.pointer.pos, state.world, fish, canvas, { viewportFishCapacity, cameraZoom, cameraPan });
            accel = pointerSteer(fish.pos, { active: true, pos: worldPointer });
        }else if( controlMode.active === 'touch' && fish && input.pointer.active && input.touchDown ){
            input.pointer.vector = controlVectorFromFish(fish, input.pointer.pos);
            accel = scale(normalize(input.pointer.vector), FISH.accel * Math.min(1, Math.hypot(input.pointer.vector.x, input.pointer.vector.y)));
        }else if( activeInputMode === 'dual-joystick' ){
            accel = joystickSteer(input.rightJoystick);
        }else{
            accel = joystickSteer(input.joystick);
        }
    }
    const desiredLevel = speedLevel(input, activeInputMode);
    const level = fish ? availableSpeedLevelForSize(fish.size, desiredLevel) : desiredLevel;
    const keyboardCruise = keyboardAccel && level > 0 && level <= REGIME.cruiseMaxSpeedLevel;
    return {
        accel: accel ? normalize(accel) : v(0, 0),
        speedLevel: level,
        cruiseControl: keyboardCruise ? 'keyboard' : null,
    };
}

// @ds:10baf178 @ds:22fd3ab4 @ds:671e9773
function sendInputIfChanged(now){
    const payload = buildInputPayload();
    const key = inputPayloadKey(payload);
    if( key !== lastSentInputKey ){
        net.input(payload);
        lastSentInputKey = key;
        lastInputFlushAt = now;
        return;
    }
    if( now - lastInputFlushAt >= CONTROL_HEARTBEAT_MS ){
        net.input(payload);
        net.idle();
        lastInputFlushAt = now;
    }
}

// @ds:d6cebf86 @ia:3c4d5e6f
function advanceClientBubbles(bubbles, emitters, world, dt, rng){
    const visibleFishIds = new Set((world.fish || []).map(fish => fish.id));
    for( const fishId of emitters.keys() ){
        if( !visibleFishIds.has(fishId) ) emitters.delete(fishId);
    }
    for( const fish of world.fish || [] ){
        let emitter = emitters.get(fish.id);
        if( !emitter ){
            emitter = { bubbleTimer: 0, bubbleBurstRemaining: 0 };
            emitters.set(fish.id, emitter);
        }
        const bubbleFish = {
            ...fish,
            bubbleTimer: emitter.bubbleTimer,
            bubbleBurstRemaining: emitter.bubbleBurstRemaining,
        };
        const bubble = emitBubble(bubbleFish, dt, rng);
        emitter.bubbleTimer = bubbleFish.bubbleTimer;
        emitter.bubbleBurstRemaining = bubbleFish.bubbleBurstRemaining;
        if( bubble ) bubbles.push(bubble);
    }
    advanceBubbles(bubbles, world, dt);
}

function inputPayloadKey(payload){
    const accel = payload?.accel || {};
    const x = Math.max(-999, Math.min(999, Math.round((accel.x || 0) * 1000)));
    const y = Math.max(-999, Math.min(999, Math.round((accel.y || 0) * 1000)));
    return `${x}:${y}:v${payload?.speedLevel || 0}:${payload?.cruiseControl || ''}`;
}

function currentUserFishViewportPos(fish){
    const viewport = worldToViewport(state.world, fish, canvas, { viewportFishCapacity, cameraZoom, cameraPan });
    return v(fish.pos.x * viewport.scale + viewport.offsetX, fish.pos.y * viewport.scale + viewport.offsetY);
}

function controlVectorFromFish(fish, point){
    const center = currentUserFishViewportPos(fish);
    const raw = v((point?.x || 0) - center.x, (point?.y || 0) - center.y);
    const radius = invisibleJoystickRadius();
    const distance = Math.min(radius, Math.hypot(raw.x, raw.y));
    const direction = normalize(raw);
    return scale(direction, distance / radius);
}

function invisibleJoystickRadius(){
    return Math.max(1, Math.min(Math.min(window.innerWidth, window.innerHeight) * 0.4, 212));
}

// @ds:ab1e4f02
function toggleGameMenu(){
    gameMenuOpen = !gameMenuOpen;
    updateGameMenu();
}

// @ds:59c118f5
function toggleDebugMode(){
    debugMode = !debugMode;
    syncSegmentsVisible = debugMode;
    if( debugMode && entrySessionReady && net?.isJoined ){
        worldMapVisible = true;
        updateWorldMapUi();
    }
    if( syncSegmentsToggle ){
        syncSegmentsToggle.setAttribute('aria-pressed', String(syncSegmentsVisible));
        syncSegmentsToggle.classList.toggle('is-active', syncSegmentsVisible);
    }
    syncDangerMapTransport();
    updateGameMenu();
}

// @ds:3a980720
function toggleWorldMap(){
    if( !entrySessionReady || !net?.isJoined ) return;
    worldMapVisible = !worldMapVisible;
    updateWorldMapUi();
}

// @ds:3a980720
function updateWorldMapUi(){
    if( worldMapToggle ){
        worldMapToggle.setAttribute('aria-pressed', worldMapVisible ? 'true' : 'false');
        worldMapToggle.classList.toggle('is-active', worldMapVisible);
    }
    if( worldMap ) worldMap.hidden = !worldMapVisible;
}

// @ds:ab1e4f02 @ds:59c118f5 @ds:70871bc5 @ds:22fd3ab4
function updateGameMenu(){
    if( gameMenuToggle ) gameMenuToggle.setAttribute('aria-expanded', gameMenuOpen ? 'true' : 'false');
    if( gameMenu ) gameMenu.hidden = !gameMenuOpen || !entrySessionReady;
    if( debugModeToggle ) debugModeToggle.setAttribute('aria-pressed', debugMode ? 'true' : 'false');
    updateControlHelp();
    updateBurstEnduranceTable(currentUserFish());
}

// @ds:e001d967 @fix:a64e9b31
function setupViewportFishCapacity(){
    if( !viewportFishCapacitySelect ) return;
    updateViewportFishCapacityUi();
    const applySelection = () => setViewportFishCapacity(viewportFishCapacitySelect.value);
    viewportFishCapacitySelect.addEventListener('change', applySelection);
    viewportFishCapacitySelect.addEventListener('input', applySelection);
}

// @fix:394756ee
function updateViewportFishCapacityUi(){
    if( !viewportFishCapacitySelect ) return;
    const customOption = viewportFishCapacitySelect.querySelector('option[value="custom"]');
    let selectedValue = viewportFishCapacity;
    let customLabel = 'текущий масштаб';
    let customHidden = true;
    if( Number.isFinite(cameraZoom) ){
        const world = lastVisibleState?.world || state.world;
        const capacity = world && canvas.width > 0 && canvas.height > 0
            ? viewportCapacityForZoom(world, canvas, cameraZoom)
            : null;
        selectedValue = 'custom';
        customHidden = false;
        customLabel = capacity ? `текущий (${capacity.toFixed(1)})` : 'текущий масштаб';
    }
    const key = `${selectedValue}|${customLabel}|${customHidden}`;
    if( key === viewportFishCapacityUiKey ) return;
    viewportFishCapacityUiKey = key;
    if( customOption ){
        customOption.hidden = customHidden;
        if( customOption.textContent !== customLabel ) customOption.textContent = customLabel;
    }
    if( viewportFishCapacitySelect.value !== selectedValue ) viewportFishCapacitySelect.value = selectedValue;
}

// @fix:394756ee
function updateViewportScaleWidget(){
    if( !viewportScaleWidget || !viewportScaleMarker ) return;
    const world = lastVisibleState?.world || state.world;
    const zoom = Number.isFinite(cameraZoom)
        ? cameraZoom
        : (world && canvas.width > 0 && canvas.height > 0
            ? viewportZoomForCapacity(world, canvas, viewportFishCapacity)
            : 0);
    const position = Math.max(0, Math.min(1, Number(zoom) || 0));
    const key = position.toFixed(4);
    if( key === viewportScaleWidgetKey ) return;
    viewportScaleWidgetKey = key;
    viewportScaleMarker.style.top = `${(position * 100).toFixed(2)}%`;
}

// @fix:394756ee
function setupViewportScaleWidget(){
    if( !viewportScaleWidget || !viewportScaleTrack || !viewportScaleMarker ) return;
    const setFromPointer = e =>{
        const rect = viewportScaleTrack.getBoundingClientRect();
        const position = Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height)));
        cameraZoom = position;
        viewportScaleWidgetKey = null;
        updateViewportScaleWidget();
    };
    viewportScaleWidget.addEventListener('pointerdown', e =>{
        if( e.pointerType === 'mouse' && e.button !== 0 ) return;
        viewportScalePointerId = e.pointerId;
        cameraZoom = ensureCameraZoom();
        viewportScaleWidget.setPointerCapture?.(e.pointerId);
        setFromPointer(e);
        e.preventDefault();
    });
    viewportScaleWidget.addEventListener('pointermove', e =>{
        if( e.pointerId !== viewportScalePointerId ) return;
        setFromPointer(e);
        e.preventDefault();
    });
    const release = e =>{
        if( e.pointerId !== viewportScalePointerId ) return;
        saveCameraZoom();
        updateViewportFishCapacityUi();
        viewportScalePointerId = null;
    };
    viewportScaleWidget.addEventListener('pointerup', release);
    viewportScaleWidget.addEventListener('pointercancel', release);
}

// @fix:f1c6a8d4
function setupTouchSpeedMetricDrag(){
    if( !touchSpeedMetric ) return;
    touchSpeedMetric.addEventListener('pointerdown', e =>{
        if( controlLayoutMode !== 'touch' || !uiLayoutEditMode ) return;
        const rect = touchSpeedMetric.getBoundingClientRect();
        touchSpeedPointerId = e.pointerId;
        touchSpeedDragOffset = v(e.clientX - rect.left, e.clientY - rect.top);
        touchSpeedMetric.setPointerCapture?.(e.pointerId);
        e.preventDefault();
    });
    touchSpeedMetric.addEventListener('pointermove', e =>{
        if( e.pointerId !== touchSpeedPointerId || !touchSpeedDragOffset ) return;
        const width = touchSpeedMetric.offsetWidth;
        const height = touchSpeedMetric.offsetHeight;
        const viewportWidth = Math.max(1, window.visualViewport?.width || window.innerWidth);
        const viewportHeight = Math.max(1, window.visualViewport?.height || window.innerHeight);
        const left = Math.max(8, Math.min(viewportWidth - width - 8, e.clientX - touchSpeedDragOffset.x));
        const top = Math.max(8, Math.min(viewportHeight - height - 8, e.clientY - touchSpeedDragOffset.y));
        touchSpeedMetric.style.left = `${left}px`;
        touchSpeedMetric.style.top = `${top}px`;
        touchSpeedMetric.style.right = 'auto';
        touchSpeedMetric.style.bottom = 'auto';
        e.preventDefault();
    });
    const release = e =>{
        if( e.pointerId !== touchSpeedPointerId ) return;
        touchSpeedPointerId = null;
        touchSpeedDragOffset = null;
    };
    touchSpeedMetric.addEventListener('pointerup', release);
    touchSpeedMetric.addEventListener('pointercancel', release);
}

// @fix:a64e9b31
function loadViewportFishCapacity(){
    try{
        const stored = window.localStorage.getItem(VIEWPORT_FISH_CAPACITY_STORAGE_KEY);
        return VIEWPORT_FISH_CAPACITY.options.includes(stored)
            ? stored
            : VIEWPORT_FISH_CAPACITY.defaultValue;
    }catch{
        return VIEWPORT_FISH_CAPACITY.defaultValue;
    }
}

// @fix:394756ee
function loadCameraZoom(){
    try{
        const stored = Number(window.localStorage.getItem(VIEWPORT_CAMERA_ZOOM_STORAGE_KEY));
        return Number.isFinite(stored) ? Math.max(0, Math.min(1, stored)) : null;
    }catch{
        return null;
    }
}

// @fix:394756ee
function saveCameraZoom(){
    if( !Number.isFinite(cameraZoom) ) return;
    try{
        window.localStorage.setItem(VIEWPORT_CAMERA_ZOOM_STORAGE_KEY, String(cameraZoom));
    }catch{
        // The in-memory zoom remains usable when storage is disabled.
    }
}

// @ds:e001d967 @fix:a64e9b31
function setViewportFishCapacity(value){
    if( value === 'custom' ){
        updateViewportFishCapacityUi();
        return;
    }
    viewportFishCapacity = VIEWPORT_FISH_CAPACITY.options.includes(value)
        ? value
        : VIEWPORT_FISH_CAPACITY.defaultValue;
    cameraZoom = null;
    viewportFishCapacityUiKey = null;
    viewportScaleWidgetKey = null;
    updateViewportFishCapacityUi();
    try{
        window.localStorage.setItem(VIEWPORT_FISH_CAPACITY_STORAGE_KEY, viewportFishCapacity);
        window.localStorage.removeItem(VIEWPORT_CAMERA_ZOOM_STORAGE_KEY);
    }catch{
        // The in-memory display preference remains available when storage is disabled.
    }
}

// @ds:70871bc5
function setupControlModes(){
    setControlMode(controlMode.active, { announce: false });
    for( const button of controlModeButtons ){
        button.addEventListener('click', () => setControlMode(button.dataset.controlMode, { announce: true }));
    }
}

function setControlMode(mode, { announce = false, preserveLayoutMode = false } = {}){
    const previousLayoutMode = controlLayoutMode;
    controlMode.active = mode === 'keyboard' ? 'joystick' : (mode || controlMode.active);
    if( !preserveLayoutMode ){
        controlLayoutMode = controlMode.active === 'touch' ? 'touch' : 'joystick';
    }
    if( controlLayoutMode === 'joystick' ){
        // One joystick starts movable; the lock button opts into fixation.
        joystickRelocationLocked = false;
        uiLayoutEditMode = false;
    }else if( controlLayoutMode === 'touch' ){
        // Touch layout starts editable so its speed/burst indicator can be placed.
        joystickRelocationLocked = false;
        uiLayoutEditMode = true;
    }else{
        // Two-grip layout starts fixed until the move button is pressed.
        joystickRelocationLocked = false;
        uiLayoutEditMode = false;
    }
    for( const button of controlModeButtons ){
        const active = button.dataset.controlMode === controlMode.active;
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    updateJoystickPanelVisibility();
    input.pointer.lockedByKeyboard = false;
    input.joystick.active = false;
    input.joystick.vector = v(0, 0);
    input.joystick.rawVector = v(0, 0);
    if( joystickKnob ) joystickKnob.style.transform = 'translate(-50%, -50%)';
    resetDualRightJoystick();
    resetDualBurstJoystick();
    updateControlHelp();
    updateControlLayoutToolsUi(announce && previousLayoutMode !== controlLayoutMode);
    lastSentInputKey = null;
}

// @ds:ab1e4f02 @ds:22fd3ab4 @ds:93b8abba
function updateControlHelp(){
    if( !controlHelp ) return;
    const help = {
        keyboard: 'Клавиши активны всегда: WASD/стрелки — движение; Space или 1 — v31, 2 — v65, 3 — v99.',
        pointer: 'Экспериментальная мышь: указатель задаёт направление; удержание кнопки мыши — v31. Клавиши активны.',
        touch: 'Экспериментальный тач: касание вокруг рыбы задаёт направление и v0..v99. Клавиши активны.',
        joystick: 'Визуальный джойстик: рукоятка задаёт направление и v0..v99. Клавиши активны.',
        'dual-joystick': 'Два джойстика: правый задаёт направление и cruise v0..v30. Клавиши активны.',
    };
    const activeMode = controlLayoutMode === 'dual-joystick' ? 'dual-joystick' : controlMode.active;
    controlHelp.textContent = `${help[activeMode] || help.keyboard} Клик по рыбе — serialize.`;
}

// @ds:cff27cd5
function updateBurstEnduranceTable(fish){
    if( !burstEnduranceRows || !gameMenuOpen ) return;
    const currentSize = Number(fish?.size);
    const key = Number.isFinite(currentSize) ? currentSize.toFixed(3) : 'none';
    if( key === burstEnduranceTableKey ) return;
    burstEnduranceTableKey = key;
    const rows = [];
    for( let level = 1; level <= REGIME.speedLevels; level++ ){
        const threshold = BURST_ENDURANCE_SIZE_THRESHOLDS[level] || 0;
        const burst = level >= REGIME.burstStartSpeedLevel;
        const available = !burst || (Number.isFinite(currentSize) && currentSize >= threshold);
        const energyFactor = burst ? burstEnergyFactorOf(level) : 0;
        const loss = burst && Number.isFinite(currentSize)
            ? currentSize * ENERGY.lossPerRef * energyFactor
            : 0;
        const speed = Number.isFinite(currentSize) ? speedCapOf(currentSize, 'user', level) : 0;
        const seconds = burst && speed > 0 ? (ENERGY.refSizes * currentSize) / speed : 0;
        rows.push(`<tr class="${available ? 'is-available' : 'is-locked'}"><td>${level}</td><td>${burst ? 'burst' : 'cruise'}</td><td>${burst ? formatThresholdSize(threshold) : '-'}</td><td>${energyFactor.toFixed(2)}</td><td>${loss.toFixed(3)} / ${seconds.toFixed(1)}s</td><td>${available ? 'yes' : '-'}</td></tr>`);
    }
    burstEnduranceRows.innerHTML = rows.join('');
}

function formatThresholdSize(size){
    if( !Number.isFinite(size) ) return '-';
    return size < 10 ? size.toFixed(2) : size.toFixed(1);
}

// @ds:cd1c5776 @ds:9772e9ac @ds:93b8abba
function updateJoystickPanelVisibility(){
    const visible = isJoystickPanelVisible();
    if( joystickPanel ) joystickPanel.hidden = !visible;
    const dualVisible = isDualRightJoystickVisible();
    if( dualRightJoystickPanel ) dualRightJoystickPanel.hidden = !dualVisible;
    if( dualBurstPanel ) dualBurstPanel.hidden = !dualVisible;
    dualBurstScale = null; // @fix:dual-burst-grip
    if( visible || dualVisible ) requestAnimationFrame(restoreControlLayoutPositions); // @fix:control-viewport-layout
}

function isJoystickPanelVisible(){
    return Boolean(entrySessionReady && net?.isJoined && controlLayoutMode === 'joystick'
        && controlMode.active !== 'pointer' && controlMode.active !== 'touch');
}

function isDualRightJoystickVisible(){
    return Boolean(entrySessionReady && net?.isJoined && controlLayoutMode === 'dual-joystick');
}

// @ds:0eef2d19 @ds:e6be3c03 @ds:e41821af
function updateJoystickBurstAvailability(fish){
    if( !joystickBase ) return;
    joystickAvailableLevel = fish ? availableSpeedLevelForSize(fish.size, REGIME.speedLevels) : REGIME.speedLevels;
    if( joystickAvailableLevel !== joystickRenderedAvailabilityLevel ){
        renderJoystickBurstRings(joystickAvailableLevel);
        joystickRenderedAvailabilityLevel = joystickAvailableLevel;
    }
    updateJoystickCurrentBurstRing(fish);
    if( input.joystick.active ){
        input.joystick.vector = clampJoystickVectorToAvailableBurst(input.joystick.rawVector);
        renderJoystickKnob(input.joystick.vector);
    }
}

function renderJoystickBurstRings(availableLevel){
    if( !joystickBurstRings ) return;
    if( joystickBase ) joystickBase.style.setProperty('--cruise-base-diameter', `${speedLevelToControlMagnitude(REGIME.cruiseMaxSpeedLevel) * 100}%`);
    if( joystickBurstBase ) joystickBurstBase.style.setProperty('--burst-base-diameter', `${speedLevelToControlMagnitude(REGIME.burstStartSpeedLevel) * 100}%`);
    const maxLevel = Math.max(1, Math.min(REGIME.speedLevels, Math.floor(Number(availableLevel) || 1)));
    const ringLevels = [30, 31, 40, 50, 60, 70, 80, 90, 99]; // @fix:8c4f2a71
    const ringSpecs = ringLevels.map(level => ({
        level,
        diameter: speedLevelToControlMagnitude(level) * 100,
        color: level <= maxLevel ? 'rgba(210, 151, 76, 0.42)' : 'rgba(150, 158, 164, 0.12)',
        width: 1,
    }));
    for( const level of ringLevels ){
        if( level === maxLevel ) return renderJoystickRingSpecs(ringSpecs);
    }
    ringSpecs.push({
        level: maxLevel,
        diameter: speedLevelToControlMagnitude(maxLevel) * 100,
        color: 'rgba(255, 228, 92, 0.28)',
        width: 1.6,
    });
    renderJoystickRingSpecs(ringSpecs.sort((a, b) => a.diameter - b.diameter));
}

function renderJoystickRingSpecs(ringSpecs){
    if( !joystickBurstRings ) return;
    while( joystickBurstRings.children.length > ringSpecs.length ) joystickBurstRings.lastElementChild.remove();
    while( joystickBurstRings.children.length < ringSpecs.length ){
        const ring = document.createElement('div');
        ring.className = 'joystick-burst-ring';
        joystickBurstRings.appendChild(ring);
    }
    ringSpecs.forEach((spec, index) =>{
        const ring = joystickBurstRings.children[index];
        ring.style.setProperty('--burst-ring-diameter', `${spec.diameter.toFixed(2)}%`);
        ring.style.setProperty('--burst-ring-color', spec.color);
        ring.style.setProperty('--burst-ring-width', `${spec.width}px`);
    });
}

function updateJoystickCurrentBurstRing(fish){
    if( !joystickCurrentBurstRing ) return;
    const appliedLevel = Math.max(0, Math.min(REGIME.speedLevels, Math.floor(Number(fish?.speedLevel) || 0)));
    if( appliedLevel === joystickCurrentBurstRingLevel ) return;
    joystickCurrentBurstRingLevel = appliedLevel;
    const visible = appliedLevel > 0;
    joystickCurrentBurstRing.classList.toggle('is-visible', visible);
    if( !visible ) return;
    const diameter = speedLevelToControlMagnitude(appliedLevel) * 100;
    joystickCurrentBurstRing.style.setProperty('--current-burst-diameter', `${diameter.toFixed(2)}%`);
    joystickCurrentBurstRing.style.setProperty('--current-burst-color', joystickCurrentSpeedColor(appliedLevel));
}

function clampJoystickVectorToAvailableBurst(rawVector){
    const raw = rawVector || v(0, 0);
    const magnitude = Math.min(1, Math.hypot(raw.x, raw.y));
    if( magnitude < 1e-3 ) return v(0, 0);
    const availableMagnitude = speedLevelToControlMagnitude(joystickAvailableLevel);
    return scale(normalize(raw), Math.min(magnitude, availableMagnitude));
}

function renderJoystickKnob(vector){
    if( !joystickBase || !joystickKnob ) return;
    const rect = joystickBase.getBoundingClientRect();
    const radius = Math.max(1, rect.width / 2);
    const magnitude = Math.min(1, Math.hypot(vector.x, vector.y));
    const direction = magnitude > 1e-3 ? normalize(vector) : v(0, 0);
    const distance = magnitude * radius;
    joystickKnob.style.transform = `translate(calc(-50% + ${direction.x * distance}px), calc(-50% + ${direction.y * distance}px))`;
}

// @fix:32ef3d51
function cameraPanEnabled(e){
    return e.pointerType === 'touch'
        && controlMode.active !== 'touch'
        && controlMode.active !== 'pointer'
        && !controlLayoutIsFixed();
}

// @fix:f1c6a8d4
function controlLayoutIsFixed(){
    return controlLayoutMode === 'joystick' ? joystickRelocationLocked : !uiLayoutEditMode;
}

// @fix:32ef3d51
function ensureCameraZoom(){
    if( Number.isFinite(cameraZoom) ) return cameraZoom;
    const world = lastVisibleState?.world || state.world;
    cameraZoom = world && canvas.width > 0 && canvas.height > 0
        ? viewportZoomForCapacity(world, canvas, viewportFishCapacity)
        : 0;
    return cameraZoom;
}

// @fix:32ef3d51
function clampCameraPanToSafeArea(){
    const fish = currentUserFish(lastVisibleState?.world || state.world, lastVisibleState?.currentUserFishId || state.currentUserFishId);
    if( !fish || canvas.width <= 0 || canvas.height <= 0 ){
        cameraPan.x = 0;
        cameraPan.y = 0;
        return;
    }
    const inset = Math.min(canvas.width, canvas.height) * CAMERA.safeInsetShortSideRatio;
    const minPanX = inset - canvas.width / 2;
    const maxPanX = canvas.width - inset - canvas.width / 2;
    const minPanY = inset - canvas.height / 2;
    const maxPanY = canvas.height - inset - canvas.height / 2;
    cameraPan.x = Math.max(minPanX, Math.min(maxPanX, cameraPan.x));
    cameraPan.y = Math.max(minPanY, Math.min(maxPanY, cameraPan.y));
}

// @fix:32ef3d51
function setupCameraPan(){
    if( !canvas ) return;
    canvas.addEventListener('pointerdown', e =>{
        if( !cameraPanEnabled(e) ) return;
        cameraPointers.set(e.pointerId, v(e.clientX, e.clientY));
        if( cameraPointers.size === 1 ){
            cameraPanPointerId = e.pointerId;
            cameraPanLastPoint = v(e.clientX, e.clientY);
            cameraGestureMode = 'pan';
        }else if( cameraPointers.size === 2 ){
            const points = [...cameraPointers.values()];
            pinchStartDistance = Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y));
            cameraGestureStartZoom = ensureCameraZoom();
            cameraGestureMode = 'pinch';
            cameraPanPointerId = null;
            cameraPanLastPoint = null;
        }
        canvas.setPointerCapture?.(e.pointerId);
        e.preventDefault();
    });
    canvas.addEventListener('pointermove', e =>{
        if( !cameraPointers.has(e.pointerId) ) return;
        const point = v(e.clientX, e.clientY);
        cameraPointers.set(e.pointerId, point);
        if( cameraPointers.size >= 2 && cameraGestureMode === 'pinch' ){
            const points = [...cameraPointers.values()];
            const distance = Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y));
            const distanceRatio = distance / Math.max(1, pinchStartDistance);
            cameraZoom = Math.max(0, Math.min(1,
                cameraGestureStartZoom + Math.log(distanceRatio) * CAMERA.pinchZoomSensitivity));
        }else if( cameraGestureMode === 'pan' && e.pointerId === cameraPanPointerId && cameraPanLastPoint ){
            cameraPan.x += point.x - cameraPanLastPoint.x;
            cameraPan.y += point.y - cameraPanLastPoint.y;
            clampCameraPanToSafeArea();
        }
        if( e.pointerId === cameraPanPointerId ) cameraPanLastPoint = point;
        e.preventDefault();
    });
    const release = e =>{
        if( !cameraPointers.has(e.pointerId) ) return;
        cameraPointers.delete(e.pointerId);
        if( cameraGestureMode === 'pinch' && cameraPointers.size === 1 ){
            const [remainingId, remainingPoint] = cameraPointers.entries().next().value;
            cameraGestureMode = 'pan';
            cameraPanPointerId = remainingId;
            cameraPanLastPoint = remainingPoint;
            saveCameraZoom();
            updateViewportFishCapacityUi();
        }else if( cameraPointers.size === 0 ){
            if( cameraGestureMode === 'pinch' ) saveCameraZoom();
            cameraPanPointerId = null;
            cameraPanLastPoint = null;
            cameraGestureStartZoom = null;
            pinchStartDistance = null;
            cameraGestureMode = null;
            flowMapLastBuildAt = 0;
            updateViewportFishCapacityUi();
        }
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
}

// @ds:b43d2f95 @ds:cd1c5776
function setupJoystickControls(){
    if( !joystickBase ) return;
    let activePointerId = null;
    let layoutDragOffset = null;
    const updateJoystick = e =>{
        const pointer = v(e.clientX, e.clientY);
        let rect = joystickBase.getBoundingClientRect();
        let center = v(rect.left + rect.width / 2, rect.top + rect.height / 2);
        let raw = v(pointer.x - center.x, pointer.y - center.y);
        const radius = Math.max(1, rect.width / 2);
        const distanceFromCenter = Math.hypot(raw.x, raw.y);
        let isAtOuterBoundary = false;
        const relocationDeadzone = rect.width * JOYSTICK.relocationActivationRatio; // @fix:52cd6e6c
        if( !joystickRelocationLocked && distanceFromCenter > radius + relocationDeadzone ){
            const outward = normalize(raw);
            const overshoot = distanceFromCenter - radius;
            const desiredCenter = v(center.x + outward.x * overshoot, center.y + outward.y * overshoot);
            setJoystickCenter(clampJoystickCenter(desiredCenter, radius));
            const movedRect = joystickBase.getBoundingClientRect();
            center = v(movedRect.left + movedRect.width / 2, movedRect.top + movedRect.height / 2);
            raw = v(pointer.x - center.x, pointer.y - center.y);
            isAtOuterBoundary = true;
        }
        // A relocation puts the touch exactly on the outer boundary: this
        // event therefore represents the maximum burst level.
        const distance = isAtOuterBoundary ? radius : Math.min(radius, Math.hypot(raw.x, raw.y));
        const direction = normalize(raw);
        input.joystick.active = true;
        input.joystick.rawVector = scale(direction, distance / radius);
        input.joystick.vector = clampJoystickVectorToAvailableBurst(input.joystick.rawVector);
        renderJoystickKnob(input.joystick.vector);
    };
    const resetJoystick = () =>{
        activePointerId = null;
        layoutDragOffset = null;
        input.joystick.active = false;
        input.joystick.vector = v(0, 0);
        input.joystick.rawVector = v(0, 0);
        if( joystickKnob ) joystickKnob.style.transform = 'translate(-50%, -50%)';
        persistControlLayoutPositions();
    };
    joystickBase.addEventListener('pointerdown', e =>{
        activePointerId = e.pointerId;
        joystickBase.setPointerCapture(e.pointerId);
        if( uiLayoutEditMode ){
            const rect = joystickBase.getBoundingClientRect();
            layoutDragOffset = v(e.clientX - (rect.left + rect.width / 2), e.clientY - (rect.top + rect.height / 2));
            e.preventDefault();
            return;
        }
        updateJoystick(e);
    });
    joystickBase.addEventListener('pointermove', e =>{
        if( e.pointerId !== activePointerId ) return;
        if( uiLayoutEditMode && layoutDragOffset ){
            const rect = joystickBase.getBoundingClientRect();
            const radius = Math.max(1, rect.width / 2);
            const desiredCenter = v(e.clientX - layoutDragOffset.x, e.clientY - layoutDragOffset.y);
            setJoystickCenter(clampJoystickCenter(desiredCenter, radius));
            e.preventDefault();
            return;
        }
        updateJoystick(e);
    });
    joystickBase.addEventListener('pointerup', resetJoystick);
    joystickBase.addEventListener('pointercancel', resetJoystick);
}

// @fix:dual-right-grip
function setupDualRightJoystickControls(){
    if( !dualRightJoystickBase ) return;
    dualRightJoystickBase.addEventListener('pointerdown', e =>{
        if( controlLayoutMode !== 'dual-joystick' ) return;
        dualRightJoystickPointerId = e.pointerId;
        dualRightJoystickBase.setPointerCapture?.(e.pointerId);
        if( uiLayoutEditMode ){
            const rect = dualRightJoystickBase.getBoundingClientRect();
            dualRightJoystickLayoutDragOffset = v(
                e.clientX - (rect.left + rect.width / 2),
                e.clientY - (rect.top + rect.height / 2),
            );
        }else{
            dualRightJoystickLayoutDragOffset = null;
            updateDualRightJoystick(e);
        }
        e.preventDefault();
    });
    dualRightJoystickBase.addEventListener('pointermove', e =>{
        if( e.pointerId !== dualRightJoystickPointerId ) return;
        if( uiLayoutEditMode && dualRightJoystickLayoutDragOffset ){
            const rect = dualRightJoystickBase.getBoundingClientRect();
            const desiredCenter = v(
                e.clientX - dualRightJoystickLayoutDragOffset.x,
                e.clientY - dualRightJoystickLayoutDragOffset.y,
            );
            setDualRightJoystickCenter(clampJoystickCenter(
                desiredCenter,
                Math.max(1, rect.width / 2),
                dualRightJoystickKnob,
            ));
        }else{
            updateDualRightJoystick(e);
        }
        e.preventDefault();
    });
    const release = e =>{
        if( e.pointerId !== dualRightJoystickPointerId ) return;
        dualRightJoystickPointerId = null;
        dualRightJoystickLayoutDragOffset = null;
        resetDualRightJoystick();
        persistControlLayoutPositions();
    };
    dualRightJoystickBase.addEventListener('pointerup', release);
    dualRightJoystickBase.addEventListener('pointercancel', release);
}

// @fix:dual-right-grip
function updateDualRightJoystick(e){
    if( !dualRightJoystickBase ) return;
    const rect = dualRightJoystickBase.getBoundingClientRect();
    const center = v(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const raw = v(e.clientX - center.x, e.clientY - center.y);
    const knobRadius = Math.max(0, (dualRightJoystickKnob?.getBoundingClientRect().width || JOYSTICK.dualKnobDiameterPx) / 2);
    const radius = Math.max(1, rect.width / 2 - knobRadius);
    const distance = Math.min(radius, Math.hypot(raw.x, raw.y));
    const direction = normalize(raw);
    input.rightJoystick.active = true;
    input.rightJoystick.rawVector = scale(direction, distance / radius);
    input.rightJoystick.vector = input.rightJoystick.rawVector;
    renderDualRightJoystick(input.rightJoystick.vector, radius);
}

// @fix:dual-right-grip
function renderDualRightJoystick(vector, radius = JOYSTICK.dualDiameterPx / 2 - JOYSTICK.dualKnobDiameterPx / 2){
    if( !dualRightJoystickKnob || !dualRightJoystickVector ) return;
    const raw = vector || v(0, 0);
    const magnitude = Math.min(1, Math.hypot(raw.x, raw.y));
    const direction = magnitude > 1e-3 ? normalize(raw) : v(0, 0);
    const distance = magnitude * Math.max(0, radius);
    dualRightJoystickKnob.style.transform = `translate(calc(-50% + ${direction.x * distance}px), calc(-50% + ${direction.y * distance}px))`;
    dualRightJoystickVector.style.setProperty('--dual-right-vector-length', `${distance}px`);
    dualRightJoystickVector.style.setProperty('--dual-right-vector-angle', `${Math.atan2(direction.y, direction.x)}rad`);
}

// @fix:dual-right-grip
function resetDualRightJoystick(){
    dualRightJoystickPointerId = null;
    dualRightJoystickLayoutDragOffset = null;
    input.rightJoystick.active = false;
    input.rightJoystick.vector = v(0, 0);
    input.rightJoystick.rawVector = v(0, 0);
    renderDualRightJoystick(input.rightJoystick.vector);
}

// @fix:dual-burst-grip
function burstArcPoint(level, outwardOffset = 0){
    const normalized = Math.max(0, Math.min(1,
        (Math.max(REGIME.burstStartSpeedLevel, Math.min(REGIME.speedLevels, Number(level) || REGIME.burstStartSpeedLevel))
            - REGIME.burstStartSpeedLevel)
        / Math.max(1, REGIME.speedLevels - REGIME.burstStartSpeedLevel)));
    const angle = -normalized * Math.PI / 2;
    const normal = { x: Math.cos(angle), y: Math.sin(angle) };
    const arc = {
        x: JOYSTICK.burstArcOriginX + normal.x * JOYSTICK.burstArcRadiusPx,
        y: JOYSTICK.burstArcOriginY + normal.y * JOYSTICK.burstArcRadiusPx,
    };
    return {
        angle,
        normal,
        arc,
        knob: { x: arc.x + normal.x * outwardOffset, y: arc.y + normal.y * outwardOffset },
    };
}

// @fix:dual-burst-grip
function burstLevelFromArcPoint(point){
    const dx = point.x - JOYSTICK.burstArcOriginX;
    const dy = point.y - JOYSTICK.burstArcOriginY;
    const angle = Math.atan2(dy, dx);
    const normalized = Math.max(0, Math.min(1, -angle / (Math.PI / 2)));
    return Math.max(REGIME.burstStartSpeedLevel, Math.min(REGIME.speedLevels,
        Math.round(REGIME.burstStartSpeedLevel + normalized * (REGIME.speedLevels - REGIME.burstStartSpeedLevel))));
}

// @fix:dual-burst-grip
function burstPointerPoint(e){
    if( !dualBurstSurface ) return v(0, 0);
    const rect = dualBurstSurface.getBoundingClientRect();
    return v(
        (e.clientX - rect.left) / Math.max(1, rect.width) * JOYSTICK.burstPanelWidthPx,
        (e.clientY - rect.top) / Math.max(1, rect.height) * JOYSTICK.burstPanelHeightPx,
    );
}

// @fix:dual-burst-grip
function burstPointNearArc(point){
    const dx = point.x - JOYSTICK.burstArcOriginX;
    const dy = point.y - JOYSTICK.burstArcOriginY;
    const radius = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    return radius >= JOYSTICK.burstArcHitInnerRadiusPx
        && radius <= JOYSTICK.burstArcHitOuterRadiusPx
        && angle <= 0.08 && angle >= -Math.PI / 2 - 0.08;
}

// @fix:dual-burst-grip
function burstPointNearNumber(point){
    const dx = point.x - JOYSTICK.burstArcOriginX;
    const dy = point.y - JOYSTICK.burstArcOriginY;
    return Math.hypot(dx, dy) <= JOYSTICK.burstNumberHitRadiusPx;
}

// @fix:dual-burst-grip
function configureDualBurstHitTargets(){
    if( dualBurstNumberHit ){
        dualBurstNumberHit.setAttribute('cx', String(JOYSTICK.burstArcOriginX));
        dualBurstNumberHit.setAttribute('cy', String(JOYSTICK.burstArcOriginY));
        dualBurstNumberHit.setAttribute('r', String(JOYSTICK.burstNumberHitRadiusPx));
    }
    if( dualBurstArcHit ){
        const ox = JOYSTICK.burstArcOriginX;
        const oy = JOYSTICK.burstArcOriginY;
        const outer = JOYSTICK.burstArcHitOuterRadiusPx;
        const inner = JOYSTICK.burstArcHitInnerRadiusPx;
        dualBurstArcHit.setAttribute('d',
            `M${ox} ${oy - outer}`
            + `A${outer} ${outer} 0 0 1 ${ox + outer} ${oy}`
            + `L${ox + inner} ${oy}`
            + `A${inner} ${inner} 0 0 0 ${ox} ${oy - inner}Z`);
    }
}

// @fix:dual-burst-grip
function burstPointNearHandle(point, level, outwardOffset = 0){
    const knob = burstArcPoint(level, outwardOffset);
    return Math.hypot(point.x - knob.knob.x, point.y - knob.knob.y) <= JOYSTICK.burstKnobDiameterPx * 0.9;
}

// @fix:dual-burst-grip
function setDualBurstText(element, value){
    if( !element ) return;
    const text = String(value);
    if( element.textContent !== text ) element.textContent = text;
}

// @fix:dual-burst-grip
function setDualBurstStyle(element, property, value){
    if( !element || element.style[property] === value ) return;
    element.style[property] = value;
}

// @fix:dual-burst-grip
function setDualBurstAttribute(element, name, value){
    if( !element ) return;
    const next = String(value);
    if( element.getAttribute(name) !== next ) element.setAttribute(name, next);
}

// @fix:dual-burst-grip
function setDualBurstLevel(level, active = true){
    input.burstJoystick.active = active;
    input.burstJoystick.level = Math.max(REGIME.burstStartSpeedLevel,
        Math.min(REGIME.speedLevels, Math.round(Number(level) || REGIME.burstStartSpeedLevel)));
}

// @fix:dual-burst-grip
function burstPinCandidateFromGesture(gesture, point){
    if( !gesture || gesture.pinEligible === false ) return null;
    const delta = v(point.x - gesture.start.x, point.y - gesture.start.y);
    const outward = delta.x * gesture.normal.x + delta.y * gesture.normal.y;
    const tangent = delta.x * gesture.normal.y - delta.y * gesture.normal.x;
    const gestureAngle = Math.atan2(tangent, Math.max(1e-6, outward)) * 180 / Math.PI;
    const distance = Math.hypot(delta.x, delta.y);
    const pinDistance = JOYSTICK.burstKnobDiameterPx * JOYSTICK.burstPinDistanceKnobDiameters;
    if( distance < pinDistance || outward <= 0 || gestureAngle < -10 || gestureAngle > 45 ) return null;
    const pinAngle = Math.max(0, gestureAngle) / 45;
    const pinnedLevel = Math.max(REGIME.burstStartSpeedLevel,
        Math.min(65, Math.round(REGIME.burstStartSpeedLevel + pinAngle * (65 - REGIME.burstStartSpeedLevel))));
    return { level: pinnedLevel, angle: gestureAngle, distance };
}

// @fix:dual-burst-grip
function commitBurstPinGesture(gesture, candidate){
    if( !gesture || !candidate ) return false;
    input.burstJoystick.pinned = true;
    input.burstJoystick.pinnedLevel = candidate.level;
    // The candidate has already been rendered at the final offset while the
    // finger was held. Keep that position on release instead of animating
    // back to the arc and producing a visible jump.
    setDualBurstLevel(candidate.level, true);
    return true;
}

// @fix:dual-burst-grip
function setupDualBurstJoystickControls(){
    if( !dualBurstSurface ) return;
    configureDualBurstHitTargets();
    dualBurstSurface.addEventListener('pointerdown', e =>{
        if( controlLayoutMode !== 'dual-joystick' ) return;
        dualBurstPointerId = e.pointerId;
        dualBurstSurface.setPointerCapture?.(e.pointerId);
        if( uiLayoutEditMode ){
            const rect = dualBurstPanel?.getBoundingClientRect();
            if( !rect || rect.width <= 0 || rect.height <= 0 ) return;
            dualBurstLayoutDragOffset = v(
                e.clientX - (rect.left + rect.width / 2),
                e.clientY - (rect.top + rect.height / 2),
            );
            dualBurstGesture = null;
            e.preventDefault();
            return;
        }
        const point = burstPointerPoint(e);
        const burst = input.burstJoystick;
        const pinnedLevel = burst.pinnedLevel || REGIME.burstStartSpeedLevel;
        const nearPinnedHandle = burst.pinned
            && burstPointNearHandle(point, pinnedLevel, JOYSTICK.burstHandleOffsetPx);
        const hitNumberZone = e.target === dualBurstNumberHit;
        const hitArcZone = e.target === dualBurstArcHit;
        if( nearPinnedHandle ){
            dualBurstGesture = { type: 'pinned-knob', start: point, level: pinnedLevel, normal: burstArcPoint(pinnedLevel).normal };
            setDualBurstLevel(pinnedLevel, true);
        }else if( hitNumberZone || (!hitArcZone && burstPointNearNumber(point)) ){
            if( burst.pinned ){
                burst.pinned = false;
                burst.pinnedLevel = 0;
            }
            dualBurstGesture = {
                type: 'number',
                start: point,
                normal: burstArcPoint(REGIME.burstStartSpeedLevel).normal,
                pinCandidate: null,
                dynamic: false,
            };
            setDualBurstLevel(REGIME.burstStartSpeedLevel, true);
        }else if( hitArcZone || burstPointNearArc(point) ){
            const level = burstLevelFromArcPoint(point);
            dualBurstGesture = {
                type: 'arc',
                start: point,
                startLevel: level,
                pinnedAtStart: burst.pinned,
                normal: burstArcPoint(level).normal,
                pinCandidate: null,
                pinEligible: true,
                dynamic: false,
            };
            setDualBurstLevel(level, true);
        }else{
            dualBurstGesture = null;
            dualBurstPointerId = null;
            return;
        }
        e.preventDefault();
    });
    dualBurstSurface.addEventListener('pointermove', e =>{
        if( e.pointerId !== dualBurstPointerId ) return;
        if( uiLayoutEditMode && dualBurstLayoutDragOffset ){
            const rect = dualBurstPanel?.getBoundingClientRect();
            if( rect && rect.width > 0 && rect.height > 0 ){
                const desiredCenter = v(
                    e.clientX - dualBurstLayoutDragOffset.x,
                    e.clientY - dualBurstLayoutDragOffset.y,
                );
                const center = clampControlRectCenter(desiredCenter, rect.width, rect.height);
                setDualBurstJoystickCenter(center);
            }
            e.preventDefault();
            return;
        }
        if( !dualBurstGesture ) return;
        const point = burstPointerPoint(e);
        const burst = input.burstJoystick;
        if( dualBurstGesture.type === 'number' ){
            const candidate = burstPinCandidateFromGesture(dualBurstGesture, point);
            dualBurstGesture.pinCandidate = candidate;
            if( candidate ) setDualBurstLevel(candidate.level, true);
            const deltaY = point.y - dualBurstGesture.start.y;
            const level = REGIME.burstStartSpeedLevel
                + (-deltaY / Math.max(1, JOYSTICK.burstDynamicRangePx))
                * (REGIME.speedLevels - REGIME.burstStartSpeedLevel);
            if( !candidate ){
                const delta = v(point.x - dualBurstGesture.start.x, point.y - dualBurstGesture.start.y);
                const outward = delta.x * dualBurstGesture.normal.x + delta.y * dualBurstGesture.normal.y;
                const tangent = delta.x * dualBurstGesture.normal.y - delta.y * dualBurstGesture.normal.x;
                const gestureAngle = Math.atan2(tangent, Math.max(1e-6, outward)) * 180 / Math.PI;
                if( gestureAngle > 45 ){
                    dualBurstGesture.dynamic = true;
                    if( burst.pinned ){
                        burst.pinned = false;
                        burst.pinnedLevel = 0;
                    }
                    setDualBurstLevel(level, true);
                }
            }
        }else if( dualBurstGesture.type === 'pinned-knob' ){
            const delta = v(point.x - dualBurstGesture.start.x, point.y - dualBurstGesture.start.y);
            const inward = delta.x * dualBurstGesture.normal.x + delta.y * dualBurstGesture.normal.y;
            if( inward < -JOYSTICK.burstKnobDiameterPx ){
                burst.pinned = false;
                burst.pinnedLevel = 0;
                dualBurstGesture.type = 'arc';
                dualBurstGesture.dynamic = true;
                dualBurstGesture.pinEligible = false;
                setDualBurstLevel(burstLevelFromArcPoint(point), true);
            }
        }else if( dualBurstGesture.type === 'arc' ){
            const candidate = burstPinCandidateFromGesture(dualBurstGesture, point);
            dualBurstGesture.pinCandidate = candidate;
            if( candidate ){
                setDualBurstLevel(candidate.level, true);
            }else{
                const delta = v(point.x - dualBurstGesture.start.x, point.y - dualBurstGesture.start.y);
                const outward = delta.x * dualBurstGesture.normal.x + delta.y * dualBurstGesture.normal.y;
                const tangent = delta.x * dualBurstGesture.normal.y - delta.y * dualBurstGesture.normal.x;
                const gestureAngle = Math.atan2(tangent, Math.max(1e-6, outward)) * 180 / Math.PI;
                if( gestureAngle > 45 ){
                    burst.pinned = false;
                    burst.pinnedLevel = 0;
                    dualBurstGesture.dynamic = true;
                }
                setDualBurstLevel(burstLevelFromArcPoint(point), true);
            }
        }
        e.preventDefault();
    });
    const release = (e, commit = false) =>{
        if( e.pointerId !== dualBurstPointerId ) return;
        if( commit && dualBurstGesture
            && (dualBurstGesture.type === 'number' || dualBurstGesture.type === 'arc') ){
            const point = burstPointerPoint(e);
            const candidate = burstPinCandidateFromGesture(dualBurstGesture, point);
            if( candidate ) commitBurstPinGesture(dualBurstGesture, candidate);
        }
        dualBurstPointerId = null;
        dualBurstLayoutDragOffset = null;
        dualBurstGesture = null;
        input.burstJoystick.active = false;
        input.burstJoystick.level = 0;
        persistControlLayoutPositions();
    };
    dualBurstSurface.addEventListener('pointerup', e => release(e, true));
    dualBurstSurface.addEventListener('pointercancel', e => release(e, false));
}

// @fix:dual-burst-grip
function resetDualBurstJoystick(){
    dualBurstPointerId = null;
    dualBurstLayoutDragOffset = null;
    dualBurstGesture = null;
    input.burstJoystick.active = false;
    input.burstJoystick.level = 0;
    input.burstJoystick.pinned = false;
    input.burstJoystick.pinnedLevel = 0;
    dualBurstVisualKey = null;
    setDualBurstStyle(dualBurstPreviewMarker, 'display', 'none');
}

// @fix:dual-burst-grip
function updateDualBurstArcAvailability(availableLevel){
    const maxLevel = Math.max(REGIME.burstStartSpeedLevel,
        Math.min(REGIME.speedLevels, Math.floor(Number(availableLevel) || REGIME.burstStartSpeedLevel)));
    if( maxLevel === dualBurstArcAvailabilityLevel ) return;
    dualBurstArcAvailabilityLevel = maxLevel;
    const limited = maxLevel < REGIME.speedLevels;
    setDualBurstStyle(dualBurstArcMuted, 'display', limited ? 'inline' : 'none');
    if( dualBurstArcActiveClipSector ){
        const endpoint = burstArcPoint(maxLevel).arc;
        setDualBurstAttribute(dualBurstArcActiveClipSector, 'd',
            `M0 ${JOYSTICK.burstArcOriginY}L${JOYSTICK.burstArcOriginX + JOYSTICK.burstArcRadiusPx} ${JOYSTICK.burstArcOriginY}`
            + `A${JOYSTICK.burstArcRadiusPx} ${JOYSTICK.burstArcRadiusPx} 0 0 0 ${endpoint.x} ${endpoint.y}Z`);
    }
    if( dualBurstArcBase ){
        setDualBurstStyle(dualBurstArcBase, 'clipPath', limited ? 'url(#dual-burst-active-clip)' : 'none');
    }
}

// @fix:dual-burst-grip
function updateDualBurstJoystickVisual(fish){
    if( !dualBurstPanel || dualBurstPanel.hidden ) return;
    const burst = input.burstJoystick;
    const rightCruiseLevel = input.rightJoystick?.active
        ? Math.round(Math.max(0, Math.min(1, Math.hypot(input.rightJoystick.rawVector?.x || 0, input.rightJoystick.rawVector?.y || 0))) * REGIME.cruiseMaxSpeedLevel)
        : 0;
    const serverLevel = Math.max(0, Math.min(REGIME.speedLevels, Math.floor(Number(fish?.speedLevel) || 0)));
    const desiredLevel = burst.active ? burst.level : burst.pinned ? burst.pinnedLevel : (serverLevel || rightCruiseLevel);
    const availableLevel = fish ? availableSpeedLevelForSize(fish.size, REGIME.speedLevels) : REGIME.speedLevels;
    const level = fish ? availableSpeedLevelForSize(fish.size, desiredLevel) : desiredLevel;
    const isBurst = level >= REGIME.burstStartSpeedLevel;
    const displayLevel = isBurst ? level : REGIME.burstStartSpeedLevel;
    const pinnedHandleLevel = burst.pinned
        ? (fish ? availableSpeedLevelForSize(fish.size, burst.pinnedLevel) : burst.pinnedLevel)
        : displayLevel;
    const pinPreviewCandidate = !burst.pinned
        && dualBurstPointerId !== null
        && dualBurstGesture
        && (dualBurstGesture.type === 'number' || dualBurstGesture.type === 'arc')
        ? dualBurstGesture.pinCandidate
        : null;
    const pinPreviewActive = Boolean(pinPreviewCandidate);
    const visualPinned = burst.pinned || pinPreviewActive;
    const visualPinnedLevel = burst.pinned ? pinnedHandleLevel : (pinPreviewCandidate?.level || displayLevel);
    const point = burstArcPoint(visualPinnedLevel, visualPinned ? JOYSTICK.burstHandleOffsetPx : 0);
    if( dualBurstScale === null ){
        const surfaceRect = dualBurstSurface?.getBoundingClientRect();
        dualBurstScale = surfaceRect && surfaceRect.width > 0 && surfaceRect.height > 0
            ? Math.min(
                surfaceRect.width / Math.max(1, JOYSTICK.burstPanelWidthPx),
                surfaceRect.height / Math.max(1, JOYSTICK.burstPanelHeightPx),
            )
            : 1;
    }
    const burstScale = dualBurstScale;
    const visualKey = [
        level,
        visualPinnedLevel,
        visualPinned ? 1 : 0,
        pinPreviewActive ? 1 : 0,
        burst.active ? 1 : 0,
        availableLevel,
        burstScale,
        displayLevel,
    ].join('|');
    if( visualKey === dualBurstVisualKey ) return;
    dualBurstVisualKey = visualKey;
    const burstScaleValue = String(burstScale);
    if( dualBurstPanel.style.getPropertyValue('--burst-ui-scale') !== burstScaleValue ){
        dualBurstPanel.style.setProperty('--burst-ui-scale', burstScaleValue);
    }
    if( dualBurstNumber ){
        setDualBurstText(dualBurstNumber, level);
        setDualBurstStyle(dualBurstNumber, 'color', isBurst ? '#ffb963' : '#11b8ee');
    }
    if( dualBurstHandle ){
        setDualBurstStyle(dualBurstHandle, 'left', `${point.knob.x * burstScale}px`);
        setDualBurstStyle(dualBurstHandle, 'top', `${point.knob.y * burstScale}px`);
        setDualBurstStyle(dualBurstHandle, 'background', visualPinned || isBurst
            ? 'rgba(255, 185, 99, 0.45)'
            : 'rgba(25, 104, 155, 0.8)');
    }
    setDualBurstText(dualBurstHandleLevel, visualPinned ? visualPinnedLevel : '');
    updateDualBurstArcAvailability(availableLevel);
    if( dualBurstPinLine ){
        setDualBurstAttribute(dualBurstPinLine, 'x1', point.arc.x);
        setDualBurstAttribute(dualBurstPinLine, 'y1', point.arc.y);
        setDualBurstAttribute(dualBurstPinLine, 'x2', point.knob.x);
        setDualBurstAttribute(dualBurstPinLine, 'y2', point.knob.y);
        // The connector is visible for the preview and the committed pin. Once
        // that logical state is stable, leave the DOM value alone so a
        // CSS/DevTools adjustment is not overwritten on every game frame.
        const desiredPinLineOpacity = visualPinned ? '1' : '0';
        if( desiredPinLineOpacity !== dualBurstPinLineOpacity ){
            dualBurstPinLineOpacity = desiredPinLineOpacity;
            dualBurstPinLine.style.opacity = desiredPinLineOpacity;
        }
    }
    if( dualBurstPreviewMarker ){
        const hasTemporaryLevel = burst.pinned && burst.active
            && displayLevel !== pinnedHandleLevel;
        if( hasTemporaryLevel ){
            const previewPoint = burstArcPoint(displayLevel).arc;
            setDualBurstStyle(dualBurstPreviewMarker, 'display', 'block');
            setDualBurstStyle(dualBurstPreviewMarker, 'left', `${previewPoint.x * burstScale}px`);
            setDualBurstStyle(dualBurstPreviewMarker, 'top', `${previewPoint.y * burstScale}px`);
        }else{
            setDualBurstStyle(dualBurstPreviewMarker, 'display', 'none');
        }
    }
}

// @fix:f1c6a8d4
function setJoystickCenter(center, { remember = true } = {}){
    if( !joystickPanel || !joystickBase || !center ) return;
    const panelRect = joystickPanel.getBoundingClientRect();
    const baseRect = joystickBase.getBoundingClientRect();
    const baseCenterOffsetX = baseRect.left + baseRect.width / 2 - panelRect.left;
    const baseCenterOffsetY = baseRect.top + baseRect.height / 2 - panelRect.top;
    // Position the panel from the base center; the base itself is inset inside
    // the larger footprint on mobile.
    joystickPanel.style.left = `${center.x - baseCenterOffsetX}px`;
    joystickPanel.style.top = `${center.y - baseCenterOffsetY}px`;
    joystickPanel.style.right = 'auto';
    joystickPanel.style.bottom = 'auto';
    if( remember ){
        rememberControlCenter('joystick', center);
        markControlPositionCustom('joystick');
    }
}

// @fix:dual-right-grip
function setDualRightJoystickCenter(center, { remember = true } = {}){
    if( !dualRightJoystickPanel || !dualRightJoystickBase || !center ) return;
    const panelRect = dualRightJoystickPanel.getBoundingClientRect();
    const viewport = controlViewportSize();
    const rightPx = Math.max(0, viewport.width - center.x - panelRect.width / 2);
    const bottomPx = Math.max(0, viewport.height - center.y - panelRect.height / 2);
    dualRightJoystickPanel.style.left = 'auto';
    dualRightJoystickPanel.style.top = 'auto';
    dualRightJoystickPanel.style.right = `${rightPx}px`;
    dualRightJoystickPanel.style.bottom = `${bottomPx}px`;
    if( remember ){
        rememberControlCenter('dualRight', center);
        markControlPositionCustom('dualRight');
    }
}

// @fix:control-viewport-layout
function setDualBurstJoystickCenter(center, { remember = true } = {}){
    if( !dualBurstPanel || !center ) return;
    const rect = dualBurstPanel.getBoundingClientRect();
    if( rect.width <= 0 || rect.height <= 0 ) return;
    const viewport = controlViewportSize();
    const leftPx = Math.max(0, center.x - rect.width / 2);
    const bottomPx = Math.max(0, viewport.height - center.y - rect.height / 2);
    dualBurstPanel.style.left = `${leftPx}px`;
    dualBurstPanel.style.top = 'auto';
    dualBurstPanel.style.right = 'auto';
    dualBurstPanel.style.bottom = `${bottomPx}px`;
    if( remember ){
        rememberControlCenter('dualBurst', center);
        markControlPositionCustom('dualBurst');
    }
}

// @fix:f1c6a8d4
function clampJoystickCenter(center, outerRadius, knobElement = joystickKnob){
    const knobRect = knobElement?.getBoundingClientRect();
    const knobSize = Math.max(1, Number(knobRect?.width) || 0);
    const inset = knobSize * JOYSTICK.edgeInsetKnobRatio;
    const viewportWidth = Math.max(1, window.visualViewport?.width || window.innerWidth);
    const viewportHeight = Math.max(1, window.visualViewport?.height || window.innerHeight);
    const minX = outerRadius + inset;
    const maxX = viewportWidth - outerRadius - inset;
    const minY = outerRadius + inset;
    const maxY = viewportHeight - outerRadius - inset;
    return v(
        minX > maxX ? viewportWidth / 2 : Math.max(minX, Math.min(maxX, center.x)),
        minY > maxY ? viewportHeight / 2 : Math.max(minY, Math.min(maxY, center.y)),
    );
}

// @fix:f1c6a8d4
function clampJoystickPositionToViewport(){
    if( !joystickBase || joystickPanel?.hidden ) return;
    const rect = joystickBase.getBoundingClientRect();
    if( rect.width <= 0 || rect.height <= 0 ) return;
    const center = v(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const clamped = clampJoystickCenter(center, Math.max(rect.width, rect.height) / 2);
    if( Math.hypot(clamped.x - center.x, clamped.y - center.y) > 0.5 ) setJoystickCenter(clamped);
}

// @fix:dual-right-grip
function clampDualRightJoystickPositionToViewport(){
    if( !dualRightJoystickBase || dualRightJoystickPanel?.hidden ) return;
    const rect = dualRightJoystickBase.getBoundingClientRect();
    if( rect.width <= 0 || rect.height <= 0 ) return;
    const center = v(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const clamped = clampJoystickCenter(center, Math.max(rect.width, rect.height) / 2, dualRightJoystickKnob);
    if( Math.hypot(clamped.x - center.x, clamped.y - center.y) > 0.5 ) setDualRightJoystickCenter(clamped);
}

// @fix:control-viewport-layout
function clampControlRectCenter(center, width, height, element = null){
    const viewport = controlViewportSize();
    const elementRect = element?.getBoundingClientRect();
    const elementSize = Math.max(1, Number(elementRect?.width) || 0);
    const inset = elementSize * JOYSTICK.edgeInsetKnobRatio;
    const halfWidth = Math.max(1, width / 2);
    const halfHeight = Math.max(1, height / 2);
    const minX = halfWidth + inset;
    const maxX = viewport.width - halfWidth - inset;
    const minY = halfHeight + inset;
    const maxY = viewport.height - halfHeight - inset;
    return v(
        minX > maxX ? viewport.width / 2 : Math.max(minX, Math.min(maxX, center.x)),
        minY > maxY ? viewport.height / 2 : Math.max(minY, Math.min(maxY, center.y)),
    );
}

// @fix:dual-right-grip
function visibleBottomInfoHeight(){
    const panels = [worldInfo, flowInfoPanel, recordsPanel]
        .filter(panel => panel && !panel.hidden)
        .map(panel => panel.getBoundingClientRect())
        .filter(rect => rect.width > 0 && rect.height > 0);
    if( panels.length ) return Math.max(...panels.map(rect => rect.height));
    const cssHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bottom-info-bar-height'));
    return Number.isFinite(cssHeight) ? cssHeight : 0;
}

// @fix:dual-right-grip
function applyDefaultDualGripAnchors(){
    const viewport = controlViewportSize();
    const rightRect = dualRightJoystickBase?.getBoundingClientRect();
    const burstRect = dualBurstPanel?.getBoundingClientRect();
    if( !rightRect || !burstRect || rightRect.width <= 0 || burstRect.width <= 0 ) return;
    const rightKnobDiameter = Math.max(1, Number(dualRightJoystickKnob?.getBoundingClientRect().width) || JOYSTICK.dualKnobDiameterPx);
    const burstKnobDiameter = Math.max(1, Number(dualBurstHandle?.getBoundingClientRect().width) || JOYSTICK.burstKnobDiameterPx);
    const bottomGap = Math.max(rightKnobDiameter, burstKnobDiameter);
    const bottomInfoHeight = visibleBottomInfoHeight();
    const rightCenterY = viewport.height - bottomInfoHeight - bottomGap - rightRect.height / 2;
    const burstCenterY = viewport.height - bottomInfoHeight - bottomGap - burstRect.height / 2;

    const leftBlock = viewportControlTools?.getBoundingClientRect();
    const leftEdge = leftBlock && leftBlock.width > 0
        ? leftBlock.right
        : Math.max(0, Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--viewport-control-gap')) || 0);
    if( !controlLayoutPositions.dualBurstCustom ){
        const defaultBurstCenter = clampControlRectCenter(
            v(leftEdge + burstKnobDiameter + burstRect.width / 2, burstCenterY),
            burstRect.width,
            burstRect.height,
            dualBurstHandle,
        );
        setDualBurstJoystickCenter(defaultBurstCenter, { remember: false });
    }
    if( !controlLayoutPositions.dualRightCustom ){
        // Mirror the burst grip's actual left margin in pixels: the right
        // grip's outer edge receives the same margin from the right side.
        const burstAnchorRect = dualBurstPanel.getBoundingClientRect();
        const mirroredSideMargin = Math.max(0, burstAnchorRect.left);
        const defaultRightCenter = clampJoystickCenter(
            v(viewport.width - mirroredSideMargin - rightRect.width / 2, rightCenterY),
            Math.max(rightRect.width, rightRect.height) / 2,
            dualRightJoystickKnob,
        );
        setDualRightJoystickCenter(defaultRightCenter, { remember: false });
    }
}

// @fix:control-viewport-layout
function restoreControlLayoutPositions(){
    if( joystickBase && joystickPanel && !joystickPanel.hidden ){
        rememberCurrentControlCenter('joystick', joystickBase);
        const remembered = rememberedControlCenter('joystick');
        if( remembered ){
            const rect = joystickBase.getBoundingClientRect();
            const center = clampJoystickCenter(remembered, Math.max(rect.width, rect.height) / 2);
            setJoystickCenter(center, { remember: false });
            rememberControlCenter('joystick', center);
        }
    }
    if( dualRightJoystickBase && dualRightJoystickPanel && !dualRightJoystickPanel.hidden ){
        applyDefaultDualGripAnchors();
        rememberCurrentControlCenter('dualRight', dualRightJoystickBase);
        const remembered = rememberedControlCenter('dualRight');
        if( remembered ){
            const rect = dualRightJoystickBase.getBoundingClientRect();
            const center = clampJoystickCenter(remembered, Math.max(rect.width, rect.height) / 2, dualRightJoystickKnob);
            setDualRightJoystickCenter(center, { remember: false });
            rememberControlCenter('dualRight', center);
        }
    }
    if( dualBurstPanel && !dualBurstPanel.hidden ){
        rememberCurrentControlCenter('dualBurst', dualBurstPanel);
        const remembered = rememberedControlCenter('dualBurst');
        if( remembered ){
            const rect = dualBurstPanel.getBoundingClientRect();
            const center = clampControlRectCenter(remembered, rect.width, rect.height);
            setDualBurstJoystickCenter(center, { remember: false });
            rememberControlCenter('dualBurst', center);
        }
    }
    persistControlLayoutPositions();
}

// @ds:727e9afe
function recordDebugPositionTraces(now, visibleWorld){
    if( now - lastDebugTraceAt < DEBUG.traceSampleMs ) return;
    lastDebugTraceAt = now;
    for( const fish of visibleWorld.fish || [] ){
        debugPositionTraces.push({
            kind: 'relative',
            fishId: fish.id,
            pos: { ...fish.pos },
            createdAt: now,
            fadeStartAt: now + DEBUG.traceVisibleMs,
        });
    }
    for( const [fishId, pos] of latestAbsoluteServerPositions ){
        debugPositionTraces.push({
            kind: 'absolute',
            fishId,
            pos: { ...pos },
            createdAt: now,
            fadeStartAt: now + DEBUG.traceVisibleMs,
        });
    }
    const maxAge = DEBUG.traceVisibleMs + DEBUG.traceFadeMs;
    debugPositionTraces = debugPositionTraces.filter(trace => now - trace.createdAt <= maxAge);
}

void init().finally(() => requestAnimationFrame(frame));
