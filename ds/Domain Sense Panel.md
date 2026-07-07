# Domain Sense Panel

## Status

Concept fixation. This document records agreed ideas for a future Domain Sense panel. It is not an implementation plan and does not define executable code.

## Purpose

The panel should make Domain Sense work visible and navigable. Its main job is to reduce the cost of keeping `.ds`, `.ia`, `fix:*`, `.dsc`, `.air`, `.dsr`, and executable implementation aligned.

The panel is not a smoke-test dashboard. It should help the coductor understand:

- what sense errors currently block progress;
- which DS gate is applicable now;
- which requirements changed;
- how those requirements flow into DSC, DSR, and code;
- where bug/fix/task work is waiting;
- which interpretation decisions are reliable, stale, or need grooming.

## Section order

### 1. Pipeline

Compact DS-process status.

Shows:

- current gate and next recommended gate;
- changed or stale layers;
- blockers;
- readiness for the next command;
- whether the current workspace is in DS-first, non-DS, incremental, or standard mode.

This section should stay compact. It gives orientation, not full diagnostics.

### 2. Sense Errors

Primary navigator for semantic blockers.

Shows Domain Sense errors such as:

- impossible domain model;
- missing concept;
- contradictory requirement;
- unresolved reference;
- cyclic requirement dependency;
- stage mismatch between DS, DSC, DSR, and code;
- implementation that violates a domain contract.

This section should be near the top because semantic errors are the most Domain-Sense-specific value of the panel.

### 3. Bug/Fix Tracker

Interactive intake and task board for bugs, fixes, improvements, questions, and investigation items.

The panel should allow the coductor to write items directly as text. The agent later normalizes them into the correct files:

- `bug:*` items into `ds/fix/bug.fix`;
- permanent `fix:*` requirements into semantic `.fix` files;
- open questions into AI/open-question blocks where appropriate;
- improvement proposals into the IA proposal flow when they are not accepted requirements yet.

Suggested task states:

- Open;
- Needs normalization;
- Needs DS decision;
- Ready for DSC;
- Ready for DSR;
- Ready for IMP;
- Needs verification;
- Done.

### 4. IA Inbox

Pre-file-change proposal layer.

Shows AI recommendations before they modify `.ds`, `.ia`, or `.fix` files:

- improve requirement wording;
- add a missing constraint;
- split a requirement;
- move an item from `ds:*` to `fix:*`;
- mark an implementation proposal as `fn:*`, `do:*`, `it:*`, or `eg:*`;
- flag a conflict with an existing requirement.

The coductor can accept, reject, or edit proposals before they become source files.

### 5. Command Assistant

Command-aware guide for the current DS workflow.

Shows:

- applicable DS command gate;
- why a later gate is not yet allowed;
- which files the command is allowed to change;
- which files are protected at this stage;
- recommended model strength for the current stage;
- expected blast radius.

Model recommendation idea:

- `DS`: strong semantic/language model;
- `DSC`: strong reasoning model;
- `DSR`: strong reasoning plus coding model;
- `IMP`: coding model can be sufficient when DSR is strong;
- `REF` and `FIX`: strong model when root-cause analysis is needed.

### 6. Trace Tree

Navigation from a sense requirement to downstream artifacts and back.

Example shape:

```text
ds:fish.decor.mouth
  -> fish.dsc / decor.mouth
  -> web-canvas.dsr / fish.decor.mouth.update
  -> fish.js#updateMouth
  -> render.js#drawMouthIfOpen
  -> bug:mouth-visual-shape
```

The trace tree should support navigation across:

- `.ds`, `.ia`, and `fix:*`;
- `.dsc`;
- `.air` decisions when relevant;
- `.dsr`;
- executable files;
- bug/fix/task records.

The source of truth remains the project files. Any machine index used by the extension is only an acceleration and navigation artifact.

### 7. Requirement Web

Live graph of requirement-to-requirement relationships.

Potential relationship types:

- depends on;
- refines;
- clarifies;
- conflicts with;
- overrides;
- repairs;
- implements concept from;
- is supplemented by IA.

A `.dsweb` index may be useful, but it must avoid full-graph overwork. It should be maintained incrementally around changed requirements and should allow stale relationship markers when the agent is not confident.

### 8. Consistency Monitor

Cross-layer health monitor.

Highlights:

- drift between `.ds -> .dsc -> .dsr -> code`;
- orphan requirements;
- orphan code;
- stale AIR;
- invalid or unresolved SHA links;
- too-broad annotations;
- unnormalized bug/fix intake;
- unconfirmed IA additions;
- source code modified by a DS-controlled flow without sense links.

This section is not just a syntax or file-presence checker. It is a monitor for conflicts, debt, drift, and synchronization problems across the DS pipeline.

### 9. AIR Ledger

Management view for Agent Interpretation Reference.

Shows:

- AIR volume;
- useful vs suspicious AIR content;
- AIR blocks actually referenced by DSR;
- duplicated requirement text that should not be in AIR;
- stale or conflicting interpretation decisions;
- origin metadata: which agent/model/command produced a block;
- trust level of the generating model.

Future command idea: `AIR~`.

`AIR~` would groom AIR by:

- removing duplicates;
- shrinking verbose notes into reusable interpretation decisions;
- moving requirement text back to `.ds` or `.ia` when it was stored in AIR by mistake;
- marking stale decisions;
- protecting higher-trust AIR blocks from edits by weaker models unless explicitly authorized.

### 10. Scenario Matrix

Requirement-linked testing and verification matrix.

Connects:

- requirement;
- domain scenario;
- expected behavior;
- DSR contract;
- test/probe;
- implementation location;
- verification status.

Example:

```text
ds:predation.player-respawn
Scenario: vulnerable player is eaten
Probe: pending
Code: predation.js#respawnPlayerAfterEating
Status: partially verified
```

This is not only a unit-test list. It is a matrix from domain expectations to runtime verification.

## Supporting indexes

The panel may need machine-readable indexes for performance and navigation, but those indexes should not replace the DS source files.

Likely indexes:

- pipeline/status index;
- trace index;
- consistency issue index;
- requirement web index, possibly `.dsweb`;
- AIR ledger metadata;
- scenario matrix metadata.

These indexes should be regenerated or incrementally updated by DS commands and agent actions. If an index conflicts with source files, the source files win.
