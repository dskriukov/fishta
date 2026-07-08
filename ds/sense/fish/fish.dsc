# fish.dsc — Formal Domain Model (generated from fish.ds)
# Status: coducted

module: fish

entity:
  id: Fish
  from: ds:fish.entity
  requires_medium: water
  properties:
    position: { type: vec2, from: ds:fish.entity }
    velocity: { type: vec2, from: ds:fish.movement.swim }
    size:     { type: number, gt: 0, from: ds:fish.size }
    facing:   { type: enum[left,right], from: ds:fish.facing }
    mode:     { type: enum[cruise,burst], default: cruise, from: ds:fish.regime }
    ownerKind: { type: enum[user,npc], from: ds:fish.entity }
    userName: { type: string?, from: [ds:multiplayer.identity, ds:fish.decor.user-label] }
    userColor: { type: color?, from: [ds:multiplayer.identity, ds:fish.decor.abandoned-gradient] }
    userTier: { type: enum[paid,free]?, from: ds:multiplayer.identity }
  visual_geometry:
    from: [ds:fish.visual.geometry-asset, ds:fish.geometry.collision-area, ia:fish.visual.svg-geometry-fidelity]
    asset: ds/assets/fish2.svg
    fidelity: "viewBox, path/circle coordinates, proportions, element-relative positions, semantic ids, and canonical silhouette are preserved from the source SVG"
    anchor: collision_area.center
    canonical_presence_area: collision_area
    size_definition: "fish geometric size is the diameter of collision_area"
    area_definition: "fish geometric area is the area of collision_area"
    contact_geometry: "fish intersection uses canonical circular presence areas"
    allowed_render_transforms:
      - "color and transparent overlay changes"
      - "group visibility for cruise/burst"
      - "position, scale, horizontal facing reflection"
      - "animation transforms applied on top of source element geometry"
    semantic_ids_required:
      - collision_area
      - shape_cruise
      - shape_burst
      - fin_*

derived:
  radius:
    from: [ds:fish.size, ia:fish.radius-formula]
    rule: "radius is monotonic function of size"      # f(size) -> px
    constraints:
      - "small and large fish remain visually readable"
  cruiseSpeed:
    from: [ds:fish.regime, ds:fish.size, ia:fish.speed-formula, ia:fish.regime.cruise-factor]
    rule: "default speed cap is a fixed fraction of maxSpeed; < maxSpeed; decreases slightly with size and has a lower bound"
  maxSpeed:
    from: [ds:fish.regime, ds:fish.size, ds:fish.thrust, ia:fish.speed-formula]
    rule: "burst speed cap; reachable only when mode==burst; decreases slightly with size and has a lower bound"

behaviours:
  swim:
    from: ds:fish.movement.swim
    contract:
      name: integrateMotion
      inputs: [position, velocity, acceleration, drag, mode, dt]
      output: [position', velocity']
      notes: "v += a*dt; v = clamp(v, mode==burst ? maxSpeed : cruiseSpeed); v = drag(v); p += v*dt"
  thrust:
    from: ds:fish.thrust
    rule: "accelerate toward target; speed cap depends on mode (cruise vs burst)"
    note: "ramp up/down EMERGES from accel + world.drag + speed clamp; no separate state (fish.air#ia:fish.thrust.emergent-ramp)"
  wrapInWorld:
    from: ds:fish.movement.bounds
    uses: world.bounds.wrapPosition
  updateFacing:
    from: [ds:fish.facing, ia:fish.facing-threshold, ia:fish.client-visual-facing-mouth]
    rule: "client visual facing follows confident horizontal movement inferred from fish velocity; tiny or jittery horizontal changes do not flip facing; no server-facing field is required"

