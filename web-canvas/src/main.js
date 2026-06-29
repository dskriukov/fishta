// imp/web-canvas/src/main.js
// Bootstraps world + game loop (dsr/use/ecs-loop.dsr). Glue/I-O layer.
// @ds b28b7af6 27fa3caa ec8cb052 c95ca496 48c4fc99 b433f1bc d2e8a84c 5fb1ff09 c83f4c1e ca07d970 d6cebf86 1f3abc43 cbc1225a 7ce238da c4073e51 ee07d6da 8869f043 f51831f5 8d0ca6a8 d867989f 975ca168 bd354b7a 906be50b 91e32235 55c13a4f 10baf178 22fd3ab4 7b9a7984 ad8d81d8 31cb7a0d 579e4888 e699c42d e6ecfbdd 1e66d817 a3e394a8 27ebde84 e9fb3705 fcdfb2b7

import { LOOP } from './constants.js';
import { makeWorld } from './world.js';
import { makeFish, serializeFish } from './fish.js';
import { createInput } from './controls.js';
import { maintainPopulation } from './prey.js';
import { step } from './step.js';
import { render } from './render.js';
import { dist, v } from './vec.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const hudSize = document.getElementById('size');
const hudEaten = document.getElementById('eaten');

// simple deterministic-ish rng (swappable for seeded rng to make step reproducible)
const rng = Math.random;

let state;
let serializeKeyLatch = false;

// ds:b28b7af6
function init(){
    resize();
    const world = makeWorld(canvas.width, canvas.height);
    const player = makeFish({
        pos: v(world.width / 2, world.height / 2),
        size: 1,
        isPlayer: true,
    });
    state = { world, player, prey: [], bubbles: [], eaten: 0 };
    maintainPopulation(state, rng);
}

// ds:b28b7af6
function resize(){
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    if( state ){
        state.world.width = canvas.width;
        state.world.height = canvas.height;
    }
}

const input = createInput(canvas);
canvas.addEventListener('click', e =>{
    if( !state ) return;
    const rect = canvas.getBoundingClientRect();
    const clickPos = v(e.clientX - rect.left, e.clientY - rect.top);
    const fish = [state.player, ...state.prey].find(candidate => dist(clickPos, candidate.pos) <= candidate.radius);
    if( fish ) console.log(serializeFish(fish)); // ds:2e1570ed
});
window.addEventListener('resize', resize);

let last = performance.now();
// ds:b28b7af6
function frame(now){
    let dt = (now - last) / 1000;
    last = now;
    dt = Math.min(dt, LOOP.maxDt);   // clamp — ecs-loop.dsr

    step(state, input, dt, rng);
    render(ctx, state);

    const serializePressed = input.keys.has('i') || input.keys.has('I');
    if( serializePressed && !serializeKeyLatch ){
        console.log(serializeFish(state.player));
    }
    serializeKeyLatch = serializePressed;

    hudSize.textContent = `size: ${state.player.size.toFixed(1)}`;
    hudEaten.textContent = `eaten: ${state.eaten}`;

    requestAnimationFrame(frame);
}

init();
requestAnimationFrame(frame);
