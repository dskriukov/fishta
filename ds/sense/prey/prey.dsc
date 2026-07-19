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
    from: [ds:prey.flee, ds:prey.flee.effort, ds:npc.flee-immediate-danger-response, ia:prey.flee-proximity, ia:prey.flee-vain-skip, ia:prey.speed-cap, ia:npc.flee-urgency-state]
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
  burst_endurance:
    from: [ds:prey.burst-endurance, ds:fish.burst-endurance]
    contract:
      name: clampNpcSpeedLevel
      inputs: [self.size, desiredSpeedLevel, REGIME.npcMaxBurstLevel]
      output: speedLevel
      rule: "NPC burst level is an explicit intent value in the range REGIME.burstStartSpeedLevel..REGIME.npcMaxBurstLevel (79); flee intent raises and recovers this value, while the energy floor remains enforced by spendEnergy"
  risk_aware_hunt_choice:
    from: [ds:npc.risk-aware-hunt-choice, ds:npc.danger-aware-steering, ds:npc.hunt-danger-correction, fix:npc.hunt-inertia-strategies, ds:npc.flee-safest-direction, ds:npc.flee-immediate-danger-response, ds:npc.decision-inertia, ds:npc.courage-selection, ds:fish.growth, ds:predation.rule, ia:npc.steering-tunables, ia:npc.flee-urgency-state, ia:npc.flee-fear-recovery]
    contract:
      name: chooseNpcIntent
      inputs: [self, threats[], candidatePrey[], courage, dt]
      output: { target?, acceleration, mode, speedLevel, intent }
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
        choose any direction around the full circle. If either of the first two
        danger circles is occupied, choose the midpoint of the widest contiguous
        safe angular sector; if every sector is occupied, choose the least-dangerous
        candidate. On the first fresh decision with either circle occupied, set the
        target burst level to the burst floor plus one configured urgency step; on
        every subsequent fresh decision while danger remains, add the same step up
        to the NPC burst cap. Preserve fear recovery after immediate danger clears by
        gradually reducing burst level toward the burst floor, and leave fleeing
        only after the recovery interval and release distance are both satisfied.
        Keep acceleration as a separate physical smoothing signal with only a
        bounded fear-dependent adjustment. Direction, acceleration, and burst-level
        changes are smoothed by configurable decision inertia, turn-rate,
        acceleration-response, and flee-urgency tunables.
        Before choosing fear-driven flight, test the selected prey direction and
        its bounded safety correction against the first two danger circles. If
        that route has no immediate danger, continue hunting along the safest
        corrected route even while a non-immediate predator is present.
        For each newly selected target, persist one randomly chosen hunt strategy:
        braking approach regulates target speed from stopping distance and keeps
        a directed contact-speed floor; inertia approach offsets the base target
        vector by relative velocity over a short lead horizon and continues thrust.
        Both strategies use the same danger correction and acceleration smoothing.
  hunt_inertia_strategies:
    from: [fix:npc.hunt-inertia-strategies, ds:npc.decision-inertia]
    contract:
      name: huntMotionStrategy
      inputs: [self, target, targetDirection, world, strategy, dt]
      output: { strategy: "brake|inertia", acceleration, mode: burst }
      rule: "brake strategy chooses a target speed from remaining contact gap and stopping acceleration with a positive attack-speed floor; inertia strategy aims at target delta minus relativeVelocity * huntInertiaLeadSeconds; strategy is sampled once per target and shared danger correction remains authoritative"
  flee_immediate_danger_response:
    from: [ds:npc.flee-immediate-danger-response, ia:npc.flee-urgency-state, ia:npc.flee-fear-recovery, ia:npc.steering-tunables]
    contract:
      name: fleeImmediateDangerResponse
      inputs: [self, candidateDirections[], immediateDangerByDirection[], decisionFresh, mode, dt]
      output: { direction, immediateDanger, urgency, fearRecovery, burstLevel, acceleration }
      rule: "When mode=flee, select the midpoint of the widest contiguous sector whose first two danger circles are clear; when no such sector exists, select the minimum-danger direction. The first fresh decision with immediate danger targets the burst floor plus one urgency step; subsequent fresh decisions add the same step, subject to the cap. Preserve a decaying fear recovery until both the recovery interval and release distance are satisfied. Keep acceleration as a separately smoothed physical response."
  danger_aware_steering:
    from: [ds:npc.danger-aware-steering, ds:npc.hunt-danger-correction, ds:npc.flee-safest-direction, ds:npc.flee-immediate-danger-response, ds:npc.decision-inertia, ia:npc.steering-tunables, ia:npc.flee-urgency-state]
    contract:
      name: chooseDangerAwareDirection
      inputs: [self, world, baseDirection?, mode, dt]
      output: { direction, dangerScore, immediateDanger, fleeUrgency }
      rule: >
        collect all potential predators that can eat self by predation size/type.
        Sample candidate directions. For hunt mode, candidates are limited around
        baseDirection toward the selected prey by the hunt correction angle. For
        flee mode, candidates cover 360 degrees. Score each candidate by projected
        path risk against predator radius, self radius, contact distance, and attack
        reach. In flee mode classify the first two circles, choose the midpoint of
        the widest contiguous clear sector when one exists, and otherwise choose
        the lowest-risk direction. Apply decision inertia before producing
        acceleration and burst level, so abrupt direction and speed changes are
        avoided; expose immediateDanger and the persistent flee urgency for
        burst-level selection.
        Probe one short-horizon position extrapolated from current velocity
        in addition to the current position for every candidate direction; reject a direction when its projected
        position enters the first two danger circles, even if the current point
        is still clear.
  motivated_navigation:
    from: [ds:npc.local-food-motivation, ds:npc.food-profitability, ds:npc.shred-foraging, ds:npc.ring-route-safety, ds:npc.immediate-danger-stop, ds:npc.post-meal-safety, ds:npc.courage-motivation-balance, ds:npc.adaptive-danger-evaluation, ds:world.interaction-segments, ds:world.danger-raster, ia:npc.food-economics-tunables]
    contract:
      name: chooseNpcIntent
      inputs: [self, localCandidates, interactionSegments, dangerRaster, courage, currentDirection]
      output: { target?, direction, motivation, mode }
      rule: >
        derive edible fish and shred groups from the observer's wrapped 3x3
        interaction-segment neighbourhood and rank them by expected net nutrition
        after distance and hunt-energy cost. Group nearby edible shreds, sum their
        available layer nutrition, and target the nutrition-weighted group center;
        shreds contribute no evasion penalty. Keep only targets with positive net
        nutrition after the configured safety margin. For every candidate route, sample the danger raster in
        angular sectors on concentric circles centered on self: circle diameters
        begin at 2 * self.diameter and increase by self.diameter. A sector found
        dangerous on a nearer circle stays blocked for outer circles. A deadly
        threat on either of the first two circles blocks the direction for every
        courage value. Continue the route check beyond the candidate contact point.
        When first-circle feeding is practically certain, evaluate the later route
        with the predicted post-meal size and remove predators that then fail the
        predation eligibility threshold. Choose a remaining route by net nutrition
        and courage-weighted outer risk, breaking close scores toward currentDirection.
    evaluation_mode:
      sparse: "exact coordinate comparisons against local fish candidates"
      dense: "shared danger-raster samples"
      threshold: configurable_and_profiled
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
