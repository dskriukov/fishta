# fish.dsc — Formal Domain Model (generated from fish.ds)
# Status: FROZEN

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

derived:
  radius:
    from: ds:fish.size
    rule: "radius is monotonic function of size"      # f(size) -> px
  cruiseSpeed:
    from: [ds:fish.regime, ds:fish.size]
    rule: "default speed cap; < maxSpeed; decreases slightly with size"
  maxSpeed:
    from: [ds:fish.regime, ds:fish.size, ds:fish.thrust]
    rule: "burst speed cap; reachable only when mode==burst; decreases slightly with size"

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
  clampToWorld:
    from: ds:fish.movement.bounds
    uses: world.bounds.keepInsideBounds
  updateFacing:
    from: ds:fish.facing
    rule: "facing = velocity.x < 0 ? left : right"

decor:
  mouth:
    from: ds:fish.decor.mouth
    contract:
      name: updateMouth
      inputs: [fish, accel, dt, eatenSize?]
      output: mouthState
      rule: >
        if fish just ate prey -> open mouth to at least the prey size and hold it
        briefly; if fish accelerates while hunting -> mouth slightly open with teeth
        visible; otherwise mouth closes smoothly.
  swimMotion:
    from: ds:fish.decor.swim_motion
    contract:
      name: updateSwimMotion
      inputs: [fish, accel, dt]
      output: swimMotionState
      rule: >
        fish keeps a swim phase for tail/fin oscillation; phase speed follows movement
        speed, burst increases amplitude, and entering burst thrust adds a brief kick
        for a larger starting swing.
  fearEye:
    from: ds:fish.decor.fear_eye
    contract:
      name: updateFearEye
      inputs: [fish, accel, dt]
      output: fearEyeState
      rule: >
        non-player fish that actively flee in burst raise eyeFear toward 1; when
        not fleeing, eyeFear decays toward 0. Renderer uses eyeFear to enlarge
        the eye slightly.
  exhale:
    from: fn:exhale
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
        exhale stage: visual scale returns to baseline, fish emits 9..16 bubbles,
        and existing nearby bubbles are pushed away from mouth with the same
        distance-falloff and zero effect outside 1*size radius
        (ia:fish.exhale.bubble-displacement).
      properties:
        - "visual-only scaling: no side effects on speed, predation, or energy"
        - "stage order is strict: inhale displacement happens before new emission"
        - "reference graph is acyclic (Domain Sense IA: no recursive sense links)"
        - "all requirement-reference chains in this contract are finite (no loops)"

growth:
  from: ds:fish.growth
  contract:
    name: grow
    inputs: [size, preySize]
    output: size'
    rule: "size' = size + gain(preySize, size)"
    properties:
      - "gain > 0"
      - "gain decreases as size grows"   # замедление роста (fish.air)
      - "bigger prey -> bigger gain"

energy:
  from: ds:fish.energy
  status: refined               # уточнён: расход только в burst
  resolves_dse: [DSE-003, DSE-004]
  # DSE-004: "any thrust drains size" -> prey starved while wandering; fixed by mode gating
  contract:
    name: spendEnergy
    inputs: [size, mode, distanceMoved]
    output: size'
    rule: "if mode==burst: size' = size * (1 - 0.01 * (distance / (10*size))); else size unchanged"
    properties:
      - "cruise and drift cost nothing (ordinary swimming preserves size)"
      - "traveling 10*size in burst => -1% size"
      - "size never drops below MIN_SIZE (fish.air#ia:fish.energy.burst-only)"

reporting:
  serialize:
    from: do:serialize
    contract:
      name: serializeFish
      inputs: [fish]
      output: fishInfoText
      rule: >
        on demand (console/info panel), return structured text that contains:
        fish type (user|npc), fish size, fish age, and eaten-fish count.
      fields:
        - key: type
          allowed: [user, npc]
        - key: size
          type: number
        - key: age
          type: number
        - key: eatenFishCount
          type: integer
      properties:
        - "field set is fixed and complete for do:serialize"
        - "serialization has no side effects on fish simulation state"
