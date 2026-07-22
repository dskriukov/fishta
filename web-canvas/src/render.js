// imp/web-canvas/src/render.js
// Read-only over domain state (workspace.air rule: render never mutates domain).
// @ds 975ca168 bd354b7a 906be50b d6cebf86 2b3e71e0 a43de7ec a44b9d2c b28b7af6 1f3abc43 8f2c91ad 6f3a9c20 73b91e4c 0b8e71d4 3ad65f20 c5a92431 e001d967
// @ia 2f6e7a91 3983084a
// @fix 4bbc0692

import { BACKGROUND, BUBBLE, DEBUG, DANGER_MAP, FLOW_MAP, FISH, PERCEPTION, PLAYER, RENDER_LAYERS, SHRED, SIZE_DELTA_LABEL, SWIM, FEAR_EYE, SYNC, WORLD, WORLD_MAP } from './constants.js';

const DEFAULT_SVG_GEOMETRY = {
    width: 494,
    height: 386,
    centerX: 192.557,
    centerY: 192.557,
    collisionRadius: 192.057,
};

const FIN_TIP_POINTS = [
    { x: 207, y: 32 },
    { x: 180, y: 384 },
    { x: 333, y: 294 },
]; // @fix:4f8a2c71

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
let backgroundFocus = null;
let backgroundFocusKey = null;
let backgroundPhase = { x: 0, y: 0 };
let backgroundMistFarPhase = { x: 0, y: 0 };
let backgroundMistNearPhase = { x: 0, y: 0 };

const BACKGROUND_MIST = {
    far: { factor: 0.4, width: 980, height: 760 },
    near: { factor: 0.7, width: 720, height: 560 },
};

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

