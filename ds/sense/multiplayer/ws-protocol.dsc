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
  sync_ack:
    format: "v:${N}"
    rule: "acknowledges the central cell of global absolute cycle N exactly once; never gates sending"
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
    rule: "ping is an independent connection-keepalive message and is excluded from Control metrics"
  changed_control:
    message: "c${x}${y}${mods}"
    trigger: "direction, control buttons, or burst level change"
    rule: "send immediately on change and repeat the current control state at least once per second"
  control_timeout:
    authority: server
    timeout_seconds: 1.5
    field: "lastControlAt"
    rule: "delete stale client input after timeout so the authoritative step applies zero acceleration and zero speed level while drag preserves inertial braking"

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
      - "first absolute fragment containing the current user's fish"
    mark: "server setup data received"
  delta_exchange:
    allowed_after: [server_ready, client_ready]
    rule: "before setup is complete, endpoint must not treat the connection as fully synchronized for relative fragments"

server_sync:
  from: ds:ws-protocol.server-sync
  identity_message:
    format: "i:${ID}:${token}"
    fields:
      ID: "current user's fish ID in the world"
      token: "temporary reconnect token for future r:${token}"
  scale_message:
    format: "s:${scale}"
    rule: "current rounded world scale after identity/reconnect and every user-count change"
  world_messages:
    absolute:
      format: "a:N:CELL_X:CELL_Y|ROWS"
      position: "cell-local world coordinates"
    relative:
      format: "|N:CELL_X:CELL_Y|ROWS"
      position: "deltas from immediately preceding server cycle"
    cycle:
      field: N
      rule: "one common cycle number strictly increases and never repeats or decreases"
      global_absolute_period: 20
      global_absolute_rule: "every twentieth cycle sends every delivered non-empty cell from the absolute row set regardless of distance"
    rate_message:
      format: "v:N:rate"
      rate_unit: bytes_per_second
      rule: "server sends the measured end-to-end rate after receiving the matching central-cell acknowledgment"
    fragment:
      fields: [N, CELL_X, CELL_Y, ROWS]
      row_separator: "|"
      rule: "every fragment has a cycle and cell header; the protocol intentionally has no legacy global snapshot compatibility"

spatial_fragments:
  from: ds:ws-protocol.spatial-fragments
  cell_size_wu: { width: SYNC.cellSize, height: SYNC.cellSize }
  membership: "cell containing the object position center"
  object_kinds: [fish, shred]
  source_sets:
    absolute: "one shared serialized row set per completed server cycle"
    relative: "one shared serialized row set per completed server cycle"
  indexing:
    rule: "record start and end row indices in both shared sets only for non-empty cells"
    empty_cells: "are omitted from shared strings, ranges, and delivery entries"
  delivery:
    template: "synchronization-order matrix selected by grid columns and rows"
    phases: "common asynchronous phases consume the selected matrix order"
    wrap: toroidal
    rule: "no per-client distance sorting; all clients advance through the same phase before the next phase"
  reset:
    trigger: "next completed shared cycle exists before common phase plan is exhausted"
    action: "drop unsent plan entries and start the newer N"

empty_cell_fragment_fix:
  from: fix:multiplayer.empty-cell-fragments
  contract:
    name: nonEmptyCellDeliveryOnly
    rule: "filter matrix coordinates through the current non-empty cell index before adding plan entries; empty coordinates remain ordering positions and produce no WebSocket message"

sync_ack_throughput:
  from: ds:ws-protocol.sync-ack-throughput
  trigger: "client receives the central cell fragment of a global absolute cycle"
  client_message: "v:N once per global absolute cycle"
  server_measurement:
    sample: "the sent central-cell absolute fragment"
    elapsed: "from socket.send() placement to receipt of matching v:N"
    rate: "sent message bytes / elapsed seconds"
  server_message:
    format: "v:N:rate"
    unit: bytes_per_second
  effect: "does not gate or alter synchronization delivery"

cell_local_position:
  from: ds:ws-protocol.cell-local-position
  absolute_decode:
    x: "CELL_X * SYNC.cellSize + localX"
    y: "CELL_Y * SYNC.cellSize + localY"
  relative_decode:
    rule: "add the row delta to the same object's state from the immediately preceding server cycle"

