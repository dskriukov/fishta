// imp/web-canvas/src/constants.js
// Tunables. Each value is traceable back to an .air interpretation id.
// Editing these is "implementation tuning"; editing behaviour means editing sense/*.ds.
// @ds b28b7af6 ca07d970 c83f4c1e d6cebf86 2b3e71e0 a43de7ec cbc1225a 7ce238da 8869f043 07320d39 f51831f5 6aa7c828 d867989f 975ca168 bd354b7a 906be50b 55c13a4f 10baf178 22fd3ab4 e6be3c03 0eef2d19 e001d967 31cb7a0d 579e4888 703efd43 e6ecfbdd 1e66d817 a3e394a8 98224ab9 e9fb3705 39305789 4c7a2b91 9d62f0a7 b7a4c391 2e91f6d4 8f2c91ad 92d5b0c1 7cb92a44 4f58a1cd c6d7e8f9 e13d7a52 7c2f91ad 918d4b63 0b8e71d4 f0a6c5d8 c14f7a08 b6f08d21 73b91e4c 5a9c0e77 31a8f5c2 ed2b4f19
// @ia 3983084a
// @fix 4bbc0692

export const WORLD = {
    // size set at runtime to canvas size — world.air#ia:5a6b7c8d, ds:b28b7af6 ds:c83f4c1e
    drag: 1.2,              // linear damping per second — world.air#ia:1c2d3e4f, ds:ca07d970
    sizeDrag: 0.18,         // @ds:ca07d970 @ds:8869f043
    initialWidth: 700,       // @ds:10dc892b
    initialHeight: 700,      // @ds:10dc892b
    cellSize: 100,           // @ds:10dc892b
    pixelsPerWorldUnit: 4, // @ds:10dc892b
    userAreaSideDiameters: 10, // @ds:8b998807
    initialViewportScale: 1.5,
    npcDensity: 0.000005,    // @ds:53db39eb 0.000006
    maxControlledObjects: 200, // @ds:eccfca7e
    oldAgeSuspendFillRatio: 0.9, // @ds:d140effd
    densitySamples: 18,      // @ds:53db39eb
};

export const BACKGROUND = {
    parallaxFactor: 0.2,    // @ds:2b3e71e0
    tileWidthPx: 1536,      // @ds:2b3e71e0
    tileHeightPx: 1024,     // @ds:2b3e71e0
    alpha: 0.22,            // @ds:2b3e71e0
    hazeTopAlpha: 0.16,     // @ds:a43de7ec
    hazeBottomAlpha: 0.26,  // @ds:a43de7ec
};

export const FISH = {
    nominalStartDiameter: 16, // normalized world units; size=1 user diameter
    baseNoDragSpeed: 280,   // px/s before size water-drag penalty — fish.air#ia:3e4f5a6b, ds:8869f043
    waterDragByLinearSize: 0.45, // size is area; drag grows with sqrt(size) — @ds:8869f043
    minLinearSpeedSize: 0.6, // prevents tiny fish from gaining unbounded speed — @ds:8869f043
    minBurstSpeed: 220,     // user hunt floor above the NPC burst-speed envelope — @ds:8869f043 @ds:d4f6a1c2
    npcSpeedFactor: 0.6,    // NPC maximum speed multiplier — @ds:8869f043
    accel: 500,            // px/s^2 steering force — ds:55c13a4f ds:10baf178 ds:7ce238da
    facingThreshold: 8,     // velocity.x deadzone to avoid flip jitter — fish.air#ia:9a0b1c2d, ds:8d0ca6a8
    visualMaxTiltDeg: 20,    // @fix:6e2a9c41
};

export const PLAYER = {
    startSize: 1,           // player nominal start size after fry growth — @ds:4c7a2b91 @ds:39305789
    fryStartSize: 0.03,     // practically a point, still visible — @ds:4c7a2b91
    fryGrowthSeconds: 3,    // @ds:4c7a2b91 @ds:9d62f0a7 @ds:b7a4c391
    lifetimeStartSize: 5,   // active lifetime starts when user fish reaches this size — @fix:c4e8a1b7
    lowSizeMaxLifetimeSeconds: 60, // low-size recovery lifetime — @fix:de7b4c19
    maxLifetimeSeconds: 120, // longer than NPC lifetime — @ds:b7a4c391
};

export const VIEWPORT_FISH_CAPACITY = {
    options: ['5', '10', '30', 'max'], // @ds:e001d967
    defaultValue: '10',                // @ds:e001d967
};

