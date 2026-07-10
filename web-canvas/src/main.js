// imp/web-canvas/src/main.js
// Bootstraps world + game loop (dsr/use/ecs-loop.dsr). Glue/I-O layer.
// @ds b28b7af6 27fa3caa ec8cb052 ab1e4f02 c95ca496 48c4fc99 b433f1bc d2e8a84c 5fb1ff09 c83f4c1e ca07d970 d6cebf86 2b3e71e0 3ddf8f67 1f3abc43 cbc1225a 7ce238da c4073e51 ee07d6da 8869f043 07320d39 f51831f5 8d0ca6a8 d867989f 975ca168 bd354b7a 906be50b 91e32235 55c13a4f 10baf178 22fd3ab4 e6be3c03 0eef2d19 e001d967 cff27cd5 7b9a7984 ad8d81d8 31cb7a0d 579e4888 e699c42d e6ecfbdd 1e66d817 a3e394a8 98224ab9 e9fb3705 fcdfb2b7 0c8d4e2a 6f1b0a3c 39305789 2e91f6d4 b9136c2e c5a92431 c656f0ec e42a7c19 a2d5936f 73b91e4c ed2b4f19
// @ia 3983084a

import { DEBUG, ENERGY, EXHALE, FISH, LOOP, MOUTH, PLAYER, REGIME, SHRED, SIZE_DELTA_LABEL, SWIM, SYNC, VIEWPORT_FISH_CAPACITY } from './constants.js';
import { advanceBubbles, emitBubble, makeBubble, makeWorld } from './world.js';
import { BURST_ENDURANCE_SIZE_THRESHOLDS, availableSpeedLevelForSize, burstEnergyFactorOf, maxSpeedOf, requestExhale, runExhaleCycle, serializeFish, speedCapOf } from './fish.js';
import { createControlModeState, createInput, keySteer, pointerSteer, joystickSteer, speedLevel, speedLevelToControlMagnitude } from './controls.js';
import { buildToroidalRenderWorld, loadFishGeometry, loadShredGeometry, render, viewportToWorld, worldToViewport } from './render.js';
import { dist, normalize, scale, v } from './vec.js';
import { createClientNet } from './client-net.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const playerMetrics = document.getElementById('player-metrics');
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
const joinPanel = document.getElementById('join');
const joinForm = document.getElementById('join-form');
const joinName = document.getElementById('join-name');
const joinColor = document.getElementById('join-color');
const joinTier = document.getElementById('join-tier');
const leaveButton = document.getElementById('leave-game');
const gameMenuToggle = document.getElementById('game-menu-toggle');
const gameMenu = document.getElementById('game-menu');
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
const snapshotBuffer = [];
const clientBubbles = [];
const clientBubbleEmitters = new Map();
const clientFishDecor = new Map();
let serializeKeyLatch = false;
let lastSentInputKey = null;
let lastInputFlushAt = 0;
let gameMenuOpen = false;
let debugMode = false;
let debugPositionTraces = [];
let latestAbsoluteServerPositions = new Map();
let lastDebugTraceAt = 0;
let lastVisibleState = state;
let entrySessionReady = false;
let burstEnduranceTableKey = '';
let viewportFishCapacity = VIEWPORT_FISH_CAPACITY.defaultValue;
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