function easedCyclicPhase(phase, curve){
    const cycle = ((phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const half = cycle < Math.PI ? 0 : 1;
    const progress = half === 0 ? cycle / Math.PI : (cycle - Math.PI) / Math.PI;
    const eased = cubicBezierEase(progress, curve);
    return (half + eased) * Math.PI;
}

function cubicBezierEase(x, curve){
    const x1 = clamp01(Number(curve?.x1));
    const y1 = clamp01(Number(curve?.y1));
    const x2 = clamp01(Number(curve?.x2));
    const y2 = clamp01(Number(curve?.y2));
    let low = 0;
    let high = 1;
    for( let i = 0; i < 12; i++ ){
        const t = (low + high) / 2;
        if( cubicBezierCoordinate(t, x1, x2) < x ) low = t;
        else high = t;
    }
    const t = (low + high) / 2;
    return cubicBezierCoordinate(t, y1, y2);
}

function cubicBezierCoordinate(t, c1, c2){
    const inv = 1 - t;
    return 3 * inv * inv * t * c1 + 3 * inv * t * t * c2 + t * t * t;
}

function clamp(value, min, max){
    return Math.max(min, Math.min(max, value));
}

// @ds:c5a92431
function drawFishLabel(ctx, f, currentUserFishId, viewport){
    if( f.id === currentUserFishId || f.ownerKind !== 'user' || !f.userName ) return;
    ctx.save();
    ctx.fillStyle = '#edf8ff';
    const viewportScale = Math.max(1e-6, viewport?.scale || 1);
    const fontPx = Math.max(10, Math.min(16, f.radius * viewportScale * 0.42));
    ctx.font = `${fontPx / viewportScale}px system-ui, sans-serif`;
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
    const viewport = worldToViewport(world, followed, ctx.canvas, {
        viewportFishCapacity: state.viewportFishCapacity,
        cameraPan: state.cameraPan,
    });
    const cameraFocus = followed ? {
        ...followed,
        pos: {
            x: followed.pos.x - (state.cameraPan?.x || 0) / viewport.scale,
            y: followed.pos.y - (state.cameraPan?.y || 0) / viewport.scale,
        },
    } : followed;
    const renderWorld = buildToroidalRenderWorld({
        ...world,
        fish,
        bubbles: state.clientBubbles || world.bubbles || state.bubbles || [],
    }, cameraFocus, state.debug?.positionTraces || []);

    updateWorldBackgroundCss(world, cameraFocus, state.viewportFishCapacity, ctx.canvas);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    ctx.save();
    ctx.translate(viewport.offsetX, viewport.offsetY);
    ctx.scale(viewport.scale, viewport.scale);

    if( state.debug?.enabled && state.syncSegmentsVisible ){
        drawGameplaySyncGrid(ctx, world, renderWorld.anchor, viewport);
    }
    if( state.flowMapVisible && state.flowMapBitmap ){
        drawFlowMapUnderlay(ctx, world, renderWorld.anchor, state.flowMapBitmap);
    }
    if( state.flowVectorsVisible && state.flowVectorField ){
        drawFlowVectorField(ctx, world, renderWorld.anchor, state.flowVectorField, viewport);
    }
    if( state.dangerMapVisible && state.dangerMapBitmap ){
        drawDangerMapUnderlay(ctx, world, renderWorld.anchor, state.dangerMapBitmap);
    }

    drawFinSparks(ctx, state.finSparks || [], renderWorld, world, viewport); // @fix:4f8a2c71

    const renderItems = buildRenderItems(renderWorld, (state.debug?.now || performance.now()) / 1000);
    for( const item of renderItems ){
        if( item.kind === 'fish' ) drawFish(ctx, item.value, state.currentUserFishId, viewport); // ds:1f3abc43
        else if( item.kind === 'shred' ) drawShred(ctx, item.value, (state.debug?.now || performance.now()) / 1000); // @ds:6f3a9c20
        else drawBubble(ctx, item.value, renderWorld, world, viewport);
    }
    for( const label of state.sizeDeltaLabels || [] ){
        const fishForLabel = renderWorld.fish.find(fishItem => fishItem.id === label.fishId);
        if( fishForLabel ) drawSizeDeltaLabel(ctx, label, fishForLabel, viewport);
    }
    if( state.debug?.enabled ){
        drawDebugWorldRepeatBounds(ctx, world, renderWorld.anchor, viewport);
        drawDebugFishCollisionRadius(ctx, renderWorld.fish, viewport);
        if( state.syncSegmentsVisible ){
            drawDebugReceivedQuadrants(ctx, world, renderWorld.anchor, state.debug.receivedQuadrants || [], state.debug.now || performance.now(), viewport);
            drawDebugPositionTraces(ctx, renderWorld.debugTraces || [], state.debug.now || performance.now(), viewport);
        }
    }
    ctx.restore();

    if( state.worldMapVisible ) drawWorldMap(
        ctx,
        world,
        state.currentUserFishId,
        state.worldMapTop,
        {
            flowMapBitmap: state.flowMapVisible ? state.flowMapBitmap : null,
            flowMapVisible: state.flowMapVisible,
            flowVectorField: state.flowVectorsVisible ? state.flowVectorField : null,
            flowVectorsVisible: state.flowVectorsVisible,
            dangerMapBitmap: state.dangerMapVisible ? state.dangerMapBitmap : null,
            dangerMapVisible: state.dangerMapVisible,
            syncSegmentsVisible: state.syncSegmentsVisible,
            debugEnabled: Boolean(state.debug?.enabled),
            debugPositionTraces: state.debug?.positionTraces || [],
            debugNow: state.debug?.now || performance.now(),
            cellSyncAverages: state.cellSyncAverages || [],
        },
    );
}

// @ds:2b3e71e0 @fix:4bbc0692 @ia:3983084a
export function updateWorldBackgroundCss(world, followed, viewportFishCapacity, canvas){
    if( typeof document === 'undefined' || !document.documentElement ) return;
    const delta = backgroundCameraDelta(world, followed);
    const scale = viewportScaleForFishCapacity(world, canvas, viewportFishCapacity);
    const cameraDelta = {
        x: -delta.x * scale,
        y: -delta.y * scale,
    };
    const backgroundDelta = {
        x: cameraDelta.x * BACKGROUND.parallaxFactor,
        y: cameraDelta.y * BACKGROUND.parallaxFactor,
    };
    backgroundPhase = {
        x: wrappedTileOffset(backgroundPhase.x + backgroundDelta.x, BACKGROUND.tileWidthPx),
        y: wrappedTileOffset(backgroundPhase.y + backgroundDelta.y, BACKGROUND.tileHeightPx),
    };
    backgroundMistFarPhase = {
        x: wrappedTileOffset(backgroundMistFarPhase.x + cameraDelta.x * BACKGROUND_MIST.far.factor, BACKGROUND_MIST.far.width),
        y: wrappedTileOffset(backgroundMistFarPhase.y + cameraDelta.y * BACKGROUND_MIST.far.factor, BACKGROUND_MIST.far.height),
    };
    backgroundMistNearPhase = {
        x: wrappedTileOffset(backgroundMistNearPhase.x + cameraDelta.x * BACKGROUND_MIST.near.factor, BACKGROUND_MIST.near.width),
        y: wrappedTileOffset(backgroundMistNearPhase.y + cameraDelta.y * BACKGROUND_MIST.near.factor, BACKGROUND_MIST.near.height),
    };
    const style = document.documentElement.style;
    style.setProperty('--world-bg-x', `${backgroundPhase.x.toFixed(2)}px`);
    style.setProperty('--world-bg-y', `${backgroundPhase.y.toFixed(2)}px`);
    style.setProperty('--world-mist-far-x', `${backgroundMistFarPhase.x.toFixed(2)}px`);
    style.setProperty('--world-mist-far-y', `${backgroundMistFarPhase.y.toFixed(2)}px`);
    style.setProperty('--world-mist-near-x', `${backgroundMistNearPhase.x.toFixed(2)}px`);
    style.setProperty('--world-mist-near-y', `${backgroundMistNearPhase.y.toFixed(2)}px`);
}

// @fix:4bbc0692
export function backgroundCameraDelta(world, followed){
    const canonical = followed ? followed.pos : { x: world.width / 2, y: world.height / 2 };
    const width = Number(world.width);
    const height = Number(world.height);
    const focusKey = `${followed?.id || 'world'}:${width}x${height}`;
    if( !Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0 ){
        backgroundFocus = null;
        backgroundFocusKey = null;
        return { x: 0, y: 0 };
    }

    if( !backgroundFocus || backgroundFocusKey !== focusKey ){
        backgroundFocus = { x: canonical.x, y: canonical.y };
        backgroundFocusKey = focusKey;
        return { x: 0, y: 0 };
    }

    const nextFocus = {
        x: nearestToroidalCoordinate(canonical.x, backgroundFocus.x, width),
        y: nearestToroidalCoordinate(canonical.y, backgroundFocus.y, height),
    };
    const delta = {
        x: nextFocus.x - backgroundFocus.x,
        y: nextFocus.y - backgroundFocus.y,
    };
    backgroundFocus = nextFocus;
    return delta;
}

function wrappedTileOffset(value, size){
    if( !Number.isFinite(size) || size <= 0 ) return 0;
    return ((value % size) + size) % size;
}

// @ds:7b9a7984 @ds:e001d967
export function worldToViewport(world, followed, canvas, options = {}){
    const scale = viewportScaleForFishCapacity(world, canvas, options.viewportFishCapacity) * (world?.scale || 1);
    const focus = followed ? followed.pos : { x: world.width / 2, y: world.height / 2 };
    const cameraPan = options.cameraPan || { x: 0, y: 0 };
    return {
        scale,
        offsetX: canvas.width / 2 - focus.x * scale + (cameraPan.x || 0),
        offsetY: canvas.height / 2 - focus.y * scale + (cameraPan.y || 0),
    };
}

// @ds:e001d967
export function viewportScaleForFishCapacity(world, canvas, value){
    const minScreenSide = Math.min(canvas?.width || 0, canvas?.height || 0);
    const screenWidth = canvas?.width || 0;
    const screenHeight = canvas?.height || 0;
    const worldWidth = world?.width || 0;
    const worldHeight = world?.height || 0;
    const worldScale = Math.max(1e-6, world?.scale || 1);
    const maxScale = screenWidth > 0 && screenHeight > 0 && worldWidth > 0 && worldHeight > 0
        ? Math.max(screenWidth / worldWidth, screenHeight / worldHeight)
            / worldScale
        : WORLD.initialViewportScale / worldScale;
    if( value === 'max' ) return maxScale;
    const capacity = Number(value);
    if( !Number.isFinite(capacity) || capacity <= 0 || minScreenSide <= 0 ) return maxScale;
    const nominalDiameter = FISH.nominalStartDiameter * Math.sqrt(PLAYER.startSize);
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

// @fix:4f8a2c71
export function fishFinTipPositions(fish){
    if( !fish?.pos ) return [];
    const radius = Math.max(0.001, Number(fish.radius) || 0) * Math.max(0.5, Number(fish.visualScale) || 1);
    const scale = radius / Math.max(1e-6, fishSvgGeometry.collisionRadius);
    const mirror = (fish.visualFacing ?? fish.facing) < 0 ? 1 : -1;
    const tilt = Number.isFinite(fish.visualTilt) ? fish.visualTilt : visualFishTurnRadians(fish);
    const cos = Math.cos(tilt);
    const sin = Math.sin(tilt);
    return FIN_TIP_POINTS.map(point => {
        const authoredX = (point.x - fishSvgGeometry.centerX) * scale * mirror;
        const authoredY = (point.y - fishSvgGeometry.centerY) * scale;
        const offset = {
            x: authoredX * cos - authoredY * sin,
            y: authoredX * sin + authoredY * cos,
        };
        return { offset };
    });
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
        bubbles: world.bubbles || [],
        debugTraces: (debugTraces || []).map(trace => ({
            ...trace,
            pos: projectPos(trace.pos),
        })),
    };
}

// @ds:6f3a9c20 @ds:73b91e4c @ds:8c663384
function drawShred(ctx, shred, timeSeconds = 0){
    ctx.save();
    ctx.globalAlpha *= shred.syncOpacity ?? 1;
    ctx.translate(shred.pos.x, shred.pos.y);
    ctx.rotate(Number(shred.renderRotation) || 0); // @fix:4e9b2c71
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

const fishLayerCache = new Map();

function buildRenderItems(renderWorld, timeSeconds){
    const fishLayers = assignFishRenderLayers(renderWorld.fish || []);
    const occupied = [...fishLayers.values()].sort((a, b) => a - b);
    const items = [];
    for( const fish of renderWorld.fish || [] ){
        items.push({ kind: 'fish', value: fish, renderLayer: fishLayers.get(fish.id) });
    }
    const shredLayers = assignShredRenderLayers(renderWorld.shreds || [], occupied);
    for( const shred of renderWorld.shreds || [] ){
        items.push({ kind: 'shred', value: shred, renderLayer: shredLayers.get(shred.id) });
    }
    for( const bubble of renderWorld.bubbles || [] ){
        const sourceLayer = fishLayers.get(bubble.sourceFishId);
        if( sourceLayer === undefined ) continue;
        items.push({ kind: 'bubble', value: bubble, renderLayer: sourceLayer - 1 });
    }
    return items.sort((a, b) => a.renderLayer - b.renderLayer || String(a.value.id).localeCompare(String(b.value.id)));
}

function assignFishRenderLayers(fish){
    const ordered = [...fish].sort((a, b) => {
        const aPlayer = a.ownerKind === 'user' || a.isPlayer ? 1 : 0;
        const bPlayer = b.ownerKind === 'user' || b.isPlayer ? 1 : 0;
        return aPlayer - bPlayer || String(a.id).localeCompare(String(b.id));
    });
    const result = new Map();
    let npcIndex = 0;
    let playerIndex = 0;
    for( const fishItem of ordered ){
        const isPlayer = fishItem.ownerKind === 'user' || fishItem.isPlayer;
        const min = isPlayer ? RENDER_LAYERS.playerFishMin : RENDER_LAYERS.npcFishMin;
        const max = isPlayer ? RENDER_LAYERS.playerFishMax : RENDER_LAYERS.npcFishMax;
        const index = isPlayer ? playerIndex++ : npcIndex++;
        const layer = Math.min(max, min + index * 2);
        result.set(fishItem.id, layer);
        fishLayerCache.set(fishItem.id, layer);
    }
    return result;
}

function assignShredRenderLayers(shreds, occupiedFishLayers){
    const candidates = [];
    const maxSlots = occupiedFishLayers.length + RENDER_LAYERS.shredExtraFishSlots;
    const slotCount = Math.max(1, Math.min(maxSlots, occupiedFishLayers.length));
    for( let i = 0; i < slotCount; i++ ){
        const fishLayer = occupiedFishLayers[Math.floor(i * occupiedFishLayers.length / slotCount)];
        if( fishLayer !== undefined ) candidates.push(fishLayer - 1);
    }
    const uniqueCandidates = [...new Set(candidates)];
    const result = new Map();
    const ordered = [...shreds].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    for( let i = 0; i < ordered.length; i++ ){
        result.set(ordered[i].id, uniqueCandidates.length ? uniqueCandidates[i % uniqueCandidates.length] : RENDER_LAYERS.npcFishMin - 1);
    }
    return result;
}

function drawBubble(ctx, bubble, renderWorld, world, viewport){
    const pixelsPerWorldUnit = WORLD.pixelsPerWorldUnit;
    const anchor = renderWorld.anchor || { x: world.width / 2, y: world.height / 2 };
    const x = nearestToroidalCoordinate(bubble.posPx.x / pixelsPerWorldUnit, anchor.x, world.width);
    const y = nearestToroidalCoordinate(bubble.posPx.y / pixelsPerWorldUnit, anchor.y, world.height);
    const radius = (bubble.radiusPx || 0) / pixelsPerWorldUnit / Math.max(1e-6, world.scale || 1);
    const age = bubble.age || 0;
    const pulsePhase = Math.floor((age + bubble.phase) / BUBBLE.pulseStep) % 2;
    const squash = pulsePhase === 0 ? 1 : BUBBLE.pulseSquash;
    const red = bubble.color === 'red';
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, squash);
    ctx.globalAlpha = bubble.alpha;
    ctx.fillStyle = red ? `rgba(255, 72, 72, ${BUBBLE.fillAlpha * 1.35})` : `rgba(183, 236, 255, ${BUBBLE.fillAlpha})`;
    ctx.strokeStyle = red ? '#ff6b6b' : '#d9f6ff';
    ctx.lineWidth = BUBBLE.strokeWidthPx / Math.max(1e-6, viewport.scale);
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}

// @fix:4f8a2c71
function drawFinSparks(ctx, sparks, renderWorld, world, viewport){
    if( !Array.isArray(sparks) || !sparks.length ) return;
    const anchor = renderWorld.anchor || { x: world.width / 2, y: world.height / 2 };
    const worldScale = Math.max(1e-6, world?.scale || 1);
    ctx.save();
    ctx.fillStyle = '#d9f6ff';
    for( const spark of sparks ){
        if( !spark?.pos || !(spark.alpha > 0) ) continue;
        const x = nearestToroidalCoordinate(spark.pos.x, anchor.x, world.width);
        const y = nearestToroidalCoordinate(spark.pos.y, anchor.y, world.height);
        const radius = Math.max(0.25, Number(spark.sizePx) || 1) / WORLD.pixelsPerWorldUnit / worldScale;
        ctx.globalAlpha = Math.max(0, Math.min(1, Number(spark.alpha) || 0));
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

// @ds:7435b6ce
function drawDebugWorldRepeatBounds(ctx, world, anchor, viewport){
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 228, 92, 0.68)';
    const viewportScale = Math.max(1e-6, viewport?.scale || 1);
    ctx.lineWidth = 2 / viewportScale;
    ctx.setLineDash([12 / viewportScale, 8 / viewportScale]);
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
function drawDebugFishCollisionRadius(ctx, fish, viewport){
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = 1.5 / Math.max(1e-6, viewport?.scale || 1);
    for( const item of fish || [] ){
        if( !item?.pos || !Number.isFinite(item.radius) ) continue;
        ctx.beginPath();
        ctx.arc(item.pos.x, item.pos.y, item.radius, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.restore();
}

// @ds:727e9afe
function drawDebugReceivedQuadrants(ctx, world, anchor, quadrants, now, viewport){
    ctx.save();
    ctx.strokeStyle = DEBUG.receivedQuadrantColor;
    ctx.lineWidth = 2 / Math.max(1e-6, viewport?.scale || 1);
    ctx.setLineDash([]);
    for( const quadrant of quadrants || [] ){
        const alpha = Math.max(0, 1 - (now - quadrant.receivedAt) / DEBUG.receivedQuadrantFadeMs);
        if( alpha <= 0 ) continue;
        const x = nearestToroidalCoordinate(quadrant.cellX * SYNC.cellSize, anchor.x, world.width);
        const y = nearestToroidalCoordinate(quadrant.cellY * SYNC.cellSize, anchor.y, world.height);
        ctx.globalAlpha = alpha;
        ctx.strokeRect(x, y, SYNC.cellSize, SYNC.cellSize);
    }
    ctx.restore();
}

// @ds:727e9afe
function drawDebugPositionTraces(ctx, traces, now, viewport){
    const viewportScale = Math.max(1e-6, viewport?.scale || 1);
    for( const trace of traces ){
        const alpha = traceAlpha(trace, now);
        if( alpha <= 0 ) continue;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = trace.kind === 'absolute' ? DEBUG.absoluteTraceColor : DEBUG.relativeTraceColor;
        ctx.beginPath();
        ctx.arc(trace.pos.x, trace.pos.y, (trace.kind === 'absolute' ? 4 : 3) / viewportScale, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function traceAlpha(trace, now){
    if( now <= trace.fadeStartAt ) return 1;
    return Math.max(0, 1 - (now - trace.fadeStartAt) / DEBUG.traceFadeMs);
}

// @ds:8f2c91ad @ds:3a980720 @ds:f3a1c7d9 @ds:e6d3b9a1 @ds:9a6e4c31
function drawWorldMap(ctx, world, currentUserFishId, top, inspection = {}){
    const size = WORLD_MAP.sizePx;
    const left = WORLD_MAP.leftPx;
    if( !Number.isFinite(world.width) || !Number.isFinite(world.height) || world.width <= 0 || world.height <= 0 ) return;
    const maxLinearSize = (world.fish || []).reduce((max, fish) => Math.max(max, linearMapFishSize(fish)), 0);
    const nominalLinearSize = Math.sqrt(PLAYER.startSize);

    ctx.save();
    ctx.fillStyle = '#04263b';
    ctx.strokeStyle = 'rgba(216, 246, 255, 0.72)';
    ctx.lineWidth = 1;
    ctx.fillRect(left, top, size, size);
    ctx.strokeRect(left + 0.5, top + 0.5, size, size);

    if( inspection.debugEnabled || inspection.syncSegmentsVisible ){
        drawDebugCellSyncAveragesOnMap(ctx, world, inspection.cellSyncAverages || [], left, top, size);
        drawWorldMapSyncGrid(ctx, world, left, top, size);
        drawWorldMapDebugTraces(ctx, world, inspection.debugPositionTraces || [], inspection.debugNow, left, top, size);
    }
    if( inspection.flowMapVisible && inspection.flowMapBitmap ){
        ctx.save();
        ctx.beginPath();
        ctx.rect(left, top, size, size);
        ctx.clip();
        ctx.globalAlpha = FLOW_MAP.bitmapAlpha;
        ctx.drawImage(inspection.flowMapBitmap, left, top, size, size);
        ctx.restore();
    }
    if( inspection.flowVectorsVisible && inspection.flowVectorField ){
        drawFlowVectorFieldOnMap(ctx, world, inspection.flowVectorField, left, top, size);
    }
    if( inspection.dangerMapVisible ){
        drawDangerMapGrid(ctx, world, left, top, size);
    }
    if( inspection.dangerMapVisible && inspection.dangerMapBitmap ){
        ctx.save();
        ctx.beginPath();
        ctx.rect(left, top, size, size);
        ctx.clip();
        ctx.globalAlpha = DANGER_MAP.bitmapAlpha;
        ctx.drawImage(inspection.dangerMapBitmap, left, top, size, size);
        ctx.restore();
    }

    for( const fish of world.fish || [] ){
        if( !fish?.pos ) continue;
        const x = left + clamp01(fish.pos.x / world.width) * size;
        const y = top + clamp01(fish.pos.y / world.height) * size;
        drawWorldMapFish(ctx, fish, currentUserFishId, x, y, maxLinearSize, nominalLinearSize);
    }
    ctx.restore();
}

// @fix:9b6d2e41
function drawWorldMapDebugTraces(ctx, world, traces, now, left, top, size){
    ctx.save();
    for( const trace of traces || [] ){
        const alpha = traceAlpha(trace, now);
        if( alpha <= 0 || !trace?.pos ) continue;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = trace.kind === 'absolute' ? DEBUG.absoluteTraceColor : DEBUG.relativeTraceColor;
        const x = left + clamp01(trace.pos.x / world.width) * size;
        const y = top + clamp01(trace.pos.y / world.height) * size;
        ctx.beginPath();
        ctx.arc(x, y, trace.kind === 'absolute' ? 2.5 : 2, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

// @fix:b5c7d9e1
function drawDangerMapGrid(ctx, world, left, top, size){
    const segmentSize = PERCEPTION.segmentGameSide / Math.max(1e-6, world.scale || 1);
    const columns = Math.max(1, Math.ceil(world.width / segmentSize));
    const rows = Math.max(1, Math.ceil(world.height / segmentSize));
    const cellWidth = size / columns;
    const cellHeight = size / rows;
    ctx.save();
    ctx.globalAlpha = DANGER_MAP.gridAlpha;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    for( let column = 0; column <= columns; column++ ){
        const x = left + column * cellWidth;
        ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + size); ctx.stroke();
    }
    for( let row = 0; row <= rows; row++ ){
        const y = top + row * cellHeight;
        ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + size, y); ctx.stroke();
    }
    ctx.restore();
}

// @fix:1f5d8c42
function drawDangerMapUnderlay(ctx, world, anchor, bitmap){
    const width = Number(world.width);
    const height = Number(world.height);
    if( !bitmap || !Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0 ) return;
    const originX = nearestToroidalCoordinate(0, anchor?.x ?? width / 2, width);
    const originY = nearestToroidalCoordinate(0, anchor?.y ?? height / 2, height);

    ctx.save();
    drawDangerMapGameplayGrid(ctx, world, originX, originY);
    ctx.globalAlpha = DANGER_MAP.bitmapAlpha;
    for( let column = -1; column <= 1; column++ ){
        for( let row = -1; row <= 1; row++ ){
            ctx.drawImage(bitmap, originX + column * width, originY + row * height, width, height);
        }
    }
    ctx.restore();
}

// @fix:6a7b8c9d
function drawFlowMapUnderlay(ctx, world, anchor, bitmap){
    const width = Number(world.width);
    const height = Number(world.height);
    if( !bitmap || !Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0 ) return;
    const originX = nearestToroidalCoordinate(0, anchor?.x ?? width / 2, width);
    const originY = nearestToroidalCoordinate(0, anchor?.y ?? height / 2, height);
    ctx.save();
    ctx.globalAlpha = FLOW_MAP.bitmapAlpha;
    for( let column = -1; column <= 1; column++ ){
        for( let row = -1; row <= 1; row++ ){
            ctx.drawImage(bitmap, originX + column * width, originY + row * height, width, height);
        }
    }
    ctx.restore();
}

// @fix:5f2a8c71
function drawFlowVectorField(ctx, world, anchor, field, viewport){
    const width = Number(world.width);
    const height = Number(world.height);
    if( !field || !Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0 ) return;
    const cellSize = FISH.nominalStartDiameter / 4;
    const stride = Math.max(1, Math.floor(FLOW_MAP.vectorStrideCells));
    const crossRadius = FISH.nominalStartDiameter * FLOW_MAP.vectorCrossSizeRatio / 2;
    const viewportScale = Math.max(1e-6, viewport?.scale || 1);
    const crossAngles = field.crossAngles || [];
    ctx.save();
    ctx.lineWidth = FLOW_MAP.vectorCrossLineWidth / viewportScale;
    ctx.lineCap = 'round';
    for( let row = 0; row < field.rows; row += stride ) for( let column = 0; column < field.columns; column += stride ){
        const index = row * field.columns + column;
        const centerX = nearestToroidalCoordinate((column + 0.5) * cellSize, anchor?.x ?? width / 2, width);
        const centerY = nearestToroidalCoordinate((row + 0.5) * cellSize, anchor?.y ?? height / 2, height);
        const crossAngle = Number(crossAngles[index]) || 0;
        ctx.save();
        ctx.globalAlpha = FLOW_MAP.vectorCrossAlpha;
        ctx.lineWidth = FLOW_MAP.vectorCrossLineWidth / viewportScale;
        ctx.translate(centerX, centerY);
        ctx.rotate(crossAngle);
        ctx.strokeStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(-crossRadius, 0); ctx.lineTo(crossRadius, 0);
        ctx.moveTo(0, -crossRadius); ctx.lineTo(0, crossRadius);
        ctx.stroke();
        ctx.restore();

        const offset = index * 4;
        const magnitude = (field.pixels[offset + 3] || 0) / 255 * SHRED.flowMapMaxImpulse;
        if( magnitude <= 1e-6 ) continue;
        const encodedAngle = ((field.pixels[offset] || 0) * 256) + (field.pixels[offset + 1] || 0);
        const angle = encodedAngle / 65535 * Math.PI * 2 - Math.PI;
        const length = Math.min(FLOW_MAP.vectorMaxLength, magnitude * FLOW_MAP.vectorLengthScale);
        ctx.globalAlpha = FLOW_MAP.vectorAlpha;
        ctx.lineWidth = FLOW_MAP.vectorLineWidth / viewportScale;
        ctx.strokeStyle = Math.cos(angle) < 0 ? '#48a7ff' : '#48e68a';
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(centerX + Math.cos(angle) * length, centerY + Math.sin(angle) * length);
        ctx.stroke();
    }
    ctx.restore();
}

// @fix:9b6d2e41
function drawFlowVectorFieldOnMap(ctx, world, field, left, top, size){
    const cellSize = FISH.nominalStartDiameter / 4;
    const stride = Math.max(1, Math.floor(FLOW_MAP.vectorStrideCells));
    const crossRadius = FISH.nominalStartDiameter * FLOW_MAP.vectorCrossSizeRatio / 2 / world.width * size;
    const crossLineWidth = Math.max(0.5, FLOW_MAP.vectorCrossLineWidth / world.width * size);
    const vectorLineWidth = Math.max(0.75, FLOW_MAP.vectorLineWidth / world.width * size);
    const crossAngles = field.crossAngles || [];
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, size, size);
    ctx.clip();
    ctx.lineCap = 'round';
    for( let row = 0; row < field.rows; row += stride ) for( let column = 0; column < field.columns; column += stride ){
        const index = row * field.columns + column;
        const centerX = left + ((column + 0.5) * cellSize / world.width) * size;
        const centerY = top + ((row + 0.5) * cellSize / world.height) * size;
        ctx.save();
        ctx.globalAlpha = FLOW_MAP.vectorCrossAlpha;
        ctx.lineWidth = crossLineWidth;
        ctx.translate(centerX, centerY);
        ctx.rotate(Number(crossAngles[index]) || 0);
        ctx.strokeStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(-crossRadius, 0); ctx.lineTo(crossRadius, 0);
        ctx.moveTo(0, -crossRadius); ctx.lineTo(0, crossRadius);
        ctx.stroke();
        ctx.restore();

        const offset = index * 4;
        const magnitude = (field.pixels[offset + 3] || 0) / 255 * SHRED.flowMapMaxImpulse;
        if( magnitude <= 1e-6 ) continue;
        const encodedAngle = ((field.pixels[offset] || 0) * 256) + (field.pixels[offset + 1] || 0);
        const angle = encodedAngle / 65535 * Math.PI * 2 - Math.PI;
        const length = Math.min(FLOW_MAP.vectorMaxLength, magnitude * FLOW_MAP.vectorLengthScale) / world.width * size;
        ctx.globalAlpha = FLOW_MAP.vectorAlpha;
        ctx.lineWidth = vectorLineWidth;
        ctx.strokeStyle = Math.cos(angle) < 0 ? '#48a7ff' : '#48e68a';
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(centerX + Math.cos(angle) * length, centerY + Math.sin(angle) * length);
        ctx.stroke();
    }
    ctx.restore();
}

// @fix:1f5d8c42
function drawDangerMapGameplayGrid(ctx, world, left, top){
    const width = Number(world.width);
    const height = Number(world.height);
    const segmentSize = PERCEPTION.segmentGameSide / Math.max(1e-6, world.scale || 1);
    const columns = Math.max(1, Math.ceil(width / segmentSize));
    const rows = Math.max(1, Math.ceil(height / segmentSize));
    const cellWidth = width / columns;
    const cellHeight = height / rows;
    ctx.save();
    ctx.globalAlpha = DANGER_MAP.gridAlpha;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1 / Math.max(1e-6, ctx.getTransform?.().a || 1);
    for( let copyX = -1; copyX <= 1; copyX++ ){
        for( let copyY = -1; copyY <= 1; copyY++ ){
            const x0 = left + copyX * width;
            const y0 = top + copyY * height;
            for( let column = 0; column <= columns; column++ ){
                const x = x0 + column * cellWidth;
                ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + height); ctx.stroke();
            }
            for( let row = 0; row <= rows; row++ ){
                const y = y0 + row * cellHeight;
                ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + width, y); ctx.stroke();
            }
        }
    }
    ctx.restore();
}

// @fix:1f5d8c42
function drawGameplaySyncGrid(ctx, world, anchor, viewport){
    const width = Number(world.width);
    const height = Number(world.height);
    const columns = Math.max(1, Math.ceil(width / SYNC.cellSize));
    const rows = Math.max(1, Math.ceil(height / SYNC.cellSize));
    const cellWidth = width / columns;
    const cellHeight = height / rows;
    const originX = nearestToroidalCoordinate(0, anchor?.x ?? width / 2, width);
    const originY = nearestToroidalCoordinate(0, anchor?.y ?? height / 2, height);
    ctx.save();
    ctx.globalAlpha = 0.34;
    ctx.strokeStyle = 'rgba(120, 220, 255, 0.9)';
    ctx.lineWidth = 1 / Math.max(1e-6, viewport?.scale || 1);
    for( let copyX = -1; copyX <= 1; copyX++ ){
        for( let copyY = -1; copyY <= 1; copyY++ ){
            const left = originX + copyX * width;
            const top = originY + copyY * height;
            for( let column = 0; column <= columns; column++ ){
                const x = left + column * cellWidth;
                ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + height); ctx.stroke();
            }
            for( let row = 0; row <= rows; row++ ){
                const y = top + row * cellHeight;
                ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + width, y); ctx.stroke();
            }
        }
    }
    ctx.restore();
}

// @ds:f3a1c7d9
function drawWorldMapSyncGrid(ctx, world, left, top, size){
    const columns = Math.max(1, Math.round(world.width / SYNC.cellSize));
    const rows = Math.max(1, Math.round(world.height / SYNC.cellSize));
    const cellWidth = size / columns;
    const cellHeight = size / rows;
    ctx.save();
    ctx.strokeStyle = 'rgba(120, 220, 255, .05)';
    ctx.lineWidth = 1;
    for( let column = 0; column <= columns; column++ ){
        const x = left + column * cellWidth;
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, top + size);
        ctx.stroke();
    }
    for( let row = 0; row <= rows; row++ ){
        const y = top + row * cellHeight;
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(left + size, y);
        ctx.stroke();
    }
    ctx.restore();
}

// @ds:8f2c91ad
function drawDebugCellSyncAveragesOnMap(ctx, world, cellAverages, left, top, size){
    const columns = Math.max(1, Math.round(world.width / SYNC.cellSize));
    const rows = Math.max(1, Math.round(world.height / SYNC.cellSize));
    const cellWidth = size / columns;
    const cellHeight = size / rows;
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, size, size);
    ctx.clip();
    ctx.fillStyle = 'rgba(3, 19, 30, 0.72)';
    for( const cell of cellAverages || [] ){
        const alpha = clamp01(cell.ratio);
        if( alpha <= 0 ) continue;
        ctx.globalAlpha = alpha;
        ctx.fillRect(
            left + cell.cellX * cellWidth,
            top + cell.cellY * cellHeight,
            cellWidth,
            cellHeight,
        );
    }
    ctx.restore();
}

function drawWorldMapFish(ctx, fish, currentUserFishId, x, y, maxLinearSize, nominalLinearSize){
    const color = minimapFishColor(fish);
    if( fish.ownerKind === 'user' ){
        const pointDiameter = fish.id === currentUserFishId ? 5 : 3;
        const lineWidth = fish.id === currentUserFishId ? 2 : 1;
        const gap = 1;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, pointDiameter / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.arc(x, y, pointDiameter / 2 + gap + lineWidth / 2, 0, Math.PI * 2);
        ctx.stroke();
        return;
    }
    const diameter = mapNpcDiameter(fish, maxLinearSize, nominalLinearSize);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, diameter / 2, 0, Math.PI * 2);
    ctx.fill();
}

function linearMapFishSize(fish){
    return Math.sqrt(Math.max(0, Number(fish?.size) || 0));
}

function mapNpcDiameter(fish, maxLinearSize, nominalLinearSize){
    const linearSize = linearMapFishSize(fish);
    if( maxLinearSize <= nominalLinearSize ) return 2;
    const t = clamp((linearSize - nominalLinearSize) / (maxLinearSize - nominalLinearSize), 0, 1);
    return clamp(2 + t * 3, 2, 5);
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

// @ds:c2d7f4a1 @fix:4d8e2a71
function drawSizeDeltaLabel(ctx, label, fish, viewport){
    const t = Math.max(0, Math.min(1, label.age / label.life));
    const alpha = 1 - t;
    if( alpha <= 0 ) return;
    const text = `${label.value > 0 ? '+' : ''}${label.value.toFixed(1)}`;
    ctx.save();
    ctx.globalAlpha = alpha;
    const viewportScale = Math.max(1e-6, viewport?.scale || 1);
    ctx.font = `700 ${18 / viewportScale}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4 / viewportScale;
    ctx.strokeStyle = 'rgba(2, 18, 28, 0.72)';
    ctx.fillStyle = label.value > 0 ? SIZE_DELTA_LABEL.gainColor : SIZE_DELTA_LABEL.lossColor;
    const screenPxToWorld = 1 / viewportScale;
    const y = fish.pos.y - fish.radius - SIZE_DELTA_LABEL.gapPx * screenPxToWorld + label.yOffset * screenPxToWorld;
    ctx.strokeText(text, fish.pos.x, y);
    ctx.fillText(text, fish.pos.x, y);
    ctx.restore();
}

// @ds:df06827a @ds:bd354b7a @ds:906be50b @ds:8c663384 @ia:2f6e7a91 @fix:c13e07b3
function drawFish(ctx, f, currentUserFishId, viewport){
    const visualScale = Math.max(0.5, f.visualScale || 1);
    const r = f.radius * visualScale;
    const swimPhase = f.swimPhase || 0;
    const burstKick = Math.max(0, Math.min(1, f.burstKick || 0));
    const eyeFear = Math.max(0, Math.min(1, f.eyeFear || 0));
    const eyeScale = 1 + (FEAR_EYE.maxScale - 1) * eyeFear;
    const burstBlend = f.mode === 'burst' ? 1 : 0;
    const tailWave = Math.sin(swimPhase) * (SWIM.tailBaseSwing + SWIM.tailBurstSwing * burstBlend + SWIM.tailBurstSwing * burstKick);
    const verticalFinBoost = 1 + visualFishVerticality(f) * SWIM.verticalFinSwingBoost;
    const finTimingCurve = burstBlend > 0 ? SWIM.finBurstTimingCurve : SWIM.finTimingCurve;
    const finPhase = easedCyclicPhase(swimPhase + Math.PI * 0.55, finTimingCurve);
    const finWave = Math.sin(finPhase) * (SWIM.finBaseSwing + SWIM.finBurstSwing * burstBlend + SWIM.finBurstSwing * burstKick) * verticalFinBoost;
    if( fishSvgRenderTree ){
        const scale = r / fishSvgGeometry.collisionRadius;
        const animation = {
            tailWave: clamp(tailWave, -0.46, 0.46),
            finWave: clamp(finWave, -0.45, 0.45),
            eyeScale,
        };
        ctx.save();
        ctx.globalAlpha *= f.syncOpacity ?? 1;
        ctx.translate(f.pos.x, f.pos.y);
        ctx.rotate(Number.isFinite(f.visualTilt) ? f.visualTilt : visualFishTurnRadians(f)); // @fix:6e2a9c41
        // The authored SVG faces left; the domain facing convention is 1 = right.
        ctx.scale(-(f.visualFacing ?? f.facing), 1);
        ctx.scale(scale, scale);
        ctx.translate(-fishSvgGeometry.centerX, -fishSvgGeometry.centerY);
        drawSvgNodes(ctx, fishSvgRenderTree, f, animation);
        ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha *= f.syncOpacity ?? 1;
    drawFishLabel(ctx, f, currentUserFishId, viewport);
    ctx.restore();
}

// @fix:6e2a9c41 @fix:c13e07b3
export function visualFishTurnRadians(fish){
    const hasVisualDirection = Boolean(fish?.visualDirection);
    const direction = fish?.visualDirection || fish?.vel || { x: 0, y: 0 };
    const velocityX = Number(direction.x) || 0;
    const velocityY = Number(direction.y) || 0;
    const speed = Math.hypot(velocityX, velocityY);
    if( speed <= (hasVisualDirection ? 1e-3 : FISH.facingThreshold) ) return 0;
    const facing = (fish?.visualFacing ?? fish?.facing) < 0 ? -1 : 1;
    const rawMagnitude = Math.atan2(Math.abs(velocityY), Math.abs(velocityX));
    const raw = Math.sign(facing * velocityY) * rawMagnitude;
    const limit = Math.max(0, Math.min(89.9, Number(FISH.visualMaxTiltDeg) || 20)) * Math.PI / 180;
    return clamp(raw, -limit, limit);
}

// @fix:6e2a9c41 @fix:c13e07b3
function visualFishVerticality(fish){
    const direction = fish?.visualDirection || fish?.vel || { x: 0, y: 0 };
    const velocityX = Number(direction.x) || 0;
    const velocityY = Number(direction.y) || 0;
    const speed = Math.hypot(velocityX, velocityY);
    if( speed <= (fish?.visualDirection ? 1e-3 : FISH.facingThreshold) ) return 0;
    return clamp01(Math.abs(velocityY) / speed);
}
