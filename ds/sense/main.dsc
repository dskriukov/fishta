# main.dsc — Formal Domain Model (generated from main.ds)
# Layer: Domain Sense Coduction
# Status: reviewed by coductor, FROZEN (do not edit; edit main.ds and recompile)

domain: fish-eat-fish
version: 0.1.0

# Машинно-читаемая сводка мира. Детали — в доменных модулях.
world:
  dimensionality: 2          # from ds:world.flat
  time:
    exists: true             # from ds:world.time
    model: continuous        # непрерывное время, шаг dt
  medium: water              # from ds:world.medium.water (see world.dsc)

modules:                     # from ds:domain.modules
  - world
  - fish
  - prey
  - predation
  - controls

goal:                        # from ds:goal.growth
  type: open-ended-growth
  player_can_lose: false
  success_metric: player.size

constraints:                 # from ds:intent.game
  runtime: browser
  backend: none
  distribution: single-entry-html

# Domain validation summary (precompile gate)
validation:
  errors: []
  resolved:
    - id: DSE-001
      was: "fish move but time/change undefined"
      fixed_by: ds:world.time
    - id: DSE-002
      was: "fish exist but no medium"
      fixed_by: ds:world.medium.water
