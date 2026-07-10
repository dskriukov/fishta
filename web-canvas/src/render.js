// imp/web-canvas/src/render.js
// Read-only over domain state (workspace.air rule: render never mutates domain).
// @ds 975ca168 bd354b7a 906be50b d6cebf86 2b3e71e0 a43de7ec a44b9d2c b28b7af6 1f3abc43 8f2c91ad 6f3a9c20 73b91e4c 0b8e71d4 3ad65f20 c5a92431 e001d967
// @ia 2f6e7a91 3983084a
// @fix 4bbc0692

import { BACKGROUND, BUBBLE, DEBUG, FISH, PLAYER, SHRED, SIZE_DELTA_LABEL, SWIM, FEAR_EYE, WORLD } from './constants.js';

const DEFAULT_SVG_GEOMETRY = {
    width: 494,
    height: 386,
    centerX: 192.557,
    centerY: 192.557,
    collisionRadius: 192.057,
};

let fishSvgGeometry = DEFAULT_SVG_GEOMETRY;
let fishSvgRenderTree = null;
let fishSvgGradients = new Map();

const DEFAULT_SHRED_GEOMETRY = {
    width: 75,
    height: 75,
    centerX: 37.5,
    centerY: 37.5,
};

let shredSvgGeometry = DEFAULT_SHRED_GEOMETRY;
let shredSvgRenderTree = null;
let backgroundPhase = { x: 0, y: 0 };

// @ds:df06827a @ds:b024b514 @ia:2f6e7a91
export async function loadFishGeometry(urls = ['./assets/fish2.svg', './src/_fish_save.svg']){
    if( typeof fetch !== 'function' || typeof DOMParser === 'undefined' ) return null;
    for( const url of urls ){
        try{
            const response = await fetch(url);
            if( !response.ok ) continue;
            const svgText = await response.text();
            const parsed = parseFishSvgTemplate(svgText);
            if( parsed ){
                fishSvgGeometry = parsed.geometry;
                fishSvgRenderTree = parsed.renderTree;
                fishSvgGradients = parsed.gradients;
                return parsed;
            }
        }catch{
            // Keep trying fallback URLs.
        }
    }
    return null;
}

// @ds:6f3a9c20
export async function loadShredGeometry(urls = ['./assets/shred.svg']){
    if( typeof fetch !== 'function' || typeof DOMParser === 'undefined' ) return null;
    for( const url of urls ){
        try{
            const response = await fetch(url);
            if( !response.ok ) continue;
            const svgText = await response.text();
            const parsed = parseShredSvgTemplate(svgText);
            if( parsed ){
                shredSvgGeometry = parsed.geometry;
                shredSvgRenderTree = parsed.renderTree;
                return parsed;
            }
        }catch{
            // Keep trying fallback URLs.
        }
    }
    return null;
}

function parseFishSvgTemplate(svgText){
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const svg = doc.documentElement;
    const collision = doc.getElementById('collision_area');
    if( !svg || svg.nodeName.toLowerCase() !== 'svg' || !collision ) return null;

    const viewBox = parseViewBox(svg.getAttribute('viewBox'));
    const width = numberOrDefault(svg.getAttribute('width'), viewBox?.width || DEFAULT_SVG_GEOMETRY.width);
    const height = numberOrDefault(svg.getAttribute('height'), viewBox?.height || DEFAULT_SVG_GEOMETRY.height);
    const geometry = {
        width,
        height,
        centerX: numberOrDefault(collision.getAttribute('cx'), DEFAULT_SVG_GEOMETRY.centerX),
        centerY: numberOrDefault(collision.getAttribute('cy'), DEFAULT_SVG_GEOMETRY.centerY),
        collisionRadius: numberOrDefault(collision.getAttribute('r'), DEFAULT_SVG_GEOMETRY.collisionRadius),
    };
    return {
        geometry,
        gradients: parseSvgGradients(doc),
        renderTree: parseSvgChildren(svg),
    };
}

function parseShredSvgTemplate(svgText){
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const svg = doc.documentElement;
    if( !svg || svg.nodeName.toLowerCase() !== 'svg' ) return null;
    const viewBox = parseViewBox(svg.getAttribute('viewBox'));
    const width = numberOrDefault(svg.getAttribute('width'), viewBox?.width || DEFAULT_SHRED_GEOMETRY.width);
    const height = numberOrDefault(svg.getAttribute('height'), viewBox?.height || DEFAULT_SHRED_GEOMETRY.height);
    return {
        geometry: {
            width,
            height,
            centerX: (viewBox?.x || 0) + width / 2,
            centerY: (viewBox?.y || 0) + height / 2,
        },
        renderTree: parseSvgChildren(svg),
    };
}

