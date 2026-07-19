# main.dsc — Formal Domain Model (generated from main.ds)
# Layer: Domain Sense Coduction
# Status: coducted

domain: fish-eat-fish
version: 0.1.0
project_mode:
  from: ds:project.mode
  mode: standard
  source_model: "DS description is the source product model"
  implementation_derivation: "executable implementation is derived from the DS model"

# Машинно-читаемая сводка мира. Детали — в доменных модулях.
world:
  dimensionality: 2          # from ds:world.flat
  time:
    exists: true             # from ds:world.time
    model: continuous        # непрерывное время, шаг dt
  medium: water              # from ds:world.medium.water (see world.dsc)

modules:                     # from ds:domain.modules
  - world
  - fish
  - prey
  - predation
  - shred
  - player
  - controls
  - multiplayer
  - ws-protocol
  - client-debug

debug:                       # from ds:debug.mode, ds:debug.world-repeat-bounds, ds:debug.position-traces, ds:debug.fish-collision-radius
  authority: client-only
  mutates_domain_state: false
  mutates_server_state: false
  affects_network_sync: false
  activation:
    source: "game menu debug toggle"
  overlays:
    worldRepeatBounds:
      shape: rectangle
      min: { x: 0, y: 0 }
      max: { x: world.width, y: world.height }
      meaning: "boundary of the repeating wrapped world"
    positionTraces:
      relativeClientComputed:
        color: yellow
        source: "client-side computed visible fish position"
      absoluteServer:
        color: green
        source: "absolute fish position received from server sync"
      visibleSeconds: 3
      fadeAfterVisible: true
    fishCollisionRadius:
      shape: circle
      source: "current rendered fish position and fish.radius used by predation contact checks"
      appliesTo: "every fish in the rendered world view"
      style: "translucent halo"
      meaning: "visualizes the radius that contributes to fish collision/contact calculation"

goal:                        # from ds:goal.growth
  from: [ds:goal.growth, ia:player.predation-eligibility]
  type: open-ended-growth
  user_fish_can_be_eaten: "by paid/free predation eligibility, not by a separate vulnerability mode"
  player_respawns_after_eaten: "through player.spawn fry stage"
  success_metric: userFish.size

constraints:                 # from ds:intent.game
  from: [ds:intent.game, ia:web-canvas.canvas-2d]
  runtime: browser
  backend: local-server
  client: canvas-2d
  authority: server
  multiplayer_primary: true
  single_user_mode: "single-player experience over the same server-authoritative world"

