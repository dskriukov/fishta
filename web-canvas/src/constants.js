// imp/web-canvas/src/constants.js
// Tunables. Each value is traceable back to an .air interpretation id.
// Editing these is "implementation tuning"; editing behaviour means editing sense/*.ds.
// @ds b28b7af6 ca07d970 c83f4c1e d6cebf86 cbc1225a 7ce238da 8869f043 f51831f5 6aa7c828 d867989f 975ca168 bd354b7a 906be50b 55c13a4f 10baf178 22fd3ab4 31cb7a0d 579e4888 e6ecfbdd 1e66d817 a3e394a8 98224ab9 e9fb3705 39305789 8f2c91ad 92d5b0c1 7cb92a44 4f58a1cd c6d7e8f9 e13d7a52 7c2f91ad 918d4b63 0b8e71d4 f0a6c5d8 c14f7a08 b6f08d21 73b91e4c 5a9c0e77 ed2b4f19

export const WORLD = {
    // size set at runtime to canvas size — world.air#ia:5a6b7c8d, ds:b28b7af6 ds:c83f4c1e
    drag: 1.6,              // linear damping per second — world.air#ia:1c2d3e4f, ds:ca07d970
    sizeDrag: 0.18,         // @ds:ca07d970 @ds:8869f043
    initialWidth: 1800,      // @ds:19c14fea
    initialHeight: 1200,     // @ds:19c14fea
    initialViewportScale: 1.5, // @ds:19c14fea
    resizeHysteresisUsers: 1,  // @ds:19c14fea
    npcDensity: 0.00002,    // @ds:53db39eb 0.000006
    maxControlledObjects: 900, // @ds:eccfca7e
    oldAgeSuspendFillRatio: 0.9, // @ds:d140effd
    densitySamples: 18,      // @ds:53db39eb
};

export const FISH = {
    baseRadius: 16,         // px; radius = baseRadius * sqrt(size) — fish.air#ia:1e2f3a4b, ds:cbc1225a
    baseSpeed: 320,         // px/s — fish.air#ia:3e4f5a6b, ds:7ce238da
    speedDecay: 0.08,       // maxSpeed shrinks with size — fish.air#ia:3e4f5a6b, ds:8869f043
    speedFloor: 0.35,       // lower bound — fish.air#ia:3e4f5a6b, ds:8869f043
    minBurstSpeed: 220,     // > PREY.maxSpeed + PREY.speedMargin; user hunt floor — @ds:8869f043 @ds:d4f6a1c2
    accel: 1400,            // px/s^2 steering force — ds:55c13a4f ds:10baf178 ds:7ce238da
    facingThreshold: 8,     // velocity.x deadzone to avoid flip jitter — fish.air#ia:9a0b1c2d, ds:8d0ca6a8
};

export const PLAYER = {
    startSize: 1,           // player respawns at the same size used on initial spawn — ds:39305789
};

export const SERVER = {
    tickRate: 30,           // @ds:e4d375ed
    port: 8787,             // local server default — @ds:f359ebf2
};

export const SYNC = {
    snapshotHz: 10,         // @ds:e559831a
    maxExtrapolationMs: 180, // @ds:e559831a @ds:7b9a7984
};

export const DEBUG = {
    traceVisibleMs: 3000,   // @ds:727e9afe
    traceFadeMs: 700,       // @ds:727e9afe
    traceSampleMs: 150,     // @ds:727e9afe
    relativeTraceColor: '#ffe45c', // @ds:727e9afe
    absoluteTraceColor: '#5cff9d', // @ds:727e9afe
    minimapSizePx: 200,     // @ds:8f2c91ad
    minimapNpcPointPx: 1,   // @ds:8f2c91ad
    minimapUserPointPx: 3,  // @ds:8f2c91ad
    minimapCurrentUserPointPx: 5, // @ds:8f2c91ad
    minimapLeftPx: 12,      // @ds:8f2c91ad
    minimapTopPx: 56,       // @ds:8f2c91ad
};

export const SIZE_DELTA_LABEL = {
    step: 0.1,              // @ds:c2d7f4a1
    lifeSeconds: 1.05,      // @ds:c2d7f4a1
    risePx: 34,             // @ds:c2d7f4a1
    gapPx: 12,              // @ds:c2d7f4a1
    gainColor: '#64e878',   // @ds:c2d7f4a1
    lossColor: '#ff6b6b',   // @ds:c2d7f4a1
};

export const RECONNECT = {
    graceSeconds: 3,        // @ds:93a64773
};

export const LEAVE = {
    attackWindowSeconds: 2, // @ds:8917ad63
};

export const REGIME = {
    cruiseFactor: 0.55,     // cruiseSpeed = 0.55 * maxSpeed — fish.air#ia:5e6f7a8b, ds:8869f043
};

export const GROWTH = {
    fishAreaGainRatio: 0.7, // add 70% of eaten fish canonical area — @ds:d867989f @ds:b024b514
};

