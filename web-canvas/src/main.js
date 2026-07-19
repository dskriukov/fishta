// imp/web-canvas/src/main.js
// Bootstraps world + game loop (dsr/use/ecs-loop.dsr). Glue/I-O layer.
// @ds b28b7af6 27fa3caa ec8cb052 ab1e4f02 c95ca496 48c4fc99 b433f1bc d2e8a84c 5fb1ff09 c83f4c1e ca07d970 d6cebf86 2b3e71e0 3ddf8f67 1f3abc43 cbc1225a 7ce238da c4073e51 ee07d6da 8869f043 07320d39 f51831f5 8d0ca6a8 d867989f 975ca168 bd354b7a 906be50b 91e32235 55c13a4f 10baf178 22fd3ab4 e6be3c03 0eef2d19 e001d967 cff27cd5 7b9a7984 ad8d81d8 31cb7a0d 579e4888 e699c42d e6ecfbdd 1e66d817 a3e394a8 98224ab9 e9fb3705 fcdfb2b7 0c8d4e2a 6f1b0a3c 39305789 2e91f6d4 b9136c2e c5a92431 c656f0ec e42a7c19 a2d5936f 73b91e4c ed2b4f19
// @ia 3983084a

import { DEBUG, ENERGY, EXHALE, FISH, LOOP, MOUTH, PLAYER, REGIME, SHRED, SIZE_DELTA_LABEL, SWIM, SYNC, VIEWPORT_FISH_CAPACITY, WORLD_MAP } from './constants.js';
import { advanceBubbles, emitBubble, makeBubble, makeWorld } from './world.js';
import { BURST_ENDURANCE_SIZE_THRESHOLDS, availableSpeedLevelForSize, burstEnergyFactorOf, maxSpeedOf, requestExhale, runExhaleCycle, serializeFish, speedCapOf, technicalRadiusOf } from './fish.js';
import { createControlModeState, createInput, keySteer, pointerSteer, joystickSteer, speedLevel, speedLevelToControlMagnitude } from './controls.js';
import { buildToroidalRenderWorld, loadFishGeometry, loadShredGeometry, render, viewportToWorld, worldToViewport } from './render.js';
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
const joystickBurstRings = document.getElementById('joystick-burst-rings');
const joystickKnob = document.getElementById('joystick-knob');
const joystickCurrentBurstRing = document.getElementById('joystick-current-burst-ring');
let joystickAvailableLevel = REGIME.speedLevels;
let joystickRenderedAvailabilityLevel = null;
const appVersion = document.getElementById('app-version');

let state = { world: makeWorld(), currentUserFishId: null };
let resizeFrame = 0;
const snapshotBuffer = [];
const clientBubbles = [];
const clientBubbleEmitters = new Map();
const clientFishDecor = new Map();
let serializeKeyLatch = false;
let lastSentInputKey = null;
let lastInputFlushAt = 0;
const CONTROL_HEARTBEAT_MS = 900; // @ds:multiplayer.control-heartbeat
const VIEWPORT_FISH_CAPACITY_STORAGE_KEY = 'selfish-bait.viewport-fish-capacity'; // @fix:a64e9b31
let gameMenuOpen = false;
let worldMapVisible = false;
let debugMode = false;
let syncSegmentsVisible = false;
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
}

// @fix:c7e2a914
function scheduleResize(){
    if( resizeFrame ) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0;
        resize();
        // Mobile browsers can commit the new visual viewport one frame after
        // the orientation event; sample the final CSS box as well.
        requestAnimationFrame(resize);
    });
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
        if( state.currentUserFishId !== message.currentUserFishId ) lastSentInputKey = null;
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
    const clickPos = viewportToWorld(v(e.clientX - rect.left, e.clientY - rect.top), clickState.world, followed, canvas, { viewportFishCapacity });
    const renderWorld = buildToroidalRenderWorld(clickState.world, followed);
    const projectedFish = (renderWorld.fish || []).find(candidate => candidate && dist(clickPos, candidate.pos) <= candidate.radius);
    const fish = projectedFish ? (state.world.fish || []).find(candidate => candidate.id === projectedFish.id) : null;
    if( fish ) console.log(serializeFish(fish)); // ds:2e1570ed
});
window.addEventListener('resize', scheduleResize);
window.addEventListener('orientationchange', scheduleResize);
window.visualViewport?.addEventListener('resize', scheduleResize);

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