ui:
  startup_splash:
    from: ds:ui.startup-splash
    authority: client-display
    asset: web-canvas/assets/start.png
    initial_layer: "solid dark-blue fill matching the start background palette"
    animation:
      opacity: "0 -> 1"
      scale: "1.05 -> 1"
      transform_origin: center
    visibility: "startup background is the only visible application content during boot"
  startup_session_routing:
    from: ds:ui.startup-session-routing, ia:web-canvas.startup-routing
    authority: client-display
    states: [boot, checking_session, new_join, restoring, game]
    transport:
      owner: client-net.js
      initial: "no WebSocket until a restore code exists or the join form is submitted"
      restore: "open WebSocket, send r:<temporaryConnectionCode>, and await an identity response"
      new_join: "open WebSocket after Dive in and send the n:<color>:<name>:<tier> join message"
    transitions:
      valid_identity: "restoring -> game"
      expired_restore: "checking_session -> new_join"
      join_identity: "new_join -> game"
    game_reveal:
      start_background_opacity: "1 -> 0"
      duration_ms: 650
      timing: ease
  worldMap:
    from: ds:ui.world-map-toggle, ds:debug.fish-minimap
    authority: client-only
    defaultVisible: false
    trigger: "top-right toolbar map button visually matching the menu button"
    source: "current client-visible world fish positions"
    coordinateModel: "scale float world coordinates from [0,width) x [0,height) into a 200x200 map without changing fish model coordinates"
    fishMarks:
      npc:
        shape: point
        diameterPx: "interpolate by linear fish size; clamp to at least 2; nominal PLAYER.startSize is 2 and current map maximum is 5"
      otherUser:
        shape: double-circle
        pointDiameterPx: 3
        outline: { gapPx: 1, widthPx: 1 }
      currentUser:
        shape: double-circle
        pointDiameterPx: 5
        outline: { gapPx: 1, widthPx: 2 }
    meaning: "overview of all fish positions across the full wrapped world rectangle, independent from Debug"
  world_inspection_controls:
    from: [ds:ui.world-inspection-controls, ds:ui.danger-map-underlay, ds:ui.world-map-toggle, ds:ws-protocol.danger-map-stream]
    authority: client-only
    placement: "right side of the top toolbar"
    controls:
      minimap: { icon: map, output: worldMap.visible }
      synchronizationSegments: { icon: grid, output: syncSegments.visible }
      dangerMap: { icon: radar, output: dangerMapUnderlay.visible }
    invariant: "each control preserves the authoritative world and has independent active state"
  danger_map_underlay:
    from: [ds:ui.danger-map-underlay, ds:ws-protocol.danger-map-stream, fix:ui.danger-map-grid-layering, fix:ui.danger-map-debug-underlay, fix:ui.danger-map-debug-controls]
    authority: client-only
    source: "latest PNG frame from the diagnostic WebSocket endpoint"
    placement: "world-coordinate underlay below game entities"
    lifetime: "open the diagnostic transport while enabled and close it while disabled"
    layering: "draw the segment grid first as a black independent layer, then draw danger values and map entities over it; grid opacity is independent from danger-map opacity"
    steering_overlay: "draw bright blue hunt lines to every selected fish or food target using the shortest wrapped direction, red flee-direction lines with a length of two to four fish diameters based on burst level, and subdued water-colored circles for the maximum direction-search diameter"
    debug_underlay: "when Debug and the danger-map control are enabled, composite the latest danger-map frame on the main gameplay canvas in world coordinates before fish, shreds, bubbles, and other game objects; release the diagnostic transport when the danger-map control is inactive"
    debug_controls: "while Debug is enabled, the synchronization-grid control also shows the synchronization grid, received cells, and fish synchronization traces on the gameplay canvas, while the danger-map control also shows its segment grid and hunt or flee direction diagnostics"
  game_menu:
    from: [ds:ui.game-menu, ds:ui.version-visible, ds:debug.mode, ds:controls.mode-select, ds:controls.leave-game, ds:controls.viewport-fish-capacity]
    authority: client-display
    contract:
      name: updateGameMenu
      trigger: "top-left button with three horizontal bars"
      contents:
        - control mode selector
        - current game version
        - debug mode activation
        - leave-game command
        - viewport fish-capacity selector
        - active control mode help
      help_modes:
        keyboard: "keyboard movement and keyboard burst levels"
        pointer: "mouse pointer movement and mouse burst"
        touch: "primary touch movement and second-touch burst levels"
        joystick: "joystick movement and radial burst levels"
  version_visible:
    from: ds:ui.version-visible
    authority: client-display
    source: "server-served app version metadata"
    contract:
      name: showAppVersion
      inputs: [buildOrLaunchDate, commitDigest]
      output: versionText
      rule: "game menu shows date-derived build/run version plus commit digest for local verification and bug discussion"
  world_snapshot_info:
    from: ds:ui.world-snapshot-info
    authority: client-display
    source: "current world snapshot received by the client through WebSocket synchronization"
    contract:
      name: updateWorldSnapshotInfo
      inputs: [world.fish, world.shreds]
      output: worldSnapshotInfoText
      placement: "compact translucent bottom-left client UI panel"
      metrics:
        fishCount: "number of fish rows currently present in the synchronized client world"
        fishArea: "sum of canonical circular fish areas from synchronized fish radii"
        nutrientCount: "number of synchronized nutrient/shred objects"
        nutrientArea: "sum of synchronized nutrient/shred geometricArea values"
  world_performance_metrics:
    from: ds:ui.world-performance-metrics
    authority: client-display
    source: [serverWorldCalculationMilliseconds, firstAcceptedFragmentCycleTimestamps]
    placement: "compact translucent bottom-left client UI panel"
    metrics:
      worldCalc: "server average duration of stepAuthoritativeWorld in milliseconds"
      syncCycle: "client average interval between sequential synchronization cycle starts in milliseconds"

implementation_model:
  geometry:
    from: ia:web-canvas.vec
    rule: "shared geometry uses reusable vector primitives"
  runtime_background_assets:
    from: ia:web-canvas.background-assets-publication
    canonical_assets:
      - ds/assets/back.png
      - ds/assets/start.png
    published_assets:
      - web-canvas/assets/back.png
      - web-canvas/assets/start.png
    rule: "web-canvas loads PNG backgrounds from published runtime copies so local execution and publication use the same assets"
  profile_preferences:
    from: ia:web-canvas.profile-preferences
    owner: main.js
    storage: localStorage
    fields: [userName, userColor]
    write_rule: "write a field when its submitted value differs from the generated default"
    read_rule: "read stored values before generating a new default and use them as form values"
  simulation_loop:
    from: ia:web-canvas.loop
    time_model: fixed-step-approximation-of-continuous-time
    rule: "simulation advances through a stepped game loop with capped dt for stable behavior"
  state_flow:
    from: ia:web-canvas.ecs-arch
    rule: "world state is updated by pure simulation steps; rendering is separate and does not mutate domain data"

# Domain validation summary (precompile gate)
validation:
  errors: []
  resolved:
    - id: DSE-001
      was: "fish move but time/change undefined"
      fixed_by: ds:world.time
    - id: DSE-002
      was: "fish exist but no medium"
      fixed_by: ds:world.medium.water
