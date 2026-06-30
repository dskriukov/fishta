// imp/web-canvas/src/constants.js
// Tunables. Each value is traceable back to an .air interpretation id.
// Editing these is "implementation tuning"; editing behaviour means editing sense/*.ds.
// @ds b28b7af6 ca07d970 c83f4c1e d6cebf86 cbc1225a 7ce238da 8869f043 f51831f5 d867989f 975ca168 bd354b7a 906be50b 55c13a4f 10baf178 22fd3ab4 31cb7a0d 579e4888 e6ecfbdd 1e66d817 a3e394a8 98224ab9 e9fb3705

export const WORLD = {
    // size set at runtime to canvas size — world.air#ia:world.fit-to-screen, ds:b28b7af6 ds:c83f4c1e
    drag: 1.6,              // linear damping per second — world.air#ia:world.drag.linear, ds:ca07d970
};

export const FISH = {
    baseRadius: 16,         // px; radius = baseRadius * sqrt(size) — fish.air#ia:fish.radius-formula, ds:cbc1225a
    baseSpeed: 320,         // px/s — fish.air#ia:fish.speed-formula, ds:7ce238da
    speedDecay: 0.04,       // maxSpeed shrinks with size — fish.air#ia:fish.speed-formula, ds:8869f043
    speedFloor: 0.6,        // never slower than 60% — fish.air#ia:fish.speed-formula, ds:8869f043
    accel: 1400,            // px/s^2 steering force — ds:55c13a4f ds:10baf178 ds:7ce238da
    facingThreshold: 8,     // velocity.x deadzone to avoid flip jitter — fish.air#ia:fish.facing-threshold, ds:8d0ca6a8
};

export const REGIME = {
    cruiseFactor: 0.55,     // cruiseSpeed = 0.55 * maxSpeed — fish.air#ia:fish.regime.cruise-factor, ds:8869f043
};

export const GROWTH = {
    k: 0.6,                 // gain = preySize * k / (1 + size*decay) — fish.air#ia:fish.growth-formula, ds:d867989f
    decay: 0.35,
};

export const ENERGY = {
    lossPerRef: 0.01,       // -1% size per reference distance — ds:f51831f5
    refSizes: 10,           // reference distance = refSizes * size ("10 размеров")
    minSize: 0.2,           // size floor so radius>0 & predation stays defined — ia:fish.energy.burst-only
};

export const PREDATION = {
    eatRatio: 1.15,         // predator.size > prey.size * eatRatio — predation.dsc, ds:98224ab9
};

export const PREY = {
    target: 18,             // desired population — prey.dsc maintainPopulation, ds:e6ecfbdd
    minSize: 0.3,           // prey.variety range (biased to small) — ds:1e66d817
    maxSize: 1.4,
    smallBias: 2.0,         // exponent biasing spawns toward small — ds:1e66d817
    wanderAccel: 240,       // gentler than player — prey.dsc wander, ds:31cb7a0d
    wanderTurn: 0.9,        // chance/s to pick a new heading — ds:31cb7a0d
    fleeAccel: 760,         // stronger close-range escape — ds:579e4888 ds:e6ecfbdd
    fleeRadius: 240,        // wider threat awareness before contact pressure — ds:579e4888 ds:e6ecfbdd
    speedMargin: 35,        // px/s surplus before skipping burst — @ia:5f6a7b8c
    spawnMargin: 20,        // px beyond edge before new prey enters view — prey.air#ia:prey.spawn-from-edge, ds:e6ecfbdd
    spawnGrace: 0.75,       // s without world clamp after spawning — prey.air#ia:prey.spawn-from-edge, ds:e6ecfbdd
    maxSpeed: 170,          // caps prey speed — ds:579e4888 ds:31cb7a0d
};

