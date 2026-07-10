// imp/web-canvas/src/controls.js
// Implements: controls.dsc (pointerSteer primary, keySteer fallback)
// @ds 55c13a4f 10baf178 22fd3ab4 e6be3c03 0eef2d19 91e32235

import { FISH, REGIME } from './constants.js';
import { v, sub, len, normalize, scale } from './vec.js';

const JOYSTICK_CRUISE_MAGNITUDE = Math.min(1, (REGIME.cruiseMaxSpeedLevel / REGIME.speedLevels) * 1.5);

function normalizeKey(key){
    return typeof key === 'string' && key.length === 1 ? key.toLowerCase() : key;
}

function isMovementKey(key){
    return key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown'
        || key === 'a' || key === 'd' || key === 'w' || key === 's';
}

function isControlKey(key){
    return isMovementKey(key) || key === ' ' || key === 'Space' || key === '1' || key === '2' || key === '3';
}

// @ds:cf6ad7d6
export function detectControlDevice(){
    return window.matchMedia?.('(pointer: coarse)').matches ? 'touch' : 'pointer';
}

// @ds:70871bc5 @ds:93b8abba
export function createControlModeState(initialMode = null){
    const device = detectControlDevice();
    return {
        device,
        active: initialMode || 'joystick',
    };
}

// ds:55c13a4f
export function pointerSteer(playerPos, pointer){
    if( !pointer.active ) return null;
    const d = sub(pointer.pos, playerPos);
    const distance = len(d);
    if( distance < 4 ) return v(0, 0);
    const strength = Math.min(1, distance / 140);   // ramps up then caps
    return scale(normalize(d), FISH.accel * strength);
}

// ds:10baf178
export function keySteer(keys){
    let dx = 0, dy = 0;
    if( keys.has('ArrowLeft') || keys.has('a') ) dx -= 1;
    if( keys.has('ArrowRight') || keys.has('d') ) dx += 1;
    if( keys.has('ArrowUp') || keys.has('w') ) dy -= 1;
    if( keys.has('ArrowDown') || keys.has('s') ) dy += 1;
    if( dx === 0 && dy === 0 ) return null;
    return scale(normalize(v(dx, dy)), FISH.accel);
}

// ds:b43d2f95
export function joystickSteer(joystick){
    if( !joystick?.active ) return null;
    const vector = joystick.rawVector || joystick.vector || v(0, 0);
    if( len(vector) < 1e-3 ) return v(0, 0);
    return scale(normalize(vector), FISH.accel * Math.min(1, len(vector)));
}

// @ds:22fd3ab4 @ds:27129cfa @ds:cd1c5776 @ia:6b7c8d9e
export function speedLevel(input, activeControlMode = null){
    input = input || {};
    const keyLevel = keyboardSpeedLevel(input.keys || new Set());
    if( keyLevel > 0 ) return keyLevel;
    if( keyboardMovementActive(input.keys || new Set()) ) return REGIME.cruiseMaxSpeedLevel;
    const mode = activeControlMode || 'auto';
    if( mode === 'keyboard' ) return 0;
    if( mode === 'pointer' ) return input.pointerDown ? 31 : 0;
    if( mode === 'touch' ) return pointerSpeedLevel(input.pointer);
    if( mode === 'joystick' ) return joystickSpeedLevel(input.joystick);
    return Math.max(
        input.pointerDown ? 31 : 0,
        pointerSpeedLevel(input.pointer),
        joystickSpeedLevel(input.joystick)
    );
}

function keyboardSpeedLevel(keys){
    let level = 0;
    if( keys.has(' ') || keys.has('Space') || keys.has('1') ) level = Math.max(level, 31);
    if( keys.has('2') ) level = Math.max(level, 65);
    if( keys.has('3') ) level = Math.max(level, 99);
    return level;
}

function keyboardMovementActive(keys){
    for( const key of keys ){
        if( isMovementKey(key) ) return true;
    }
    return false;
}

function pointerSpeedLevel(pointer){
    if( !pointer?.active ) return 0;
    return levelFromUnit(len(pointer.vector || v(0, 0)));
}

function joystickSpeedLevel(joystick){
    if( !joystick?.active ) return 0;
    const magnitude = len(joystick.rawVector || joystick.vector || v(0, 0));
    return joystickLevelFromUnit(magnitude);
}

// @ds:cd1c5776 @ds:0eef2d19
export function speedLevelToControlMagnitude(level){
    const n = Math.max(1, Math.min(REGIME.speedLevels, Math.floor(Number(level) || 1)));
    if( n <= REGIME.cruiseMaxSpeedLevel ){
        return (n / REGIME.cruiseMaxSpeedLevel) * JOYSTICK_CRUISE_MAGNITUDE;
    }
    const burstRange = REGIME.speedLevels - REGIME.burstStartSpeedLevel;
    const burstUnit = (n - REGIME.burstStartSpeedLevel) / Math.max(1, burstRange);
    return JOYSTICK_CRUISE_MAGNITUDE + burstUnit * (1 - JOYSTICK_CRUISE_MAGNITUDE);
}

