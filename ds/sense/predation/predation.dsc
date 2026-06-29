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
  contract:
    name: canEat
    inputs: [predator, prey]
    output: boolean
    rule: "predator.size > prey.size * EAT_RATIO"

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
