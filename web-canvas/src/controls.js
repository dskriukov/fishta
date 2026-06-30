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

function isExhaleKey(key){
    return key === 'o' || key === 'щ';
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

// ds:55c13a4f ds:10baf178
export function playerSteer(player, input){
    const keyAccel = keySteer(input.keys);
    if( keyAccel ) return keyAccel;
    if( input.pointer.lockedByKeyboard ) return v(0, 0);
    return pointerSteer(player.pos, input.pointer) ?? v(0, 0);
}

// ds:22fd3ab4
export function huntMode(input){
    return (input.keys.has(' ') || input.keys.has('Space') || input.pointerDown || input.touchDown) ? 'burst' : 'cruise';
}

// @ia 6b7c8d9e
export function createInput(canvas){
    const input = {
        pointer: { pos: v(0, 0), active: false, lockedByKeyboard: false },
        pointerDown: false,
        touchDown: false,
        keys: new Set(),
        exhaleRequested: false,
    };

    const setPointer = (clientX, clientY, unlockKeyboardLock = false) =>{
        const rect = canvas.getBoundingClientRect();
        input.pointer.pos = v(clientX - rect.left, clientY - rect.top);
        input.pointer.active = true;
        if( unlockKeyboardLock ) input.pointer.lockedByKeyboard = false;
    };

    canvas.addEventListener('mousemove', e => setPointer(e.clientX, e.clientY, true));
    canvas.addEventListener('mouseleave', () =>{ input.pointer.active = false; input.pointerDown = false; });
    canvas.addEventListener('mousedown', e =>{ setPointer(e.clientX, e.clientY); input.pointerDown = true; });
    window.addEventListener('mouseup', () =>{ input.pointerDown = false; });
    canvas.addEventListener('touchstart', e =>{
        const touch = e.touches[0];
        if( !touch ) return;
        setPointer(touch.clientX, touch.clientY);
        input.touchDown = true;
    }, { passive: true });
    canvas.addEventListener('touchmove', e =>{
        const touch = e.touches[0];
        if( !touch ) return;
        setPointer(touch.clientX, touch.clientY, true);
    }, { passive: true });
    canvas.addEventListener('touchend', () =>{ input.pointer.active = false; input.touchDown = false; });

    window.addEventListener('keydown', e =>{
        const key = normalizeKey(e.key);
        input.keys.add(key);
        if( isMovementKey(key) ) input.pointer.lockedByKeyboard = true;
        if( !e.repeat && isExhaleKey(key) ) input.exhaleRequested = true; // ds:d9fc8d9c
    });
    window.addEventListener('keyup', e =>{ input.keys.delete(normalizeKey(e.key)); });

    return input;
}
