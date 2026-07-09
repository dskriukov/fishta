// imp/web-canvas/src/controls.js
// Implements: controls.dsc (pointerSteer primary, keySteer fallback)
// @ds 55c13a4f 10baf178 22fd3ab4 91e32235

import { FISH } from './constants.js';
import { v, sub, len, normalize, scale } from './vec.js';

function normalizeKey(key){
    return typeof key === 'string' && key.length === 1 ? key.toLowerCase() : key;
}

function isMovementKey(key){
    return key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown'
        || key === 'a' || key === 'd' || key === 'w' || key === 's';
}

function isControlKey(key){
    return isMovementKey(key) || key === ' ' || key === 'Space';
}

// @ds:cf6ad7d6
export function detectControlDevice(){
    return window.matchMedia?.('(pointer: coarse)').matches ? 'touch' : 'pointer';
}

// @ds:70871bc5
export function createControlModeState(initialMode = null){
    const device = detectControlDevice();
    return {
        device,
        active: initialMode || (device === 'touch' ? 'joystick' : 'keyboard'),
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
    const vector = joystick.vector || v(0, 0);
    if( len(vector) < 1e-3 ) return v(0, 0);
    return scale(normalize(vector), FISH.accel * Math.min(1, len(vector)));
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
    if( input.keys.has(' ') || input.keys.has('Space') ) return 'burst';
    const mode = activeControlMode || 'auto';
    if( mode === 'keyboard' ) return 'cruise';
    if( mode === 'pointer' ) return input.pointerDown ? 'burst' : 'cruise';
    if( mode === 'touch' ) return input.touchCount >= 2 ? 'burst' : 'cruise';
    if( mode === 'joystick' ) return input.joystick.hunt ? 'burst' : 'cruise';
    return (input.keys.has(' ') || input.keys.has('Space') || input.pointerDown || input.touchCount >= 2 || input.joystick.hunt) ? 'burst' : 'cruise';
}

// @ia 6b7c8d9e
export function createInput(canvas){
    const input = {
        pointer: { pos: v(0, 0), active: false, lockedByKeyboard: false },
        pointerDown: false,
        touchDown: false,
        touchCount: 0,
        joystick: { active: false, vector: v(0, 0), hunt: false },
        keys: new Set(),
    };

    const setPointer = (clientX, clientY, unlockKeyboardLock = false) =>{
        const rect = canvas.getBoundingClientRect();
        input.pointer.pos = v(clientX - rect.left, clientY - rect.top);
        input.pointer.active = true;
        if( unlockKeyboardLock ) input.pointer.lockedByKeyboard = false;
    };

    // @ds:10baf178 @ds:22fd3ab4
    const clearPressedControls = () =>{
        input.keys.clear();
        input.pointerDown = false;
        input.touchDown = false;
        input.touchCount = 0;
        input.joystick.active = false;
        input.joystick.vector = v(0, 0);
        input.joystick.hunt = false;
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
        if( !touch ) return;
        setPointer(touch.clientX, touch.clientY, true);
    }, { passive: false });
    canvas.addEventListener('touchend', e =>{
        e.preventDefault();
        input.touchCount = e.touches.length;
        const touch = e.touches[0];
        input.touchDown = Boolean(touch);
        if( touch ) setPointer(touch.clientX, touch.clientY);
        else input.pointer.active = false;
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
