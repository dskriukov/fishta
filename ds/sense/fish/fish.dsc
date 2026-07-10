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
    speedLevel: { type: integer, range: [0,99], default: 0, from: ds:fish.regime }
    ownerKind: { type: enum[user,npc], from: ds:fish.entity }
    userName: { type: string?, from: [ds:multiplayer.identity, ds:fish.decor.user-label] }
    userColor: { type: color?, from: [ds:multiplayer.identity, ds:fish.decor.abandoned-gradient] }
    userTier: { type: enum[paid,free]?, from: ds:multiplayer.identity }
    feedingSuccessFactor: { type: number, range: [0,1], default: 1, from: ds:fish.feeding-success }
    feedingCooldown: { type: seconds, gte: 0, default: 0, from: ds:fish.feeding-success }
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
    rule: "for speedLevel v=1..30, speed cap is maxSpeed(size, ownerKind) * (v / 100) * 0.61; cap decreases with size through maxSpeed(size, ownerKind)"
  maxSpeed:
    from: [ds:fish.regime, ds:fish.size, ds:fish.thrust, ia:fish.speed-formula]
    rule: "maxSpeed(size) models water drag from fish area: linearSize=max(minLinearSpeedSize, sqrt(size)); maxSpeed=baseNoDragSpeed/(1+waterDragByLinearSize*(linearSize-1)); for speedLevel v=31..99, speed cap is maxSpeed(size, ownerKind) * (v / 100)"

behaviours:
  swim:
    from: [ds:fish.movement.swim, ds:fish.burst-inertia]
    contract:
      name: integrateMotion
      inputs: [position, velocity, acceleration, drag, mode, speedLevel, dt]
      output: [position', velocity']
      notes: "when speedLevel>0 and acceleration is active, velocity += accel*dt and active thrust may increase speed only up to the current target cap; if the fish is already above the current cap because the target level decreased, do not clamp downward instantly. speedLevel 1..30 uses maxSpeedOf(size, ownerKind)*(speedLevel/100)*0.61; speedLevel 31..99 uses maxSpeedOf(size, ownerKind)*(speedLevel/100). speedLevel 0 applies no thrust. After thrust handling, apply the same water drag damping used for inertial objects and integrate position."
  burst_endurance:
    from: ds:fish.burst-endurance
    contract:
      name: availableSpeedLevelForSize
      inputs: [size, desiredSpeedLevel, enduranceReserveSeconds, burstEnduranceThresholds]
      output: speedLevel
      rule: "at application start compute one size-threshold table for burst speedLevels 31..99 using integral simulation of size loss down to the minimum allowed size; desired speedLevel 0..30 is returned unchanged, desired burst speedLevel 31..99 is reduced to the nearest available level not greater than desired, and level 31 is always available"
  thrust:
    from: [ds:fish.thrust, ds:fish.burst-inertia]
    rule: "accelerate toward target; speed cap depends on mode (cruise vs burst)"
    note: "ramp up emerges from finite acceleration; ramp down emerges from world.drag damping, not from an instant downward speed clamp"
  wrapInWorld:
    from: ds:fish.movement.bounds
    uses: world.bounds.wrapPosition
  updateFacing:
    from: [ds:fish.facing, ia:fish.facing-threshold, ia:fish.client-visual-facing-mouth]
    rule: "client visual facing follows confident horizontal movement inferred from fish velocity; tiny or jittery horizontal changes do not flip facing; no server-facing field is required"
  feedingRecovery:
    from: ds:fish.feeding-success
    contract:
      name: advanceFeedingState
      inputs: [fish, dt]
      output: fish'
      rule: "server reduces feedingCooldown toward 0 by elapsed dt and linearly restores feedingSuccessFactor toward 1 over 1 second; every processed feeding attempt multiplies feedingSuccessFactor by the food-type decay factor before later time recovery: 0.75 for fish attempts and 0.9 for shred attempts"

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
      inputs: [fish, accel, mode, dt, eatenCount?, shredEatCue?]
      output: mouthState
      rule: >
        if fish is in burst/hunt mode with active thrust -> mouth slightly open
        with teeth visible; ordinary direction change, cruise acceleration, and
        inertial movement do not open the toothed mouth. When fish just ate prey,
        the client holds that fish in a local visual cruise state for 0.3 seconds
        so the mouth closes through the ordinary cruise form; this visual hold does
        not change server movement, predation, size, or synchronization. When fish
        eats a shred while in cruise or inertial movement, the client opens the
        toothed mouth locally for 0.3 seconds without changing the domain movement
        mode.
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
      rule: "abandoned former user fish applies the former-user-to-NPC-yellow gradient only to the SVG body base; fins, eyes, gills, mouth, highlights, and decorative SVG layers keep their authored geometry and layer policy"
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
        for size changes after the player start window. Start growth up to the
        nominal player start size is visible through the current-size HUD value
        and does not emit labels above the fish. Positive changes after feeding
        appear as green labels like "+0.2"; negative changes appear as red labels
        like "-0.1". Changes are emitted in discrete 0.1 size steps: continuous
        loss accumulates until at least one step is reached, emits that rounded
        step amount, and carries the remainder below 0.1 forward. Each label
        follows the fish, moves slightly upward, fades out, and never changes
        movement, collision, predation, numeric size, or network synchronization.
  eatingExhale:
    from: ds:fish.decor.eating-exhale
    authority: client-only
    server_domain_event: false
    contract:
      name: triggerEatingExhale
      inputs: [fish.eatenFishCount, previousEatenFishCount, exhaleState]
      output: exhaleState'
      rule: >
        when a visible fish's eatenFishCount increases, the client requests a
        decorative exhale for that fish. The exhale emits the normal sequential
        bubble count and timing, with each newly emitted exhale bubble having an
        approximately 40% chance to use the red eating-bubble style and otherwise
        using the ordinary white air-bubble style. The effect remains visual-only:
        movement, collision, predation, numeric size, and network synchronization
        keep their ordinary rules.
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
  from: [ds:fish.energy, ds:fish.user-min-size, ds:fish.burst-inertia]
  status: refined               # уточнён: расход только в burst
  resolves_dse: [DSE-003, DSE-004]
  # DSE-004: "any thrust drains size" -> prey starved while wandering; fixed by mode gating
  contract:
    name: spendEnergy
    inputs: [size, mode, speedLevel, activeBurstThrust, distanceMoved]
    output: size'
    rule: "if activeBurstThrust and speedLevel>=31: size' = max(userMinSize for user fish, npcMinSize for NPC fish, size * (1 - 0.01 * burstEnergyFactor(speedLevel) * (distance / (100*size)))); else size unchanged; burstEnergyFactor(N)=1 + burstExtraSpendFactor * (N - 31) / 68 for N in 31..99"
    properties:
      - "speedLevel 0..30 costs nothing"
      - "inertial braking after burst thrust stops costs nothing even while actual speed remains above cruise range"
      - "traveling 100*size at v=31 => -1% size; v=99 applies the maximum configured extra spend factor"
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
