// imp/web-canvas/src/main.js
// Bootstraps world + game loop (dsr/use/ecs-loop.dsr). Glue/I-O layer.
// @ds b28b7af6 27fa3caa ec8cb052 ab1e4f02 c95ca496 48c4fc99 b433f1bc d2e8a84c 5fb1ff09 c83f4c1e ca07d970 d6cebf86 2b3e71e0 3ddf8f67 1f3abc43 cbc1225a 7ce238da c4073e51 ee07d6da 8869f043 07320d39 f51831f5 8d0ca6a8 d867989f 975ca168 bd354b7a 906be50b 91e32235 55c13a4f 10baf178 22fd3ab4 e6be3c03 0eef2d19 e001d967 cff27cd5 7b9a7984 ad8d81d8 31cb7a0d 579e4888 e699c42d e6ecfbdd 1e66d817 a3e394a8 98224ab9 e9fb3705 fcdfb2b7 0c8d4e2a 6f1b0a3c 39305789 2e91f6d4 b9136c2e c5a92431 c656f0ec e42a7c19 a2d5936f 73b91e4c ed2b4f19
// @ia 3983084a

import { CAMERA, DEBUG, ENERGY, EXHALE, FISH, FLOW_MAP, JOYSTICK, LOOP, MOUTH, PLAYER, REGIME, SHRED, SIZE_DELTA_LABEL, SWIM, SYNC, VIEWPORT_FISH_CAPACITY, WORLD_MAP } from './constants.js';
import { advanceBubbles, emitBubble, makeBubble, makeWorld } from './world.js';
import { BURST_ENDURANCE_SIZE_THRESHOLDS, availableSpeedLevelForSize, burstEnergyFactorOf, requestExhale, runExhaleCycle, serializeFish, speedCapOf, technicalRadiusOf } from './fish.js';
import { createControlModeState, createInput, keySteer, pointerSteer, joystickSteer, speedLevel, speedLevelToControlMagnitude } from './controls.js';
import { buildToroidalRenderWorld, fishFinTipPositions, loadFishGeometry, loadShredGeometry, render, viewportToWorld, visualFishTurnRadians, worldToViewport } from './render.js';
import { dist, normalize, scale, v } from './vec.js';
import { createClientNet, createDangerMapSocket, createFlowMapSocket } from './client-net.js';
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
const worldMap = document.getElementById('world-map');
const debugModeToggle = document.getElementById('debug-mode-toggle');
const controlModes = document.getElementById('control-modes');
const controlModeButtons = [...document.querySelectorAll('[data-control-mode]')];
const controlHelp = document.getElementById('control-help');
const viewportFishCapacitySelect = document.getElementById('viewport-fish-capacity-select');
const burstEnduranceRows = document.getElementById('burst-endurance-rows');
const joystickPanel = document.getElementById('joystick-panel');
const joystickBase = document.getElementById('joystick-base');
const joystickBurstBase = document.getElementById('joystick-burst-base');
const joystickBurstRings = document.getElementById('joystick-burst-rings');
const joystickKnob = document.getElementById('joystick-knob');
const joystickCurrentBurstRing = document.getElementById('joystick-current-burst-ring');
let joystickAvailableLevel = REGIME.speedLevels;
let joystickRenderedAvailabilityLevel = null;
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
const cameraPan = { x: 0, y: 0 };
let cameraPanPointerId = null;
let cameraPanLastPoint = null;
let serializeKeyLatch = false;
let lastSentInputKey = null;
let lastInputFlushAt = 0;
const CONTROL_HEARTBEAT_MS = 900; // @ds:multiplayer.control-heartbeat
const VIEWPORT_FISH_CAPACITY_STORAGE_KEY = 'selfish-bait.viewport-fish-capacity'; // @fix:a64e9b31
let gameMenuOpen = false;
let worldMapVisible = false;
let debugMode = false;
let syncSegmentsVisible = false;
let flowMapVisible = false; // @fix:6a7b8c9d
let flowMapBitmap = null; // @fix:6a7b8c9d
let flowMapField = null; // @fix:4e9b2c71
let flowMapFrameSerial = 0; // @fix:4e9b2c71
let flowMapTransportEnabled = false; // @fix:4e9b2c71
let flowVectorsVisible = false; // @fix:5f2a8c71
let flowVectorsResetPending = false; // @fix:5f2a8c71
const clientShredSpin = new Map(); // @fix:4e9b2c71
let dangerMapVisible = false;
let dangerMapBitmap = null;
const dangerMapNet = createDangerMapSocket(bitmap => { dangerMapBitmap?.close?.(); dangerMapBitmap = bitmap; });
const flowMapNet = createFlowMapSocket(bitmap => { handleFlowMapFrame(bitmap); });
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

