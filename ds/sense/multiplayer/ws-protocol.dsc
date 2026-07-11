# ws-protocol.dsc — Formal Domain Model (generated from ws-protocol.ds)
# Status: coducted

module: ws-protocol

encoding:
  from: ds:ws-protocol.encoding
  transport: WebSocket
  payload_kind: ascii-string
  json_allowed: false
  first_character_dispatch: true
  structural_charset: ASCII
  text_encoding:
    fish_name: base64url
    rule: "user-facing fish names may contain Cyrillic or other non-ASCII text, but protocol structure remains ASCII"

client_messages:
  from: ds:ws-protocol.client-messages
  new_fish:
    format: "n:${color}:${name}:${type}"
    fields:
      color: { type: hex_rgb, prefix_hash: false }
      name: { type: base64url_string }
      type: { allowed: [u, p], meaning: { u: ordinary_user_fish, p: paid_user_fish } }
  reconnect:
    format: "r:${token}"
    fields:
      token: temporary_connection_code
  leave:
    format: "q"
  ping:
    format: "p:${N}"
    fields:
      N: { type: integer, rule: "increments for each sent ping" }
  control:
    format: "c${x}${y}${mods}"
    fields:
      x: { type: signed_thousandths, range: [-999, 999], width: 4, example: "-123" }
      y: { type: signed_thousandths, range: [-999, 999], width: 4, example: "+050" }
      mods: { type: string, flags: { v1..v99: speedLevel } }
    example:
      message: "c-123+050v50"
      value: { x: -0.123, y: 0.050, speedLevel: 50 }

client_delta_input:
  from: ds:ws-protocol.client-delta-input
  initial_control:
    trigger: "after successful new_fish or reconnect"
    rule: "client sends current absolute control vector once"
  idle:
    message: "p:${N}"
    period_seconds: 1
    rule: "when control does not change, client sends only ping and does not repeat zero/control messages"
  changed_control:
    message: "c${x}${y}${mods}"
    trigger: "direction, control buttons, or burst level change"
    rule: "send only changed control state"

handshake:
  from: ds:ws-protocol.handshake-state
  server_ready:
    requires:
      - "successful n or r"
      - "first current c control message"
    mark: "client setup data received"
  client_ready:
    requires:
      - "i:${ID}:${token}"
      - "first absolute a|... world state"
    mark: "server setup data received"
  delta_exchange:
    allowed_after: [server_ready, client_ready]
    rule: "before setup is complete, endpoint must not treat the connection as fully synchronized for delta exchange"

server_sync:
  from: ds:ws-protocol.server-sync
  identity_message:
    format: "i:${ID}:${token}"
    fields:
      ID: "current user's fish ID in the world"
      token: "temporary reconnect token for future r:${token}"
  world_messages:
    absolute:
      prefix: "a|"
      trigger:
        - "after setup"
        - "every 20 server state messages"
    delta:
      prefix: "|"
      trigger: "ordinary server state message between absolute baselines"
    audience: all_clients
    rule: "one shared world string includes all fish for all clients; client finds own fish by ID from identity_message"
    delta_fields: "only changed OPT fields are transmitted; unchanged OPT fields are ="

shared_world_snapshot:
  from: ds:ws-protocol.shared-world-snapshot
  authoritative_world_step_hz_min: 10
  current_delivery:
    scope: all_live_fish_and_shreds
    serialization: one_shared_message_per_sync
    fanout: "send the already serialized message to every connected client"
    per_client_object_serialization: false
  future_spatial_delivery:
    rule: "cached world fragments may replace global fanout by viewport subscription without duplicating authoritative world calculation"

fish_row:
  from: ds:ws-protocol.fish-row
  format: "ID:TYPE EATEN_OPT:SIZE_ABS:COLOR1_OPT:COLOR2_OPT:NAME_OPT POS_X_OPT:POS_Y_OPT MOVING_ANG:MOVING_SPEED STATE_MODS"
  type_codes:
    u: ordinary_user_fish
    p: paid_user_fish
    n: npc_fish
  optional_fields:
    marker: "="
    fields: [EATEN_OPT, COLOR1_OPT, COLOR2_OPT, NAME_OPT, POS_X_OPT, POS_Y_OPT]
    rule: "in delta messages, unchanged OPT fields are encoded as ="
  size:
    field: SIZE_ABS
    precision: 3
    delta_rule: "absolute value when changed; = when unchanged"
  position:
    precision: 5
    absolute_message: "absolute coordinates"
    delta_message: "coordinate deltas"
  motion:
    angle_precision: 5
    speed_precision: 2
  color:
    format: "hex RGB without #"
  name:
    format: base64url

shred_row:
  from: ds:ws-protocol.shred-row
  lifecycle:
    every_sync_contains: every_live_shred
    omission: "removes shred from client cache"
  full:
    marker: s
    trigger: [absolute_world_message, first_shred_appearance]
    fields: [id, size, geometric_area, initial_geometric_area, source_color, remaining_layers, visual_seed, decay_age, position, motion]
  dynamic:
    marker: d
    trigger: "known shred in a delta world message"
    fields: [id, position, motion, decay_age, remaining_layers_when_changed]
    preserved_client_fields: [size, geometric_area, initial_geometric_area, source_color, visual_seed]
  recovery:
    rule: "absolute world messages rebuild the complete client shred cache without prior delta state"

state_mods:
  from: ds:ws-protocol.state-mods
  flags:
    a: "fish is under threat / can be attacked"
    v1..v99: "current relative speed level"
    f: "fear mode"
    e: "fish is eaten"
  combinations:
    threat_with_speed_level: "fish moves while also under threat"
  eaten_lifecycle:
    rule: "after sending e, server removes the fish from the world and does not send that ID in following sync messages"

events:
  from: ds:ws-protocol.events
  format: "e:${event_type}:${event_data}"
  audience: specific_client
  event_types:
    eat:
      format: "e:eat:${ID}"
      meaning: "current user ate fish ID"
    wrn:
      format: "e:wrn:${ID}"
      meaning: "fish ID threatens current user; client may show short warning"
    npc:
      format: "e:npc:${ID}"
      meaning: "fish ID converted to NPC"
