# prey.dsc — Formal Domain Model (generated from prey.ds)
# Status: FROZEN

module: prey

entity:
  id: PreyFish
  from: ds:prey.entity
  extends: fish.Fish              # наследует свойства рыбы
  controlled_by: world

behaviours:
  wander:
    from: ds:prey.wander
    contract:
      name: wanderSteer
      inputs: [self, dt, rng]
      output: { acceleration, mode: cruise }   # блуждание = cruise, размер не тратит
      rule: "occasionally pick new heading; gentle, slower than player; mode stays cruise"
  flee:
    from: [ds:prey.flee, ds:prey.flee.effort]
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
    from: ds:prey.spawn
    contract:
      name: maintainPopulation
      inputs: [preyCount, targetCount, world, rng]
      output: newPrey[]
      rule: "spawn just outside the world bounds, give each new fish a short spawn grace so it can swim into view from beyond the field before world bounds clamp it"
  variety:
    from: ds:prey.variety
    rule: "spawn size sampled from range [small .. medium], biased to small"