export const BUBBLE = {
    maxRatio: 0.08,         // bubble radius target = fish.radius * maxRatio — world.air#ia:world.bubble.radius-formula, ds:d6cebf86
    displayScale: 1,        // visual size follows fish size directly — ds:d6cebf86
    minRadius: 1.1,         // px minimum — readable but still delicate bubbles — ds:d6cebf86
    baseInterval: 0.8,      // seconds between emissions — world.air#ia:world.bubble.animation, ds:d6cebf86
    intervalJitter: 0.8,    // added random delay — world.air#ia:world.bubble.animation, ds:d6cebf86
    life: 1.6,              // seconds to fade out — world.air#ia:world.bubble.animation, ds:d6cebf86
    riseSpeed: 18,          // px/s upward drift — world.air#ia:world.bubble.animation, ds:d6cebf86
    drift: 8,               // px/s sideways wobble — world.air#ia:world.bubble.animation, ds:d6cebf86
    burstMinCount: 2,       // minimum bubbles per burst — world.air#ia:world.bubble.burst-sequence, ds:d6cebf86
    burstMaxCount: 5,       // maximum bubbles per burst — world.air#ia:world.bubble.burst-sequence, ds:d6cebf86
    gapMinPx: 2,            // minimum spacing between bubbles — world.air#ia:world.bubble.burst-sequence, ds:d6cebf86
    gapMaxRatio: 1,         // spacing stays within one average bubble size — world.air#ia:world.bubble.burst-sequence, ds:d6cebf86
    pulseStep: 0.12,        // seconds between circle/oval toggles — ds:d6cebf86
    pulseSquash: 0.92,      // vertical scale when oval is shown — ds:d6cebf86
    fillAlpha: 0.1,         // near-invisible filled bubble — ds:d6cebf86
};

export const MOUTH = {
    chaseOpenRatio: 0.22,   // slight open while thrusting in burst — fish.air#ia:fish.decor.mouth-state, ds:975ca168
    holdDuration: 0.4,      // seconds to keep post-eat open state — fish.air#ia:fish.decor.mouth-state, ds:975ca168
};

export const SWIM = {
    basePhaseRate: 4.5,     // radians/s idle swim motion — fish.air#ia:fish.decor.swim-state, ds:bd354b7a
    speedPhaseRate: 0.045,  // extra radians/s per px/s — fish.air#ia:fish.decor.swim-state, ds:bd354b7a
    tailBaseSwing: 0.18,    // calm tail swing in radii — fish.air#ia:fish.decor.swim-state, ds:bd354b7a
    tailBurstSwing: 0.28,   // additional burst swing in radii — fish.air#ia:fish.decor.swim-state, ds:bd354b7a
    finBaseSwing: 0.12,     // calm fin swing in radii — fish.air#ia:fish.decor.swim-state, ds:bd354b7a
    finBurstSwing: 0.18,    // additional burst fin swing in radii — fish.air#ia:fish.decor.swim-state, ds:bd354b7a
    kickDecay: 4.5,         // seconds^-1 decay after burst start — fish.air#ia:fish.decor.swim-state, ds:bd354b7a
};

export const FEAR_EYE = {
    maxScale: 1.35,         // eye grows modestly while fleeing — fish.air#ia:fish.decor.fear-eye-state, ds:906be50b
    riseRate: 7,            // seconds^-1 toward fear — fish.air#ia:fish.decor.fear-eye-state, ds:906be50b
    decayRate: 4,           // seconds^-1 back to normal — fish.air#ia:fish.decor.fear-eye-state, ds:906be50b
};

export const EXHALE = {
    inhaleScale: 1.1,       // fn:exhale inhale visual target
    inhaleDuration: 0.18,   // seconds
    emitInterval: 0.05,      // fn:a9a3ed12, seconds between sequential exhale bubbles
    emitMinCount: 9,         // fn:a9a3ed12
    emitMaxCount: 16,        // fn:a9a3ed12
    influenceRadiusSizes: 1,
    bubbleDisplaceSpeed: 36,
};

export const LOOP = {
    maxDt: 1 / 30,          // clamp dt — dsr/use/ecs-loop.dsr
};
