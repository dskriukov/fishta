# controls.dsc — Formal Domain Model (generated from controls.ds)
# Status: FROZEN

module: controls

player:
  from: ds:controls.player
  rule: "exactly one Fish is tagged as player"

input:
  pointer:
    from: ds:controls.pointer
    contract:
      name: pointerSteer
      inputs: [playerPos, pointerPos]
      output: acceleration
      rule: "accel toward pointer; magnitude grows with distance, capped"
    primary: true
  keys:
    from: ds:controls.keys
    contract:
      name: keySteer
      inputs: [keysDown]
      output: acceleration
      mapping: { ArrowUp/W: up, ArrowDown/S: down, ArrowLeft/A: left, ArrowRight/D: right }
      compose: "simultaneous movement keys compose one acceleration vector"
      layout_equivalents: "where possible, keyboard-layout equivalents are accepted"
      priority_rule: "movement keys override pointer steering while active"
      pointer_reactivation: "after movement-key input, pointer steering resumes only after pointer position changes"
    primary: false
  hunt:
    from: ds:controls.hunt
    contract:
      name: huntMode
      inputs: [keysDown, pointerDown, touchDown]
      output: mode                 # burst while Space or mouse held, else cruise
      rule: "mode = (Space in keysDown OR pointerDown OR touchDown) ? burst : cruise; steering unchanged"
    status: added
  exhale_hotkey:
    from: ds:controls.exhale-hotkey
    contract:
      name: exhaleHotkey
      inputs: [keysDown]
      output: exhaleRequest
      rule: "pressing O or Щ requests @fn:exhale"
    status: added
  inspect_click:
    from: ds:controls.inspect-click
    contract:
      name: inspectClick
      inputs: [clickPos, fishUnderClick]
      output: serializedFishLog
      rule: "clicking any fish logs @do:serialize for that fish"
    status: added

camera:
  from: ds:controls.camera
  model: fixed-fit            # весь мир виден целиком
  zoom: none
  scroll: none
  boundary: "world fits on screen (controls.air)"
