// imp/web-canvas/src/predation.js
// Implements: predation.dsc (overlaps, canEat, resolveEating)
// Note: player_immune = true (predation.symmetry, goal.growth)
// @ds a3e394a8 27ebde84 e9fb3705 fcdfb2b7 d867989f

import { PREDATION } from './constants.js';
import { dist } from './vec.js';
import { grow } from './fish.js';

// ds:a3e394a8
export function overlaps(a, b){
    return dist(a.pos, b.pos) < a.radius + b.radius;
}

// ds:27ebde84
export function canEat(predator, prey){
    return predator.size > prey.size * PREDATION.eatRatio;
}

// ds:e9fb3705
// Returns number of prey eaten by the player this tick (for HUD).
export function resolveEating(state){
    const { player, prey } = state;
    let eatenByPlayer = 0;

    // ds:e9fb3705 ds:d867989f
    for( let i = prey.length - 1; i >= 0; i-- ){
        const p = prey[i];
        if( overlaps(player, p) && canEat(player, p) ){
            grow(player, p.size);
            prey.splice(i, 1);
            eatenByPlayer++;
        }
    }

    // ds:e9fb3705 ds:d867989f
    for( let i = prey.length - 1; i >= 0; i-- ){
        const a = prey[i];
        if( !a ) continue;
        for( let j = prey.length - 1; j >= 0; j-- ){
            if( i === j ) continue;
            const b = prey[j];
            if( !b ) continue;
            if( overlaps(a, b) && canEat(a, b) ){
                grow(a, b.size);
                prey.splice(j, 1);
                if( j < i ) i--;
            }
        }
    }
    // player is never removed — symmetry/player_immune
    return eatenByPlayer;
}
