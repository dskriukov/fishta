// imp/web-canvas/src/hunt.js
// Implements: predation.hunt (NPC pursuit steering)
// @ds d4f6a1c2

import { PREY } from './constants.js';
import { sub, normalize, dist, scale } from './vec.js';
import { isEdibleBySize } from './predation.js';

export function huntSteer(hunter, targets){
    let nearest = null;
    let nearestD = PREY.fleeRadius;
    for( const target of targets ){
        if( target === hunter ) continue;
        if( !isEdibleBySize(hunter, target) ) continue;
        const d = dist(hunter.pos, target.pos);
        if( d < nearestD ){
            nearestD = d;
            nearest = target;
        }
    }

    if( !nearest ) return { accel: null, mode: 'cruise' };

    const hunterSpeed = Math.hypot(hunter.vel.x, hunter.vel.y);
    const targetSpeed = Math.hypot(nearest.vel.x, nearest.vel.y);
    if( hunterSpeed > targetSpeed + PREY.speedMargin ){
        return { accel: null, mode: 'cruise' };
    }

    const toward = normalize(sub(nearest.pos, hunter.pos));
    const proximity = Math.max(0, Math.min(1, (PREY.fleeRadius - nearestD) / PREY.fleeRadius));
    return {
        accel: scale(toward, PREY.fleeAccel * proximity),
        mode: 'burst',
    };
}