sync_order_matrix_7x7:
  from: ds:ws-protocol.sync-order-matrix-7x7
  dimensions: { columns: 7, rows: 7 }
  origin: user_cell
  coordinate_system: "dx is horizontal with right positive; dy is vertical with down positive"
  entries:
    - [0, 0]
    - [-1, 0]
    - [1, 0]
    - [0, -1]
    - [0, 1]
    - [-1, -1]
    - [1, 1]
    - [-1, 1]
    - [1, -1]
    - [-2, 0]
    - [2, 0]
    - [0, -2]
    - [0, 2]
    - [-2, -1]
    - [2, 1]
    - [-2, 1]
    - [2, -1]
    - [-1, -2]
    - [1, 2]
    - [-1, 2]
    - [1, -2]
    - [-3, 0]
    - [3, 0]
    - [0, -3]
    - [0, 3]
    - [-2, -2]
    - [2, 2]
    - [-2, 2]
    - [2, -2]
    - [-3, 1]
    - [3, -1]
    - [-3, -1]
    - [3, 1]
    - [-1, -3]
    - [1, 3]
    - [1, -3]
    - [-1, 3]
    - [-3, -2]
    - [3, 2]
    - [-3, 2]
    - [3, -2]
    - [-2, -3]
    - [2, 3]
    - [-2, 3]
    - [2, -3]
    - [-3, 3]
    - [-3, -3]
    - [3, -3]
    - [3, 3]

new_object_row:
  from: ds:ws-protocol.new-object-row
  marker: n
  placement: "immediately before the object's existing identifier token"
  duration_cycles: 10
  payload: "full absolute object state with cell-local position"
  fragment_override: "row remains absolute even inside a relative fragment"
  client_rule: "create object or restore an absolute baseline without predecessor state"
  separate_creation_message: false

shared_world_snapshot:
  from: ds:ws-protocol.shared-world-snapshot
  authoritative_world_step_hz_min: 10
  prepared_cycle:
    scope: all_live_fish_and_shreds
    serialization: "one shared absolute row set and one shared relative row set"
    grouping: "non-empty cells with row index ranges plus empty-cell flags and prebuilt templates"
    per_client_object_serialization: false
    per_client_delivery: "only chooses and sends ranges from the shared prepared sets"

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
    absolute_message: "coordinates local to the fragment cell"
    relative_message: "coordinate deltas from preceding server cycle"
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
    omission: "does not imply removal"
  full:
    marker: s
    trigger: [absolute_fragment, first_shred_appearance]
    fields: [id, size, geometric_area, initial_geometric_area, source_color, remaining_layers, visual_seed, decay_age, cell_local_position, motion]
  dynamic:
    marker: d
    trigger: "synchronized shred in a relative fragment"
    fields: [id, position_delta, motion, decay_age, remaining_layers_when_changed]
    preserved_client_fields: [size, geometric_area, initial_geometric_area, source_color, visual_seed]

state_mods:
  from: ds:ws-protocol.state-mods
  flags:
    a: "fish is under threat / can be attacked"
    v1..v99: "current relative speed level"
    f: "fear mode"
  combinations:
    threat_with_speed_level: "fish moves while also under threat"

object_removal:
  from: ds:ws-protocol.object-removal
  format: "x:${TRANSPORT_ID}"
  transport_id:
    fish: "${ID}"
    shred: "s${ID}"
  audience: all_clients
  trigger: "immediately when fish or shred is removed from authoritative world"
  priority: "independent of fragment queue, cycle, and cell; wins over late fragment rows"
  creation: "no separate creation message; a full absolute row creates the object"
  reused_id: "an absolute row after x:${TRANSPORT_ID} creates a new object without generation tracking"

client_fragment_validity:
  from: ds:ws-protocol.client-fragment-validity
  identity_key: object_ID
  relative_apply:
    prerequisite: "applicable object state from N - 1"
    on_missing_predecessor: "ignore relative row and keep object unrendered until an absolute row"
  completed_cycle_check:
    trigger: "first received fragment of N + 1"
    unsynchronized_when:
      - "object was received in N - 1"
      - "object was not received in N"
      - "x:${TRANSPORT_ID} was not received"
    rule: "absence during the current unfinished cycle is not unsynchronized"

client_timing_and_visibility:
  from: ds:ws-protocol.client-timing-and-visibility
  cycle_clock: "local receive time of first fragment for each N"
  render_position: "wrap(server_base_position + last_velocity * elapsed_since_cycle_clock)"
  temporary_unsynchronized:
    motion: "continues extrapolation"
    fade_out_seconds: 0.2
    after_fade: "remain cached but not rendered until absolute row or x:${TRANSPORT_ID}"
  absolute_recovery:
    active_fade: "cancel fade, replace server state, and fade current alpha to 1 over 0.2 seconds"
    new_or_hidden: "create or reveal with alpha 0 to 1 over 0.2 seconds"
  removal_animation:
    trigger: "x:${TRANSPORT_ID}"
    motion: "stop at currently displayed position"
    opacity: "ease-out to 0 over 0.1 seconds"
    completion: "remove local cache object"

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

diagnostic_danger_map_stream:
  from: [ds:ws-protocol.danger-map-stream, ds:world.danger-raster, ds:world.interaction-segments]
  endpoint: "/danger-map"
  transport: WebSocket
  direction: server_to_client
  payload: "binary PNG frame"
  frequency_hz: 10
  frame:
    layers: [monochrome_danger_raster, interaction_segment_grid]
    coordinate_space: world
  client_role: "read-only diagnostic consumer"
