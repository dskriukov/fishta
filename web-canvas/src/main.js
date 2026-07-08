// imp/web-canvas/src/main.js
// Bootstraps world + game loop (dsr/use/ecs-loop.dsr). Glue/I-O layer.
// @ds b28b7af6 27fa3caa ec8cb052 c95ca496 48c4fc99 b433f1bc d2e8a84c 5fb1ff09 c83f4c1e ca07d970 d6cebf86 3ddf8f67 1f3abc43 cbc1225a 7ce238da c4073e51 ee07d6da 8869f043 f51831f5 8d0ca6a8 d867989f 975ca168 bd354b7a 906be50b 91e32235 55c13a4f 10baf178 22fd3ab4 7b9a7984 ad8d81d8 31cb7a0d 579e4888 e699c42d e6ecfbdd 1e66d817 a3e394a8 98224ab9 e9fb3705 fcdfb2b7 0c8d4e2a 6f1b0a3c 39305789

import { DEBUG, FISH, GROWTH, LOOP, MOUTH, SIZE_DELTA_LABEL, SWIM, SYNC } from './constants.js';
import { advanceBubbles, emitBubble, makeWorld } from './world.js';
import { requestExhale, runExhaleCycle, serializeFish } from './fish.js';
import { createControlModeState, createInput, keySteer, pointerSteer, joystickSteer, huntMode } from './controls.js';
import { buildToroidalRenderWorld, loadFishGeometry, render, viewportToWorld } from './render.js';
import { dist, normalize, scale, v } from './vec.js';
import { createClientNet } from './client-net.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const hudSize = document.getElementById('size');
const hudEaten = document.getElementById('eaten');
const hudStatus = document.getElementById('status');
const joinPanel = document.getElementById('join');
const joinForm = document.getElementById('join-form');
const joinName = document.getElementById('join-name');
const joinColor = document.getElementById('join-color');
const joinTier = document.getElementById('join-tier');
const leaveButton = document.getElementById('leave-game');
const debugToggle = document.getElementById('debug-toggle');
const controlModeButtons = [...document.querySelectorAll('[data-control-mode]')];
const joystickPanel = document.getElementById('joystick-panel');
const joystickBase = document.getElementById('joystick-base');
const joystickKnob = document.getElementById('joystick-knob');
const joystickHunt = document.getElementById('joystick-hunt');

let state = { world: makeWorld(), currentUserFishId: null };
const snapshotBuffer = [];
const clientBubbles = [];
const clientBubbleEmitters = new Map();
const clientFishDecor = new Map();
let serializeKeyLatch = false;
let lastSentInputKey = null;
let lastInputFlushAt = 0;
let debugMode = false;
let debugPositionTraces = [];
let latestAbsoluteServerPositions = new Map();
let lastDebugTraceAt = 0;
let lastVisibleState = state;
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
    await loadFishGeometry();
}

// ds:b28b7af6
function resize(){
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

const input = createInput(canvas);
const net = createClientNet({
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
    },
    onStatus(status){
        hudStatus.textContent = status;
    },
    onIdentity(){
        lastSentInputKey = null;
        lastInputFlushAt = 0;
        if( joinPanel ) joinPanel.hidden = true;
    },
});

function currentUserFish(world = state.world, currentUserFishId = state.currentUserFishId){
    return (world.fish || []).find(f => f.id === currentUserFishId)
        || (world.fish || []).find(f => f.id === net.currentUserFishId);
}

canvas.addEventListener('click', e =>{
    if( !state ) return;
    const rect = canvas.getBoundingClientRect();
    const clickState = lastVisibleState || state;
    const followed = currentUserFish(clickState.world, clickState.currentUserFishId);
    const clickPos = viewportToWorld(v(e.clientX - rect.left, e.clientY - rect.top), clickState.world, followed, canvas);
    const renderWorld = buildToroidalRenderWorld(clickState.world, followed);
    const projectedFish = (renderWorld.fish || []).find(candidate => candidate && dist(clickPos, candidate.pos) <= candidate.radius);
    const fish = projectedFish ? (state.world.fish || []).find(candidate => candidate.id === projectedFish.id) : null;
    if( fish ) console.log(serializeFish(fish)); // ds:2e1570ed
});
window.addEventListener('resize', resize);

