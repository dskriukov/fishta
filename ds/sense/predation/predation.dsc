# predation.dsc — Formal Domain Model (generated from predation.ds)
# Status: FROZEN

module: predation

contact:
  from: ds:predation.contact
  contract:
    name: overlaps
    inputs: [fishA, fishB]
    output: boolean
    rule: "distance(posA, posB) < radius(A) + radius(B)"

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
    rule: "predator.mode == 'burst' and isEdibleBySize(predator, prey)"

hunt:
  from: ds:predation.hunt
  contract:
    name: huntSteer
    inputs: [hunter, visiblePrey[]]
    output: { acceleration, mode }
    rule: >
      if hunter has any visible prey edible by size: move toward the nearest edible prey and
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
      - "for each overlapping pair where canEat(a,b): remove b; grow a (fish.growth)"
      - "eaten prey decrements population -> later refilled (prey.spawn)"

symmetry:
  from: ds:predation.symmetry
  player_immune: true        # игрока не едят (goal.growth: player_can_lose=false)