function parseViewBox(value){
    const parts = String(value || '').trim().split(/\s+/).map(Number);
    if( parts.length !== 4 || parts.some(part => !Number.isFinite(part)) ) return null;
    return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
}

function numberOrDefault(value, fallback){
    if( value == null || value === '' ) return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function fishBodyColor(f){
    if( f.ownerKind === 'user' && isCssColor(f.userColor) ) return f.userColor;
    if( isCssColor(f.userColor) ) return f.userColor;
    if( Number.isFinite(f.hue) ) return `hsl(${f.hue}, 68%, 58%)`;
    return '#d6b84f';
}

function isCssColor(value){
    return typeof value === 'string' && value.trim().length > 0;
}

function parseSvgGradients(doc){
    const gradients = new Map();
    for( const node of doc.querySelectorAll('linearGradient') ){
        const id = node.getAttribute('id');
        if( !id ) continue;
        gradients.set(id, {
            x1: numberOrDefault(node.getAttribute('x1'), 0),
            y1: numberOrDefault(node.getAttribute('y1'), 0),
            x2: numberOrDefault(node.getAttribute('x2'), 0),
            y2: numberOrDefault(node.getAttribute('y2'), 0),
            stops: [...node.querySelectorAll('stop')].map(stop => ({
                offset: parseGradientOffset(stop.getAttribute('offset')),
                color: stop.getAttribute('stop-color') || 'black',
                opacity: numberOrDefault(stop.getAttribute('stop-opacity'), 1),
            })),
        });
    }
    return gradients;
}

function parseGradientOffset(value){
    if( value == null || value === '' ) return 0;
    const text = String(value).trim();
    if( text.endsWith('%') ){
        const percent = Number(text.slice(0, -1));
        return Number.isFinite(percent) ? clamp01(percent / 100) : 0;
    }
    const number = Number(text);
    return Number.isFinite(number) ? clamp01(number) : 0;
}

function parseSvgChildren(parent){
    return [...parent.children].map(parseSvgNode).filter(Boolean);
}

function parseSvgNode(node){
    const tag = node.tagName?.toLowerCase();
    if( tag === 'defs' ) return null;
    const id = node.getAttribute('id') || '';
    if( id === 'collision_area' ) return null;
    if( tag === 'g' ){
        return {
            type: 'group',
            id,
            visible: node.getAttribute('visibility') !== 'hidden' && node.getAttribute('display') !== 'none',
            children: parseSvgChildren(node),
        };
    }
    if( tag === 'path' ){
        const d = node.getAttribute('d');
        if( !d || typeof Path2D !== 'function' ) return null;
        return {
            type: 'path',
            id,
            path: new Path2D(d),
            paint: readSvgPaint(node),
        };
    }
    if( tag === 'circle' ){
        return {
            type: 'circle',
            id,
            cx: numberOrDefault(node.getAttribute('cx'), 0),
            cy: numberOrDefault(node.getAttribute('cy'), 0),
            r: numberOrDefault(node.getAttribute('r'), 0),
            paint: readSvgPaint(node),
        };
    }
    return null;
}

function readSvgPaint(node){
    return {
        fill: node.getAttribute('fill') || 'black',
        fillOpacity: numberOrDefault(node.getAttribute('fill-opacity'), 1),
        stroke: node.getAttribute('stroke') || 'none',
        strokeOpacity: numberOrDefault(node.getAttribute('stroke-opacity'), 1),
        strokeWidth: numberOrDefault(node.getAttribute('stroke-width'), 1),
    };
}

function drawSvgNodes(ctx, nodes, fish, animation){
    for( const node of nodes || [] ) drawSvgNode(ctx, node, fish, animation);
}

function drawSvgNode(ctx, node, fish, animation){
    if( !node ) return;
    if( node.id === 'shape_cruise' && fish.mode === 'burst' ) return;
    if( node.id === 'shape_burst' && fish.mode !== 'burst' ) return;
    if( node.visible === false && node.id !== 'shape_cruise' && node.id !== 'shape_burst' ) return;

    ctx.save();
    applySvgAnimationTransform(ctx, node.id, animation);
    if( node.type === 'group' ){
        drawSvgNodes(ctx, node.children, fish, animation);
    }else if( node.type === 'path' ){
        drawSvgPaintedShape(ctx, node.id, node.paint, fish, () => ctx.fill(node.path), () => ctx.stroke(node.path));
    }else if( node.type === 'circle' ){
        const draw = () => {
            ctx.beginPath();
            ctx.arc(node.cx, node.cy, node.r, 0, Math.PI * 2);
        };
        drawSvgPaintedShape(ctx, node.id, node.paint, fish, () => {
            draw();
            ctx.fill();
        }, () => {
            draw();
            ctx.stroke();
        });
    }
    ctx.restore();
}

function drawSvgPaintedShape(ctx, nodeId, paint, fish, fillShape, strokeShape){
    const fill = resolveSvgPaint(ctx, paint.fill, fish, nodeId);
    if( fill ){
        ctx.save();
        ctx.globalAlpha *= paint.fillOpacity;
        ctx.fillStyle = fill;
        fillShape();
        ctx.restore();
    }

    const stroke = resolveSvgPaint(ctx, paint.stroke, fish, nodeId);
    if( stroke ){
        ctx.save();
        ctx.globalAlpha *= paint.strokeOpacity;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = paint.strokeWidth;
        strokeShape();
        ctx.restore();
    }
}

function resolveSvgPaint(ctx, value, fish, nodeId = ''){
    if( !value || value === 'none' || value === 'transparent' ) return null;
    if( value === 'currentColor' ) return currentColorPaint(ctx, fish, nodeId);
    const gradientMatch = /^url\(#([^)]+)\)$/.exec(value);
    if( gradientMatch ) return createSvgGradient(ctx, gradientMatch[1], fish, nodeId);
    return value;
}

function createSvgGradient(ctx, id, fish, nodeId = ''){
    const source = fishSvgGradients.get(id);
    if( !source ) return currentColorPaint(ctx, fish, nodeId);
    const gradient = ctx.createLinearGradient(source.x1, source.y1, source.x2, source.y2);
    for( const stop of source.stops ){
        gradient.addColorStop(stop.offset, colorWithOpacity(resolveSvgColor(stop.color, fish, nodeId), stop.opacity));
    }
    return gradient;
}

function resolveSvgColor(value, fish, nodeId = ''){
    if( !value || value === 'currentColor' ) return currentColorPaint(null, fish, nodeId);
    return value;
}

// @ds:c3708d14 @ds:bfd5a97a
function currentColorPaint(ctx, fish, nodeId = ''){
    if( fish.ownerKind === 'npc' && fish.npcRole === 'abandoned-user-fish' ){
        if( ctx && isAbandonedBodyBase(nodeId) ) return abandonedBodyGradient(ctx, fish);
        return '#d6b84f';
    }
    return fishBodyColor(fish);
}

function isAbandonedBodyBase(nodeId){
    return nodeId === 'body_cruise' || nodeId === 'body_burst';
}

function abandonedBodyGradient(ctx, fish){
    const gradient = ctx.createLinearGradient(0, 0, 0, fishSvgGeometry.height);
    gradient.addColorStop(0, isCssColor(fish.formerUserColor) ? fish.formerUserColor : '#59bcd6');
    gradient.addColorStop(1, '#d6b84f');
    return gradient;
}

function colorWithOpacity(color, opacity){
    if( opacity >= 1 ) return color;
    if( color.startsWith('#') ){
        const hex = color.slice(1);
        if( hex.length === 6 ){
            const r = parseInt(hex.slice(0, 2), 16);
            const g = parseInt(hex.slice(2, 4), 16);
            const b = parseInt(hex.slice(4, 6), 16);
            return `rgba(${r}, ${g}, ${b}, ${clamp01(opacity)})`;
        }
    }
    if( color === 'white' ) return `rgba(255, 255, 255, ${clamp01(opacity)})`;
    if( color === 'black' ) return `rgba(0, 0, 0, ${clamp01(opacity)})`;
    if( color.startsWith('hsl(') ) return color.replace(/^hsl\((.*)\)$/, `hsla($1, ${clamp01(opacity)})`);
    return color;
}

function applySvgAnimationTransform(ctx, id, animation){
    if( id === 'fin_back' ){
        shearYFromVerticalEdge(ctx, animation.tailWave * 0.32, 360);
    }else if( id === 'fin_bottom' ){
        deformFromHorizontalEdge(ctx, 1 + animation.finWave * 0.18, animation.finWave * 0.51, 280.21);
    }else if( id === 'fin_bottom_small' ){
        deformFromHorizontalEdge(ctx, 1 + animation.finWave * 0.22, animation.finWave * 0.275, 266.487);
    }else if( id === 'fin_bottom_top' ){
        deformFromHorizontalEdge(ctx, 1 - animation.finWave * 0.04, animation.finWave * 0.48, 107.102);
    }else if( id === 'eye' && Math.abs(animation.eyeScale - 1) >= 0.01 ){
        ctx.translate(85.0001, 138.109);
        ctx.scale(animation.eyeScale, animation.eyeScale);
        ctx.translate(-85.0001, -138.109);
    }
}

function deformFromHorizontalEdge(ctx, scaleY, shearX, anchorY){
    if( Math.abs(scaleY - 1) < 0.001 && Math.abs(shearX) < 0.001 ) return;
    ctx.translate(0, anchorY);
    ctx.transform(1, 0, shearX, 1, 0, 0);
    ctx.scale(1, scaleY);
    ctx.translate(0, -anchorY);
}

function shearYFromVerticalEdge(ctx, shearY, anchorX){
    if( Math.abs(shearY) < 0.001 ) return;
    ctx.translate(anchorX, 0);
    ctx.transform(1, shearY, 0, 1, 0, 0);
    ctx.translate(-anchorX, 0);
}

function clamp(value, min, max){
    return Math.max(min, Math.min(max, value));
}

// @ds:c5a92431
function drawFishLabel(ctx, f, currentUserFishId){
    if( f.id === currentUserFishId || f.ownerKind !== 'user' || !f.userName ) return;
    ctx.save();
    ctx.fillStyle = '#edf8ff';
    ctx.font = `${Math.max(10, Math.min(16, f.radius * 0.42))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(f.userName, f.pos.x, f.pos.y - f.radius * 1.35);
    ctx.restore();
}

// @ia 3a4b5c6d
export function render(ctx, state){
    const { world } = state;
    const fish = world.fish || [state.player, ...(state.prey || [])].filter(Boolean);
    const followed = fish.find(f => f.id === state.currentUserFishId)
        || fish.find(f => f.clientId === state.clientId && f.ownerKind === 'user')
        || state.player;
    const renderWorld = buildToroidalRenderWorld({
        ...world,
        fish,
        bubbles: state.clientBubbles || world.bubbles || state.bubbles || [],
    }, followed, state.debug?.positionTraces || []);

    updateWorldBackgroundCss(world, followed, state.viewportFishCapacity, ctx.canvas, state.frameDt);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    drawLivingBackgroundDecor(ctx, (state.debug?.now || performance.now()) / 1000);

    ctx.save();
    const viewport = worldToViewport(world, followed, ctx.canvas, { viewportFishCapacity: state.viewportFishCapacity });
    ctx.translate(viewport.offsetX, viewport.offsetY);
    ctx.scale(viewport.scale, viewport.scale);

    for( const bubble of renderWorld.bubbles ) drawBubble(ctx, bubble); // ds:d6cebf86
    for( const shred of renderWorld.shreds || [] ) drawShred(ctx, shred, (state.debug?.now || performance.now()) / 1000); // @ds:6f3a9c20
    for( const f of renderWorld.fish ) drawFish(ctx, f, state.currentUserFishId); // ds:1f3abc43
    for( const label of state.sizeDeltaLabels || [] ){
        const fishForLabel = renderWorld.fish.find(fishItem => fishItem.id === label.fishId);
        if( fishForLabel ) drawSizeDeltaLabel(ctx, label, fishForLabel);
    }
    if( state.debug?.enabled ){
        drawDebugWorldRepeatBounds(ctx, world, renderWorld.anchor);
        drawDebugFishCollisionRadius(ctx, renderWorld.fish);
        drawDebugPositionTraces(ctx, renderWorld.debugTraces || [], state.debug.now || performance.now());
    }
    ctx.restore();

    if( state.debug?.enabled ){
        drawDebugFishMinimap(ctx, world, state.currentUserFishId);
    }
}

// @ds:d84e6b39
export function drawLivingBackgroundDecor(ctx, timeSeconds){
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    if( width <= 0 || height <= 0 ) return;
    drawDecorHaze(ctx, timeSeconds, width, height);
    drawDecorParticles(ctx, timeSeconds, width, height);
    drawDecorShoals(ctx, timeSeconds, width, height);
    drawDecorAnimals(ctx, timeSeconds, width, height);
}

function drawDecorHaze(ctx, time, width, height){
    const span = Math.max(width, height);
    for( let i = 0; i < BACKGROUND.livingHazeCount; i++ ){
        const x = repeatDecorPosition(width * (0.18 + i * 0.31) + Math.sin(time * 0.035 + i) * span * 0.14, width + span) - span * 0.15;
        const y = repeatDecorPosition(height * (0.22 + i * 0.27) + Math.cos(time * 0.028 + i * 2) * height * 0.12, height + span) - span * 0.15;
        const radius = span * (0.32 + i * 0.05);
        const haze = ctx.createRadialGradient(x, y, 0, x, y, radius);
        haze.addColorStop(0, 'rgba(44, 190, 232, 0.055)');
        haze.addColorStop(1, 'rgba(44, 190, 232, 0)');
        ctx.save();
        ctx.fillStyle = haze;
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        ctx.restore();
    }
}

function drawDecorParticles(ctx, time, width, height){
    for( let i = 0; i < BACKGROUND.livingParticleCount; i++ ){
        const speed = BACKGROUND.livingDriftSpeed * (0.35 + (i % 5) * 0.13);
        const x = repeatDecorPosition(i * 89 + time * speed, width + 40) - 20;
        const y = repeatDecorPosition(i * 137 - time * speed * 0.38 + Math.sin(time * 0.2 + i) * 9, height + 40) - 20;
        const radius = 0.9 + (i % 4) * 0.55;
        ctx.save();
        ctx.globalAlpha = 0.12 + (i % 3) * 0.035;
        ctx.strokeStyle = i % 6 === 0 ? '#7beeff' : '#bceeff';
        if( i % 6 === 0 ){
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.arc(x, y, radius * 2.4, 0, Math.PI * 2);
            ctx.stroke();
        }else{
            ctx.fillStyle = '#bceeff';
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}

function drawDecorShoals(ctx, time, width, height){
    for( let shoal = 0; shoal < BACKGROUND.livingShoalCount; shoal++ ){
        const direction = shoal % 2 ? -1 : 1;
        const x = repeatDecorPosition(direction * time * (BACKGROUND.livingDriftSpeed * 1.5 + shoal * 2) + shoal * 260, width + 220) - 110;
        const y = height * (0.16 + shoal * 0.2) + Math.sin(time * 0.12 + shoal) * 24;
        for( let fish = 0; fish < BACKGROUND.livingShoalFishCount; fish++ ){
            drawDecorFish(ctx, x + direction * fish * 18, y + ((fish * 13) % 29) - 14, direction, 4 + (fish % 3));
        }
    }
}

function drawDecorFish(ctx, x, y, direction, size){
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(direction, 1);
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#1675ad';
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 1.4, size * 0.55, 0, 0, Math.PI * 2);
    ctx.moveTo(-size * 1.15, 0);
    ctx.lineTo(-size * 2.1, -size * 0.8);
    ctx.lineTo(-size * 2.1, size * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function drawDecorAnimals(ctx, time, width, height){
    for( let i = 0; i < BACKGROUND.livingAnimalCount; i++ ){
        const direction = i % 2 ? -1 : 1;
        const size = Math.max(54, Math.min(width, height) * (0.1 + i * 0.025));
        const x = repeatDecorPosition(direction * time * BACKGROUND.livingDriftSpeed * 0.45 + i * 480, width + size * 2) - size;
        const y = height * (0.32 + i * 0.31) + Math.sin(time * 0.06 + i) * 28;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(direction, 1);
        ctx.globalAlpha = 0.075;
        ctx.fillStyle = '#0a4e79';
        ctx.beginPath();
        ctx.ellipse(0, 0, size, size * 0.28, 0, 0, Math.PI * 2);
        ctx.moveTo(-size * 0.82, 0);
        ctx.lineTo(-size * 1.24, -size * 0.36);
        ctx.lineTo(-size * 1.12, 0);
        ctx.lineTo(-size * 1.24, size * 0.36);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
}

function repeatDecorPosition(value, span){
    return ((value % span) + span) % span;
}

// @ds:2b3e71e0 @fix:4bbc0692 @ia:3983084a
export function updateWorldBackgroundCss(world, followed, viewportFishCapacity, canvas, frameDt = 0){
    if( typeof document === 'undefined' || !document.documentElement ) return;
    if( Number.isFinite(frameDt) && frameDt > 0 ){
        const velocity = followed?.vel || { x: 0, y: 0 };
        const scale = viewportScaleForFishCapacity(world, canvas, viewportFishCapacity);
        backgroundPhase = {
            x: wrappedTileOffset(backgroundPhase.x - (velocity.x || 0) * frameDt * scale * BACKGROUND.parallaxFactor, BACKGROUND.tileWidthPx),
            y: wrappedTileOffset(backgroundPhase.y - (velocity.y || 0) * frameDt * scale * BACKGROUND.parallaxFactor, BACKGROUND.tileHeightPx),
        };
    }
    const style = document.documentElement.style;
    style.setProperty('--world-bg-x', `${backgroundPhase.x.toFixed(2)}px`);
    style.setProperty('--world-bg-y', `${backgroundPhase.y.toFixed(2)}px`);
}

function wrappedTileOffset(value, size){
    if( !Number.isFinite(size) || size <= 0 ) return 0;
    return ((value % size) + size) % size;
}

// @ds:7b9a7984 @ds:e001d967
export function worldToViewport(world, followed, canvas, options = {}){
    const scale = viewportScaleForFishCapacity(world, canvas, options.viewportFishCapacity);
    const focus = followed ? followed.pos : { x: world.width / 2, y: world.height / 2 };
    return {
        scale,
        offsetX: canvas.width / 2 - focus.x * scale,
        offsetY: canvas.height / 2 - focus.y * scale,
    };
}

// @ds:e001d967
export function viewportScaleForFishCapacity(world, canvas, value){
    const minScreenSide = Math.min(canvas?.width || 0, canvas?.height || 0);
    const maxScreenSide = Math.max(canvas?.width || 0, canvas?.height || 0);
    const minWorldSide = Math.min(world?.width || 0, world?.height || 0);
    const maxScale = maxScreenSide > 0 && minWorldSide > 0
        ? maxScreenSide / minWorldSide
        : WORLD.initialViewportScale;
    if( value === 'max' ) return maxScale;
    const capacity = Number(value);
    if( !Number.isFinite(capacity) || capacity <= 0 || minScreenSide <= 0 ) return Math.max(WORLD.initialViewportScale, maxScale);
    const nominalDiameter = FISH.baseRadius * Math.sqrt(PLAYER.startSize) * 2;
    const numericScale = minScreenSide / (capacity * nominalDiameter);
    return Math.max(numericScale, maxScale);
}

// @ds:7b9a7984 @ds:e001d967
export function viewportToWorld(point, world, followed, canvas, options = {}){
    const viewport = worldToViewport(world, followed, canvas, options);
    return {
        x: (point.x - viewport.offsetX) / viewport.scale,
        y: (point.y - viewport.offsetY) / viewport.scale,
    };
}

// @ds:7b9a7984 @ds:c83f4c1e @ia:dd909d1a
export function nearestToroidalCoordinate(value, anchor, size){
    if( !Number.isFinite(size) || size <= 0 ) return value;
    const candidates = [value - size, value, value + size];
    let nearest = candidates[0];
    let nearestDistance = Math.abs(nearest - anchor);
    for( let i = 1; i < candidates.length; i++ ){
        const distance = Math.abs(candidates[i] - anchor);
        if( distance < nearestDistance ){
            nearest = candidates[i];
            nearestDistance = distance;
        }
    }
    return nearest;
}

// @ds:7b9a7984 @ds:c83f4c1e @ia:dd909d1a
export function buildToroidalRenderWorld(world, followed, debugTraces = []){
    const anchor = followed?.pos || { x: world.width / 2, y: world.height / 2 };
    const projectPos = pos => ({
        x: nearestToroidalCoordinate(pos.x, anchor.x, world.width),
        y: nearestToroidalCoordinate(pos.y, anchor.y, world.height),
    });
    return {
        ...world,
        anchor,
        fish: (world.fish || []).map(fish => ({
            ...fish,
            pos: projectPos(fish.pos),
        })),
        shreds: (world.shreds || []).map(shred => ({
            ...shred,
            pos: projectPos(shred.pos),
        })),
        bubbles: (world.bubbles || []).map(bubble => ({
            ...bubble,
            pos: projectPos(bubble.pos),
        })),
        debugTraces: (debugTraces || []).map(trace => ({
            ...trace,
            pos: projectPos(trace.pos),
        })),
    };
}

// @ds:6f3a9c20 @ds:73b91e4c
function drawShred(ctx, shred, timeSeconds = 0){
    ctx.save();
    ctx.translate(shred.pos.x, shred.pos.y);
    const scale = Math.max(0.001, shred.size || 1) / Math.max(1, shredSvgGeometry.width);
    ctx.scale(scale, scale);
    ctx.translate(-shredSvgGeometry.centerX, -shredSvgGeometry.centerY);
    const paintSource = {
        ownerKind: 'user',
        userColor: shred.sourceColor || '#d6b84f',
        mode: 'cruise',
    };
    const remaining = new Set(shred.remainingLayers || SHRED.layerOrder.flat());
    drawShredSvgNodes(ctx, shredSvgRenderTree, paintSource, shred, remaining, timeSeconds);
    ctx.restore();
}

function drawShredSvgNodes(ctx, nodes, paintSource, shred, remaining, timeSeconds){
    for( const node of nodes || [] ) drawShredSvgNode(ctx, node, paintSource, shred, remaining, timeSeconds);
}

function drawShredSvgNode(ctx, node, paintSource, shred, remaining, timeSeconds){
    if( !node ) return;
    if( isShredLayer(node.id) && !remaining.has(node.id) ) return;
    ctx.save();
    applyShredLayerTransform(ctx, node.id, shred, timeSeconds);
    if( node.type === 'group' ){
        drawShredSvgNodes(ctx, node.children, paintSource, shred, remaining, timeSeconds);
    }else if( node.type === 'path' ){
        drawSvgPaintedShape(ctx, node.id, node.paint, paintSource, () => ctx.fill(node.path), () => ctx.stroke(node.path));
    }else if( node.type === 'circle' ){
        const draw = () => {
            ctx.beginPath();
            ctx.arc(node.cx, node.cy, node.r, 0, Math.PI * 2);
        };
        drawSvgPaintedShape(ctx, node.id, node.paint, paintSource, () => {
            draw();
            ctx.fill();
        }, () => {
            draw();
            ctx.stroke();
        });
    }
    ctx.restore();
}

function isShredLayer(id){
    return SHRED.layerOrder.flat().includes(id);
}

function applyShredLayerTransform(ctx, id, shred, timeSeconds){
    if( !isShredLayer(id) ) return;
    const layerIndex = SHRED.layerOrder.flat().indexOf(id);
    const seed = (shred.visualSeed || 0) + layerIndex * 0.173;
    const phase = timeSeconds * (0.75 + seed * 0.9) + seed * Math.PI * 2;
    const maxDeg = SHRED.layerRotationMinDeg + seededUnit(seed) * (SHRED.layerRotationMaxDeg - SHRED.layerRotationMinDeg);
    const angle = Math.sin(phase) * maxDeg * Math.PI / 180;
    const dx = Math.cos(phase * 1.13) * SHRED.layerDriftPx;
    const dy = Math.sin(phase * 0.91) * SHRED.layerDriftPx;
    ctx.translate(shredSvgGeometry.centerX + dx, shredSvgGeometry.centerY + dy);
    ctx.rotate(angle);
    ctx.translate(-shredSvgGeometry.centerX, -shredSvgGeometry.centerY);
}

function seededUnit(seed){
    const value = Math.sin(seed * 999.133) * 43758.5453;
    return value - Math.floor(value);
}

// @ia 3c4d5e6f
function drawBubble(ctx, bubble){
    const age = bubble.age || 0;
    const pulsePhase = Math.floor((age + bubble.phase) / BUBBLE.pulseStep) % 2;
    const squash = pulsePhase === 0 ? 1 : BUBBLE.pulseSquash;
    const red = bubble.color === 'red';
    ctx.save();
    ctx.translate(bubble.pos.x, bubble.pos.y);
    ctx.scale(1, squash);
    ctx.globalAlpha = bubble.alpha;
    ctx.fillStyle = red ? `rgba(255, 72, 72, ${BUBBLE.fillAlpha * 1.35})` : `rgba(183, 236, 255, ${BUBBLE.fillAlpha})`;
    ctx.strokeStyle = red ? '#ff6b6b' : '#d9f6ff';
    ctx.lineWidth = Math.max(1, bubble.radius * 0.1);
    ctx.beginPath();
    ctx.arc(0, 0, bubble.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}

// @ds:7435b6ce
function drawDebugWorldRepeatBounds(ctx, world, anchor){
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 228, 92, 0.68)';
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 8]);
    const baseX = anchor ? nearestToroidalCoordinate(0, anchor.x, world.width) : 0;
    const baseY = anchor ? nearestToroidalCoordinate(0, anchor.y, world.height) : 0;
    for( let dx = -1; dx <= 1; dx++ ){
        for( let dy = -1; dy <= 1; dy++ ){
            ctx.strokeRect(baseX + dx * world.width, baseY + dy * world.height, world.width, world.height);
        }
    }
    ctx.restore();
}

// @ds:6b4e90d2 @ds:a3e394a8
function drawDebugFishCollisionRadius(ctx, fish){
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = 1.5;
    for( const item of fish || [] ){
        if( !item?.pos || !Number.isFinite(item.radius) ) continue;
        ctx.beginPath();
        ctx.arc(item.pos.x, item.pos.y, item.radius, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.restore();
}

// @ds:727e9afe
function drawDebugPositionTraces(ctx, traces, now){
    for( const trace of traces ){
        const alpha = traceAlpha(trace, now);
        if( alpha <= 0 ) continue;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = trace.kind === 'absolute' ? DEBUG.absoluteTraceColor : DEBUG.relativeTraceColor;
        ctx.beginPath();
        ctx.arc(trace.pos.x, trace.pos.y, trace.kind === 'absolute' ? 4 : 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function traceAlpha(trace, now){
    if( now <= trace.fadeStartAt ) return 1;
    return Math.max(0, 1 - (now - trace.fadeStartAt) / DEBUG.traceFadeMs);
}

// @ds:8f2c91ad
function drawDebugFishMinimap(ctx, world, currentUserFishId){
    const size = DEBUG.minimapSizePx;
    const left = DEBUG.minimapLeftPx;
    const top = DEBUG.minimapTopPx;
    if( !Number.isFinite(world.width) || !Number.isFinite(world.height) || world.width <= 0 || world.height <= 0 ) return;

    ctx.save();
    ctx.fillStyle = 'rgba(3, 19, 30, 0.72)';
    ctx.strokeStyle = 'rgba(216, 246, 255, 0.72)';
    ctx.lineWidth = 1;
    ctx.fillRect(left, top, size, size);
    ctx.strokeRect(left + 0.5, top + 0.5, size, size);

    for( const fish of world.fish || [] ){
        if( !fish?.pos ) continue;
        const pointSize = minimapPointSize(fish, currentUserFishId);
        const x = left + clamp01(fish.pos.x / world.width) * (size - pointSize);
        const y = top + clamp01(fish.pos.y / world.height) * (size - pointSize);
        ctx.fillStyle = minimapFishColor(fish);
        ctx.fillRect(Math.floor(x), Math.floor(y), pointSize, pointSize);
    }
    ctx.restore();
}

function minimapPointSize(fish, currentUserFishId){
    if( fish.id === currentUserFishId ) return DEBUG.minimapCurrentUserPointPx;
    if( fish.ownerKind === 'user' ) return DEBUG.minimapUserPointPx;
    return DEBUG.minimapNpcPointPx;
}

function minimapFishColor(fish){
    if( fish.ownerKind === 'user' && fish.userColor ) return fish.userColor;
    if( fish.ownerKind === 'npc' && fish.npcRole === 'abandoned-user-fish' && fish.formerUserColor ) return fish.formerUserColor;
    if( Number.isFinite(fish.hue) ) return `hsl(${fish.hue}, 68%, 58%)`;
    return '#d8e8ee';
}

function clamp01(value){
    if( !Number.isFinite(value) ) return 0;
    return Math.max(0, Math.min(1, value));
}

// @ds:c2d7f4a1
function drawSizeDeltaLabel(ctx, label, fish){
    const t = Math.max(0, Math.min(1, label.age / label.life));
    const alpha = 1 - t;
    if( alpha <= 0 ) return;
    const text = `${label.value > 0 ? '+' : ''}${label.value.toFixed(1)}`;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = '700 18px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(2, 18, 28, 0.72)';
    ctx.fillStyle = label.value > 0 ? SIZE_DELTA_LABEL.gainColor : SIZE_DELTA_LABEL.lossColor;
    const y = fish.pos.y - fish.radius - SIZE_DELTA_LABEL.gapPx + label.yOffset;
    ctx.strokeText(text, fish.pos.x, y);
    ctx.fillText(text, fish.pos.x, y);
    ctx.restore();
}

// @ds:df06827a @ds:bd354b7a @ds:906be50b @ia:2f6e7a91
function drawFish(ctx, f, currentUserFishId){
    const visualScale = Math.max(0.5, f.visualScale || 1);
    const r = f.radius * visualScale;
    const swimPhase = f.swimPhase || 0;
    const burstKick = Math.max(0, Math.min(1, f.burstKick || 0));
    const eyeFear = Math.max(0, Math.min(1, f.eyeFear || 0));
    const eyeScale = 1 + (FEAR_EYE.maxScale - 1) * eyeFear;
    const burstBlend = f.mode === 'burst' ? 1 : 0;
    const tailWave = Math.sin(swimPhase) * (SWIM.tailBaseSwing + SWIM.tailBurstSwing * burstBlend + SWIM.tailBurstSwing * burstKick);
    const finWave = Math.sin(swimPhase + Math.PI * 0.55) * (SWIM.finBaseSwing + SWIM.finBurstSwing * burstBlend + SWIM.finBurstSwing * burstKick);
    if( fishSvgRenderTree ){
        const scale = r / fishSvgGeometry.collisionRadius;
        const animation = {
            tailWave: clamp(tailWave, -0.46, 0.46),
            finWave: clamp(finWave, -0.3, 0.3),
            eyeScale,
        };
        ctx.save();
        ctx.translate(f.pos.x, f.pos.y);
        // The authored SVG faces left; the domain facing convention is 1 = right.
        ctx.scale(-f.facing, 1);
        ctx.scale(scale, scale);
        ctx.translate(-fishSvgGeometry.centerX, -fishSvgGeometry.centerY);
        drawSvgNodes(ctx, fishSvgRenderTree, f, animation);
        ctx.restore();
    }

    drawFishLabel(ctx, f, currentUserFishId);
}
