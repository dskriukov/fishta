// imp/web-canvas/src/render.js
// Read-only over domain state (workspace.air rule: render never mutates domain).
// @ds 975ca168 bd354b7a 906be50b d6cebf86 b28b7af6 1f3abc43 8f2c91ad

import { BUBBLE, DEBUG, MOUTH, SIZE_DELTA_LABEL, SWIM, FEAR_EYE, WORLD } from './constants.js';

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

    // ds:d2e8a84c b28b7af6
    const g = ctx.createLinearGradient(0, 0, 0, world.height);
    g.addColorStop(0, '#0a3a57');
    g.addColorStop(1, '#04263b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    ctx.save();
    const viewport = worldToViewport(world, followed, ctx.canvas);
    ctx.translate(viewport.offsetX, viewport.offsetY);
    ctx.scale(viewport.scale, viewport.scale);

    for( const bubble of renderWorld.bubbles ) drawBubble(ctx, bubble); // ds:d6cebf86

    for( const f of renderWorld.fish ) drawFish(ctx, f); // ds:1f3abc43
    for( const label of state.sizeDeltaLabels || [] ){
        const fishForLabel = renderWorld.fish.find(fish => fish.id === label.fishId);
        if( fishForLabel ) drawSizeDeltaLabel(ctx, label, fishForLabel);
    }
    if( state.debug?.enabled ){
        drawDebugWorldRepeatBounds(ctx, world, renderWorld.anchor);
        drawDebugPositionTraces(ctx, renderWorld.debugTraces || [], state.debug.now || performance.now());
    }
    ctx.restore();

    if( state.debug?.enabled ){
        drawDebugFishMinimap(ctx, world, state.currentUserFishId);
    }
}

// @ds:7b9a7984
export function worldToViewport(world, followed, canvas){
    const scale = WORLD.initialViewportScale;
    const focus = followed ? followed.pos : { x: world.width / 2, y: world.height / 2 };
    return {
        scale,
        offsetX: canvas.width / 2 - focus.x * scale,
        offsetY: canvas.height / 2 - focus.y * scale,
    };
}

