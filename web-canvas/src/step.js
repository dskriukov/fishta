// imp/web-canvas/src/step.js
// Implements: dsr/use/ecs-loop.dsr — PURE domain step: state' = step(state, input, dt)
// Composes behaviours from world/fish/prey/predation/controls. No canvas here.
// @ds b28b7af6 22fd3ab4 55c13a4f 10baf178 7ce238da 8869f043 579e4888 31cb7a0d e9fb3705 e6ecfbdd d6cebf86

import { integrate, runExhaleCycle, requestExhale } from './fish.js';
import { preySteer, capPreySpeed, maintainPopulation } from './prey.js';
import { playerSteer, huntMode } from './controls.js';
import { resolveEating } from './predation.js';
import { emitBubble, advanceBubbles } from './world.js';

// @ia e5f60718
export function step(state, input, dt, rng){
    // ds:22fd3ab4 ds:55c13a4f ds:10baf178 ds:7ce238da
    state.player.mode = huntMode(input);
    if( input.exhaleRequested ){
        requestExhale(state.player);
        input.exhaleRequested = false;
    }
    const playerAccel = playerSteer(state.player, input);
    integrate(state.player, playerAccel, state.world, dt);
    runExhaleCycle(state.player, state.bubbles, rng, dt);

    // ds:579e4888 ds:31cb7a0d ds:27ebde84
    const threats = [state.player, ...state.prey];
    for( const p of state.prey ){
        const steer = preySteer(p, threats, dt, rng);
        p.mode = steer.mode;
        integrate(p, steer.accel ?? { x: 0, y: 0 }, state.world, dt);
        runExhaleCycle(p, state.bubbles, rng, dt);
        capPreySpeed(p);
    }

    // ds:e9fb3705 ds:d867989f
    state.eaten += resolveEating(state);

    // ds:e6ecfbdd ds:1e66d817
    maintainPopulation(state, rng);

    // ds:d6cebf86
    const fish = [state.player, ...state.prey];
    for( const f of fish ){
        const bubble = emitBubble(f, dt, rng);
        if( bubble ) state.bubbles.push(bubble);
    }
    advanceBubbles(state.bubbles, state.world, dt);

    return state;
}
