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
        if( (fish.mouthSuctionImpulse || 0) > 0 ){
            const mouth = {
                x: fish.pos.x + heading.x * fish.radius * SHRED.mouthPositionRadiusRatio,
                y: fish.pos.y + heading.y * fish.radius * SHRED.mouthPositionRadiusRatio,
            };
            const mouthRadius = Math.max(cellSize, fish.radius * SHRED.mouthSuctionRadiusRatio);
            stampMouthSuction(flowX, flowY, columns, rows, cellSize, world, mouth, mouthRadius, fish.mouthSuctionImpulse);
        }
    }

    // Add the local curl of the linear field to the angular field.  The
    // four-neighbour stencil keeps this contribution continuous with the
    // bilinear flow sampling used by client-side decorative objects.
    stampFlowVorticity(flowAngular, flowX, flowY, columns, rows, cellSize);

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

// @fix:4e9b2c71
function stampFlowVorticity(flowAngular, flowX, flowY, columns, rows, cellSize){
    const denominator = Math.max(EPSILON, 2 * cellSize);
    const shoulder = Number(SHRED.flowVorticityShoulder) || 0;
    if( Math.abs(shoulder) <= EPSILON ) return;
    for( let y = 0; y < rows; y++ ) for( let x = 0; x < columns; x++ ){
        const center = y * columns + x;
        const top = ((y - 1 + rows) % rows) * columns + x;
        const bottom = ((y + 1) % rows) * columns + x;
        const left = y * columns + ((x - 1 + columns) % columns);
        const right = y * columns + ((x + 1) % columns);
        // Screen-space clockwise curl: d(flowY)/dx - d(flowX)/dy.
        const curl = ((flowY[right] || 0) - (flowY[left] || 0)
            - ((flowX[bottom] || 0) - (flowX[top] || 0))) / denominator;
        flowAngular[center] += curl * shoulder;
    }
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
    const previousSpeed = Number(fish.previousSpeed);
    const speedDecreasing = fish.speedDecreasing === true
        || (Number.isFinite(previousSpeed)
            && speed < previousSpeed - Math.max(EPSILON, SHRED.flowSpeedDropEpsilon));
    const inertialBraking = speedDecreasing && !fish.reverseFacing;
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
        const behind = delta.x * heading.x + delta.y * heading.y < 0;
        if( inertialBraking ){
            const impulse = strengthVelocity * SHRED.flowBrakingCoreStrength * weight;
            flowX[index] += heading.x * impulse;
            flowY[index] += heading.y * impulse;
            const longitudinal = delta.x * heading.x + delta.y * heading.y;
            const lateralX = delta.x - heading.x * longitudinal;
            const lateralY = delta.y - heading.y * longitudinal;
            const lateralDistance = Math.hypot(lateralX, lateralY);
            if( lateralDistance > EPSILON ){
                const sideWeight = brakingSideWeight(longitudinal, lateralDistance, fish.radius);
                const inwardImpulse = strengthVelocity * SHRED.flowBrakingInwardStrength * weight * sideWeight;
                flowX[index] -= lateralX / lateralDistance * inwardImpulse;
                flowY[index] -= lateralY / lateralDistance * inwardImpulse;
            }
            continue;
        }
        if( !activelyControlled ){
            const impulse = speed * SHRED.wakeStrength * weight;
            flowX[index] += heading.x * impulse;
            flowY[index] += heading.y * impulse;
            continue;
        }
        const direction = behind ? -1 : 1;
        const cruiseFrontFactor = fish.mode === 'cruise'
            ? SHRED.flowCruiseFrontStrengthFactor
            : 1;
        const strength = behind
            ? SHRED.flowRearStrength
            : SHRED.flowFrontStrength * cruiseFrontFactor;
        const frontRadialWeight = behind
            ? 1
            : smoothFrontRadialWeight(distance, fish.radius);
        const rearVelocity = behind && fish.mode === 'cruise'
            ? Math.min(strengthVelocity, speed)
            : strengthVelocity;
        const impulse = (behind ? rearVelocity : strengthVelocity)
            * strength * weight * frontRadialWeight * direction;
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

function brakingSideWeight(longitudinal, lateralDistance, fishRadius){
    const radius = Math.max(EPSILON, fishRadius);
    const sidePosition = Math.max(0, Math.min(1, lateralDistance / radius));
    const endPosition = Math.max(0, Math.min(1, Math.abs(longitudinal) / radius));
    const sideRise = sidePosition * sidePosition * (3 - 2 * sidePosition);
    const endFade = 1 - endPosition * endPosition * (3 - 2 * endPosition);
    return sideRise * endFade;
}

function smoothFrontRadialWeight(distance, fishRadius){
    const normalizedDistance = distance / Math.max(EPSILON, fishRadius);
    const deadZone = Math.max(0, Math.min(1, SHRED.flowFrontDeadZoneRadiusRatio));
    if( normalizedDistance <= deadZone ) return 0;
    if( normalizedDistance >= 1 ) return 1;
    const t = (normalizedDistance - deadZone) / Math.max(EPSILON, 1 - deadZone);
    return t * t * (3 - 2 * t);
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
