# world.dsc — Formal Domain Model (generated from world.ds)
# Status: coducted

module: world

medium:
  id: water
  from: ds:world.medium.water
  rule: "entities of kind=fish require medium=water to exist and move"

surface:
  from: [ds:world.surface.flat, ds:world.coordinates, ia:world.fit-to-screen]
  space: euclidean-2d
  coordinates: [x, y]
  units: game-world-units
  depth: none

bounds:
  from: [ds:world.bounds, ia:world.bounds.wrap]
  shape: rectangle
  properties: [width, height]
  edge_behaviour: wrap
  contract:
    name: wrapPosition
    inputs: [position, radius, width, height]
    output: position'
    invariant: "position is mapped into [0,width) x [0,height) by toroidal wrapping, without stopping or reflecting velocity"

dynamic_size:
  from: ds:world.dynamic-size
  contract:
    name: resizeWorld
    inputs: [worldSize, userFishCount]
    output: nextWorldSize
    rule: "server changes world size by user-count thresholds with hysteresis; initial world size is approximately 1.5x normalized viewport"
  coordinate_scaling:
    name: scaleFishCoordinatesForWorldResize
    inputs: [fish.position, oldWorldSize, newWorldSize]
    output: fish.position'
    rule: "scale fish coordinates proportionally to new world bounds; fish size values are not scaled"
  client_playback:
    name: playWorldResize
    rule: "client receives the next server world-size step and visually interpolates coordinate stretching"

npc_density:
  from: ds:world.npc-density
  target_density:
    relation_to_previous_base_density: 4x
  contract:
    name: maintainNpcDensity
    inputs: [worldArea, npcFishCount, targetNpcDensity]
    output: targetNpcFishCount
    rule: "target NPC count follows targetNpcDensity * world area; targetNpcDensity is four times the previous base density"
  density_field:
    name: findLowestFishDensityArea
    inputs: [allFish[], worldSize]
    output: spawnArea
    rule: "density for spawn and respawn location selection is computed from all fish and persistent nutrient chunks, not only dangerous fish or NPC fish"

controlled_objects:
  from: [ds:world.controlled-object-limit, ds:world.high-load-old-age-suspension]
  counted_entities: [fish, shreds]
  excluded_entities: [client_decor, bubbles, exhale_visuals]
  max_count: configurable
  high_load_threshold: 0.9
  contract:
    name: controlledObjectCount + canAddControlledObjects + isOldAgeSuspended
    inputs: [world, addedCount]
    output: boolean
    rule: >
      controlled object count is the number of server-synchronized fish plus
      server-synchronized shreds. Shred creation may add only the count that
      keeps the total within max_count. Old-age NPC expiry is suspended while
      controlledObjectCount(world) / max_count is greater than 0.9 and resumes
      when the ratio is not greater than that threshold.

nutrients:
  from: [ds:world.nutrient-chunks, ds:world.nutrient-chunk-feeding, ds:world.nutrient-chunk-drift, ds:npc.lifetime-aging]
  authority: server
  entity:
    id: NutrientChunk
    properties: [id, pos, vel, size, radius, areaValue, initialAreaValue]
  contract:
    name: spawnNutrientChunksFromAgedNpc
    inputs: [expiredNpcFish, world, rng]
    output: world.nutrientChunks'
    rule: >
      when an NPC dies of old age, create edible drifting nutrient chunks with
      total canonical circular area about 50% of that fish's canonical circular
      area. Each chunk's geometric size is capped at the smallest ordinary NPC
      size.
  feeding:
    name: resolveNutrientEating
    inputs: [world, rng]
    output: world'
    rule: >
      nutrient chunks are eaten in hunting contact phases between one fish and
      one chunk. A phase starts when a fish in burst enters overlap with the
      chunk and ends when overlap or burst state stops. Each new phase gets one
      random bite attempt with 40% success probability. A successful bite gives
      the fish up to 30% of the chunk's remaining areaValue using the same
      area-growth principle as ordinary prey, decreases the chunk areaValue, and
      does not increment eaten-fish count. Chunk visual opacity follows
      areaValue / initialAreaValue. The chunk disappears when its edible
      areaValue is exhausted.
  drift:
    name: advanceNutrientChunks
    inputs: [world.nutrientChunks, world.fish, dt]
    output: world.nutrientChunks'
    rule: >
      chunks are inert server-owned drifting objects. They keep position and
      velocity, wrap in the world, and receive a small wake acceleration from
      nearby passing fish: 70% along fish movement direction and 30% perpendicular
      toward the passing trajectory, weakened by distance.

dynamics:
  drag:
    from: [ds:world.drag, ia:world.drag.linear]
    model: linear-velocity-damping
    contract:
      name: applyDrag
      inputs: [velocity, dragCoefficient, dt]
      output: velocity'
      invariant: "|velocity'| <= |velocity|"   # сопротивление не разгоняет

decor:
  bubbles:
    from: [ds:world.decor.bubbles, ia:world.bubble.radius-formula, ia:world.bubble.animation, ia:world.bubble.rise-speed, ia:world.bubble.burst-sequence]
    authority: client-only
    server_responsibility: false
    entity:
      id: Bubble
      properties: [position, radius, targetRadius, velocity, life, age, alpha]
    contract:
      name: emitBubbles
      inputs: [fish, dt, rng]
      output: bubble?
      rule: >
        periodically emit bursts of 2-5 bubbles near the fish mouth; radius
        is derived from fish size so large fish produce noticeably larger bubbles,
        and small fish do not get clamped to the same visible size. Bubble radius
        is capped at 10% of fish size and uses a very small minimum radius so the
        lower bound does not dominate the result.
    animation:
      name: advanceBubbles
      inputs: [bubbles[], dt, world]
      output: bubbles[]
      rule: "new bubbles begin with zero alpha and zero current radius, quickly animate alpha and radius up to their normal values, then rise upward at near-constant speed close to median fish cruise speed, drift slightly, fade out, and are removed when expired or out of world; the fill is nearly transparent while the contour remains visible and may subtly pulse in the vertical axis"
    exhale_trigger:
      from: [ds:world.exhale.accel-start-trigger, ds:world.exhale.burst-start-trigger, ia:world.exhale.accel-start-trigger]
      name: triggerExhaleDecor
      inputs: [fish, accel, prevAccel, previousMode]
      output: exhaleRequest?
      authority: client-only
      rule: "client may locally auto-trigger @fn:exhale when acceleration transitions from zero to nonzero, and must locally trigger @fn:exhale when a displayed fish transitions from cruise to burst; burst-start triggering is edge-based and does not repeat while the fish remains in burst; server does not create, store, sync, or transmit exhale/bubble state"
