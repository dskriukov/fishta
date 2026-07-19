# multiplayer.dsc — Formal Domain Model (generated from multiplayer.ds)
# Status: coducted

module: multiplayer

server:
  local_server:
    from: ds:multiplayer.local-server
    authority: server
    rule: "local server is the base world model; a single connected user is a single-player experience over the same server-authoritative world"
  shared_world:
    from: ds:multiplayer.shared-world
    contains:
      - user_fish
      - npc_fish
  memory:
    from: ds:multiplayer.server-memory
    persistence: in-memory
    restart_persistence_required: false

connection:
  fish_assignment:
    from: ds:multiplayer.connection-fish
    contract:
      name: connectClientInstance
      inputs: [temporaryConnectionCode?, joinIdentity]
      output: userFish
      rule: "new client instance without active temporary code creates a new user fish; reconnect with current instance temporary code returns control to same fish after brief socket break"
  tab_session_binding:
    from: ds:multiplayer.tab-session-binding
    authority: client-memory
    fields:
      temporaryConnectionCode: "optional in-memory string scoped to the current browser tab"
    rule: "the client keeps the temporary code only in the current tab runtime and uses it for reconnect attempts; a fresh tab starts without a restoration code"
  reconnect_grace:
    from: ds:multiplayer.reconnect-grace
    duration_seconds: 3
    rule: "during unexpected socket break, user fish continues the last action for up to 3 seconds; reconnect with same temporary code restores control"
  disconnect_to_npc:
    from: ds:multiplayer.disconnect-to-npc
    contract:
      name: convertDisconnectedUserFishToNpc
      trigger: "unexpected offline duration > 3 seconds"
      rule: "fish remains in world with current domain parameters, becomes NPC immediately, and can be eaten by ordinary rules"
  leave_game:
    from: ds:multiplayer.leave-game
    contract:
      name: leaveGame
      inputs: [userFish, attackBlockState]
      output: world'
      rule: "explicit leave immediately converts user fish to NPC unless blocked by predation.leave-blocked-by-user-attack"

authority:
  server_authority:
    from: ds:multiplayer.server-authority
    server_owns:
      - fish existence
      - user-or-npc ownership
      - alive/eaten facts
      - NPC motivations
      - domain events
      - synchronizing coordinates
    client_prediction: "visual smoothness and responsive controls only; not source of truth"
  socket_sync:
    from: ds:multiplayer.socket-sync
    contract:
      name: syncWorld
      client_to_server: [userInput]
      server_to_client: [domainEvents, mandatoryObjectRemoval, spatialCoordinateFragments, worldScale]
      rule: "the server prepares one complete authoritative cycle and executes one shared phase order across all clients; concrete WebSocket message format is specified by ws-protocol.dsc"
    protocol_module: ws-protocol.dsc
  phase_synchronized_delivery:
    from: ds:multiplayer.phase-synchronized-delivery
    source: "synchronization-order matrix selected by computed grid dimensions"
    phases: "matrix order grouped into common asynchronous delivery phases"
    rule: "for each shared cycle, schedule every client's cells in the selected matrix order using relative offsets from its own cell; a new cycle discards unsent work from the preceding common phase plan"
  performance_statistics:
    from: ds:multiplayer.server-performance-statistics
    output:
      interval_seconds: 5
      destination: server_console
    window_averages:
      world_iteration_ms: "elapsed time of one authoritative world iteration"
      phase_duration_ms: "common delivery phase duration"
      controlled_object_count: "all live fish plus shreds sampled during authoritative iterations"
      dropped_fragments_per_sync_cycle: "unsent common-plan fragments discarded by a newer cycle, divided by prepared cycles"
      sync_ack: "received v:N acknowledgments and computed client rate values"
  server_world_calculation_metric:
    from: ds:multiplayer.server-world-calculation-metric
    authority: server
    source: "stepAuthoritativeWorld elapsed duration"
    window: "current server performance measurement window"
    excludes: [sync_plan_preparation, fragment_delivery, client_receipt, sync_cycle_interval]
    output: "average world calculation milliseconds sent to connected clients"
  client_sync_cycle_metric:
    from: ds:multiplayer.client-sync-cycle-metric
    authority: client
    source: "monotonic timestamps of first accepted fragment for each sequential cycle N"
    window: sliding
    excludes: [v_acknowledgment_messages]
    output: "average synchronization cycle interval milliseconds"
  sync_rate_feedback:
    from: ds:multiplayer.sync-rate-feedback
    authority: client-display
    field: rate
    unit: bytes_per_second
    source: "server message v:N:rate after a global absolute-cycle central-cell acknowledgment"
    surface: "lower information panel"
  client_event_rates:
    from: ds:multiplayer.client-event-rates
    authority: client-display
    window_seconds: 1
    dynamic_source: "accepted fish and shred coordinate rows received from the server"
    control_source: "successfully sent c... control messages"
    excluded_control_source: "p... ping messages"
    surface: "lower information panel"
    format: "<rate> Ev/s"
  control_heartbeat:
    from: ds:multiplayer.control-heartbeat
    authority: client-server
    client_period_seconds: 1
    server_timeout_seconds: 1.5
    message: "repeated c... control message"
    timeout_effect: "remove active control and let the fish brake through normal drag"

identity:
  from: ds:multiplayer.identity
  fields:
    name:
      source: "generated by default; user may override before connection"
    color:
      source: "generated by default; user may override before connection"
    userTier:
      allowed: [paid, free]
      source: "simple join-form toggle at current stage; no external account system"
  join_profile_preferences:
    from: ds:multiplayer.join-profile-preferences
    authority: client-local-settings
    fields: [userName, userColor]
    storage: localStorage
    rule: "customized name and color are stored independently from session binding and reused to prefill the next join form"
  name_generation:
    from: ds:multiplayer.name-generation
    rule: "default name is a pronounceable funny word, 4 to 12 characters"
  color_palettes:
    from: ds:multiplayer.color-palettes
    rule: "NPC fish use yellow tones; user fish use a separate color range so they are easy to distinguish"
  abandoned_fish_visual:
    from: ds:multiplayer.abandoned-fish-visual
    rule: "on leave or timeout, fish loses user name and paid/free protection, becomes NPC, and keeps part of former user color through a gradient toward NPC yellow"
