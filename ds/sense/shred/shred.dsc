# shred.dsc — Formal Domain Model (generated from shred.ds)
# Status: coducted

module: shred

entity:
  id: Shred
  from: ds:shred.entity
  controlled_by: server
  kind: edible-nutrient
  properties:
    id: integer
    position: { type: vec2, from: ds:shred.entity }
    velocity: { type: vec2, from: [ds:shred.entity, ds:shred.drift] }
    size: { type: number, gt: 0, from: [ds:shred.size-area, ds:shred.geometry.collision-area] }
    radius: { type: number, rule: "size / 2 in canonical contact geometry" }
    geometricArea: { type: number, gt: 0, from: ds:shred.size-area }
    nutritionMass: { type: number, gt: 0, from: [ds:shred.size-area, ds:shred.growth-effect] }
    sourceColor: { type: color, from: ds:shred.source-color }
    remainingLayers: { type: ordered-set, from: ds:shred.layers }
    drag: { type: number, from: ds:shred.drift }
    decayAge: { type: seconds, gte: 0, from: [ds:shred.auto-decay, ds:shred.interaction-refreshes-decay] }

spawn:
  from: [ds:shred.spawn, ds:shred.spawn.distribution, ds:shred.initial-placement, ds:shred.source-color]
  contract:
    name: spawnShredsFromFish
    inputs: [world, oldAgeDeadFish, rng]
    output: shred[]
    rule: >
      on fish old-age death, compute total shred geometric area as
      fish canonical circular area * configurable shred area ratio (target 0.5).
      Split that total area into randomized individual shred sizes. The
      configurable minimum and maximum visual diameters are fractions of the
      nominal start-fish diameter, independent of prey variety; convert that
      visual diameter once to technical units using pixelsPerWorldUnit and the
      current world scale, then apply fragmentation tuning. Place each shred at a
      random offset inside the dead fish canonical circle. Give each shred a
      small random velocity and individual drag. sourceColor is the fish userColor
      when present, formerUserColor for abandoned former user NPC fish, otherwise
      the ordinary NPC shred color.

geometry:
  visual_asset:
    from: ds:shred.visual.geometry-asset
    asset: ds/assets/shred.svg
    fidelity: "viewBox, path coordinates, proportions, semantic ids, and authored layer shapes are preserved from the source SVG"
    semantic_ids_required:
      - part_30_percents
      - part_30_percents_main_color
      - part_20_percents
      - part_10_percents_1
      - part_10_percents_2
  collision_area:
    from: ds:shred.geometry.collision-area
    rule: "canonical contact circle diameter equals shred.size; contact with fish is circle intersection against fish canonical presence area"

movement:
  drift:
    from: ds:shred.drift
    contract:
      name: advanceShreds
      inputs: [world.shreds, dt]
      output: world.shreds'
      rule: "position += velocity * dt, wrap in world topology, velocity is damped by each shred's individual drag until it reaches rest"

eating:
  eligibility:
    from: [ds:shred.eating-eligibility, ds:predation.feeding-batch]
    contract:
      name: canEatShred
      inputs: [fish, shred]
      output: boolean
      rule: "fish can be offered a shred candidate when fish/shred circles intersect, fish.size passes the configurable size threshold against shred.size, and fish actual speed reaches the configurable minimum feeding speed; burst and cruise movement both qualify; actual consumption is mediated by predation feeding batch factor, area limit, and cooldown"
  layers:
    from: [ds:shred.layers, ds:shred.auto-decay]
    order:
      - [part_30_percents]
      - [part_30_percents_main_color]
      - [part_20_percents]
      - [part_10_percents_1, part_10_percents_2]
    fractions:
      part_30_percents: 0.3
      part_30_percents_main_color: 0.3
      part_20_percents: 0.2
      part_10_percents_1: 0.1
      part_10_percents_2: 0.1
  auto_decay:
    from: [ds:shred.auto-decay, ds:shred.decay-density-limit, ds:shred.interaction-refreshes-decay]
    contract:
      name: advanceShredDecay + refreshShredDecay
      inputs: [world.shreds, dt, shredInteraction]
      output: world.shreds'
      rule: >
        each shred keeps a server-owned decayAge timer. advanceShredDecay adds dt
        and, for each full configurable 10 second interval, first checks current
        shred density against the current smooth density limit. If density is below
        the limit, preserve remainingLayers and defer the next check by one full
        interval. If density is at or above the limit, remove the next layer group
        in the same order as eating: 30%, then 30%, then 20%. When only the final
        10%+10% group remains and another eligible interval elapses, remove the
        shred from world.shreds. Decay never grants nutrition. Any fish interaction
        with a shred refreshes decayAge to 0 while preserving the current
        remainingLayers exactly.
  color_nutrition:
    from: ds:shred.nutrition.color-match
    rule: "first two 30% layers use color factor: exact same color -> 1.0; different color -> clamp 0.3..0.7 from HSV similarity with hue primary and saturation secondary"
  common_nutrition:
    from: ds:shred.nutrition.common-layers
    rule: "20% layer and both final 10% layers use factor 1.0 for every fish"
  growth:
    from: ds:shred.growth-effect
    contract:
      name: shredCandidateNutrition + consumeShredLayer
      inputs: [fish, shred]
      output: [fish', shred']
      rule: >
        predation feeding batch inspects the next layer group from
        shred.remainingLayers, computes gained nutrition as geometric layer area
        * nutritionMultiplier * applicable color factor, applies that nutrition
        to fish size on successful batch attempt, then removes consumed layers.
        Remove the shred when no layers remain.

client_visual:
  mouth_cue:
    from: ds:shred.eating-mouth-cue
    contract:
      name: triggerShredMouthCue
      inputs: [fishId, shredEatEvent]
      output: clientDecorState'
      rule: "when a non-burst shred eating event is observed, client opens toothed mouth locally for 0.3 seconds while keeping fish domain mode unchanged"
  layer_drift:
    from: ds:shred.visual.layer-drift
    contract:
      name: drawShred
      inputs: [ctx, shred, clientTime]
      output: canvas
      rule: "draw remaining SVG layers from shred.svg with currentColor=sourceColor; each visible layer applies deterministic client-local drift/rotation in configured 3-5 degree range"

authority:
  from: ds:shred.server-authority
  server_owns:
    - spawn
    - position
    - velocity
    - size
    - geometricArea
    - nutritionMass
    - sourceColor
    - remainingLayers
    - eating eligibility
    - growth result
  client_owns:
    - layer drift phase
    - local mouth cue animation

tunables:
  from: ds:shred.tunables
  constants:
    - areaRatioFromDeadFish
    - nutritionMultiplier
    - minSize
    - maxSize
    - fragmentation
    - sizeJitter
    - eatSizeRatio
    - minFeedingSpeed
    - scatterRadiusRatio
    - initialSpeedRange
    - dragRange
    - svgScale
    - layerFractions
    - decayIntervalSeconds
    - densityLimitBase
    - densityLimitSmoothRate
    - densityAreaMode
    - colorFactorMin
    - colorFactorMaxDifferent
    - hueWeight
    - saturationWeight
    - layerRotationDegreesRange
    - layerDriftPx