// ds:b28b7af6 @fix:c7e2a914
function resize(){
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || window.innerWidth));
    const height = Math.max(1, Math.round(rect.height || window.innerHeight));
    if( canvas.width === width && canvas.height === height ) return;
    canvas.width = width;
    canvas.height = height;
    clampJoystickPositionToViewport(); // @fix:f1c6a8d4
    clampCameraPanToSafeArea(); // @fix:32ef3d51
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
        openFlowMapTransport(); // @fix:4e9b2c71
        if( state.currentUserFishId !== message.currentUserFishId ){ // @fix:32ef3d51
            lastSentInputKey = null;
            cameraPan.x = 0;
            cameraPan.y = 0;
        }
        state.world = message.world;
        state.currentUserFishId = message.currentUserFishId;
        updateWorldSyncMetrics(message);
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
    const clickPos = viewportToWorld(v(e.clientX - rect.left, e.clientY - rect.top), clickState.world, followed, canvas, { viewportFishCapacity, cameraPan });
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
        flowVectorsResetPending = true;
        resetClientFlowCrosses();
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
    if( flowMapVisible ) openFlowMapTransport();
}

// @fix:4e9b2c71
function openFlowMapTransport(){
    if( flowMapTransportEnabled ) return;
    flowMapTransportEnabled = true;
    flowMapNet.open();
}

// @fix:4e9b2c71
function closeFlowMapTransport(){
    if( !flowMapTransportEnabled ) return;
    flowMapTransportEnabled = false;
    flowMapNet.close();
    flowMapBitmap?.close?.();
    flowMapBitmap = null;
    flowMapField = null;
    flowMapFrameSerial++;
}