export const JOYSTICK = {
    edgeInsetKnobRatio: 0.7, // additional safe inset from viewport edge, relative to knob size — @fix:f1c6a8d4
};

export const SERVER = {
    tickRate: 30,           // @ds:e4d375ed
    controlTimeoutMs: 1500, // @ds:multiplayer.control-heartbeat
    port: 8787,             // local server default — @ds:f359ebf2
    performanceStatisticsIntervalMs: 5000, // @ds:61245206
};

// @ds c94d2a8f 9a6e4c31 d9a4c82e
export const PERCEPTION = {
    segmentGameSide: 100,
    dangerRasterThreshold: 10,
    dangerStampRadiusFactor: 1.5, // @fix:3a7c9e21
    dangerRasterMotionTicks: 3, // current tick plus two extrapolated ticks — @fix:7f3c9a21
};

export const SYNC = {
    snapshotHz: 10,         // @ds:e559831a
    deliveryBudgetMs: 2,    // @fix:7c4d2e91 @fix:91ab6e30
    maxSocketBufferedBytes: 256 * 1024, // @fix:91ab6e30
    maxExtrapolationMs: 180, // @ds:e559831a @ds:7b9a7984
    cellSize: WORLD.cellSize, // @ds:c39827ed @ds:10dc892b
    nearestAbsoluteCells: 4, // @ds:c39827ed
    globalAbsoluteEvery: 20, // @ds:682570c7
    newObjectAbsoluteCycles: 10, // @ds:6c8c56e7
    temporaryFadeSeconds: 0.2, // @ds:8c663384
    removalFadeSeconds: 0.1, // @ds:8c663384
    renderSmoothingRate: 32, // seconds^-1; short client-side convergence at sync boundaries — @fix:b3d7e9a2
};

export const DEBUG = {
    traceVisibleMs: 3000,   // @ds:727e9afe
    traceFadeMs: 700,       // @ds:727e9afe
    traceSampleMs: 150,     // @ds:727e9afe
    cellSyncWindowCycles: 10, // @ds:8f2c91ad
    relativeTraceColor: '#ffe45c', // @ds:727e9afe
    absoluteTraceColor: '#5cff9d', // @ds:727e9afe
    receivedQuadrantFadeMs: 200, // @ds:727e9afe
    receivedQuadrantColor: '#3f8cff', // @ds:727e9afe
};

export const WORLD_MAP = {
    sizePx: 200,            // @ds:3a980720 @ds:8f2c91ad
    leftPx: 12,             // @ds:3a980720
    overlayGapPx: 12,       // @ds:3a980720
};

export const DANGER_MAP = {
    bitmapAlpha: 0.42, // @fix:b5c7d9e1
    gridAlpha: 0.72,   // @fix:b5c7d9e1
};

export const FLOW_MAP = {
    bitmapAlpha: 0.97, // @fix:6a7b8c9d
    vectorStrideCells: 3, // @fix:5f2a8c71
    vectorCrossSizeRatio: 0.4, // @fix:5f2a8c71
    vectorLengthScale: 0.08, // @fix:5f2a8c71
    vectorMaxLength: 18, // @fix:5f2a8c71
    vectorLineWidth: 7.2, // @fix:5f2a8c71
    vectorCrossLineWidth: 1.2, // @fix:5f2a8c71
    vectorCrossAlpha: 0.24, // @fix:5f2a8c71
    vectorAlpha: 0.7, // @fix:5f2a8c71
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
    cruiseFactor: 0.7,      // joystick/touch cruise speed = maxSpeed * v/100 * factor
    keyboardCruiseSpeed: 36, // px/s at v30 for keyboard movement, capped by maxSpeedOf(size)
    speedLevels: 99,        // relative speed scale v1..v99 — @ds:8869f043 @ds:07320d39
    cruiseMaxSpeedLevel: 30, // v1..v30 are cruise speed levels — @ds:8869f043
    burstStartSpeedLevel: 31, // v31 is the first burst speed — @ds:8869f043
    enduranceReserveSeconds: 5, // @ds:07320d39
    enduranceSimulationStepSeconds: 0.1, // @ds:07320d39
    npcMaxBurstLevel: 79,   // NPC target burst percent cap — @ds:703efd43
};

export const GROWTH = {
    fishAreaGainRatio: 0.7, // add 70% of eaten fish canonical area — @ds:d867989f @ds:b024b514
};

