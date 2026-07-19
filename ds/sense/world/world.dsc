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

fixed_coordinate_grid:
  from: ds:world.fixed-coordinate-grid
  dimensions: { width: WORLD.initialWidth, height: WORLD.initialHeight }
  game_dimensions: { width: "WORLD.initialWidth * WORLD.pixelsPerWorldUnit", height: "WORLD.initialHeight * WORLD.pixelsPerWorldUnit" }
  pixels_per_world_unit: WORLD.pixelsPerWorldUnit
  cells: { columns: "round(WORLD.initialWidth / WORLD.cellSize)", rows: "round(WORLD.initialHeight / WORLD.cellSize)", size: WORLD.cellSize }
  invariant: "fish and shred canonical positions stay in the fixed wrapped coordinate grid when user count changes"

sync_grid_configuration:
  from: ds:world.sync-grid-configuration
  dimensions: [columns, rows]
  derived_from: [WORLD.initialWidth, WORLD.initialHeight, WORLD.cellSize]
  registry: "one synchronization-order matrix per supported columns x rows configuration"
  matrix_entry: { ordinal: integer, dx: integer, dy: integer }
  invariant: "each supported matrix contains every grid cell exactly once relative to the user's cell; toroidal wrapping resolves out-of-range coordinates"

virtual_area_scale:
  from: [ds:world.virtual-area-per-user, ds:world.scale-visualization]
  nominal_start_diameter_normalized: 8
  user_area_side_diameters: 10
  effective_area: "(WORLD.initialWidth * WORLD.pixelsPerWorldUnit) * (WORLD.initialHeight * WORLD.pixelsPerWorldUnit) + userCount * (10 * 8 * WORLD.pixelsPerWorldUnit)^2"
  scale: "round(sqrt(effectiveArea / ((WORLD.initialWidth * WORLD.pixelsPerWorldUnit) * (WORLD.initialHeight * WORLD.pixelsPerWorldUnit))), 3)"
  scale_wire_format: "decimal without insignificant trailing zeros"
  technical_length: "pixelLength / pixelsPerWorldUnit / scale"
  scales: [collision_diameter, shred_size, velocity, acceleration, search_distance, flee_distance, attack_distance, spawn_margin]
  excludes: [time, probability, temporal_damping, dimensionless_size]
  client_contract:
    name: applyWorldScale
    rule: "client receives s:<scale>, narrows its normalized viewport by scale, and interpolates the projection without changing canonical positions"

npc_density:
  from: [ds:world.npc-density, ds:world.scale-density]
  target_density:
    relation_to_previous_base_density: 4x
  contract:
    name: maintainNpcDensity
    inputs: [effectiveWorldArea, npcFishCount, targetNpcDensity]
    output: targetNpcFishCount
    rule: "target NPC count follows targetNpcDensity * effective game area; targetNpcDensity is a configured per-area coefficient and controlled-object limit remains authoritative"
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

spatial_perception:
  interaction_segments:
    from: ds:world.interaction-segments
    space: "toroidal grid independent from synchronization delivery cells"
    size: "derived from worldScale to preserve a stable game-space perception range"
    membership: "an entity is inserted into every segment intersected by its contact circle"
    observer_query:
      origin: "the segment containing the observer center"
      range: "central segment plus its eight wrapped neighbours"
      result: "unique local interaction candidates"
  danger_raster:
    from: [ds:world.danger-raster, ds:world.danger-raster-synchronous]
    authority: server
    grid_cell_size: "nominal start-fish diameter / 4"
    update: "once in each authoritative world step after current fish positions are available"
    source: fish
    stamp:
      shape: swept_filled_disk
      path: "from fish.position to fish.position + fish.velocity * dt * PERCEPTION.dangerRasterMotionTicks, sampled continuously and wrapped across world edges"
      diameter: "fish.contactDiameter * 1.50"
      edge: hard
      intensity: "encodes source fish size"
      overlap: max_intensity
    sample: "nearest raster cell"
    use: "long-range NPC route safety; exact local segment geometry remains authoritative for contact and immediate lethal threat"
    direction_danger:
      storage: "one counter per raster cell for the current authoritative cycle"
      increment: "one unit at the first blocking point for each candidate vector rejected by danger checks"
      lifecycle: "reset at cycle start and preserved through the post-movement perception rebuild"
      output: "cycle-maximum-normalized 0..100 red overlay in the diagnostic PNG"

decor:
  background_tile_parallax:
    from: [ds:world.background.tile-parallax, fix:world-background-parallax-continuity]
    authority: client-only
    mutates_domain_state: false
    server_responsibility: false
    asset: ds/assets/back.png
    contract:
      name: updateWorldBackgroundCss
      inputs: [cameraViewport, cssBackgroundLayer]
      output: cssBackgroundPosition
      rule: >
        the game surface has a muted CSS background layer from back.png under a
        transparent canvas and all game objects. The background repeats along both
        axes and moves by a weak parallax factor, about 0.2x of camera movement
        on both x and y. CSS opacity keeps fish, shreds, bubbles, HUD, and
        controls readable. The layer is visual-only and does not affect
        simulation, input, collision, or network synchronization.
    continuity:
      from: fix:world-background-parallax-continuity
      rule: >
        the background parallax phase is render-only and continuous across
        toroidal world boundaries. It changes from the nearest toroidal camera
        delta between frames and preserves its current CSS phase when the followed
        focus or world dimensions reset, so the tile offset remains visually
        smooth on both axes.
  background_depth_haze:
    from: ds:world.background.depth-haze
    authority: client-only
    mutates_domain_state: false
    server_responsibility: false
    contract:
      name: backgroundDepthHazeCss
      inputs: [viewport]
      output: cssBackgroundHazeLayer
      rule: >
        a CSS viewport-space gradient haze sits over the background tile and
        under all game objects: lighter near the top of the viewport and darker
        near the bottom. The haze is visual-only and keeps fish, shreds, bubbles,
        debug overlays, HUD, and controls readable.
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
      name: triggerMotionBubbleCue
      inputs: [fish, previousMode, currentMode, previousMotionDirection, currentMotionDirection]
      output: bubbles[1..2]?
      authority: client-only
      rule: "client locally emits 1-2 ordinary bubbles when a displayed fish transitions cruise<->burst or when its movement direction changes by more than 100 degrees; changes between target burst speeds inside active burst do not trigger this cue by themselves; server does not create, store, sync, or transmit cue bubble state"
