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
    from: [ds:prey.wander, ia:prey.wander-cruise]
    contract:
      name: wanderSteer
      inputs: [self, dt, rng]
      output: { acceleration, mode: cruise }   # блуждание = cruise, размер не тратит
      rule: "occasionally pick new heading; gentle, slower than player; mode stays cruise"
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

population:
  spawn:
    from: [ds:prey.spawn, ia:prey.spawn-low-density-entry]
    contract:
      name: maintainPopulation
      inputs: [npcFishCount, targetNpcFishCount, world, rng]
      output: newNpcFish[]
      rule: "when NPC count is below target for current world size, spawn NPC fish in lowest-current-density areas computed over all fish"
    juvenile_growth:
      name: growSpawnedFryToNominalSize
      inputs: [spawnedNpcFish, dt]
      output: spawnedNpcFish'
      rule: "new NPC appears as fry and grows visually/domain-size smoothly to nominal start size over 10 seconds; after that it grows only by eating other fish"
      hunting_allowed_during_initial_growth: false
  variety:
    from: [ds:prey.variety, ia:prey.size-bias]
    rule: "spawn size sampled from range [small .. medium], biased to small"