export const ENERGY = {
    lossPerRef: 0.009,      // -0.9% size per reference distance in burst — @fix:8c4f2a71
    refSizes: 100,          // reference distance = refSizes * size ("100 размеров")
    minSize: 0.2,           // size floor so radius>0 & predation stays defined — ia:7c8d9e0f
    userMinSize: 0.36,      // > PREY.minSize * PREDATION.eatRatio (0.3 * 1.15) — @ds:6aa7c828
    burstExtraSpendFactor: 20, // v31 x1, v99 x21 — @ds:f51831f5
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
    wanderAccel: 70,       // gentler than player — prey.dsc wander, ds:31cb7a0d
    wanderTurn: 0.9,        // chance/s to pick a new heading — ds:31cb7a0d
    fleeAccel: 360,         // stronger close-range escape — ds:579e4888 ds:e6ecfbdd
    fleeRadius: 190,        // wider threat awareness before contact pressure — ds:579e4888 ds:e6ecfbdd
    speedMargin: 30,        // px/s surplus before skipping burst — @ia:5f6a7b8c
    spawnMargin: 20,        // px beyond edge before new prey enters view — prey.air#ia:3b4c5d6e, ds:e6ecfbdd
    spawnGrace: 0.75,       // s without world clamp after spawning — prey.air#ia:3b4c5d6e, ds:e6ecfbdd
    maxSpeed: 90,          // caps prey speed — ds:579e4888 ds:31cb7a0d
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
    dangerPredictionSeconds: 0.32, // @fix:5e1a7c42
    dangerPredictionSamples: 1, // current position plus one extrapolated position — @fix:5e1a7c42
    dangerRadiusWeight: 1.15, // @ds:92d5b0c1 @ia:8a4b2f19
    dangerContactWeight: 1.8, // @ds:92d5b0c1 @ia:8a4b2f19
    dangerAttackReachWeight: 1.2, // @ds:92d5b0c1 @ia:8a4b2f19
    decisionIntervalSeconds: 0.18, // @ds:c6d7e8f9 @ia:8a4b2f19
    maxTurnRateDegPerSecond: 220, // @ds:c6d7e8f9 @ia:8a4b2f19
    accelResponsePerSecond: 7, // @ds:c6d7e8f9 @ia:8a4b2f19
    fleeBurstLevelStep: 8, // fear raises burst level per fresh danger decision — @ds:7d9f5b31 @ia:6c5e4b2a
    fleeBurstRecoveryPerSecond: 18, // burst level recovery after immediate danger — @ds:4e7a9c2d @ia:5b8d1f6a
    fleeAccelFearFactor: 0.18, // small fear-dependent acceleration variation — @ds:c6d7e8f9 @ia:5b8d1f6a
    fleeAccelMax: 480, // smooth physical acceleration ceiling — @ds:7d9f5b31 @ia:6c5e4b2a
    huntInertiaLeadSeconds: 0.42, // @fix:9d4e7b21
    huntApproachSpeed: 38, // px/s contact speed floor for braking strategy — @fix:9d4e7b21
    foodClusterRadius: 80, // @ds:9b4e6d7f @ia:7a6b5c4d
    foodProfitMargin: 1.1, // @ds:8f1a2c3d @ia:7a6b5c4d
    foodFishSuccessFactor: 0.75, // @ds:8f1a2c3d @ia:7a6b5c4d
    fleeFearRecoverySeconds: 1.2, // @ds:4e7a9c2d @ia:5b8d1f6a
    fleeFearReleaseDistance: 260, // @ds:4e7a9c2d @ia:5b8d1f6a
    fleeFearMinAccelFactor: 0.82, // bounded acceleration variation during fear recovery — @ds:4e7a9c2d @ia:5b8d1f6a
    maxLifetimeSeconds: 20, // @ds:a6c9e8b4
};