export const ENERGY = {
    lossPerRef: 0.01,       // -1% size per reference distance — ds:f51831f5
    refSizes: 100,          // reference distance = refSizes * size ("100 размеров")
    minSize: 0.2,           // size floor so radius>0 & predation stays defined — ia:7c8d9e0f
    userMinSize: 0.36,      // > PREY.minSize * PREDATION.eatRatio (0.3 * 1.15) — @ds:6aa7c828
};

export const PREDATION = {
    eatRatio: 1.15,         // predator.size > prey.size * eatRatio — predation.dsc, ds:98224ab9
    attackReachRatio: 0.38, // forward burst tolerance in combined radii — @ds:a3e394a8 @ds:98224ab9
    attackConeDotMin: 0.55, // @ds:b39c93a5
    feedingCooldownSeconds: 0.05, // @ds:a8f03d2e @ds:4e2a91f0
    feedingRecoverySeconds: 1,    // @ds:4e2a91f0 @ds:6c80e3b4
    fishFeedingSuccessDecayFactor: 0.75, // @ds:4e2a91f0 @ds:6c80e3b4
    shredFeedingSuccessDecayFactor: 0.9, // @ds:4e2a91f0 @ds:6c80e3b4
    shredStartSuccessFactor: 0.8, // @ds:6c80e3b4
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
    spawnMargin: 20,        // px beyond edge before new prey enters view — prey.air#ia:3b4c5d6e, ds:e6ecfbdd
    spawnGrace: 0.75,       // s without world clamp after spawning — prey.air#ia:3b4c5d6e, ds:e6ecfbdd
    maxSpeed: 170,          // caps prey speed — ds:579e4888 ds:31cb7a0d
};

export const FRY = {
    startSize: 0.18,        // @ds:e6ecfbdd
    growthSeconds: 10,      // @ds:e6ecfbdd
};

export const NPC = {
    courageBase: 50,        // @ds:e29aeb93
    courageJitter: 10,      // @ds:e29aeb93
    courageRandomEvery: 10, // @ds:e29aeb93
    threatSenseRadius: 520, // @ds:92d5b0c1 @ia:8a4b2f19
    dangerDirectionSamples: 24, // @ds:4f58a1cd @ia:8a4b2f19
    huntDangerCorrectionDeg: 20, // @ds:7cb92a44 @ia:8a4b2f19
    dangerProjectionDistancePx: 190, // @ds:92d5b0c1 @ia:8a4b2f19
    dangerRadiusWeight: 1.15, // @ds:92d5b0c1 @ia:8a4b2f19
    dangerContactWeight: 1.8, // @ds:92d5b0c1 @ia:8a4b2f19
    dangerAttackReachWeight: 1.2, // @ds:92d5b0c1 @ia:8a4b2f19
    decisionIntervalSeconds: 0.18, // @ds:c6d7e8f9 @ia:8a4b2f19
    maxTurnRateDegPerSecond: 220, // @ds:c6d7e8f9 @ia:8a4b2f19
    accelResponsePerSecond: 7, // @ds:c6d7e8f9 @ia:8a4b2f19
    maxLifetimeSeconds: 300, // @ds:a6c9e8b4
};

export const SHRED = {
    areaRatio: 0.5,         // @ds:e13d7a52
    nutritionMultiplier: 1.05, // @ds:0b8e71d4 @ds:f0a6c5d8
    minSize: FISH.baseRadius * Math.sqrt(PREY.minSize) * 0.45, // @ds:7c2f91ad
    maxSize: FISH.baseRadius * Math.sqrt(PREY.minSize) * 1.8, // @ds:7c2f91ad
    fragmentation: 0.58,    // @ds:7c2f91ad @ds:5a9c0e77
    sizeJitter: 0.34,       // @ds:7c2f91ad @ds:5a9c0e77
    eatSizeRatio: 1.08,     // @ds:c14f7a08
    minFeedingSpeed: 18,    // @ds:c14f7a08
    mouthCueSeconds: 0.3,   // @ds:a2d5936f
    decayIntervalSeconds: 10, // @ds:d3187816 @ds:5a9c0e77
    scatterRadiusRatio: 0.82, // @ds:918d4b63
    initialSpeedMin: 18,    // @ds:918d4b63
    initialSpeedMax: 70,    // @ds:918d4b63
    dragMin: 0.55,          // @ds:8b62d9ce
    dragMax: 1.1,           // @ds:8b62d9ce
    restSpeed: 0.35,        // @ds:8b62d9ce
    wakeRadiusRatio: 4.8,   // @ds:8b62d9ce @ds:ed2b4f19
    wakeStrength: 0.85,     // @ds:8b62d9ce @ds:ed2b4f19
    wakeMinFishSpeed: 18,   // @ds:8b62d9ce @ds:ed2b4f19
    layerFractions: {
        part_30_percents: 0.3,
        part_30_percents_main_color: 0.3,
        part_20_percents: 0.2,
        part_10_percents_1: 0.1,
        part_10_percents_2: 0.1,
    },
    layerOrder: [
        ['part_30_percents'],
        ['part_30_percents_main_color'],
        ['part_20_percents'],
        ['part_10_percents_1', 'part_10_percents_2'],
    ],
    colorFactorMin: 0.3,    // @ds:b6f08d21
    colorFactorMaxDifferent: 0.7, // @ds:b6f08d21
    hueWeight: 0.75,        // @ds:b6f08d21
    saturationWeight: 0.25, // @ds:b6f08d21
    layerRotationMinDeg: 3, // @ds:73b91e4c
    layerRotationMaxDeg: 5, // @ds:73b91e4c
    layerDriftPx: 1.2,      // @ds:73b91e4c
};

