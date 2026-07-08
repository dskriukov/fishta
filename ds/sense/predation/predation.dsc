# predation.dsc — Formal Domain Model (generated from predation.ds)
# Status: coducted

module: predation

authority:
  from: ds:predation.server-authority
  source_of_truth: server
  rule: "server decisions about eaten/not-eaten predation events override divergent local client visual simulation"

contact:
  from: ds:predation.contact
  contract:
    name: overlaps
    inputs: [fishA, fishB]
    output: boolean
    rule: "distance(posA, posB) < radius(A) + radius(B)"
  attack_contact:
    from: ds:predation.attack-contact
    contract:
      name: isAttackContact
      inputs: [predator, victim]
      output: boolean
      rule: "predator is in burst, victim intersects the predator head/mouth area, predator satisfies size and victim-type eligibility, and current relative motion increases overlap between their canonical circular areas"

rule:
  from: ds:predation.rule
  threshold:
    name: EAT_RATIO
    meaning: "predator.size must exceed prey.size * (1 + margin)"
  size_predicate:
    name: isEdibleBySize
    inputs: [predator, prey]
    output: boolean
    rule: "predator.size > prey.size * EAT_RATIO"
  contract:
    name: canEat
    inputs: [predator, prey]
    output: boolean
    rule: "predator.mode == 'burst' and isEdibleBySize(predator, prey) and victim is eligible for this predator by user tier rules and isAttackContact(predator, prey)"

victim_eligibility:
  from: ds:predation.user-tier-eligibility
  contract:
    name: canBeVictimOf
    inputs: [predator, victim]
    output: boolean
    rules:
      - "NPC fish and abandoned user fish have no user-tier protection"
      - "paid user fish can be eaten only by another paid user fish when other predation conditions hold"
      - "free user fish can be eaten by any fish that satisfies ordinary predation conditions"

hunt:
  from: ds:predation.hunt
  contract:
    name: huntSteer
    inputs: [hunter, visiblePrey[]]
    output: { acceleration, mode }
    rule: >
      if hunter has any visible prey that is edible by size and allowed by
      victim eligibility: move toward the nearest eligible prey and
      return mode=burst; otherwise return no hunt acceleration and keep the
      current cruising behaviour.
    properties:
      - "hunter selects a prey target by proximity among edible visible prey"
      - "hunt is an active pursuit behaviour, not passive drift"
      - "hunt mode change is a domain decision that enables canEat"

effect:
  from: ds:predation.effect
  contract:
    name: resolveEating
    inputs: [world]
    output: world'
    steps:
      - "server evaluates overlapping pairs and canEat(a,b)"
      - "if b is an NPC fish: remove b from world; grow a; NPC density maintenance may later spawn replacement"
      - "if b is a user fish: grow a and respawn that user's fish at start size"

symmetry:
  from: ds:predation.symmetry
  rule: "predation is symmetric across fish; user fish can be predator or prey according to paid/free eligibility"

user_tier_eligibility:
  from: ds:predation.user-tier-eligibility
  paid_user_victim:
    allowed_predators: [paid_user_fish]
    excluded_predators: [free_user_fish, npc_fish]
  free_user_victim:
    allowed_predators: [paid_user_fish, free_user_fish, npc_fish]
  abandoned_user_fish:
    after_conversion: "treated as NPC; former paid/free protection is lost"

leave_blocked_by_user_attack:
  from: ds:predation.leave-blocked-by-user-attack
  contract:
    name: isLeaveBlockedByUserAttack
    inputs: [currentUserFish, otherUserFish[], dt]
    output: boolean
    rule: "true when another user fish is in burst/acceleration, moving toward current user fish, and distance / currentBurstSpeed < 2 seconds"
    exclusions:
      - "ordinary socket disconnect is not blocked"
      - "after fish becomes NPC, this rule no longer protects it"

player_respawn:
  from: ds:predation.player-respawn
  contract:
    name: respawnPlayerAfterEating
    trigger: "user fish is eaten"
    output: world'
    rule: "create a new user fish at the user's start size, not the minimum allowed fish size, in a current lowest-density area computed over all fish"
    preserves:
      - user_tier
