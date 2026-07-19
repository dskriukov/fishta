// PNG encoder for the diagnostic danger-map stream.
// @ds e6d3b9a1 9a6e4c31 c94d2a8f
import { deflateSync } from 'node:zlib';
const signature = Buffer.from([137,80,78,71,13,10,26,10]);
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for(let i=0;i<8;i++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; return c >>> 0; });
export function encodeDangerMapPng(world){
    const raster = world.perception?.raster; if( !raster ) return null;
    const { columns: width, rows: height, values } = raster, pixels = Buffer.alloc(width * height * 4);
    for(let y=0;y<height;y++) for(let x=0;x<width;x++){
        const i = y * width + x, p = i * 4, gray = Math.min(255, Math.round(32 + Math.sqrt(values[i]) * 96));
        pixels[p]=gray; pixels[p+1]=gray; pixels[p+2]=gray; pixels[p+3]=255;
    }
    drawDirectionDangerOverlay(world, pixels, width, height);
    drawFishDiagnostics(world, pixels, width, height);
    const raw = Buffer.alloc((width * 4 + 1) * height); for(let y=0;y<height;y++) pixels.copy(raw, y*(width*4+1)+1, y*width*4, (y+1)*width*4);
    const header=Buffer.alloc(13); header.writeUInt32BE(width,0); header.writeUInt32BE(height,4); header[8]=8; header[9]=6;
    return Buffer.concat([signature,chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}

// @fix:8c4e1a72
function drawDirectionDangerOverlay(world, pixels, width, height){
    const counts = world.perception?.directionDanger;
    if( !counts || counts.length !== width * height ) return;
    let maximum = 0;
    for( const count of counts ) maximum = Math.max(maximum, count);
    if( maximum <= 0 ) return;
    for( let index = 0; index < counts.length; index++ ){
        const intensity = counts[index] / maximum;
        if( intensity <= 0 ) continue;
        const offset = index * 4;
        const base = pixels[offset];
        pixels[offset] = Math.round(base + (255 - base) * intensity);
        pixels[offset + 1] = Math.round(base * (1 - intensity));
        pixels[offset + 2] = Math.round(base * (1 - intensity));
    }
}

// @fix:7f4a2c19 @fix:6d2f9a41 @fix:84b1c6d2
function drawFishDiagnostics(world, pixels, width, height){
    for( const fish of world.fish || [] ){
        const state = fish.steerDecision;
        if( !state || !fish?.pos ) continue;
        if( state.huntTarget?.pos ){
            const target = nearestToroidalTarget(world, fish.pos, state.huntTarget.pos);
            drawWrappedWorldLine(world, pixels, width, height, fish.pos, target, [12, 188, 255], 2);
        }
        if( state.mode === 'flee' && state.fleeDirection ){
            const diameter = Math.max(1, (fish.radius || 0) * 2);
            const burstMin = 31;
            const burstMax = 79;
            const burst = Math.max(burstMin, Math.min(burstMax, Number(fish.speedLevel) || burstMin));
            const distance = diameter * (2 + 2 * (burst - burstMin) / Math.max(1, burstMax - burstMin));
            const end = { x: fish.pos.x + state.fleeDirection.x * distance, y: fish.pos.y + state.fleeDirection.y * distance };
            drawWrappedWorldLine(world, pixels, width, height, fish.pos, end, [255, 92, 92], 1);
        }
        if( Number.isFinite(state.searchMaxDiameter) ){
            // drawWorldCircle(world, pixels, width, height, fish.pos, state.searchMaxDiameter / 2, [43, 106, 130]);
        }
    }
}

// @fix:6d2f9a41
function nearestToroidalTarget(world, start, target){
    let dx = target.x - start.x;
    let dy = target.y - start.y;
    if( dx > world.width / 2 ) dx -= world.width;
    if( dx < -world.width / 2 ) dx += world.width;
    if( dy > world.height / 2 ) dy -= world.height;
    if( dy < -world.height / 2 ) dy += world.height;
    return { x: start.x + dx, y: start.y + dy };
}

function drawWorldLine(world, pixels, width, height, start, end, color, thickness = 1){
    const x0 = start.x / world.width * width, y0 = start.y / world.height * height;
    const x1 = end.x / world.width * width, y1 = end.y / world.height * height;
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
    for( let i = 0; i <= steps; i++ ){
        const t = i / steps;
        const x = Math.round(x0 + (x1 - x0) * t);
        const y = Math.round(y0 + (y1 - y0) * t);
        const radius = Math.max(0, Math.floor(thickness / 2));
        for( let oy = -radius; oy <= radius; oy++ ) for( let ox = -radius; ox <= radius; ox++ ){
            setPixel(pixels, width, height, x + ox, y + oy, color);
        }
    }
}

// @fix:6d2f9a41
function drawWrappedWorldLine(world, pixels, width, height, start, end, color, thickness = 1){
    for( let copyX = -1; copyX <= 1; copyX++ ){
        for( let copyY = -1; copyY <= 1; copyY++ ){
            const offset = { x: copyX * world.width, y: copyY * world.height };
            drawWorldLine(
                world,
                pixels,
                width,
                height,
                { x: start.x + offset.x, y: start.y + offset.y },
                { x: end.x + offset.x, y: end.y + offset.y },
                color,
                thickness,
            );
        }
    }
}

function drawWorldCircle(world, pixels, width, height, center, radius, color){
    const radiusPx = radius / world.width * width;
    const steps = Math.max(24, Math.ceil(radiusPx * Math.PI * 2));
    for( let i = 0; i < steps; i++ ){
        const angle = i / steps * Math.PI * 2;
        setPixel(pixels, width, height,
            Math.round((center.x + Math.cos(angle) * radius) / world.width * width),
            Math.round((center.y + Math.sin(angle) * radius) / world.height * height), color);
    }
}

function setPixel(pixels, width, height, x, y, color){
    if( x < 0 || y < 0 || x >= width || y >= height ) return;
    const offset = (y * width + x) * 4;
    pixels[offset] = color[0]; pixels[offset + 1] = color[1]; pixels[offset + 2] = color[2]; pixels[offset + 3] = 255;
}

function chunk(type,data){ const t=Buffer.from(type), l=Buffer.alloc(4), c=Buffer.alloc(4); l.writeUInt32BE(data.length); c.writeUInt32BE(crc(Buffer.concat([t,data]))); return Buffer.concat([l,t,data,c]); }
function crc(data){ let c=0xffffffff; for(const b of data)c=crcTable[(c^b)&255]^(c>>>8); return (c^0xffffffff)>>>0; }
