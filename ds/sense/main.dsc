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

debug:                       # from ds:debug.mode, ds:debug.world-repeat-bounds, ds:debug.position-traces, ds:debug.fish-minimap, ds:debug.fish-collision-radius
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
    fishMinimap:
      sizePx: { width: 200, height: 200 }
      source: "current client-visible world fish positions"
      coordinateModel: "scale float world coordinates from [0,width) x [0,height) into minimap pixels without changing fish model coordinates"
      mark:
        shape: point
        sizePxByFishKind:
          npc: 1
          otherUser: 3
          currentUser: 5
        color: "same as rendered fish color"
      meaning: "overview of all fish positions across the full wrapped world rectangle"
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