// @fix:1f5d8c42
function syncDangerMapTransport(){
    if( dangerMapVisible ){
        dangerMapNet.open();
        return;
    }
    dangerMapNet.close();
    dangerMapBitmap?.close?.();
    dangerMapBitmap = null;
}

if( syncSegmentsToggle ) syncSegmentsToggle.addEventListener('click', toggleSyncSegments);
if( dangerMapToggle ) dangerMapToggle.addEventListener('click', toggleDangerMapUnderlay);
if( debugModeToggle ){
    debugModeToggle.addEventListener('click', toggleDebugMode);
    debugModeToggle.setAttribute('aria-pressed', 'false');
}
setupViewportFishCapacity();
setupControlModes();
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
    applyClientFishDecor(visibleState.world, clientBubbles, dt, Math.random);
    updateSizeDeltaLabels(visibleState.world, dt);
    lastVisibleState = visibleState;
    advanceClientBubbles(clientBubbles, clientBubbleEmitters, visibleState.world, dt, Math.random);
    if( debugMode ) recordDebugPositionTraces(now, visibleState.world);
    render(ctx, {
        ...visibleState,
        viewportFishCapacity,
        clientBubbles,
        sizeDeltaLabels: sizeDeltaLabelState.labels,
        debug: {
            enabled: debugMode,
            dangerMapUnderlay: debugMode && dangerMapVisible,
            positionTraces: debugPositionTraces,
            receivedQuadrants: [...debugReceivedQuadrants.values()],
            cellSyncAverages: debugSyncCellAverages(),
            now,
        },
        cellSyncAverages: debugSyncCellAverages(),
        syncSegmentsVisible,
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
    const visible = entrySessionReady && net?.isJoined && fish && displayed > 0;
    playerSpeedMetric.classList.toggle('is-visible', Boolean(visible));
    playerSpeedMetric.setAttribute('aria-hidden', visible ? 'false' : 'true');
    playerSpeedReal.textContent = displayed.toFixed(2);
    if( !fish || displayed <= 0 ){
        playerSpeedPercent.textContent = '0';
        playerSpeedPercent.style.color = '#7bd88f';
        return;
    }

    const maxPossibleSpeed = maxSpeedOf(fish.size, 'user') * 0.99;
    const percent = Math.max(1, Math.min(99, Math.round(speed / Math.max(1, maxPossibleSpeed) * 100)));
    playerSpeedPercent.textContent = String(percent);
    playerSpeedPercent.style.color = fish.mode === 'burst'
        ? burstSpeedColor(percent)
        : '#7bd88f';
}

function burstSpeedColor(percent){
    const t = Math.max(0, Math.min(1, (percent - 1) / 98));
    return mixHexColor('#d58fb3', '#ff4f62', t);
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
    const ratio = Math.max(0, Math.min(1, 1 - activeAge / PLAYER.maxLifetimeSeconds));
    const inFryStage = fish.fryAge !== null && fish.fryAge !== undefined;
    const remainingSeconds = Math.max(0, PLAYER.maxLifetimeSeconds - activeAge);
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
    return {
        ...world,
        bubbles: world.bubbles || [],
        shreds: (world.shreds || []).map(shred => extrapolateShred(shred, now, world.width, world.height)).filter(object => object.syncOpacity > 0),
        fish: (world.fish || []).map(fish => extrapolateFish(fish, now, world.width, world.height)).filter(object => object.syncOpacity > 0),
    };
}

// @ds:8b62d9ce @ds:8c663384
function extrapolateShred(shred, now, worldWidth, worldHeight){
    const elapsedSeconds = Math.max(0, (now - (shred._syncBaseAt ?? now)) / 1000);
    return {
        ...shred,
        syncOpacity: syncOpacityAt(shred, now),
        pos: {
            x: wrapValue(shred.pos.x + (shred.vel?.x || 0) * elapsedSeconds, worldWidth),
            y: wrapValue(shred.pos.y + (shred.vel?.y || 0) * elapsedSeconds, worldHeight),
        },
    };
}

function extrapolateFish(fish, now, worldWidth, worldHeight){
    const elapsedSeconds = Math.max(0, (now - (fish._syncBaseAt ?? now)) / 1000);
    return {
        ...fish,
        syncOpacity: syncOpacityAt(fish, now),
        pos: {
            x: wrapValue(fish.pos.x + (fish.vel?.x || 0) * elapsedSeconds, worldWidth),
            y: wrapValue(fish.pos.y + (fish.vel?.y || 0) * elapsedSeconds, worldHeight),
        },
    };
}

function wrapValue(value, size){
    if( !Number.isFinite(size) || size <= 0 ) return value;
    return ((value % size) + size) % size;
}

// @ds:975ca168 @ds:bd354b7a @ds:3ddf8f67 @ds:a44b9d2c @fn:a9a3ed12 @ia:9c0d1e2f @ia:3a4b5c6e
function applyClientFishDecor(world, bubbles, dt, rng){
    const visibleFishIds = new Set((world.fish || []).map(fish => fish.id));
    for( const fishId of clientFishDecor.keys() ){
        if( !visibleFishIds.has(fishId) ) clientFishDecor.delete(fishId);
    }
    for( const fish of world.fish || [] ){
        const decor = clientFishDecor.get(fish.id) || makeClientDecor(fish);
        updateClientDecorState(decor, fish, dt, bubbles, rng);
        clientFishDecor.set(fish.id, decor);
        fish.exhale = decor.exhale;
        fish.visualScale = decor.visualScale;
        runExhaleCycle(fish, bubbles, rng, dt);
        decor.visualScale = fish.visualScale;
        fish.swimPhase = decor.swimPhase;
        fish.burstKick = decor.burstKick;
        fish.mouthOpen = decor.mouthOpen;
        if( decor.shredBurstHold > 0 ) fish.mode = 'burst'; // @ds:a2d5936f
        if( decor.eatingCruiseHold > 0 ) fish.mode = 'cruise'; // @ds:975ca168
    }
}

function makeClientDecor(fish){
    return {
        swimPhase: 0,
        burstKick: 0,
        wasBurstSwimming: false,
        wasBurstActive: fish.mode === 'burst',
        lastDirection: null,
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

function updateClientDecorState(decor, fish, dt, bubbles, rng){
    const speed = Math.hypot(fish.vel?.x || 0, fish.vel?.y || 0);
    const burstActive = fish.mode === 'burst';
    const burstSwimming = burstActive && speed > FISH.facingThreshold;
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
    if( !accel ){
        if( controlMode.active === 'pointer' && fish && input.pointer.active ){
            const worldPointer = viewportToWorld(input.pointer.pos, state.world, fish, canvas, { viewportFishCapacity });
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
    const viewport = worldToViewport(state.world, fish, canvas, { viewportFishCapacity });
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
    if( joystickPanel ) joystickPanel.hidden = !isJoystickPanelVisible();
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
    const maxLevel = Math.max(1, Math.min(REGIME.speedLevels, Math.floor(Number(availableLevel) || 1)));
    const ringLevels = [30, 43, 56, 69, 82, 99];
    const ringSpecs = ringLevels.map(level => ({
        level,
        diameter: speedLevelToControlMagnitude(level) * 100,
        color: level <= maxLevel ? 'rgba(255, 228, 92, 0.24)' : 'rgba(150, 158, 164, 0.07)',
        width: level === maxLevel ? 1.4 : 1,
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

// @ds:b43d2f95 @ds:cd1c5776
function setupJoystickControls(){
    if( !joystickBase ) return;
    let activePointerId = null;
    const updateJoystick = e =>{
        const rect = joystickBase.getBoundingClientRect();
        const center = v(rect.left + rect.width / 2, rect.top + rect.height / 2);
        const raw = v(e.clientX - center.x, e.clientY - center.y);
        const radius = Math.max(1, rect.width / 2);
        const distance = Math.min(radius, Math.hypot(raw.x, raw.y));
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