decor:
  userColorBody:
    from: [ds:multiplayer.identity, ds:multiplayer.color-palettes, ia:fish.decor.user-color-body]
    contract:
      name: resolveFishBodyColorStyle
      inputs: [fish.userColor, fish.ownerKind, fish.npcRole, fish.formerUserColor]
      output: bodyColorStyle
      rule: "for user fish, the selected user color is the base fill of the whole body silhouette; depth, fins, gills, highlights, and decorative markings are overlays that preserve visibility of the base color"
      overlay_policy:
        - "use transparent dark/light overlays for shadows and highlights instead of replacing body regions with unrelated fixed colors"
        - "derived decoration must not require hand-picked shadow/light colors for each possible user color"
        - "NPC palette separation remains: ordinary NPC fish keep yellow-toned palette; abandoned former user fish is handled by abandonedGradient"
  mouth:
    from: [ds:fish.decor.mouth, ia:fish.decor.mouth-state, ia:fish.client-visual-facing-mouth]
    contract:
      name: updateMouth
      inputs: [fish, accel, mode, dt, eatenSize?]
      output: mouthState
      rule: >
        if fish just ate prey -> open mouth to at least the prey size and hold it
        briefly; if fish is in burst/hunt mode with active thrust -> mouth slightly
        open with teeth visible; ordinary direction change, cruise acceleration, and
        inertial movement do not open the toothed mouth; otherwise mouth closes smoothly.
  swimMotion:
    from: [ds:fish.decor.swim_motion, ds:fish.visual.geometry-asset, ia:fish.decor.swim-state]
    contract:
      name: updateSwimMotion
      inputs: [fish, accel, dt]
      output: swimMotionState
      rule: >
        fish keeps a swim phase for tail/fin oscillation; animated fin_* SVG
        elements move with the current swim phase; phase speed follows movement
        speed, burst increases amplitude, and entering burst thrust adds a brief kick
        for a larger starting swing.
  regimeShape:
    from: ds:fish.decor.regime-shape
    contract:
      name: resolveFishRegimeShape
      inputs: [fish.mode]
      output: visibleShapeGroup
      rule: "mode==cruise displays shape_cruise; mode==burst displays shape_burst; switching happens directly when the swimming regime changes"
  fearEye:
    from: [ds:fish.decor.fear_eye, ia:fish.decor.fear-eye-state]
    contract:
      name: updateFearEye
      inputs: [fish, accel, dt]
      output: fearEyeState
      rule: >
        NPC fish that actively flee in burst raise eyeFear toward 1; when
        not fleeing, eyeFear decays toward 0. Renderer uses eyeFear to enlarge
        the eye slightly.
  userLabel:
    from: ds:fish.decor.user-label
    contract:
      name: updateUserLabel
      inputs: [fish, dt]
      output: labelState
      rule: "user fish displays its name visibly; when it becomes NPC, the label fades out smoothly"
  abandonedGradient:
    from: ds:fish.decor.abandoned-gradient
    contract:
      name: updateAbandonedGradient
      inputs: [fish]
      output: bodyColorStyle
      rule: "abandoned former user fish uses a gradient mixing former user color with ordinary NPC yellow; ordinary decor overlays still preserve the visible gradient base"
  sizeDeltaLabel:
    from: ds:fish.decor.size-delta-label
    authority: client-only
    server_domain_event: false
    contract:
      name: updateSizeDeltaLabels
      inputs: [currentUserFish, previousCurrentUserSize, accumulatedDeltaRemainder, dt]
      output: [sizeDeltaLabels, accumulatedDeltaRemainder']
      rule: >
        only the current client's own user fish shows temporary numeric labels
        for size changes. Positive changes appear as green labels like "+0.2";
        negative changes appear as red labels like "-0.1". Changes are emitted
        in discrete 0.1 size steps: continuous loss accumulates until at least
        one step is reached, emits that rounded step amount, and carries the
        remainder below 0.1 forward. Each label follows the fish, moves slightly
        upward, fades out, and never changes movement, collision, predation,
        numeric size, or network synchronization.
  exhale:
    from: fn:exhale
    authority: client-only
    server_domain_event: false
    contract:
      name: runExhaleCycle
      inputs: [fish, bubblesAround, rng, dt]
      output: [exhaleState, bubblesAround', emittedBubbles]
      stages: [inhale, exhale]
      rule: >
        inhale stage: visual scale rises smoothly to 1.10 of current fish size
        and does not change domain size (ia:fish.exhale.visual-scale); before any
        emission, already existing nearby bubbles are pulled toward mouth with
        distance-falloff and zero effect outside 1*size radius
        (ia:fish.exhale.bubble-inhale-order, ia:fish.exhale.bubble-displacement).
        exhale stage: visual scale returns to baseline, fish emits 9..16 bubbles
        at 50ms intervals, and existing nearby bubbles are pushed away from mouth
        with the same distance-falloff and zero effect outside 1*size radius;
        exhale duration is not time-capped and completes only after planned
        emissions finish (ia:fish.exhale.bubble-displacement).
      properties:
        - "visual-only scaling: no side effects on speed, predation, or energy"
        - "not transmitted as server domain state and not part of network synchronization"
        - "stage order is strict: inhale displacement happens before new emission"
        - "reference graph is acyclic (Domain Sense IA: no recursive sense links)"
        - "all requirement-reference chains in this contract are finite (no loops)"

growth:
  from: [ds:fish.growth, ia:fish.growth-formula]
  contract:
    name: grow
    inputs: [size, preySize]
    output: size'
    rule: "size' is computed by adding 70% of prey canonical circular area to predator canonical circular area, then deriving the new fish size from the resulting area"
    properties:
      - "gain > 0"
      - "gain decreases as size grows"   # замедление роста (fish.air)
      - "bigger prey -> bigger gain"

energy:
  from: [ds:fish.energy, ds:fish.user-min-size]
  status: refined               # уточнён: расход только в burst
  resolves_dse: [DSE-003, DSE-004]
  # DSE-004: "any thrust drains size" -> prey starved while wandering; fixed by mode gating
  contract:
    name: spendEnergy
    inputs: [size, mode, distanceMoved]
    output: size'
    rule: "if mode==burst: size' = max(userMinSize for user fish, npcMinSize for NPC fish, size * (1 - 0.01 * (distance / (100*size)))); else size unchanged"
    properties:
      - "cruise and drift cost nothing (ordinary swimming preserves size)"
      - "traveling 100*size in burst => -1% size"
      - "NPC size never drops below a positive NPC minimum (fish.air#ia:fish.energy.burst-only)"
      - "userMinSize is above PREY.minSize by the predation eat-ratio margin, so the smallest fully grown ordinary NPC remains edible by a maximally depleted user fish"

reporting:
  serialize:
    from: do:serialize
    contract:
      name: serializeFish
      inputs: [fish]
      output: fishInfoText
      rule: >
        on demand (console/info panel), return structured text that contains:
        fish type (user|npc), user name/color/tier when type=user, fish size,
        fish age, and eaten-fish count.
      fields:
        - key: type
          allowed: [user, npc]
        - key: userName
          type: string
          condition: "only for user fish"
        - key: userColor
          type: color
          condition: "only for user fish"
        - key: userTier
          allowed: [paid, free]
          condition: "only for user fish"
        - key: size
          type: number
        - key: age
          type: number
        - key: eatenFishCount
          type: integer
      properties:
        - "field set is fixed and complete for do:serialize"
        - "serialization has no side effects on fish simulation state"
