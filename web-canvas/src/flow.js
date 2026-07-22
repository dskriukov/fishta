// Unified water-flow field for server-owned shred motion and diagnostics.
// @fix:6a7b8c9d

import { FISH, SHRED } from './constants.js';

const EPSILON = 1e-6;

export function buildFlowField(world){
    const cellSize = FISH.nominalStartDiameter / 4;
    const columns = Math.max(1, Math.ceil(world.width / cellSize));
    const rows = Math.max(1, Math.ceil(world.height / cellSize));
    const length = columns * rows;
    const flowX = new Float32Array(length);
    const flowY = new Float32Array(length);
    const flowAngular = new Float32Array(length); // @fix:4e9b2c71

    for( const fish of world.fish || [] ){
        if( !fish?.pos || !Number.isFinite(fish.radius) ) continue;
        const velocity = fish.vel || { x: 0, y: 0 };
        const acceleration = fish.prevAccel || { x: 0, y: 0 };
        const speed = Math.hypot(velocity.x || 0, velocity.y || 0);
        const accelerationMagnitude = Math.hypot(acceleration.x || 0, acceleration.y || 0);
        const heading = directionOf(velocity, acceleration, fish.facing);
        if( heading.x || heading.y ){
            const wakeRadius = Math.max(cellSize, fish.radius * SHRED.flowWakeRadiusRatio);
            stampFishWake(flowX, flowY, flowAngular, columns, rows, cellSize, world, fish, heading, speed, accelerationMagnitude, wakeRadius);
        }
        if( (fish.mouthOpen || 0) > 0 ){
            const mouth = {
                x: fish.pos.x + heading.x * fish.radius * SHRED.mouthPositionRadiusRatio,
                y: fish.pos.y + heading.y * fish.radius * SHRED.mouthPositionRadiusRatio,
            };
            const mouthRadius = Math.max(cellSize, fish.radius * SHRED.mouthSuctionRadiusRatio);
            stampMouthSuction(flowX, flowY, columns, rows, cellSize, world, mouth, mouthRadius, fish.mouthOpen);
        }
    }

    return {
        cellSize,
        columns,
        rows,
        flowX,
        flowY,
        flowAngular, // @fix:4e9b2c71
        maxImpulse: SHRED.flowMapMaxImpulse,
        maxAngularImpulse: 1,
    };
}

export function sampleFlowField(field, position, world){
    if( !field || !position || !world ) return { x: 0, y: 0 };
    // Field samples are stored at cell centres, so shift the continuous index
    // by half a cell before selecting the four neighbours.
    const gridX = position.x / field.cellSize - 0.5;
    const gridY = position.y / field.cellSize - 0.5;
    const x0 = Math.floor(gridX);
    const y0 = Math.floor(gridY);
    const tx = gridX - x0;
    const ty = gridY - y0;
    return {
        x: bilinear(field.flowX, field.columns, field.rows, x0, y0, tx, ty),
        y: bilinear(field.flowY, field.columns, field.rows, x0, y0, tx, ty),
    };
}

function stampFishWake(flowX, flowY, flowAngular, columns, rows, cellSize, world, fish, heading, speed, accelerationMagnitude, radius){
    const strengthVelocity = speed + accelerationMagnitude * SHRED.flowAccelerationLeadSeconds;
    if( strengthVelocity <= EPSILON ) return;
    const activelyControlled = accelerationMagnitude > EPSILON;
    const centerX = Math.floor(fish.pos.x / cellSize);
    const centerY = Math.floor(fish.pos.y / cellSize);
    const span = Math.ceil(radius / cellSize);
    for( let oy = -span; oy <= span; oy++ ) for( let ox = -span; ox <= span; ox++ ){
        const cellX = wrapIndex(centerX + ox, columns);
        const cellY = wrapIndex(centerY + oy, rows);
        const point = { x: (cellX + 0.5) * cellSize, y: (cellY + 0.5) * cellSize };
        const delta = nearestToroidalDelta(fish.pos, point, world);
        const distance = Math.hypot(delta.x, delta.y);
        if( distance >= radius ) continue;
        const proximity = 1 - distance / radius;
        const weight = proximity * proximity;
        const index = cellY * columns + cellX;
        stampAngularImpulse(flowAngular, index, fish.radius, radius, delta, heading, speed, distance);
        if( !activelyControlled ){
            const impulse = speed * SHRED.wakeStrength * weight;
            flowX[index] += heading.x * impulse;
            flowY[index] += heading.y * impulse;
            continue;
        }
        const behind = delta.x * heading.x + delta.y * heading.y < 0;
        const direction = behind ? -1 : 1;
        const strength = behind ? SHRED.flowRearStrength : SHRED.flowFrontStrength;
        const rearVelocity = behind && fish.mode === 'cruise'
            ? Math.min(strengthVelocity, speed)
            : strengthVelocity;
        const impulse = (behind ? rearVelocity : strengthVelocity) * strength * weight * direction;
        flowX[index] += heading.x * impulse;
        flowY[index] += heading.y * impulse;
        if( behind ){
            const longitudinal = delta.x * heading.x + delta.y * heading.y;
            const lateralX = delta.x - heading.x * longitudinal;
            const lateralY = delta.y - heading.y * longitudinal;
            const lateralDistance = Math.hypot(lateralX, lateralY);
            if( lateralDistance > EPSILON ){
                const inwardImpulse = rearVelocity * SHRED.flowRearInwardStrength * weight
                    * Math.min(1, lateralDistance / Math.max(EPSILON, fish.radius));
                flowX[index] -= lateralX / lateralDistance * inwardImpulse;
                flowY[index] -= lateralY / lateralDistance * inwardImpulse;
            }
        }
    }
}

