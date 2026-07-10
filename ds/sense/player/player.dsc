# player.dsc — Formal Domain Model (generated from player.ds)
# Status: coducted

module: player

spawn:
  fry_stage:
    from: ds:player.spawn-fry-stage
    contract:
      name: startUserFryStage
      triggers:
        - first_join
        - user_old_age_death
        - user_eaten_respawn
      inputs: [userFish, trigger, spawnPosition]
      output: userFish'
      rule: "user fish keeps its applicable user identity and enters a 3 second start window at minimum visible fry size; during this window the player already controls the fish and start growth raises the body to PLAYER.startSize, ending growth early if current size reaches PLAYER.startSize before the window expires"
      preserved_user_fields:
        - id
        - clientId
        - temporaryConnectionCode
        - userName
        - userColor
        - userTier
  placement:
    from: ds:player.spawn-placement
    contract:
      name: placeUserSpawn
      inputs: [world, spawnReason, oldFish?, oldAgeShreds?, rng]
      output: position
      rules:
        - "first join uses the ordinary start-area choice"
        - "predation respawn uses the existing lowest-density respawn placement"
        - "old-age respawn uses the center of the shred cloud produced by the dead predecessor body"
  fry_protection:
    from: ds:player.fry-feeding-and-invulnerability
    contract:
      name: applyUserFryProtection
      inputs: [userFry, predationCandidate]
      output: eligibility
      rules:
        - "while user fryAge is active during the 3 second start window, other fish predation attempts keep the user fish alive"
        - "while user fryAge is active during the 3 second start window, the user fish can feed on shreds and NPC fish when ordinary size/contact/speed rules pass"
        - "while user fryAge is active during the 3 second start window, user-fish victims are not eligible targets for that user fish"
        - "start growth completion does not clear fryAge; invulnerability continues until the 3 second start window expires"

lifetime:
  aging:
    from: ds:player.lifetime-aging
    contract:
      name: expireOldUserFish
      inputs: [world, dt, rng]
      output: world'
      rule: >
        user fish has an active lifetime longer than NPC lifetime. The active
        lifetime clock starts after the 3 second start window completes. When the
        active lifetime reaches the configured limit, the server treats it as an
        old-age death event: spawn shreds from the current body using the same
        fish-to-shreds rule as NPC old-age death, keep the same user fish id and
        user identity, and restart the fish through the 3 second start window at the
        center of the created shred cloud.
  ui:
    from: ds:player.lifetime-ui
    contract:
      name: updatePlayerLifetimeBar
      inputs: [currentUserFish, clientTime, PLAYER.maxLifetimeSeconds]
      output: lifetimeBarState
      placement: "noticeable top-center client UI"
      rule: "client renders remaining active lifetime from the current user fish synchronized playerActiveAge and PLAYER.maxLifetimeSeconds; while playerActiveAge is 0 during the start window the bar stays full, and any change to PLAYER.maxLifetimeSeconds directly changes the fill ratio without hardcoded local duration or size-based lifetime inference"
      urgency_colors:
        active: "normal active color when remaining active lifetime is 10 seconds or more"
        warning: "yellow when remaining active lifetime is less than 10 seconds"
        critical: "red when remaining active lifetime is less than 3 seconds"
  size_ui:
    from: ds:player.size-ui
    contract:
      name: updatePlayerSizeMetric
      inputs: [currentUserFish]
      output: playerSizeText
      placement: "next to player lifetime indicator in the same noticeable top-center client UI"
      rule: "client renders the current synchronized size of the current user fish with the numeric value as the primary visual element and the size label as secondary text, using an empty placeholder when no current user fish is present"
  speed_mode_ui:
    from: ds:player.speed-mode-ui
    contract:
      name: updatePlayerSpeedMetric
      inputs: [currentUserFish, activeControlMode]
      output: playerSpeedMetricState
      placement:
        joystick: "above the visual joystick UI"
        other_controls: "bottom-right viewport corner"
      value_rule: "when synchronized current user fish speed rounds to a non-zero two-decimal value, render an integer percent from 1 to 99 based on current real speed divided by the maximum possible speed of that user fish, plus the real speed with two decimal places"
      visibility_rule: "fade the whole metric in when the displayed speed becomes non-zero and fade it out when the displayed speed returns to zero or no current user fish is present"
      color_rule: "the integer percent value is green during cruise and uses a burst intensity gradient from green-pink at low speed to pink-red near the maximum speed during burst"
      typography: "the metric value font size matches the numeric player size metric font size"
