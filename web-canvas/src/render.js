// imp/web-canvas/src/render.js
// Read-only over domain state (workspace.air rule: render never mutates domain).
// @ds 975ca168 bd354b7a 906be50b d6cebf86 b28b7af6 1f3abc43

import { BUBBLE, MOUTH, SWIM, FEAR_EYE } from './constants.js';

// @ia 3a4b5c6d
export function render(ctx, state){
    const { world, player, prey, bubbles } = state;

    // ds:d2e8a84c b28b7af6
    const g = ctx.createLinearGradient(0, 0, 0, world.height);
    g.addColorStop(0, '#0a3a57');
    g.addColorStop(1, '#04263b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, world.width, world.height);

    for( const bubble of bubbles ) drawBubble(ctx, bubble); // ds:d6cebf86

    for( const p of prey ) drawFish(ctx, p); // ds:1f3abc43
    drawFish(ctx, player); // ds:1f3abc43
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

    const bodyColor = f.isPlayer ? '#59bcd6' : `hsl(${f.hue}, 68%, 58%)`;
    const bodyShadow = f.isPlayer ? '#2f9dbf' : `hsl(${f.hue}, 58%, 46%)`;
    const bodyLight = f.isPlayer ? '#8ae1f4' : `hsl(${f.hue}, 78%, 70%)`;
    const snoutX = r * 1.06;
    const headX = r * 0.78;
    const tailX = -r * 0.88;
    const tailY = tailWave * 0.22;
    const bodyTop = -r * 0.62;
    const bodyBottom = r * 0.56;

    // body silhouette
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.bezierCurveTo(-r * 0.55, -r * 0.48, -r * 0.12, bodyTop, r * 0.38, bodyTop * 0.95);
    ctx.bezierCurveTo(r * 0.74, bodyTop * 0.86, snoutX, -r * 0.42, snoutX, -r * 0.03);
    ctx.bezierCurveTo(snoutX, r * 0.36, r * 0.68, bodyBottom, r * 0.28, bodyBottom * 0.95);
    ctx.bezierCurveTo(-r * 0.12, bodyBottom, -r * 0.5, r * 0.42, tailX, tailY);
    ctx.closePath();
    ctx.fill();

    // underbelly shadow and back highlight for depth
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
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-r * 0.1, r * 0.4);
    ctx.quadraticCurveTo(r * 0.12, r * 0.82 + finWave * 0.28, r * 0.2, r * 0.34 + finWave * 0.1);
    ctx.quadraticCurveTo(r * 0.02, r * 0.36, -r * 0.1, r * 0.4);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = f.isPlayer ? '#6ed7ef' : `hsl(${f.hue}, 66%, 64%)`;
    ctx.beginPath();
    ctx.moveTo(-r * 0.08, r * 0.18);
    ctx.quadraticCurveTo(r * 0.12, r * 0.52 + finWave * 0.3, r * 0.28, r * 0.16 + finWave * 0.08);
    ctx.quadraticCurveTo(r * 0.08, r * 0.06, -r * 0.08, r * 0.18);
    ctx.closePath();
    ctx.fill();

        // ds:bd354b7a
    ctx.fillStyle = bodyShadow;
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.quadraticCurveTo(-r * 1.18, -r * 0.7 + tailWave * 0.35, -r * 1.34, -r * 0.18 + tailWave);
    ctx.quadraticCurveTo(-r * 1.12, tailWave * 0.55, -r * 1.34, r * 0.18 + tailWave);
    ctx.quadraticCurveTo(-r * 1.18, r * 0.7 + tailWave * 0.35, tailX, tailY);
    ctx.closePath();
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
    const showTeeth = mouthOpenRatio > 0.04;

    if( mouthOpenRatio > 0 ){

        // dark open mouth cavity placed on the snout contour
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
    ctx.strokeStyle = f.isPlayer ? '#2a8fb0' : `hsl(${f.hue}, 58%, 36%)`;
    ctx.lineWidth = lipStroke;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if( mouthOpenRatio > 0 ){
        ctx.moveTo(snoutX - mouthWidth * 0.12, mouthY - mouthHeight * 0.5);
        ctx.quadraticCurveTo(mouthX - mouthWidth * 0.35, mouthY, snoutX - mouthWidth * 0.12, mouthY + mouthHeight * 0.5);
    }else{
        ctx.moveTo(snoutX - r * 0.1, mouthY - r * 0.08);
        ctx.quadraticCurveTo(snoutX - r * 0.28, mouthY + r * 0.02, snoutX - r * 0.06, mouthY + r * 0.13);
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

    ctx.restore();
}