if( syncSegmentsToggle ) syncSegmentsToggle.addEventListener('click', toggleSyncSegments);
if( flowMapToggle ) flowMapToggle.addEventListener('click', toggleFlowMap);
if( flowVectorsToggle ) flowVectorsToggle.addEventListener('click', toggleFlowVectors);
if( dangerMapToggle ) dangerMapToggle.addEventListener('click', toggleDangerMapUnderlay);
if( debugModeToggle ){
    debugModeToggle.addEventListener('click', toggleDebugMode);
    debugModeToggle.setAttribute('aria-pressed', 'false');
}
setupViewportFishCapacity();
setupControlModes();
setupCameraPan(); // @fix:32ef3d51
setupJoystickControls();
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
    if( !gameControlsVisible ) worldMapVisible = false;
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
    updateJoystickPanelVisibility();
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
    clampCameraPanToSafeArea(); // @fix:32ef3d51
    advanceClientShredRotation(visibleState.world, dt, flowMapField); // @fix:4e9b2c71
    if( flowVectorsVisible ) advanceClientFlowCrosses(flowMapField, dt); // @fix:5f2a8c71
    applyClientFishDecor(visibleState.world, clientBubbles, clientFinSparks, dt, Math.random); // @fix:4f8a2c71
    advanceClientFinSparks(visibleState.world, clientFinSparks, dt, flowMapField); // @fix:4f8a2c71
    updateSizeDeltaLabels(visibleState.world, dt);
    lastVisibleState = visibleState;
    advanceClientBubbles(clientBubbles, clientBubbleEmitters, visibleState.world, dt, Math.random);
    if( debugMode ) recordDebugPositionTraces(now, visibleState.world);
    render(ctx, {
        ...visibleState,
        viewportFishCapacity,
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
    hudEaten.textContent = `${fish ? fish.eatenFishCount : 0}`;
    updatePlayerLifetimeBar(fish);
    updateWorldSnapshotInfo(state.world);
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
        return;
    }

    playerSpeedPercent.textContent = String(level);
    playerSpeedPercent.style.color = level > REGIME.cruiseMaxSpeedLevel
        ? burstSpeedColor(level)
        : '#11b8ee';
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
    if( worldFishArea ) worldFishArea.textContent = formatArea(sumFishArea(fishItems));
    if( worldNutrientCount ) worldNutrientCount.textContent = formatCount(nutrientItems.length);
    if( worldNutrientArea ) worldNutrientArea.textContent = formatArea(sumNutrientArea(nutrientItems));
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

function sumFishArea(fishItems){
    return fishItems.reduce((sum, fish) =>{
        const radius = Number.isFinite(fish?.radius) ? fish.radius : technicalRadiusOf(fish?.size || 0);
        return Number.isFinite(radius) ? sum + Math.PI * radius * radius : sum;
    }, 0);
}

function sumNutrientArea(nutrientItems){
    return nutrientItems.reduce((sum, nutrient) =>{
        const area = Number(nutrient?.geometricArea);
        return Number.isFinite(area) ? sum + Math.max(0, area) : sum;
    }, 0);
}

function formatCount(value){
    return String(Math.max(0, Number(value) || 0));
}

function formatArea(value){
    const area = Math.max(0, Number(value) || 0);
    if( area >= 1000 ) return `${Math.round(area / 100) / 10}k`;
    return area.toFixed(0);
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
        updateClientFishOrientation(decor, fish); // @fix:c13e07b3
        const inertialBraking = !fish.mode || fish.mode === 'cruise' && Number(fish.speedLevel || 0) === 0;
        const targetTilt = inertialBraking ? 0 : visualFishTurnRadians(fish);
        const tiltResponse = 1 - Math.exp(-SWIM.visualTiltResponse * Math.max(0, dt));
        decor.visualTilt += (targetTilt - decor.visualTilt) * tiltResponse;
        fish.visualTilt = decor.visualTilt;
        if( decor.shredBurstHold > 0 ) fish.mode = 'burst'; // @ds:a2d5936f
        if( decor.eatingCruiseHold > 0 ) fish.mode = 'cruise'; // @ds:975ca168
    }
}