if( joinName ) joinName.value = `fish-${Math.floor(Math.random() * 900 + 100)}`;
if( joinColor ) joinColor.value = `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`;
if( joinForm ){
    joinForm.addEventListener('submit', e =>{
        e.preventDefault();
        net.join({
            userName: joinName.value.trim() || 'fish',
            userColor: joinColor.value,
            userTier: joinTier.checked ? 'paid' : 'free',
        });
        if( joinPanel ) joinPanel.hidden = true;
    });
}
if( leaveButton ){
    leaveButton.addEventListener('click', () => net.leave());
}
if( debugToggle ){
    debugToggle.addEventListener('click', toggleDebugMode);
    debugToggle.setAttribute('aria-pressed', 'false');
}
setupControlModes();
setupJoystickControls();
window.addEventListener('keydown', e =>{
    if( e.key === '`' || e.key === '~' ){
        e.preventDefault();
        toggleDebugMode();
    }
});

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
    hudSize.textContent = `size: ${fish ? fish.size.toFixed(1) : '-'}`;
    hudEaten.textContent = `eaten: ${fish ? fish.eatenFishCount : 0}`;
    if( fish ) hudStatus.textContent = fish.userTier === 'paid' ? 'paid' : 'free';

    requestAnimationFrame(frame);
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
        fish: (world.fish || []).map(fish => extrapolateFish(fish, elapsedSeconds, world.width, world.height)),
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

// @ds:975ca168 @ds:bd354b7a @ds:3ddf8f67 @fn:a9a3ed12 @ia:9c0d1e2f @ia:3a4b5c6e
function applyClientFishDecor(world, bubbles, dt, rng){
    const visibleFishIds = new Set((world.fish || []).map(fish => fish.id));
    for( const fishId of clientFishDecor.keys() ){
        if( !visibleFishIds.has(fishId) ) clientFishDecor.delete(fishId);
    }
    for( const fish of world.fish || [] ){
        const decor = clientFishDecor.get(fish.id) || makeClientDecor(fish);
        updateClientDecorState(decor, fish, dt);
        clientFishDecor.set(fish.id, decor);
        fish.exhale = decor.exhale;
        fish.visualScale = decor.visualScale;
        runExhaleCycle(fish, bubbles, rng, dt);
        decor.visualScale = fish.visualScale;
        fish.swimPhase = decor.swimPhase;
        fish.burstKick = decor.burstKick;
        fish.mouthOpen = decor.mouthOpen;
    }
}

function makeClientDecor(fish){
    return {
        swimPhase: 0,
        burstKick: 0,
        wasBurstSwimming: false,
        wasBurstActive: fish.mode === 'burst',
        visualScale: fish.visualScale || 1,
        exhale: {
            requested: false,
            stage: 'idle',
            t: 0,
            emitTimer: 0,
            emitCount: 0,
            emitTotal: 0,
        },
        mouthOpen: 0,
        mouthHold: 0,
        mouthEatenSize: 0,
        lastEatenFishCount: fish.eatenFishCount || 0,
        lastSize: fish.size || 1,
    };
}

function updateClientDecorState(decor, fish, dt){
    const speed = Math.hypot(fish.vel?.x || 0, fish.vel?.y || 0);
    const burstActive = fish.mode === 'burst';
    const burstSwimming = burstActive && speed > FISH.facingThreshold;
    if( burstActive && !decor.wasBurstActive ) requestExhale({ exhale: decor.exhale }); // @ds:3ddf8f67 @fn:a9a3ed12
    decor.wasBurstActive = burstActive;
    if( burstSwimming && !decor.wasBurstSwimming ) decor.burstKick = 1;
    decor.wasBurstSwimming = burstSwimming;
    decor.burstKick = Math.max(0, decor.burstKick - dt * SWIM.kickDecay);
    decor.swimPhase += dt * (SWIM.basePhaseRate + speed * SWIM.speedPhaseRate);

    const eatenCount = fish.eatenFishCount || 0;
    if( eatenCount > decor.lastEatenFishCount ){
        decor.mouthHold = Math.max(decor.mouthHold, MOUTH.holdDuration);
        decor.mouthEatenSize = Math.max(decor.mouthEatenSize, estimateEatenSize(decor.lastSize, fish.size));
    }
    decor.lastEatenFishCount = eatenCount;
    decor.lastSize = fish.size || decor.lastSize;

    if( decor.mouthHold > 0 ) decor.mouthHold = Math.max(0, decor.mouthHold - dt);
    if( decor.mouthEatenSize > 0 ) decor.mouthEatenSize = Math.max(0, decor.mouthEatenSize - dt * Math.max(1, fish.size || 1) * 2);

    const chaseOpen = burstSwimming ? MOUTH.chaseOpenRatio : 0;
    const eatOpen = decor.mouthHold > 0 ? Math.min(1, decor.mouthEatenSize / Math.max(1, fish.size || 1)) : 0;
    decor.mouthOpen = Math.max(chaseOpen, eatOpen);
}

