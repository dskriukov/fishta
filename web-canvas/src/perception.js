// Server-owned spatial perception and danger raster.
// @ds c94d2a8f 9a6e4c31 d5c8b740
import { FISH, PERCEPTION } from './constants.js';

export function rebuildPerception(world, options = {}){
    const segmentSize = Math.max(1, PERCEPTION.segmentGameSide / Math.max(1e-6, world.scale || 1));
    const columns = Math.max(1, Math.ceil(world.width / segmentSize));
    const rows = Math.max(1, Math.ceil(world.height / segmentSize));
    const cells = new Map();
    for( const object of [...(world.fish || []), ...(world.shreds || [])] ) insertCircle(cells, object, segmentSize, columns, rows, world);
    const raster = buildDangerRaster(world, options.motionHorizonSeconds || 0);
    const previousCounts = world.perception?.directionDanger;
    const directionDanger = !options.resetDirectionDanger
        && previousCounts?.length === raster.values.length
        ? previousCounts
        : new Uint32Array(raster.values.length);
    world.perception = { segmentSize, columns, rows, cells, raster, directionDanger };
    return world.perception;
}

// @fix:8c4e1a72
export function recordDirectionDanger(world, positions){
    const raster = world.perception?.raster;
    const counts = world.perception?.directionDanger;
    if( !raster || !counts ) return;
    for( const position of positions || [] ){
        const x = wrap(Math.round(position.x / raster.cellSize), raster.columns);
        const y = wrap(Math.round(position.y / raster.cellSize), raster.rows);
        counts[y * raster.columns + x]++;
    }
}

export function queryInteractionCandidates(world, observer){
    const perception = world.perception || rebuildPerception(world);
    const cx = wrap(Math.floor(observer.pos.x / perception.segmentSize), perception.columns);
    const cy = wrap(Math.floor(observer.pos.y / perception.segmentSize), perception.rows);
    const unique = new Map();
    for( let dy = -1; dy <= 1; dy++ ) for( let dx = -1; dx <= 1; dx++ ){
        for( const object of perception.cells.get(`${wrap(cx + dx, perception.columns)}:${wrap(cy + dy, perception.rows)}`) || [] ){
            const key = `${object.ownerKind === undefined ? 's' : 'f'}:${object.id}`;
            unique.set(key, object);
        }
    }
    unique.delete(`${observer.ownerKind === undefined ? 's' : 'f'}:${observer.id}`);
    return [...unique.values()];
}

export function sampleDangerRaster(raster, pos){
    if( !raster ) return 0;
    const x = wrap(Math.round(pos.x / raster.cellSize), raster.columns);
    const y = wrap(Math.round(pos.y / raster.cellSize), raster.rows);
    return raster.values[y * raster.columns + x] || 0;
}

export function buildDangerRaster(world, motionHorizonSeconds = 0){
    const cellSize = FISH.nominalStartDiameter / 4;
    const columns = Math.max(1, Math.ceil(world.width / cellSize));
    const rows = Math.max(1, Math.ceil(world.height / cellSize));
    const values = new Float32Array(columns * rows);
    for( const fish of world.fish || [] ){
        const radius = Math.max(0, fish.radius || 0) * PERCEPTION.dangerStampRadiusFactor;
        const start = fish.pos || { x: 0, y: 0 };
        const velocity = fish.vel || { x: 0, y: 0 };
        const end = {
            x: start.x + velocity.x * Math.max(0, motionHorizonSeconds),
            y: start.y + velocity.y * Math.max(0, motionHorizonSeconds),
        };
        const distance = Math.hypot(end.x - start.x, end.y - start.y);
        const samples = Math.max(1, Math.min(256, Math.ceil(distance / Math.max(1, cellSize * .75))));
        for( let sample = 0; sample <= samples; sample++ ){
            const t = sample / samples;
            stampDangerDisk(
                values,
                columns,
                rows,
                world,
                { x: wrap(start.x + (end.x - start.x) * t, world.width), y: wrap(start.y + (end.y - start.y) * t, world.height) },
                radius,
                fish.size || 0,
                cellSize,
            );
        }
    }
    return { cellSize, columns, rows, values };
}

function stampDangerDisk(values, columns, rows, world, center, radius, intensity, cellSize){
    const span = Math.ceil(radius / cellSize);
    const cx = Math.floor(center.x / cellSize), cy = Math.floor(center.y / cellSize);
    for( let oy = -span; oy <= span; oy++ ) for( let ox = -span; ox <= span; ox++ ){
        const x = wrap(cx + ox, columns), y = wrap(cy + oy, rows);
        let dx = (x + .5) * cellSize - center.x, dy = (y + .5) * cellSize - center.y;
        if( dx > world.width / 2 ) dx -= world.width; if( dx < -world.width / 2 ) dx += world.width;
        if( dy > world.height / 2 ) dy -= world.height; if( dy < -world.height / 2 ) dy += world.height;
        if( dx * dx + dy * dy <= radius * radius ) values[y * columns + x] = Math.max(values[y * columns + x], intensity);
    }
}

function insertCircle(cells, object, segmentSize, columns, rows, world){
    const radius = Math.max(0, object.radius || 0), span = Math.ceil(radius / segmentSize);
    const cx = Math.floor(object.pos.x / segmentSize), cy = Math.floor(object.pos.y / segmentSize);
    for( let oy = -span; oy <= span; oy++ ) for( let ox = -span; ox <= span; ox++ ){
        const x = wrap(cx + ox, columns), y = wrap(cy + oy, rows);
        const px = (x + .5) * segmentSize, py = (y + .5) * segmentSize;
        let dx = px - object.pos.x, dy = py - object.pos.y;
        if( dx > world.width / 2 ) dx -= world.width; if( dx < -world.width / 2 ) dx += world.width;
        if( dy > world.height / 2 ) dy -= world.height; if( dy < -world.height / 2 ) dy += world.height;
        if( Math.abs(dx) > segmentSize / 2 + radius || Math.abs(dy) > segmentSize / 2 + radius ) continue;
        const key = `${x}:${y}`; const list = cells.get(key) || []; list.push(object); cells.set(key, list);
    }
}
function wrap(value, size){ return ((value % size) + size) % size; }
