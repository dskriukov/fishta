# prey.dsc — Formal Domain Model (generated from prey.ds)
# Status: coducted

module: prey

entity:
  id: NpcFish
  from: [ds:prey.entity, ds:prey.npc-fish]
  extends: fish.Fish              # наследует свойства рыбы
  controlled_by: world
  npc_roles:
    - prey
    - abandoned-user-fish

behaviours:
  wander:
    from: [ds:prey.wander, ds:npc.continuous-motion-intent, ia:prey.wander-cruise]
    contract:
      name: wanderSteer
      inputs: [self, dt, rng]
      output: { acceleration, mode: cruise }   # блуждание = cruise, размер не тратит
      rule: "NPC always keeps an active movement intent; when no hunt target or threat exists, occasionally pick or keep a gentle wander heading; mode stays cruise"
  flee:
    from: [ds:prey.flee, ds:prey.flee.effort, ia:prey.flee-proximity, ia:prey.flee-vain-skip, ia:prey.speed-cap]
    contract:
      name: fleeSteer
      inputs: [self, threats[]]
      output: { acceleration, mode }
      rule: >
        nearest = nearest threat that isEdibleBySize(threat, self) within fleeRadius;
        if none -> { accel: 0, mode: cruise };
        else burst away from nearest: |accel| ∝ proximity (closer -> stronger);
        SKIP burst (mode=cruise, accel:0) if speed(self) > speed(nearest) + SPEED_MARGIN.
    status: refined          # уточнён: форсаж пропорционален близости + «не зря»
  risk_aware_hunt_choice:
    from: [ds:npc.risk-aware-hunt-choice, ds:npc.danger-aware-steering, ds:npc.hunt-danger-correction, ds:npc.flee-safest-direction, ds:npc.decision-inertia, ds:npc.courage-selection, ds:fish.growth, ds:predation.rule, ia:npc.steering-tunables]
    contract:
      name: chooseNpcIntent
      inputs: [self, threats[], candidatePrey[], courage, dt]
      output: { target?, acceleration, mode, intent }
      rule: >
        when a NPC can hunt and is also threatened, compare nearest relevant
        threat, selected prey, estimated time to incoming attack contact,
        estimated time to own attack, and expected post-eat size. If eating
        before incoming attack would make the current threat unable to eat this
        NPC by the predation threshold, the NPC may keep pursuing. If the
        threat can still eat it or reaches attack contact first, choose between
        pursuit and fleeing by individual courage. Fleeing moves along the
        trajectory that most effectively increases separation from the attacker.
        Potential threats are fish that can eat the NPC by predation size/type
        eligibility, independent of their current mode. Steering evaluates threat
        danger by position, size, radius, contact distance, and attack-zone reach.
        During hunting, safety correction is limited to a configurable angle from
        the target direction, initially 20 degrees. During fleeing, the NPC may
        choose any direction around the full circle when it minimizes summed danger.
        Direction and acceleration changes are smoothed by configurable decision
        inertia, turn-rate, and acceleration-response tunables.
  danger_aware_steering:
    from: [ds:npc.danger-aware-steering, ds:npc.hunt-danger-correction, ds:npc.flee-safest-direction, ds:npc.decision-inertia, ia:npc.steering-tunables]
    contract:
      name: chooseDangerAwareDirection
      inputs: [self, world, baseDirection?, mode, dt]
      output: { direction, dangerScore }
      rule: >
        collect all potential predators that can eat self by predation size/type.
        Sample candidate directions. For hunt mode, candidates are limited around
        baseDirection toward the selected prey by the hunt correction angle. For
        flee mode, candidates cover 360 degrees. Score each candidate by projected
        path risk against predator radius, self radius, contact distance, and attack
        reach. Return the lowest-risk direction. Apply decision inertia before
        producing acceleration, so abrupt direction and speed changes are avoided.
  courage:
    from: ds:npc.courage-selection
    range: [0, 100]
    spawn_rule: "new NPC courage is current live NPC average plus random +/-10%, clamped to 0..100; world start average is 50"
    diversity_rule: "every tenth new NPC receives fully random courage 0..100"
  lifetime_aging:
    from: [ds:npc.lifetime-aging, ds:world.high-load-old-age-suspension]
    contract:
      name: expireOldNpcFish
      inputs: [world.fish, dt]
      output: [expiredNpcFish[], world.fish', world.shreds']
      rule: "server removes NPC fish whose age reaches 5 minutes when old-age expiry is not suspended by controlled-object high load; this is an old-age death event, so no predator receives eaten credit; each old-age NPC death creates shreds through the common fish old-age shred spawn rule within the controlled-object limit"

population:
  spawn:
    from: [ds:prey.spawn, ds:npc.spawn-safe-water, ia:prey.spawn-low-density-entry]
    contract:
      name: maintainPopulation
      inputs: [npcFishCount, targetNpcFishCount, world, rng]
      output: newNpcFish[]
      rule: "when NPC count is below target for current world size, spawn NPC fish in lowest-current-density areas that are also free water against current fish positions, sizes, density, and attack zones"
    safe_water:
      contract:
        name: findSafeNpcSpawn
        inputs: [world, nominalStartSize, rng]
        output: spawnPoint
        rule: "chosen start position gives the new NPC time to start moving and run ordinary behaviour selection before the first possible attack contact"
    juvenile_growth:
      name: growSpawnedFryToNominalSize
      inputs: [spawnedNpcFish, dt]
      output: spawnedNpcFish'
      rule: "new NPC appears as fry and grows visually/domain-size smoothly to nominal start size over 10 seconds; after that it grows only by eating other fish"
      hunting_allowed_during_initial_growth: false
  variety:
    from: [ds:prey.variety, ia:prey.size-bias]
    rule: "spawn size sampled from range [small .. medium], biased to small"