function estimateEatenSize(previousSize, currentSize){
    const sizeGain = Math.max(0, (currentSize || 0) - (previousSize || 0));
    if( sizeGain > 0 ){
        return sizeGain * (1 + (previousSize || 1) * GROWTH.decay) / GROWTH.k;
    }
    return Math.max(1, currentSize || previousSize || 1);
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
    const delta = currentSize - sizeDeltaLabelState.lastSize;
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

function buildInputPayload(){
    const fish = currentUserFish();
    let accel = keySteer(input.keys);
    if( !accel ){
        if( controlMode.active === 'pointer' && fish && input.pointer.active && !input.pointer.lockedByKeyboard ){
            const worldPointer = viewportToWorld(input.pointer.pos, state.world, fish, canvas);
            accel = pointerSteer(fish.pos, { active: true, pos: worldPointer });
        }else if( controlMode.active === 'touch' && fish && input.pointer.active && input.touchDown ){
            const worldPointer = viewportToWorld(input.pointer.pos, state.world, fish, canvas);
            accel = pointerSteer(fish.pos, { active: true, pos: worldPointer });
        }else if( controlMode.active === 'joystick' ){
            accel = joystickSteer(input.joystick);
        }
    }
    return {
        accel: accel ? normalize(accel) : v(0, 0),
        hunt: huntMode(input, controlMode.active) === 'burst',
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
    return `${x}:${y}:${payload?.hunt ? 'b' : '-'}`;
}

// @ds:59c118f5
function toggleDebugMode(){
    debugMode = !debugMode;
    if( debugToggle ) debugToggle.setAttribute('aria-pressed', debugMode ? 'true' : 'false');
}

// @ds:70871bc5
function setupControlModes(){
    setControlMode(controlMode.active);
    for( const button of controlModeButtons ){
        button.addEventListener('click', () => setControlMode(button.dataset.controlMode));
    }
}

function setControlMode(mode){
    controlMode.active = mode || controlMode.active;
    for( const button of controlModeButtons ){
        const active = button.dataset.controlMode === controlMode.active;
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    if( joystickPanel ) joystickPanel.hidden = controlMode.active !== 'joystick';
    input.pointer.lockedByKeyboard = controlMode.active === 'keyboard';
    input.joystick.active = false;
    input.joystick.vector = v(0, 0);
    if( joystickKnob ) joystickKnob.style.transform = 'translate(-50%, -50%)';
    lastSentInputKey = null;
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
        input.joystick.vector = scale(direction, distance / radius);
        if( joystickKnob ){
            joystickKnob.style.transform = `translate(calc(-50% + ${direction.x * distance}px), calc(-50% + ${direction.y * distance}px))`;
        }
    };
    const resetJoystick = () =>{
        activePointerId = null;
        input.joystick.active = false;
        input.joystick.vector = v(0, 0);
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
    if( joystickHunt ){
        joystickHunt.addEventListener('pointerdown', e =>{
            e.preventDefault();
            input.joystick.hunt = true;
            joystickHunt.setAttribute('aria-pressed', 'true');
        });
        const stopHunt = () =>{
            input.joystick.hunt = false;
            joystickHunt.setAttribute('aria-pressed', 'false');
        };
        joystickHunt.addEventListener('pointerup', stopHunt);
        joystickHunt.addEventListener('pointercancel', stopHunt);
        joystickHunt.addEventListener('pointerleave', stopHunt);
    }
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
