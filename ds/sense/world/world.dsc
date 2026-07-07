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
    rule: "density for spawn and respawn location selection is computed from all fish, not only dangerous fish or NPC fish"

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
      properties: [position, radius, velocity, life, alpha]
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
      rule: "bubbles rise upward at near-constant speed close to median fish cruise speed, drift slightly, fade out, and are removed when expired or out of world; the fill is nearly transparent while the contour remains visible and may subtly pulse in the vertical axis"
    exhale_trigger:
      from: [ds:world.exhale.accel-start-trigger, ds:world.exhale.burst-start-trigger, ia:world.exhale.accel-start-trigger]
      name: triggerExhaleDecor
      inputs: [fish, accel, prevAccel, previousMode]
      output: exhaleRequest?
      authority: client-only
      rule: "client may locally auto-trigger @fn:exhale when acceleration transitions from zero to nonzero, and must locally trigger @fn:exhale when a displayed fish transitions from cruise to burst; burst-start triggering is edge-based and does not repeat while the fish remains in burst; server does not create, store, sync, or transmit exhale/bubble state"
