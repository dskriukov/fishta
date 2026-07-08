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
  - controls
  - multiplayer
  - ws-protocol
  - client-debug

debug:                       # from ds:debug.mode, ds:debug.world-repeat-bounds, ds:debug.position-traces, ds:debug.fish-minimap, ds:debug.fish-collision-radius
  authority: client-only
  mutates_domain_state: false
  mutates_server_state: false
  affects_network_sync: false
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
  player_respawns_after_eaten: true
  success_metric: userFish.size

constraints:                 # from ds:intent.game
  from: [ds:intent.game, ia:web-canvas.canvas-2d]
  runtime: browser
  backend: local-server
  client: canvas-2d
  authority: server
  multiplayer_primary: true
  single_user_mode: "single-player experience over the same server-authoritative world"

implementation_model:
  geometry:
    from: ia:web-canvas.vec
    rule: "shared geometry uses reusable vector primitives"
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
