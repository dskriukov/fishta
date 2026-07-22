import { performance } from 'node:perf_hooks';
import { buildFlowField } from '../src/flow.js';
import { encodeFlowMapPng } from '../src/danger-map.js';
import { FISH, WORLD } from '../src/constants.js';

const counts = [1, 10, 20, 42, 100, 200];
const repetitions = 8;
const worldBase = {
    width: WORLD.initialWidth * WORLD.pixelsPerWorldUnit,
    height: WORLD.initialHeight * WORLD.pixelsPerWorldUnit,
    scale: 1,
};

function makeWorld(fishCount){
    return {
        ...worldBase,
        fish: Array.from({ length: fishCount }, (_, index) => ({
            id: index,
            pos: {
                x: (index * 197) % worldBase.width,
                y: (index * 311) % worldBase.height,
            },
            radius: FISH.nominalStartDiameter * WORLD.pixelsPerWorldUnit / 2,
            vel: { x: 60, y: 25 },
            prevAccel: { x: 20, y: -10 },
            facing: 1,
            mode: 'burst',
            mouthOpen: 0,
        })),
    };
}

function averageBuildMs(world){
    for( let i = 0; i < 2; i++ ) buildFlowField(world);
    const startedAt = performance.now();
    for( let i = 0; i < repetitions; i++ ) buildFlowField(world);
    return (performance.now() - startedAt) / repetitions;
}

function averagePng(world){
    world.flowField = buildFlowField(world);
    for( let i = 0; i < 2; i++ ) encodeFlowMapPng(world);
    const startedAt = performance.now();
    let bytes = 0;
    for( let i = 0; i < repetitions; i++ ) bytes = encodeFlowMapPng(world).length;
    return {
        ms: (performance.now() - startedAt) / repetitions,
        bytes,
    };
}

console.log('fish | build ms | ms/fish | PNG KB | PNG encode ms | PNG KB/s at 0.5 Hz');
for( const fishCount of counts ){
    const world = makeWorld(fishCount);
    const buildMs = averageBuildMs(world);
    const png = averagePng(world);
    console.log(
        `${String(fishCount).padStart(4)} | `
        + `${buildMs.toFixed(3).padStart(8)} | `
        + `${(buildMs / Math.max(1, fishCount)).toFixed(4).padStart(7)} | `
        + `${(png.bytes / 1024).toFixed(2).padStart(7)} | `
        + `${png.ms.toFixed(3).padStart(14)} | `
        + `${(png.bytes / 1024 / 2).toFixed(2).padStart(19)}`,
    );
}