export const BUBBLE = {
    maxRatio: 0.08,         // bubble radius target = fish.radius * maxRatio — world.air#ia:9e0f1a2b, ds:d6cebf86
    displayScale: 1,        // visual size follows fish size directly — ds:d6cebf86
    minRadius: 1.1,         // px minimum — readable but still delicate bubbles — ds:d6cebf86
    baseInterval: 0.8,      // seconds between emissions — world.air#ia:3c4d5e6f, ds:d6cebf86
    intervalJitter: 0.8,    // added random delay — world.air#ia:3c4d5e6f, ds:d6cebf86
    life: 1.6,              // seconds to fade out — world.air#ia:3c4d5e6f, ds:d6cebf86
    birthDuration: 0.22,    // seconds to grow alpha/radius from zero — ds:d6cebf86
    riseSpeed: 18,          // px/s upward drift — world.air#ia:3c4d5e6f, ds:d6cebf86
    drift: 8,               // px/s sideways wobble — world.air#ia:3c4d5e6f, ds:d6cebf86
    burstMinCount: 2,       // minimum bubbles per burst — world.air#ia:7a8b9c0d, ds:d6cebf86
    burstMaxCount: 5,       // maximum bubbles per burst — world.air#ia:7a8b9c0d, ds:d6cebf86
    gapMinPx: 2,            // minimum spacing between bubbles — world.air#ia:7a8b9c0d, ds:d6cebf86
    gapMaxRatio: 1,         // spacing stays within one average bubble size — world.air#ia:7a8b9c0d, ds:d6cebf86
    pulseStep: 0.12,        // seconds between circle/oval toggles — ds:d6cebf86
    pulseSquash: 0.92,      // vertical scale when oval is shown — ds:d6cebf86
    fillAlpha: 0.1,         // near-invisible filled bubble — ds:d6cebf86
};

export const MOUTH = {
    chaseOpenRatio: 0.22,   // slight open while thrusting in burst — fish.air#ia:9c0d1e2f, ds:975ca168
    holdDuration: 0.4,      // seconds to keep post-eat open state — fish.air#ia:9c0d1e2f, ds:975ca168
    eatingCruiseHoldSeconds: 0.3, // @ds:975ca168
};

export const SWIM = {
    basePhaseRate: 4.5,     // radians/s idle swim motion — fish.air#ia:3a4b5c6e, ds:bd354b7a
    speedPhaseRate: 0.045,  // extra radians/s per px/s — fish.air#ia:3a4b5c6e, ds:bd354b7a
    tailBaseSwing: 0.18,    // calm tail swing in radii — fish.air#ia:3a4b5c6e, ds:bd354b7a
    tailBurstSwing: 0.28,   // additional burst swing in radii — fish.air#ia:3a4b5c6e, ds:bd354b7a
    finBaseSwing: 0.12,     // calm fin swing in radii — fish.air#ia:3a4b5c6e, ds:bd354b7a
    finBurstSwing: 0.18,    // additional burst fin swing in radii — fish.air#ia:3a4b5c6e, ds:bd354b7a
    kickDecay: 4.5,         // seconds^-1 decay after burst start — fish.air#ia:3a4b5c6e, ds:bd354b7a
};

export const FEAR_EYE = {
    maxScale: 1.35,         // eye grows modestly while fleeing — fish.air#ia:7d8e9f0a, ds:906be50b
    riseRate: 7,            // seconds^-1 toward fear — fish.air#ia:7d8e9f0a, ds:906be50b
    decayRate: 4,           // seconds^-1 back to normal — fish.air#ia:7d8e9f0a, ds:906be50b
};

export const EXHALE = {
    inhaleScale: 1.1,       // fn:a9a3ed12 inhale visual target
    inhaleDuration: 0.18,   // seconds
    emitInterval: 0.05,      // fn:a9a3ed12, seconds between sequential exhale bubbles
    emitMinCount: 9,         // fn:a9a3ed12
    emitMaxCount: 16,        // fn:a9a3ed12
    eatingRedBubbleRatio: 0.4, // @ds:a44b9d2c
    influenceRadiusSizes: 1,
    bubbleDisplaceSpeed: 36,
};

export const LOOP = {
    maxDt: 1 / 30,          // clamp dt — dsr/use/ecs-loop.dsr
};