// @ds:7b9a7984
export function viewportToWorld(point, world, followed, canvas){
    const viewport = worldToViewport(world, followed, canvas);
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

// @ia 3c4d5e6f
function drawBubble(ctx, bubble){
    const age = 1 - bubble.alpha;
    const pulsePhase = Math.floor((age + bubble.phase) / BUBBLE.pulseStep) % 2;
    const squash = pulsePhase === 0 ? 1 : BUBBLE.pulseSquash;
    ctx.save();
    ctx.translate(bubble.pos.x, bubble.pos.y);
    ctx.scale(1, squash);
    ctx.globalAlpha = bubble.alpha;
    ctx.fillStyle = `rgba(183, 236, 255, ${BUBBLE.fillAlpha})`;
    ctx.strokeStyle = '#d9f6ff';
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

// @ia 3a4b5c6d
function drawFish(ctx, f){
    const visualScale = Math.max(0.5, f.visualScale || 1);
    const r = f.radius * visualScale;
    const mouthOpen = Math.max(0, Math.min(1, f.mouthOpen || 0));
    const swimPhase = f.swimPhase || 0;
    const burstKick = Math.max(0, Math.min(1, f.burstKick || 0));
    const eyeFear = Math.max(0, Math.min(1, f.eyeFear || 0));
    const eyeScale = 1 + (FEAR_EYE.maxScale - 1) * eyeFear;
    const burstBlend = f.mode === 'burst' ? 1 : 0;
    const tailWave = Math.sin(swimPhase) * r * (SWIM.tailBaseSwing + SWIM.tailBurstSwing * burstBlend + SWIM.tailBurstSwing * burstKick);
    const finWave = Math.sin(swimPhase + Math.PI * 0.55) * r * (SWIM.finBaseSwing + SWIM.finBurstSwing * burstBlend + SWIM.finBurstSwing * burstKick);
    ctx.save();
    ctx.translate(f.pos.x, f.pos.y);
    ctx.scale(f.facing, 1);

    const userColor = f.ownerKind === 'user' ? f.userColor : null;
    const abandonedColor = f.ownerKind === 'npc' && f.npcRole === 'abandoned-user-fish' ? f.formerUserColor : null;
    const bodyColor = userColor || abandonedColor || `hsl(${f.hue}, 68%, 58%)`;
    const preserveBaseColor = Boolean(userColor || abandonedColor);
    const bodyShadow = preserveBaseColor ? 'rgba(0, 0, 0, 0.24)' : `hsl(${f.hue}, 58%, 46%)`;
    const bodyLight = preserveBaseColor ? 'rgba(255, 255, 255, 0.34)' : `hsl(${f.hue}, 78%, 70%)`;
    const finAccent = preserveBaseColor ? 'rgba(255, 255, 255, 0.22)' : `hsl(${f.hue}, 66%, 64%)`;
    const lipColor = preserveBaseColor ? 'rgba(0, 0, 0, 0.34)' : `hsl(${f.hue}, 58%, 36%)`;
    const snoutX = r * 1.06;
    const headX = r * 0.78;
    const tailX = -r * 0.88;
    const tailY = tailWave * 0.22;
    const bodyTop = -r * 0.62;
    const bodyBottom = r * 0.56;
    let baseFillStyle = bodyColor;
    if( abandonedColor ){
        const gradient = ctx.createLinearGradient(-r * 0.9, 0, snoutX, 0);
        gradient.addColorStop(0, abandonedColor);
        gradient.addColorStop(1, `hsl(${f.hue}, 68%, 58%)`);
        baseFillStyle = gradient;
    }

    // body silhouette
    ctx.fillStyle = baseFillStyle;
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.bezierCurveTo(-r * 0.55, -r * 0.48, -r * 0.12, bodyTop, r * 0.38, bodyTop * 0.95);
    ctx.bezierCurveTo(r * 0.74, bodyTop * 0.86, snoutX, -r * 0.42, snoutX, -r * 0.03);
    ctx.bezierCurveTo(snoutX, r * 0.36, r * 0.68, bodyBottom, r * 0.28, bodyBottom * 0.95);
    ctx.bezierCurveTo(-r * 0.12, bodyBottom, -r * 0.5, r * 0.42, tailX, tailY);
    ctx.closePath();
    ctx.fill();

    // @ia:32288dfb
    ctx.fillStyle = bodyShadow;
    ctx.beginPath();
    ctx.moveTo(-r * 0.45, r * 0.02);
    ctx.bezierCurveTo(-r * 0.1, r * 0.44, r * 0.28, r * 0.58, r * 0.7, r * 0.24);
    ctx.bezierCurveTo(r * 0.92, r * 0.06, r * 0.78, -r * 0.08, r * 0.48, -r * 0.04);
    ctx.bezierCurveTo(r * 0.12, -r * 0.02, -r * 0.2, -r * 0.06, -r * 0.45, r * 0.02);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = bodyLight;
    ctx.beginPath();
    ctx.ellipse(r * 0.15, -r * 0.18, r * 0.42, r * 0.16, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // fins
    ctx.fillStyle = bodyShadow;
    ctx.beginPath();
    ctx.moveTo(-r * 0.08, -r * 0.52);
    ctx.quadraticCurveTo(r * 0.08, -r * (0.98 + finWave * 0.02), r * 0.24, -r * 0.58 + finWave * 0.12);
    ctx.quadraticCurveTo(r * 0.1, -r * 0.58, -r * 0.08, -r * 0.52);
    ctx.closePath();
    if( preserveBaseColor ){
        ctx.fillStyle = baseFillStyle;
        ctx.fill();
    }
    ctx.fillStyle = bodyShadow;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-r * 0.1, r * 0.4);
    ctx.quadraticCurveTo(r * 0.12, r * 0.82 + finWave * 0.28, r * 0.2, r * 0.34 + finWave * 0.1);
    ctx.quadraticCurveTo(r * 0.02, r * 0.36, -r * 0.1, r * 0.4);
    ctx.closePath();
    if( preserveBaseColor ){
        ctx.fillStyle = baseFillStyle;
        ctx.fill();
    }
    ctx.fillStyle = bodyShadow;
    ctx.fill();

    ctx.fillStyle = finAccent;
    ctx.beginPath();
    ctx.moveTo(-r * 0.08, r * 0.18);
    ctx.quadraticCurveTo(r * 0.12, r * 0.52 + finWave * 0.3, r * 0.28, r * 0.16 + finWave * 0.08);
    ctx.quadraticCurveTo(r * 0.08, r * 0.06, -r * 0.08, r * 0.18);
    ctx.closePath();
    if( preserveBaseColor ){
        ctx.fillStyle = baseFillStyle;
        ctx.fill();
    }
    ctx.fillStyle = finAccent;
    ctx.fill();

    // gill line and eye socket shadow
    ctx.strokeStyle = bodyShadow;
    ctx.lineWidth = Math.max(1, r * 0.045);
    ctx.beginPath();
    ctx.arc(r * 0.44, -r * 0.02, r * 0.24, -0.8, 0.9);
    ctx.stroke();

    // ds:975ca168
    const mouthOpenRatio = Math.max(0, Math.min(1, mouthOpen));
    const mouthX = snoutX - r * 0.1;
    const mouthY = r * 0.03;
    const mouthWidth = r * (0.22 + mouthOpenRatio * 0.16);
    const mouthHeight = r * (0.45 + mouthOpenRatio * 0.8);
    const lipStroke = Math.max(1, r * 0.06);
    const showTeeth = mouthOpenRatio > 0 && mouthOpenRatio < (MOUTH.chaseOpenRatio + 0.05);

    if( mouthOpenRatio > 0 ){
        // @ia:9c0d1e2f
        ctx.fillStyle = '#0d0507';
        ctx.beginPath();
        ctx.moveTo(snoutX - mouthWidth * 0.1, mouthY - mouthHeight * 0.48);
        ctx.quadraticCurveTo(snoutX + mouthWidth * 0.3, mouthY, snoutX - mouthWidth * 0.1, mouthY + mouthHeight * 0.48);
        ctx.quadraticCurveTo(mouthX - mouthWidth * 0.35, mouthY + mouthHeight * 0.18, mouthX - mouthWidth * 0.35, mouthY - mouthHeight * 0.18);
        ctx.closePath();
        ctx.fill();

        if( showTeeth ){
            const topCount = 5;
            const bottomCount = 5;
            const topStart = mouthX - mouthWidth * 0.25;
            const topEnd = snoutX - mouthWidth * 0.12;
            const bottomStart = mouthX - mouthWidth * 0.24;
            const bottomEnd = snoutX - mouthWidth * 0.14;
            ctx.fillStyle = '#f7fbff';

            for( let i = 0; i < topCount; i++ ){
                const t = topCount === 1 ? 0.5 : i / (topCount - 1);
                const x = topStart + (topEnd - topStart) * t;
                const y = mouthY - mouthHeight * (0.26 + 0.03 * (i % 2));
                ctx.beginPath();
                ctx.moveTo(x - r * 0.03, y);
                ctx.lineTo(x + r * 0.002, y + r * 0.075);
                ctx.lineTo(x + r * 0.03, y);
                ctx.closePath();
                ctx.fill();
            }

            for( let i = 0; i < bottomCount; i++ ){
                const t = bottomCount === 1 ? 0.5 : i / (bottomCount - 1);
                const x = bottomStart + (bottomEnd - bottomStart) * t;
                const y = mouthY + mouthHeight * (0.24 + 0.03 * (i % 2));
                ctx.beginPath();
                ctx.moveTo(x - r * 0.03, y);
                ctx.lineTo(x + r * 0.002, y - r * 0.075);
                ctx.lineTo(x + r * 0.03, y);
                ctx.closePath();
                ctx.fill();
            }
        }
    }

    // visible mouth line: closed mouth line, or lip contour when open
    ctx.strokeStyle = lipColor;
    ctx.lineWidth = lipStroke;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if( mouthOpenRatio > 0 ){
        ctx.moveTo(snoutX - mouthWidth * 0.12, mouthY - mouthHeight * 0.5);
        ctx.quadraticCurveTo(mouthX - mouthWidth * 0.35, mouthY, snoutX - mouthWidth * 0.12, mouthY + mouthHeight * 0.5);
    }else{
        ctx.moveTo(snoutX - r * 0.18, mouthY);
        ctx.quadraticCurveTo(snoutX - r * 0.1, mouthY + r * 0.03, snoutX - r * 0.02, mouthY);
    }
    ctx.stroke();

    // ds:906be50b
    ctx.fillStyle = '#f4c41c';
    ctx.beginPath();
    ctx.arc(r * 0.42, -r * 0.18, Math.max(2, r * 0.15 * eyeScale), 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#04263b';
    ctx.beginPath();
    ctx.arc(r * 0.46, -r * 0.17, Math.max(1.5, r * 0.08 * eyeScale), 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(r * 0.49, -r * 0.2, Math.max(1, r * 0.03 * eyeScale), 0, Math.PI * 2);
    ctx.fill();

    // ds:bd354b7a
    ctx.fillStyle = bodyShadow;
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.quadraticCurveTo(-r * 1.18, -r * 0.7 + tailWave * 0.35, -r * 1.34, -r * 0.18 + tailWave);
    ctx.quadraticCurveTo(-r * 1.12, tailWave * 0.55, -r * 1.34, r * 0.18 + tailWave);
    ctx.quadraticCurveTo(-r * 1.18, r * 0.7 + tailWave * 0.35, tailX, tailY);
    ctx.closePath();
    if( preserveBaseColor ){
        ctx.fillStyle = baseFillStyle;
        ctx.fill();
    }
    ctx.fillStyle = bodyShadow;
    ctx.fill();

    ctx.restore();

    if( f.ownerKind === 'user' && f.userName ){
        ctx.save();
        ctx.fillStyle = '#edf8ff';
        ctx.font = `${Math.max(10, Math.min(16, f.radius * 0.42))}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(f.userName, f.pos.x, f.pos.y - f.radius * 1.35);
        ctx.restore();
    }
}
