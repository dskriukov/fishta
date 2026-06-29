# world.dsc — Formal Domain Model (generated from world.ds)
# Status: FROZEN

module: world

medium:
  id: water
  from: ds:world.medium.water
  rule: "entities of kind=fish require medium=water to exist and move"

surface:
  from: ds:world.surface.flat
  space: euclidean-2d
  coordinates: [x, y]
  depth: none

bounds:
  from: ds:world.bounds
  shape: rectangle
  properties: [width, height]
  edge_behaviour: clamp        # decision recorded in world.air
  contract:
    name: keepInsideBounds
    inputs: [position, radius, width, height]
    output: position'          # позиция, прижатая к краю
    invariant: "0+radius <= x <= width-radius (same for y)"

dynamics:
  drag:
    from: ds:world.drag
    model: linear-velocity-damping
    contract:
      name: applyDrag
      inputs: [velocity, dragCoefficient, dt]
      output: velocity'
      invariant: "|velocity'| <= |velocity|"   # сопротивление не разгоняет

decor:
  bubbles:
    from: ds:world.decor.bubbles
    entity:
      id: Bubble
      properties: [position, radius, velocity, life, alpha]
    contract:
      name: emitBubbles
      inputs: [fish, dt, rng]
      output: bubble?
      rule: >
        periodically emit bursts of 2-5 bubbles near the fish mouth; radius
        is derived from fish size so large fish produce noticeably larger bubbles,
        and small fish do not get clamped to the same visible size. Bubble radius
        is capped at 10% of fish size and uses a very small minimum radius so the
        lower bound does not dominate the result.
    animation:
      name: advanceBubbles
      inputs: [bubbles[], dt, world]
      output: bubbles[]
      rule: "bubbles rise upward, drift slightly, fade out, and are removed when expired or out of world; the fill is nearly transparent while the contour remains visible and may subtly pulse in the vertical axis"
