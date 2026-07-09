# controls.dsc — Formal Domain Model (generated from controls.ds)
# Status: coducted

module: controls

player:
  from: ds:controls.player
  rule: "each connected client instance controls exactly its own user fish; other user fish and NPC fish are not controlled by this client"

join_world:
  from: ds:controls.join-world
  contract:
    name: joinWorldForm
    inputs: [generatedName, generatedColor, userTierToggle]
    output: joinRequest
    fields:
      - name
      - color
      - userTier
    rule: "client shows a prefilled join form; user may keep or override generated name/color and choose paid/free type before connecting"

no_vulnerability_control:
  from: ds:controls.no-vulnerability-control
  rule: "UI and control input do not expose a separate user-fish vulnerability toggle; victim eligibility is derived from paid/free user tier rules"

leave_game:
  from: ds:controls.leave-game
  contract:
    name: leaveGameCommand
    inputs: [currentUserFish, attackBlockState]
    output: leaveRequest?
    rule: "explicit UI command requests conversion of current user fish to NPC through multiplayer.leave-game unless predation attack-block rule denies it"

join_after_leave:
  from: ds:controls.join-after-leave
  contract:
    name: joinAfterLeave
    inputs: [leaveResult, joinFormState]
    output: entryUiState
    rule: >
      after a successful explicit leave, the current client returns to the entry
      state: the leave command becomes an enter command, the enter command opens
      the start form with name, color, and existing paid/free choice, and submitting
      that form creates a new user fish for this client instance through the normal
      join-world identity flow.

game_surface_input_ownership:
  from: ds:controls.game-surface-input-ownership
  contract:
    name: bindGameSurfaceInputOwnership
    inputs: [gameSurface, gameControls, joinForm, ordinaryUiControls]
    output: browserGesturePolicy
    rule: >
      the game surface and game controls are owned by game input, so text
      selection, element selection, context gestures, scrolling, zooming, and
      browser navigation touch gestures yield to game controls there. The join
      form and ordinary UI controls keep their normal typing, selection, click,
      and activation behavior.

input:
  device:
    from: ds:controls.device-type
    contract:
      name: detectControlDeviceType
      inputs: [clientCapabilities]
      output: deviceType
      allowed: [pointer, touch]
      rule: "client detects ordinary pointer vs mobile/touch device to select available input modes; this does not change fish movement rules"
  mode_select:
    from: ds:controls.mode-select
    contract:
      name: selectControlMode
      inputs: [deviceType, selectedMode]
      output: activeControlMode
      allowed_by_device:
        pointer: [keyboard, pointer]
        touch: [touch, joystick]
      rule: "client uses an explicit control-mode switch; only input belonging to the selected mode is processed"
      automatic_last_input_switching: false
  initial_mode:
    from: ds:controls.initial-mode
    contract:
      name: initialControlMode
      inputs: [deviceType]
      output: activeControlMode
      rule: "when the web app opens, pointer devices start in keyboard mode and mobile/touch devices start in joystick mode; the explicit control-mode switch can change the mode after join"
  pointer:
    from: ds:controls.pointer
    contract:
      name: pointerSteer
      inputs: [activeControlMode, userFishPos, pointerPos]
      output: acceleration
      rule: "when activeControlMode == pointer, accelerate current client's user fish toward pointer; magnitude grows with distance, capped"
  keys:
    from: [ds:controls.keys, ia:controls.key-layout-equivalents, ia:controls.key-combo-compose]
    contract:
      name: keySteer
      inputs: [activeControlMode, keysDown]
      output: acceleration
      mapping: { ArrowUp/W: up, ArrowDown/S: down, ArrowLeft/A: left, ArrowRight/D: right }
      compose: "simultaneous movement keys compose one acceleration vector"
      layout_equivalents: "where possible, keyboard-layout equivalents are accepted"
      rule: "when activeControlMode == keyboard, movement keys produce one composed acceleration vector; pointer input is ignored in this mode"
  mobile_touch:
    from: ds:controls.mobile-touch
    contract:
      name: touchSteer
      inputs: [activeControlMode, primaryTouch, userFishPos]
      output: acceleration
      rule: "when activeControlMode == touch, the first active touch defines movement from current client's user fish toward that touch point; releasing the primary touch stops directed movement"
  mobile_joystick:
    from: ds:controls.mobile-joystick
    contract:
      name: joystickSteer
      inputs: [activeControlMode, joystickVector]
      output: acceleration
      rule: "when activeControlMode == joystick, the screen joystick defines the movement vector; releasing it stops directed movement"
  hunt:
    from: [ds:controls.hunt, ds:controls.mobile-hunt, ds:controls.mobile-joystick-hunt, ia:controls.hunt-binding]
    contract:
      name: huntMode
      inputs: [activeControlMode, keysDown, pointerDown, touches, joystickHuntControl]
      output: mode                 # burst while Space or mouse held, else cruise
      rule: >
        for current client's user fish: Space enables burst in every active
        control mode; pointer mode also uses held mouse button, touch mode also
        uses the second simultaneous touch, and joystick mode also uses a
        separate on-screen hunt control. The joystick hunt control is placed on
        the left side of the screen so movement can be handled with the right
        hand and burst with the left. Hunt switches only cruise/burst regime;
        steering remains defined by the active movement mode. In touch mode,
        releasing the primary touch stops directed movement but can preserve
        burst while the second touch is still held.
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
  model: follow-user-fish
  zoom: none
  scroll: none
  boundary: "viewport is centered around current client's user fish; full world need not fit on screen"