export const SHRED = {
    areaRatio: 0.5,         // @ds:e13d7a52
    nutritionMultiplier: 1.05, // @ds:0b8e71d4 @ds:f0a6c5d8
    minDiameterRatio: 0.2, // fraction of the nominal start-fish diameter — @ds:7c2f91ad
    maxDiameterRatio: 0.6, // fraction of the nominal start-fish diameter — @ds:7c2f91ad
    fragmentation: 0.72,    // @ds:7c2f91ad @ds:5a9c0e77
    sizeJitter: 0.34,       // @ds:7c2f91ad @ds:5a9c0e77
    eatSizeRatio: 1.08,     // @ds:c14f7a08
    minFeedingSpeed: 18,    // @ds:c14f7a08
    mouthCueSeconds: 0.3,   // @ds:a2d5936f
    decayIntervalSeconds: 10, // @ds:d3187816 @ds:5a9c0e77
    densityLimitBase: 0.00002, // @ds:31a8f5c2 @ds:5a9c0e77
    densityLimitSmoothRate: 0.35, // @ds:31a8f5c2 @ds:5a9c0e77
    scatterRadiusRatio: 0.82, // @ds:918d4b63
    initialSpeedMin: 4,    // @ds:918d4b63
    initialSpeedMax: 12,    // @ds:918d4b63
    dragMin: 0.55,          // @ds:8b62d9ce
    dragMax: 1.1,           // @ds:8b62d9ce
    restSpeed: 0.35,        // @ds:8b62d9ce
    wakeRadiusRatio: 4.8,   // @ds:8b62d9ce @ds:ed2b4f19
    wakeStrength: 0.85,     // @ds:8b62d9ce @ds:ed2b4f19
    wakeMinFishSpeed: 18,   // @ds:8b62d9ce @ds:ed2b4f19
    flowWakeRadiusRatio: 4.8, // @fix:6a7b8c9d
    flowRearStrength: 0.85, // @fix:6a7b8c9d
    flowFrontStrength: 0.25, // @fix:6a7b8c9d
    flowRearInwardStrength: 0.18, // @fix:6a7b8c9d
    flowAccelerationLeadSeconds: 0.25, // @fix:6a7b8c9d
    mouthPositionRadiusRatio: 0.9, // @fix:6a7b8c9d
    mouthSuctionRadiusRatio: 3.8, // @fix:6a7b8c9d
    mouthSuctionStrength: 240, // @fix:6a7b8c9d
    flowMapMaxImpulse: 600, // @fix:6a7b8c9d
    flowAngularReferenceSpeed: 90, // @fix:4e9b2c71
    flowAngularImpulseStrength: 22, // @fix:4e9b2c71
    flowAngularDrag: 5.8, // @fix:4e9b2c71
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
    strokeWidthPx: 0.55,    // screen-pixel outline thickness — ds:d6cebf86
};

export const RENDER_LAYERS = {
    npcFishMin: 100,
    npcFishMax: 9000,
    playerFishMin: 10002,
    playerFishMax: 29000,
    shredExtraFishSlots: 5,
};

export const MOUTH = {
    chaseOpenRatio: 0.22,   // slight open while thrusting in burst — fish.air#ia:9c0d1e2f, ds:975ca168
    holdDuration: 0.4,      // seconds to keep post-eat open state — fish.air#ia:9c0d1e2f, ds:975ca168
    eatingCruiseHoldSeconds: 0.3, // @ds:975ca168
};

export const SWIM = {
    basePhaseRate: 7.5,     // radians/s idle swim motion — fish.air#ia:3a4b5c6e, ds:bd354b7a
    speedPhaseRate: 0.1,  // extra radians/s per px/s — fish.air#ia:3a4b5c6e, ds:bd354b7a
    tailBaseSwing: 0.2,    // calm tail swing in radii — fish.air#ia:3a4b5c6e, ds:bd354b7a
    tailBurstSwing: 0.7,   // additional burst swing in radii — fish.air#ia:3a4b5c6e, ds:bd354b7a
    finBaseSwing: 0.18,     // calm fin swing in radii — fish.air#ia:3a4b5c6e, ds:bd354b7a
    finBurstSwing: 0.45,    // additional burst fin swing in radii — fish.air#ia:3a4b5c6e, ds:bd354b7a
    verticalFinSwingBoost: 0.9, // stronger fin motion while swimming vertically — @fix:6e2a9c41
    visualTiltResponse: 7,   // seconds^-1 return toward horizontal during inertial braking — @fix:6e2a9c41
    finTimingCurve: { x1: 0.35, y1: 0.05, x2: 0.65, y2: 0.95 }, // calm fin phase easing — @fix:2e7a4c91
    finBurstTimingCurve: { x1: 0.22, y1: 0.02, x2: 0.78, y2: 0.98 }, // burst fin phase easing — @fix:2e7a4c91
    kickDecay: 4.5,         // seconds^-1 decay after burst start — fish.air#ia:3a4b5c6e, ds:bd354b7a
    finSparkChance: 0.72,    // one decorative wake point per eligible fin on a burst-level change — @fix:4f8a2c71
    finSparkMinSizePx: 1,
    finSparkMaxSizePx: 2,
    finSparkSmallLifeSeconds: 1,
    finSparkLargeLifeSeconds: 1.4,
    finSparkAlpha: 0.86,
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