function levelFromUnit(unit){
    return Math.max(0, Math.min(99, Math.round(Math.max(0, Math.min(1, unit)) * 99)));
}

function joystickLevelFromUnit(unit){
    const magnitude = Math.max(0, Math.min(1, unit));
    if( magnitude <= 0 ) return 0;
    if( magnitude <= JOYSTICK_CRUISE_MAGNITUDE ){
        return Math.max(1, Math.min(REGIME.cruiseMaxSpeedLevel, Math.round((magnitude / JOYSTICK_CRUISE_MAGNITUDE) * REGIME.cruiseMaxSpeedLevel)));
    }
    const burstRange = REGIME.speedLevels - REGIME.burstStartSpeedLevel;
    const burstUnit = (magnitude - JOYSTICK_CRUISE_MAGNITUDE) / Math.max(1e-6, 1 - JOYSTICK_CRUISE_MAGNITUDE);
    return Math.max(REGIME.burstStartSpeedLevel, Math.min(REGIME.speedLevels, REGIME.burstStartSpeedLevel + Math.floor(burstUnit * burstRange)));
}

// ds:55c13a4f ds:10baf178
export function playerSteer(player, input){
    const keyAccel = keySteer(input.keys);
    if( keyAccel ) return keyAccel;
    if( input.pointer.lockedByKeyboard ) return v(0, 0);
    return pointerSteer(player.pos, input.pointer) ?? v(0, 0);
}

// ds:22fd3ab4
// @ia:6b7c8d9e
export function huntMode(input, activeControlMode = null){
    return speedLevel(input, activeControlMode) >= 31 ? 'burst' : 'cruise';
}

// @ia 6b7c8d9e
export function createInput(canvas){
    const input = {
        pointer: { pos: v(0, 0), vector: v(0, 0), active: false, lockedByKeyboard: false },
        pointerDown: false,
        touchDown: false,
        touchCount: 0,
        joystick: { active: false, vector: v(0, 0), rawVector: v(0, 0) },
        keys: new Set(),
    };

    const setPointer = (clientX, clientY, unlockKeyboardLock = false) =>{
        const rect = canvas.getBoundingClientRect();
        input.pointer.pos = v(clientX - rect.left, clientY - rect.top);
        input.pointer.active = true;
        if( unlockKeyboardLock ) input.pointer.lockedByKeyboard = false;
    };

    // @ds:10baf178 @ds:22fd3ab4 @ds:93b8abba
    const clearPressedControls = () =>{
        input.keys.clear();
        input.pointerDown = false;
        input.touchDown = false;
        input.touchCount = 0;
        input.joystick.active = false;
        input.joystick.vector = v(0, 0);
        input.joystick.rawVector = v(0, 0);
    };

    // @ds:5d92a6ef
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('mousemove', e => setPointer(e.clientX, e.clientY, true));
    canvas.addEventListener('mouseleave', () =>{ input.pointer.active = false; input.pointerDown = false; });
    canvas.addEventListener('mousedown', e =>{ setPointer(e.clientX, e.clientY); input.pointerDown = true; });
    window.addEventListener('mouseup', () =>{ input.pointerDown = false; });
    canvas.addEventListener('touchstart', e =>{
        e.preventDefault();
        input.touchCount = e.touches.length;
        const touch = e.touches[0];
        if( !touch ) return;
        setPointer(touch.clientX, touch.clientY);
        input.touchDown = true;
    }, { passive: false });
    canvas.addEventListener('touchmove', e =>{
        e.preventDefault();
        input.touchCount = e.touches.length;
        const touch = e.touches[0];
        input.touchDown = Boolean(touch);
        if( touch ) setPointer(touch.clientX, touch.clientY, true);
        else input.pointer.active = false;
    }, { passive: false });
    canvas.addEventListener('touchend', e =>{
        e.preventDefault();
        input.touchCount = e.touches.length;
        const touch = e.touches[0];
        input.touchDown = Boolean(touch);
        if( touch ) setPointer(touch.clientX, touch.clientY);
        else input.pointer.active = false;
    }, { passive: false });
    canvas.addEventListener('touchcancel', e =>{
        e.preventDefault();
        input.touchCount = e.touches.length;
    }, { passive: false });

    window.addEventListener('keydown', e =>{
        const key = normalizeKey(e.key);
        if( isControlKey(key) ) e.preventDefault();
        input.keys.add(key);
        if( isMovementKey(key) ) input.pointer.lockedByKeyboard = true;
    });
    window.addEventListener('keyup', e =>{ input.keys.delete(normalizeKey(e.key)); });
    window.addEventListener('blur', clearPressedControls);
    document.addEventListener('visibilitychange', () =>{
        if( document.hidden ) clearPressedControls();
    });

    return input;

}