// @fix:4e9b2c71
function stampAngularImpulse(flowAngular, index, fishRadius, influenceRadius, delta, heading, speed, distance){
    if( distance <= fishRadius || speed <= EPSILON ) return;
    const radialLength = Math.max(EPSILON, distance);
    const radialX = delta.x / radialLength;
    const radialY = delta.y / radialLength;
    // In screen coordinates a positive cross product is the lower/right side;
    // that side rotates clockwise, while the upper/left side rotates counter-clockwise.
    const signedSide = heading.x * radialY - heading.y * radialX;
    const sideWeight = Math.abs(signedSide) ** 2;
    if( sideWeight <= EPSILON ) return;
    const outside = Math.max(0, Math.min(1, 1 - (distance - fishRadius) / Math.max(EPSILON, influenceRadius - fishRadius)));
    const speedWeight = Math.max(0, Math.min(1, speed / Math.max(EPSILON, SHRED.flowAngularReferenceSpeed)));
    flowAngular[index] += signedSide * sideWeight * outside * outside * speedWeight;
}

function stampMouthSuction(flowX, flowY, columns, rows, cellSize, world, mouth, radius, mouthOpen){
    const centerX = Math.floor(mouth.x / cellSize);
    const centerY = Math.floor(mouth.y / cellSize);
    const span = Math.ceil(radius / cellSize);
    for( let oy = -span; oy <= span; oy++ ) for( let ox = -span; ox <= span; ox++ ){
        const cellX = wrapIndex(centerX + ox, columns);
        const cellY = wrapIndex(centerY + oy, rows);
        const point = { x: (cellX + 0.5) * cellSize, y: (cellY + 0.5) * cellSize };
        const delta = nearestToroidalDelta(mouth, point, world);
        const distance = Math.hypot(delta.x, delta.y);
        if( distance >= radius ) continue;
        const proximity = 1 - distance / radius;
        const weight = proximity * proximity * Math.max(0, Math.min(1, mouthOpen));
        if( weight <= 0 ) continue;
        const direction = distance > EPSILON
            ? { x: -delta.x / distance, y: -delta.y / distance }
            : { x: 0, y: 0 };
        const impulse = SHRED.mouthSuctionStrength * weight;
        const index = cellY * columns + cellX;
        flowX[index] += direction.x * impulse;
        flowY[index] += direction.y * impulse;
    }
}

function directionOf(velocity, acceleration, facing){
    const speed = Math.hypot(velocity.x || 0, velocity.y || 0);
    if( speed > EPSILON ) return { x: velocity.x / speed, y: velocity.y / speed };
    const accelerationMagnitude = Math.hypot(acceleration.x || 0, acceleration.y || 0);
    if( accelerationMagnitude > EPSILON ) return { x: acceleration.x / accelerationMagnitude, y: acceleration.y / accelerationMagnitude };
    return { x: facing < 0 ? -1 : 1, y: 0 };
}

function bilinear(values, columns, rows, x0, y0, tx, ty){
    const f00 = values[wrapIndex(y0, rows) * columns + wrapIndex(x0, columns)] || 0;
    const f10 = values[wrapIndex(y0, rows) * columns + wrapIndex(x0 + 1, columns)] || 0;
    const f01 = values[wrapIndex(y0 + 1, rows) * columns + wrapIndex(x0, columns)] || 0;
    const f11 = values[wrapIndex(y0 + 1, rows) * columns + wrapIndex(x0 + 1, columns)] || 0;
    return f00 * (1 - tx) * (1 - ty)
        + f10 * tx * (1 - ty)
        + f01 * (1 - tx) * ty
        + f11 * tx * ty;
}

function nearestToroidalDelta(from, to, world){
    let dx = (to.x || 0) - (from.x || 0);
    let dy = (to.y || 0) - (from.y || 0);
    if( world.width > 0 ){
        if( dx > world.width / 2 ) dx -= world.width;
        if( dx < -world.width / 2 ) dx += world.width;
    }
    if( world.height > 0 ){
        if( dy > world.height / 2 ) dy -= world.height;
        if( dy < -world.height / 2 ) dy += world.height;
    }
    return { x: dx, y: dy };
}

function wrapIndex(value, size){
    return ((value % size) + size) % size;
}
