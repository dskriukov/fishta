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

start_background:
  from: ds:controls.start-background
  asset: ds/assets/start.png
  contract:
    name: drawStartBackground
    inputs: [entryUiState, startBackgroundImage]
    output: startScreenBackground
    rule: >
      the entry join screen uses start.png as its own visual background before
      the client joins the world. This UI background is separate from the game
      surface parallax background used after entry.

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
      screen_modes: [joystick, pointer, touch]
      experimental_screen_modes: [pointer, touch]
      rule: "client uses an explicit control-mode switch for experimental pointer/touch screen input; keyboard input remains active in every mode and joystick is the default screen input outside pointer/touch"
      automatic_last_input_switching: false
  initial_mode:
    from: ds:controls.initial-mode
    contract:
      name: initialControlMode
      inputs: [deviceType]
      output: activeControlMode
      rule: "when the web app opens, the screen input mode starts as joystick/default; the explicit control-mode switch can choose experimental pointer or touch mode after join"
  primary_keyboard_and_joystick:
    from: ds:controls.primary-keyboard-and-joystick
    contract:
      name: primaryKeyboardAndJoystickInput
      inputs: [activeControlMode, keysDown, joystickVector]
      output: activeInputSources
      rule: "keyboard movement and burst keys are always processed after join; visual joystick is visible and active whenever activeControlMode is not pointer or touch"
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
      inputs: [keysDown]
      output: acceleration
      mapping: { ArrowUp/W: up, ArrowDown/S: down, ArrowLeft/A: left, ArrowRight/D: right }
      compose: "simultaneous movement keys compose one acceleration vector"
      layout_equivalents: "where possible, keyboard-layout equivalents are accepted"
      rule: "movement keys produce one composed acceleration vector in every activeControlMode, have priority over pointer, touch, and joystick steering, and select cruise speedLevel 30 when no higher keyboard speed key is held"
  mobile_touch:
    from: ds:controls.mobile-touch
    contract:
      name: touchSteer
      inputs: [activeControlMode, primaryTouch, currentUserFishViewportPos, viewportSize]
      output: { acceleration, speedLevel: integer[0,99] }
      rule: "when activeControlMode == touch, the first active touch defines direction from the current user fish screen position toward the touch point and maps radial distance from that fish position to relative speed v=0..99; releasing the touch stops directed movement and returns speedLevel to 0"
  mobile_joystick:
    from: ds:controls.mobile-joystick
    contract:
      name: joystickSteer
      inputs: [activeControlMode, joystickBaseRect, pointerOrTouchPoint]
      output: { acceleration, speedLevel: integer[0,99] }
      rule: "when activeControlMode is not pointer or touch, the visible joystick base in the lower-right interface area defines movement direction and speedLevel from pointer displacement relative to its own center; releasing it stops directed movement and returns speedLevel to 0"
  hunt:
    from: [ds:controls.hunt, ds:controls.mobile-hunt, ds:controls.mobile-joystick-hunt, ia:controls.hunt-binding]
    contract:
      name: speedControl
      inputs: [activeControlMode, keysDown, pointerDown, primaryTouch, joystickVector]
      output: { mode: enum[cruise,burst], speedLevel: integer[0,99] }
      rule: >
        for current client's user fish: movement keys select speedLevel 30,
        Space and key 1 select speedLevel 31,
        key 2 selects speedLevel 65, and key 3 selects speedLevel 99; the highest
        active key-selected level wins in every activeControlMode. Pointer mode uses held mouse button as
        speedLevel 31 only when selected as the experimental screen mode. Touch mode derives speedLevel linearly from radial distance to the current user fish screen position. Joystick mode derives speedLevel from radial distance to the visible joystick base center with an expanded cruise radius: values 0..30 occupy 1.5 * (30/99) of the joystick radius, and values 31..99 occupy the remaining radius. Mode is cruise for speedLevel 0..30 and burst for speedLevel 31..99. Steering remains defined by the active movement source with keyboard priority.
  burst_endurance_limit:
    from: ds:controls.burst-endurance-limit
    contract:
      name: clampUserSpeedInput
      inputs: [desiredSpeedLevel, currentUserFish.size, fish.burstEnduranceThresholds]
      output: speedLevel
      rule: "before sending input, the client preserves cruise speedLevel 0..30 and reduces burst speedLevel 31..99 to the nearest available target speed for the current user fish size"
  burst_endurance_joystick_ui:
    from: ds:controls.burst-endurance-joystick-ui
    contract:
      name: updateJoystickBurstAvailability
      inputs: [currentUserFish.size, fish.burstEnduranceThresholds]
      output: joystickRingStyles
      rule: "visual speed availability uses v=31..99 only for burst constraints; cruise values v=1..30 are always available"
  joystick_current_burst_indicator:
    from: ds:controls.joystick-current-burst-indicator
    contract:
      name: updateJoystickCurrentBurstIndicator
      inputs: [currentUserFish.mode, currentUserFish.speedLevel]
      output: joystickCurrentBurstRingStyle
      rule: "when the current user fish has speedLevel 1..99, the visual joystick draws one extra ring at that relative-speed radius with double normal ring thickness; speedLevel 1..30 uses a blue cruise ring, and speedLevel 31..99 uses a pink burst intensity scale from calm pink at minimum burst to bright pink-red at maximum burst"
  burst_endurance_menu_table:
    from: ds:controls.burst-endurance-menu-table
    contract:
      name: updateBurstEnduranceTable
      inputs: [currentUserFish.size, fish.burstEnduranceThresholds]
      output: menuBurstEnduranceRows
      rule: "game menu renders a compact scrollable table for speedLevel v=1..99 with mode, minimum size threshold, availability, energy factor, expected size loss, and the time window used for that loss; v=1..30 has zero energy factor and zero expected loss"
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