// ds:b28b7af6
function resize(){
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

const input = createInput(canvas);
net = createClientNet({
    onSnapshot(message){
        if( state.currentUserFishId !== message.currentUserFishId ) lastSentInputKey = null;
        state.world = message.world;
        state.currentUserFishId = message.currentUserFishId;
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
    onEvent(message){
        hudStatus.textContent = message.status || message.event || 'event';
        if( message.event === 'rj' ){
            state.currentUserFishId = null;
            lastSentInputKey = null;
            lastInputFlushAt = 0;
            setJoinedUiState(false, { showJoinForm: true });
        }
        if( message.leaveSucceeded ){
            state.currentUserFishId = null;
            lastSentInputKey = null;
            lastInputFlushAt = 0;
            setJoinedUiState(false, { showJoinForm: true });
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
            setJoinedUiState(false, { showJoinForm: true, sessionReady: true });
        }
    },
    onIdentity(){
        lastSentInputKey = null;
        lastInputFlushAt = 0;
        setJoinedUiState(true, { sessionReady: true });
    },
});

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
window.addEventListener('resize', resize);

if( joinName ) joinName.value = `fish-${Math.floor(Math.random() * 900 + 100)}`;
if( joinColor ) joinColor.value = `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`;
setJoinedUiState(false);
if( joinForm ){
    joinForm.addEventListener('submit', e =>{
        e.preventDefault();
        net.join({
            userName: joinName.value.trim() || 'fish',
            userColor: joinColor.value,
            userTier: joinTier.checked ? 'paid' : 'free',
        });
        setJoinedUiState(false, { sessionReady: true });
    });
}
if( leaveButton ){
    leaveButton.addEventListener('click', handleLeaveGameButton);
}
if( gameMenuToggle ){
    gameMenuToggle.addEventListener('click', toggleGameMenu);
    gameMenuToggle.setAttribute('aria-expanded', 'false');
}
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
        frameDt: dt,
        viewportFishCapacity,
        clientBubbles,
        sizeDeltaLabels: sizeDeltaLabelState.labels,
        debug: { enabled: debugMode, positionTraces: debugPositionTraces, now },
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

// @ds:c5a92431
function updatePlayerNameMetric(fish){
    if( !playerName ) return;
    playerName.textContent = fish?.userName || '-';
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

function sumFishArea(fishItems){
    return fishItems.reduce((sum, fish) =>{
        const radius = Number.isFinite(fish?.radius) ? fish.radius : FISH.baseRadius * Math.sqrt(Math.max(0, fish?.size || 0));
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
    const elapsedSeconds = Math.min(SYNC.maxExtrapolationMs / 1000, Math.max(0, (now - latest.receivedAt) / 1000));

    return {
        ...state,
        currentUserFishId: latest.currentUserFishId,
        world: extrapolateWorld(latest.world, elapsedSeconds),
    };
}

function extrapolateWorld(world, elapsedSeconds){
    return {
        ...world,
        bubbles: world.bubbles || [],
        shreds: (world.shreds || []).map(shred => extrapolateShred(shred, elapsedSeconds, world.width, world.height)),
        fish: (world.fish || []).map(fish => extrapolateFish(fish, elapsedSeconds, world.width, world.height)),
    };
}

// @ds:8b62d9ce
function extrapolateShred(shred, elapsedSeconds, worldWidth, worldHeight){
    return {
        ...shred,
        pos: {
            x: wrapValue(shred.pos.x + (shred.vel?.x || 0) * elapsedSeconds, worldWidth),
            y: wrapValue(shred.pos.y + (shred.vel?.y || 0) * elapsedSeconds, worldHeight),
        },
    };
}

function extrapolateFish(fish, elapsedSeconds, worldWidth, worldHeight){
    return {
        ...fish,
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
    if( now - lastInputFlushAt >= 1000 ){
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
    updateGameMenu();
}

// @ds:ab1e4f02 @ds:59c118f5 @ds:70871bc5 @ds:22fd3ab4
function updateGameMenu(){
    if( gameMenuToggle ) gameMenuToggle.setAttribute('aria-expanded', gameMenuOpen ? 'true' : 'false');
    if( gameMenu ) gameMenu.hidden = !gameMenuOpen || !entrySessionReady;
    if( debugModeToggle ) debugModeToggle.setAttribute('aria-pressed', debugMode ? 'true' : 'false');
    updateControlHelp();
    updateBurstEnduranceTable(currentUserFish());
}

// @ds:e001d967
function setupViewportFishCapacity(){
    if( !viewportFishCapacitySelect ) return;
    viewportFishCapacitySelect.value = viewportFishCapacity;
    viewportFishCapacitySelect.addEventListener('change', () => setViewportFishCapacity(viewportFishCapacitySelect.value));
}

// @ds:e001d967
function setViewportFishCapacity(value){
    viewportFishCapacity = VIEWPORT_FISH_CAPACITY.options.includes(value)
        ? value
        : VIEWPORT_FISH_CAPACITY.defaultValue;
    if( viewportFishCapacitySelect ) viewportFishCapacitySelect.value = viewportFishCapacity;
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