// @fix:4f8a2c71
function visibleDecorFishIds(world){
    const fishes = world?.fish || [];
    if( !fishes.length ) return new Set();
    const followed = currentUserFish(world) || fishes[0];
    const viewport = worldToViewport(world, followed, canvas, { viewportFishCapacity });
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
    const speed = Math.hypot(fish.vel?.x || 0, fish.vel?.y || 0);
    const burstActive = fish.mode === 'burst';
    const burstSwimming = burstActive && speed > FISH.facingThreshold;
    const burstSpeedLevel = Math.floor(Number(fish.speedLevel) || 0);
    if( burstActive && burstSpeedLevel !== decor.lastBurstSpeedLevel ){
        emitFinSparks(fish, finSparks, rng); // @fix:4f8a2c71
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
}

// @fix:4f8a2c71
function emitFinSparks(fish, finSparks, rng){
    if( !Array.isArray(finSparks) || !fish?.pos || (fish.syncOpacity ?? 1) <= 0 ) return;
    const tips = fishFinTipPositions(fish);
    for( const tip of tips ){
        if( rng() > SWIM.finSparkChance ) continue;
        const sizePx = SWIM.finSparkMinSizePx + rng() * (SWIM.finSparkMaxSizePx - SWIM.finSparkMinSizePx);
        const sizeRatio = (sizePx - SWIM.finSparkMinSizePx) / Math.max(1e-6, SWIM.finSparkMaxSizePx - SWIM.finSparkMinSizePx);
        const life = SWIM.finSparkSmallLifeSeconds + (SWIM.finSparkLargeLifeSeconds - SWIM.finSparkSmallLifeSeconds) * sizeRatio;
        finSparks.push({
            id: `${fish.id}:${performance.now()}:${finSparks.length}`,
            pos: { x: fish.pos.x + tip.offset.x, y: fish.pos.y + tip.offset.y },
            vel: { x: 0, y: 0 },
            age: 0,
            life,
            initialSizePx: sizePx,
            shrinkDuration: life * 0.5 * sizeRatio,
            sizePx,
            alpha: SWIM.finSparkAlpha,
        });
    }
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
        const flow = sampleLinearFlow(field, spark.pos);
        spark.vel.x += flow.x * dt;
        spark.vel.y += flow.y * dt;
        const drag = Math.exp(-SHRED.dragMin * dt);
        spark.vel.x *= drag;
        spark.vel.y *= drag;
        spark.pos.x = wrapValue(spark.pos.x + spark.vel.x * dt, world.width);
        spark.pos.y = wrapValue(spark.pos.y + spark.vel.y * dt, world.height);
        const shrinkDuration = Math.max(0, Number(spark.shrinkDuration) || 0);
        if( shrinkDuration > 0 && spark.age < shrinkDuration ){
            const shrinkProgress = spark.age / shrinkDuration;
            spark.sizePx = spark.initialSizePx - (spark.initialSizePx - SWIM.finSparkMinSizePx) * shrinkProgress;
            spark.alpha = SWIM.finSparkAlpha;
        }else{
            spark.sizePx = SWIM.finSparkMinSizePx;
            const fadeDuration = Math.max(1e-6, spark.life - shrinkDuration);
            spark.alpha = SWIM.finSparkAlpha * (1 - Math.max(0, spark.age - shrinkDuration) / fadeDuration);
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
    let accel = keySteer(input.keys);
    const keyboardAccel = Boolean(accel);
    if( joystickBase ) joystickBase.classList.toggle('is-keyboard-control', keyboardAccel); // @fix:5d9e3a71
    if( !accel ){
        if( controlMode.active === 'pointer' && fish && input.pointer.active ){
            const worldPointer = viewportToWorld(input.pointer.pos, state.world, fish, canvas, { viewportFishCapacity, cameraPan });
            accel = pointerSteer(fish.pos, { active: true, pos: worldPointer });
        }else if( controlMode.active === 'touch' && fish && input.pointer.active && input.touchDown ){
            input.pointer.vector = controlVectorFromFish(fish, input.pointer.pos);
            accel = scale(normalize(input.pointer.vector), FISH.accel * Math.min(1, Math.hypot(input.pointer.vector.x, input.pointer.vector.y)));
        }else{
            accel = joystickSteer(input.joystick);
        }
    }
    const desiredLevel = speedLevel(input, controlMode.active);
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
    const viewport = worldToViewport(state.world, fish, canvas, { viewportFishCapacity, cameraPan });
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
    viewportFishCapacitySelect.value = viewportFishCapacity;
    viewportFishCapacitySelect.addEventListener('change', () => setViewportFishCapacity(viewportFishCapacitySelect.value));
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

// @ds:e001d967 @fix:a64e9b31
function setViewportFishCapacity(value){
    viewportFishCapacity = VIEWPORT_FISH_CAPACITY.options.includes(value)
        ? value
        : VIEWPORT_FISH_CAPACITY.defaultValue;
    if( viewportFishCapacitySelect ) viewportFishCapacitySelect.value = viewportFishCapacity;
    try{
        window.localStorage.setItem(VIEWPORT_FISH_CAPACITY_STORAGE_KEY, viewportFishCapacity);
    }catch{
        // The in-memory display preference remains available when storage is disabled.
    }
}

// @ds:70871bc5
function setupControlModes(){
    setControlMode(controlMode.active);
    for( const button of controlModeButtons ){
        button.addEventListener('click', () => setControlMode(button.dataset.controlMode));
    }
}

function setControlMode(mode){
    controlMode.active = mode === 'keyboard' ? 'joystick' : (mode || controlMode.active);
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
    updateControlHelp();
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
    };
    controlHelp.textContent = `${help[controlMode.active] || help.keyboard} Клик по рыбе — serialize.`;
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
    if( visible ) requestAnimationFrame(clampJoystickPositionToViewport); // @fix:f1c6a8d4
}

function isJoystickPanelVisible(){
    return Boolean(entrySessionReady && net?.isJoined && controlMode.active !== 'pointer' && controlMode.active !== 'touch');
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
    return e.pointerType === 'touch' && controlMode.active !== 'touch' && controlMode.active !== 'pointer';
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
        cameraPanPointerId = e.pointerId;
        cameraPanLastPoint = v(e.clientX, e.clientY);
        canvas.setPointerCapture?.(e.pointerId);
        e.preventDefault();
    });
    canvas.addEventListener('pointermove', e =>{
        if( e.pointerId !== cameraPanPointerId || !cameraPanLastPoint ) return;
        cameraPan.x += e.clientX - cameraPanLastPoint.x;
        cameraPan.y += e.clientY - cameraPanLastPoint.y;
        cameraPanLastPoint = v(e.clientX, e.clientY);
        clampCameraPanToSafeArea();
        e.preventDefault();
    });
    const release = e =>{
        if( e.pointerId !== cameraPanPointerId ) return;
        cameraPanPointerId = null;
        cameraPanLastPoint = null;
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
}

// @ds:b43d2f95 @ds:cd1c5776
function setupJoystickControls(){
    if( !joystickBase ) return;
    let activePointerId = null;
    const updateJoystick = e =>{
        const pointer = v(e.clientX, e.clientY);
        let rect = joystickBase.getBoundingClientRect();
        let center = v(rect.left + rect.width / 2, rect.top + rect.height / 2);
        let raw = v(pointer.x - center.x, pointer.y - center.y);
        const radius = Math.max(1, rect.width / 2);
        const distanceFromCenter = Math.hypot(raw.x, raw.y);
        let isAtOuterBoundary = false;
        const relocationDeadzone = rect.width * JOYSTICK.relocationActivationRatio; // @fix:52cd6e6c
        if( distanceFromCenter > radius + relocationDeadzone ){
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
        input.joystick.active = false;
        input.joystick.vector = v(0, 0);
        input.joystick.rawVector = v(0, 0);
        if( joystickKnob ) joystickKnob.style.transform = 'translate(-50%, -50%)';
    };
    joystickBase.addEventListener('pointerdown', e =>{
        activePointerId = e.pointerId;
        joystickBase.setPointerCapture(e.pointerId);
        updateJoystick(e);
    });
    joystickBase.addEventListener('pointermove', e =>{
        if( e.pointerId !== activePointerId ) return;
        updateJoystick(e);
    });
    joystickBase.addEventListener('pointerup', resetJoystick);
    joystickBase.addEventListener('pointercancel', resetJoystick);
}

// @fix:f1c6a8d4
function setJoystickCenter(center){
    if( !joystickPanel || !joystickBase || !center ) return;
    const panelRect = joystickPanel.getBoundingClientRect();
    const baseRect = joystickBase.getBoundingClientRect();
    const baseCenterOffsetX = baseRect.left + baseRect.width / 2 - panelRect.left;
    const baseCenterOffsetY = baseRect.top + baseRect.height / 2 - panelRect.top;
    // Position the panel from the base center; the base itself is inset inside
    // the larger footprint on mobile.
    joystickPanel.style.width = `${panelRect.width}px`;
    joystickPanel.style.height = `${panelRect.height}px`;
    joystickPanel.style.left = `${center.x - baseCenterOffsetX}px`;
    joystickPanel.style.top = `${center.y - baseCenterOffsetY}px`;
    joystickPanel.style.right = 'auto';
    joystickPanel.style.bottom = 'auto';
}

// @fix:f1c6a8d4
function clampJoystickCenter(center, outerRadius){
    const knobRect = joystickKnob?.getBoundingClientRect();
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
