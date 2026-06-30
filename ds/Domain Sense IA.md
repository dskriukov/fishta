# Domain Sense (DS)

## Concept Draft v0.1

## Overview

Domain Sense is a software development paradigm in which the primary source of truth is a human-readable domain description, not source code.

The role of AI is not to "write code from prompts", but to iteratively compile the domain description into progressively more formal representations, validate the consistency of the domain model, preserve interpretation decisions, and finally generate executable implementations.

The generated source code is considered a derived artifact, not the project source.

## Motivation

Current LLM-assisted development typically follows this cycle:

```text
Prompt
  ↓
LLM
  ↓
Generated code
  ↓
Prompt corrections
  ↓
LLM
  ↓
...
```

Every iteration forces the model to reinterpret the project from scratch.

This has several drawbacks:

- unstable interpretation;
- repeated expensive reasoning;
- prompt engineering instead of engineering;
- knowledge loss between iterations;
- inability to validate the domain before implementation.

Domain Sense introduces a formal pre-compilation pipeline where interpretation itself becomes an engineering artifact.

## Philosophy

The developer no longer writes algorithms first.

The developer describes:

- what exists;
- what properties entities have;
- what they can do;
- how the world behaves.

The AI gradually transforms this into executable software.

## Roles

### Coductor

The traditional coder becomes a coductor.

A coductor collaborates with AI to evolve the domain description rather than directly writing implementation.

The word "coduction" intentionally combines:

- code
- co-operation
- induction
- deduction

to describe collaborative construction of formal knowledge.

## Compilation Pipeline

```text
.ds + .ia + fix:*
  ↓
DS
  ↓
DSC
  ↓
.dsc
  ↓
Domain validation
  ↓
.air
  ↓
DSR
  ↓
.dsr
  ↓
IMP
  ↓
  imp/  (@ds / @ia / @fix annotations)
  ↓
.dsmap  (linkage index)
```

### Command Gates

Each stage is invoked through a command name, with aliases accepted by the agent.

#### INIT - initialize Domain Sense

Command: `INIT`

Purpose:

- detect whether the workspace already contains an executable implementation;
- create the initial Domain Sense folder structure for a new or existing project;
- prepare `./ds/sense/main.ds` as the entry point for future `DS`, `DSC`, `DSR`, `IMP`, `REF`, `FIX`, and `GO` flows;
- do not generate executable implementation code;
- do not rewrite or restructure an existing project.

Executable implementation detection:

- an implementation exists when the workspace contains recognizable runnable artifacts such as source files plus an entry point, package/project manifests, build scripts, app framework files, or static web entry files;
- a non-empty folder may still count as having no implementation when it only contains documentation, notes, assets, empty folders, or Domain Sense files;
- if detection is uncertain, prefer a conservative incremental initialization and record uncertainty in `main.ds` instead of modifying project code.

Behavior when no executable implementation exists:

- create `./ds/sense/`;
- create `./ds/sense/main.ds`;
- fill `main.ds` with a minimal starter structure for the coductor to complete:
  - domain/project brief;
  - intended platform;
  - intended stack;
  - runtime and distribution expectations;
  - primary actors/entities;
  - core behaviors;
  - constraints and open questions.

Behavior when an executable implementation already exists:

- perform a lightweight reverse-engineering pass over the existing project;
- create `./ds/sense/`;
- create `./ds/sense/main.ds`;
- fill only the basic facts that can be inferred with reasonable confidence:
  - project brief;
  - platform/runtime;
  - stack/frameworks/languages;
  - main entry points;
  - visible modules or feature areas;
  - known constraints from manifests/configuration;
- mark the project as `incremental` and state that Domain Sense is being added for ongoing improvement, not as a full ownership migration of all existing code;
- avoid exhaustive reverse engineering during `INIT`; deeper modeling belongs to later explicit `DS`, `DSC`, or `REF` work.

Suggested `main.ds` starter shape:

```markdown
# Domain: <project name>

## Project mode

**[ds:project.mode]**\
Domain Sense mode: standard | incremental.

## Brief

**[ds:project.brief]**\
<short product/domain description>

## Platform

**[ds:project.platform]**\
<browser | mobile | backend | CLI | desktop | mixed | unknown>

## Stack

**[ds:project.stack]**\
<languages, frameworks, runtimes, storage, build tools>

## Existing implementation

**[fix:project.incremental-baseline]**\
This project is being improved incrementally through Domain Sense. Existing implementation context may be used when repairing or extending already present behavior, but newly generated or modified DS-driven elements must receive sense requirement links.

## Core behavior

**[ds:behavior.core]**\
<main behavior to preserve or build>

## Open questions

**[ia:project.open-questions]**\
<known uncertainties for later clarification>
```

Aliases:

- `init`
- `INIT DS`
- `initialize`
- `Инициализируй DS`
- `Добавь Domain Sense`
- similar requests with the same intent.

#### DS - requirement sense check

Command: `DS`

Purpose:

- analyze newly added and changed requirements in `.ds` files before coduction;
- provide requirement-level feedback only, focused on wording quality and domain coherence;
- evaluate correctness, clarity, completeness, and relation to other requirements;
- suggest improvements, risks, and quality score directions;
- do not generate or modify `.dsc` files;
- do not proceed to `DSC` unless explicitly requested;
- do not modify files by default.

Aliases:

- `ds`
- `sense`
- `Посмотри новые требования`
- similar requests with the same intent.

DS refinement modes:

- `DS refine` (minimal edits in `.ds` files when explicitly requested).
- `DS expand` (deeper edits in `.ds` and, when useful, expanded/additional related requirements in `.ia`).
- Missing slugs for newly introduced requirements are an allowed initial state during `DS` review; slug naming/normalization is performed at `DSC` stage or explicitly on `DS refine` / `DS expand` request.
- `.ia` requirements should complement `.ds` with additional constraints and implementation-oriented clarifications, not duplicate or paraphrase existing `.ds` requirements; if text only refines `.ds` wording, prefer improving `.ds` directly.
- Requirement blocks should be written as contiguous text without forced/manual line wrapping; visual wrapping is performed by the IDE display settings.
- `DS` and its refinement modes are manual pre-coduction commands and are not part of automatic `GO` execution.

`DS refine` aliases:

- `ds~`
- `DS~`
- `~`
- `подправь`
- `DS подправь`

`DS expand` aliases:

- `ds+`
- `DS+`
- `дополни`
- `DS дополни`

#### DSC - coduction

Command: `DSC`

Purpose:

- read all `.ds`, `.ia`, and normalized `fix:*` requirement sources;
- find new requirements and changes;
- groom `.dsc`, `.air`, and `.ia` files;
- for `fix:*` requirements, use the current implementation context discovered in the workspace as part of coduction instead of relying only on the text of the fix requirement;
- keep `.air` strictly interpretational: store rationale/decisions and IA-level clarifications, and avoid duplicating raw requirement bindings from `.ds` that are not interpretation artifacts;
- give feedback to the developer;
- surface Domain Sense Errors;
- do not proceed to DSR;
- do not modify `.ds` files unless the developer explicitly asks the AI agent to do so.

Aliases:

- `dsc`
- `coduct`
- `Разберём требования`
- similar requests with the same intent.

#### DSR - precompile | rendition

Command: `DSR`

Purpose:

- form implementation plans;
- groom `.dsr` files;
- register all `ds | ia | fix | fn | eg | it | do` requirements in `.dsmap`;
- do not modify requirement or interpretation source files (`.ds`, `.ia`, `.fix`, `.air`);
- provide feedback to the developer in chat when needed.

DSR trace rules:

- `.dsr` files must use SHA-only requirement links in comments and trace notes.
- Do not copy human-readable slugs into `.dsr` comments when the goal is requirement linkage.
- The linking unit is: `code element -> sense requirement SHA`.
- Allowed trace forms are short and explicit, for example: `# @fn:a9a3ed12`, `# @ds:d9fc8d9c`, `# @ia:7e8f9a0b`, `# @fix:21cf09ab`, or `# @ds d9fc8d9c 22fd3ab4`.
- Forbidden in `.dsr` requirement traces: slug text, mixed slug+SHA noise, or explanatory prose that does not change implementation meaning.
- Keep non-link comments terse and implementation-specific; use them only when they help a junior model place the code in the right block.

Execution checklist (in order):

1. Compute checksums for changed/new requirement source files (use `sha1sum`; truncate to 8 hex chars).
  - For `.ds` and `.ia` files, checksum the whole file.
  - For `*.fix` files, checksum only normalized `fix:*` requirement blocks; `bug:*` audit items must not affect `.dsmap`.
  - `./ds/fix/bug.fix` is never listed in `.dsmap`.
  - If any `bug:*` item is found outside `./ds/fix/bug.fix`, or any `[bug]:` / `[fix]:` intake marker remains unnormalized, stop and request `FIX` normalization before continuing.
2. Update `.dsmap` file index (`<path>#<consumedDigest> - <sourceSha>`) for changed/new requirement files.
  - Update only `consumedDigest` for existing files.
  - Keep the right-side `sourceSha` stable for existing files; do not regenerate it from checksum.
  - Assign a new `sourceSha` only once when a file first appears in `.dsmap`.
3. Ensure all new/changed slugs (`ds|ia|fix|fn|eg|it|do`) are present in `.dsmap` slug index with stable `slugSha` linked to the file `sourceSha` from the top block (reuse existing `sourceSha`; never derive it from checksum).
4. Update `.dsr` files to reference affected requirements via `.dsmap` slug entries (`slugSha`), where applicable.
5. Update `.dsr` `contract_map` and `implementation_notes` sections to include new/changed requirement references.
6. Verify: `.ds`, `.ia`, `.fix`, and `.air` remain unchanged; only `.dsmap` and `.dsr` are modified.

DSR comment format guidance:

- When a `.dsr` line names a code symbol, attach the linked sense requirement using the SHA only, not the slug.
- Outside sense-source files, `@ds:<sha>` and `@ds <sha1> <sha2>` are valid; `@ds fish.behavior.swim` and `@ds:fish.behavior.swim` are invalid.
- If a comment needs to explain the reason for the link, keep that reason short and technical, and do not repeat the slug name.
- Do not add historical notes, source-of-solution notes, or human-oriented rationale in `.dsr` comments or trace notes unless that text is the minimal implementation cue needed by the agent.
- If the only useful information is a requirement reference, the comment must contain only the SHA link and nothing else.
- If the same code element maps to multiple requirements, list each requirement as a separate SHA-only marker.
- Example of correct shape: `fish.runExhaleCycle: fish.js#runExhaleCycle  # @fn:a9a3ed12`
- Example of incorrect shape: `fish.runExhaleCycle: fish.js#runExhaleCycle  # @fn:exhale a9a3ed12`

Aliases:

- `dsr`
- `compile`
- `prepare`
- `Опиши реализацию`
- similar requests with the same intent.

#### DS~R - transition check (DS -> DSC -> DSR)

Command: `DS~R`

Purpose:

- run transition validation from requirement sense to implementation plan;
- execute stages in order: `DS`, then `DSC`, then `DSR`;
- stop on the first stage that has errors or unresolved conflicts;
- report explicit per-stage outcome and final readiness for `IMP`;
- do not run `IMP` automatically.

Stage behavior:

- `DS`: validate requirement wording, coherence, and completeness.
- `DSC`: coduct requirements into `.dsc`, `.air`, and `.ia` according to `DSC` rules.
- `DSR`: generate/update `.dsr` and `.dsmap` according to the `DSR` checklist.

Guards:

- follow each stage gate exactly as defined in this document;
- if `DS` requires clarification, stop before `DSC` and request clarification;
- if `DSC` has Domain Sense Errors, do not proceed to `DSR`;
- if `DSR` checklist is incomplete, report failure and do not mark transition as complete;
- `DS~R` does not replace `GO`; it is a pre-implementation transition command.

Aliases:

- `ds~r`
- `DSR check`
- `Проверь переход DS к DSR`
- `Подготовь к IMP`

#### IMP - implementation

Command: `IMP`

Purpose:

- implement executable code based on `.dsr` files;
- use `.dsr` as the only stage source of truth for implementation decisions;
- do not consult `.ds` files during IMP unless the developer explicitly requests a stage change;
- link all new and changed code fragments to `ds | ia | fix | fn | eg | it | do` requirements;
- verify that the links are correct, refer to existing requirements, and are attached to the right code fragment;
- remove extra or missing links;
- work only on code fragments affected by the current change.

Aliases:

- `imp`
- `Imp`
- `Implement`
- `Сделай реализацию`
- similar requests with the same intent.

#### REF - refine

Command: `REF`

Purpose:

- scan the full implementation codebase;
- verify that requirement links are correct;
- report problems to the developer;
- flag code fragments that have no own sense link and are not an integral part of a parent block that already has a sense link.

Sense requirement here means any of: `ds`, `ia`, `fix`, `fn`, `eg`, `it`, `do`.

Aliases:

- `ref`
- `refine`
- `Проверь связи`
- similar requests with the same intent.

#### FIX - repair intake and bug audit

Command: `FIX`

Purpose:

- discover all `bug` and `fix` intake markers across the workspace;
- move discovered bug intake markers into `./ds/fix/bug.fix`;
- move discovered fix intake markers into the most appropriate `*.fix` file under `./ds`, creating a new semantic fix file when no existing file fits;
- remove intake markers from executable implementation files after they are captured under `./ds`;
- assign stable slugs immediately when an intake item has no slug yet;
- keep `bug:*` and `fix:*` storage separate so bug audit noise never affects `.dsmap` checksums;
- trace the referenced requirement or affected behavior from the beginning of the pipeline through all stages;
- fix the first non-requirement stage where the mismatch is introduced;
- mark bug items as `- [x]` only after the relevant downstream artifacts and implementation have been corrected and verified.

Intake marker formats:

- in Markdown or sense files: `[bug]: <text>` and `[fix]: <text>`;
- in executable code comments: `// [bug]: <text>`, `// [fix]: <text>`, `# [bug]: <text>`, and `# [fix]: <text>`.

Intake discovery:

- `FIX` must use regular-expression search tools, such as `rg` or an equivalent file-search API, to find `[bug]:` and `[fix]:` markers in executable files;
- the AI model must not load the whole project into context to discover intake markers;
- after regex search finds candidate matches, the AI model may read only the matched lines plus the minimal surrounding context needed to understand scope, source element, and whether the match is real;
- false positives, such as documentation examples or escaped text that is not an active intake marker, must be filtered during this contextual review.

Intake normalization:

- `FIX` must search the workspace for all `[bug]:` and `[fix]:` markers before stage analysis;
- every discovered `[bug]:` marker is moved into `./ds/fix/bug.fix`;
- every discovered `[fix]:` marker is moved into the most appropriate semantic `*.fix` file under `./ds`;
- if no existing `*.fix` file is semantically appropriate for a discovered `[fix]:` marker, the AI agent creates a new focused `*.fix` file under `./ds/fix/` or a more specific `./ds/**` subfolder;
- if `./ds/fix/bug.fix` does not exist, the AI agent creates it only when the first bug item needs to be captured;
- the moved item must include a stable slug:
  - `[bug]:` becomes `bug:*`;
  - `[fix]:` becomes `fix:*`;
- the moved item must include a concise source context link to where it came from, such as file path plus symbol, line, or surrounding element;
- after successful capture, the original marker must be removed from executable implementation code;
- markers already located under `./ds` are normalized in place only when they are already in the correct target file;
- bug markers found outside `./ds/fix/bug.fix` are moved into `./ds/fix/bug.fix` before `.dsmap` is updated;
- fix markers found in `./ds/fix/bug.fix` are moved into an appropriate semantic fix file before `.dsmap` is updated.
- intake normalization is completed before `DSR`; `DSR` must not move bug or fix items and must stop if normalization is incomplete.

Stage behavior:

- `DS`: verify that the original `.ds` / `.ia` / `fix:*` wording is coherent and does not itself encode the bug.
- `DSC`: verify the high-level `.dsc` interpretation and identify mistaken interpretation or harmful ambiguity.
- `DSR`: verify that the implementation contract preserves the intended interpretation.
- `IMP`: verify that executable code matches `.dsr` and all requirement links point to the right code fragments.

Execution split:

- first normalize all `[bug]:` and `[fix]:` intake markers into their target files under `./ds`;
- then pass all open bug items and active fix requirements through `DS -> DSC -> DSR`, update `.fix`, `.dsc`, `.air`, `.dsmap`, and `.dsr` as needed, then stop;
- after this pass, `ds/dsr/**` must contain the complete corrected implementation instructions needed to resolve each processed bug or fix item;
- report a full per-item summary before implementation, including blocked decisions and proposed implementation changes;
- ask the developer whether to proceed to `IMP`;
- run `IMP` only after explicit confirmation.

Guards:

- if the problem is in `.ds`, `.ia`, or `fix:*` wording, do not edit the sense requirement automatically; record the issue in the item's `AI:` block and ask the developer for an explicit sense refinement request;
- if the problem is in `.dsc`, `.dsr`, `.air`, or implementation code, the agent may fix it automatically within the `FIX` flow;
- during the `IMP` phase, do not read `ds/sense/**` or `.fix` files; implementation decisions must come only from `ds/dsr/**`;
- `bug:*` is an audit driver for reaching a corrected DSR, not an additional implementation input for `IMP`;
- `fix:*` is a permanent sense requirement and may be used as an implementation reference after DSR registers it in `.dsmap`.

AIR rule:

- if the root cause is an interpretation mistake that could recur, add or refine the relevant `.air` file with a concise decision/rationale before closing the fix item;
- `.air` additions from `FIX` must explain the interpretation trap, not duplicate the raw bug report.

AI discussion block:

- if a bug cannot be fully resolved without developer judgment, add an `AI:` sub-block inside that bug item;
- the `AI:` block contains a numbered list of separate remarks or questions, so the developer can answer by number;
- do not mark the bug as `- [x]` while unresolved numbered AI remarks remain.

Aliases:

- `fix`
- `bugs`
- `Проверь баги`
- `Исправь баги`

#### GO - iterate

Command: `GO`

Purpose:

- run the stable execution cycle from `DSC` to implementation;
- execute and report each stage explicitly in order: `DSC -> DSR -> IMP`;
- stop on errors and report the discovered problems in detail;
- allow the developer to fix issues and continue from the current state;
- allow a repeated `GO` call to restart, continue, or stop again depending on the current state, context, and remaining errors.
- do not invoke `DS` or any DS refinement mode implicitly (`DS refine`, `DS expand`);
- do not modify `.ds` or `.ia` files during `GO` unless explicitly requested outside `GO`.

Aliases:

- `go`
- `Go`
- `iteration`
- `Примени изменения`
- `Пройди полный цикл`
- similar requests with the same intent.

## Domain Compilation

Unlike traditional compilers, Domain Sense introduces a domain precompilation stage.

Instead of validating syntax, it validates the consistency of the described world.

Examples:

- Fish exist but no water environment exists.
- Birds can fly but the world is only two-dimensional.
- Jump consumes energy but entities have no energy property.
- Objects age although time does not exist.

These are Domain Sense Errors, not syntax errors.

## Project Layers

### 1. Human Requirements

`.ds`

Primary product requirements authored by the developer.

This layer defines the semantic core of the product.

It is read by the `DS` and `DSC` commands.

### 2. IA Requirements

`.ia`

Auxiliary requirements proposed by AI to increase completeness and reduce ambiguity.

IA requirements must stay at the same abstraction level as DS requirements: they describe what must be true, not how to implement it.

DS has priority over IA on semantic conflicts.

No sense requirement may form recursive dependency links. This applies to all sense slugs (`ds`, `ia`, `fix`, `fn`, `eg`, `it`, `do`) including IA→IA references.

All requirement-reference chains must be finite and acyclic (no loops).

### 3. FIX Requirements

`fix:*`

FIX requirements are permanent repair or improvement requirements for incremental work over an existing implementation.

They are sense requirements, on the same traceability level as DS and IA requirements, but they have a different context rule:

- `ds:*` must be self-contained and describe the domain requirement without relying on current implementation details;
- `fix:*` may rely on context that already exists in the workspace implementation and can be discovered by the AI agent;
- `ia:*` may clarify or constrain either `ds:*` or `fix:*`.

FIX requirements are written as slugged requirement blocks under `./ds`, commonly in `.ds`, `.ia`, or `*.fix` files depending on where the repair context fits best.

Before normalization, a developer may write an unslugged fix intake marker in any workspace file:

```text
[fix]: Text describing what must be repaired or improved.
// [fix]: Text describing what must be repaired or improved.
# [fix]: Text describing what must be repaired or improved.
```

The `FIX` command promotes such markers into stable `fix:*` requirements under `./ds`, records their source context, removes them from executable code, and registers them in `.dsmap` during the DSR transition.

FIX requirements are intended for cases where the coductor wants to repair, stabilize, preserve, or incrementally improve existing behavior without first describing the entire surrounding domain model.

This does not restrict normal feature work: new features may still be described through standard `ds:*` requirements in an incremental project.

FIX requirements are not temporary bug reports.

The distinction between bug and fix is:

- `fix:*` is a permanent sense requirement and must be registered in `.dsmap`;
- `bug:*` items are temporary audit records and are not registered in `.dsmap`;
- bugs may lead to new or refined `fix:*`, `ds:*`, or `ia:*` requirements, but the bug item itself remains a workflow artifact.

Handling for a `fix:*` requirement follows the same stage discipline as for `ds:*` and `ia:*`: investigate the requirement through `DS -> DSC -> DSR -> IMP`, fix the first stage where the mismatch appears, and keep implementation links attached to the stable sense requirement rather than to a temporary bug record.

### 4. Domain Sense Coduction

`.dsc`

Formal interpretation of merged requirements from `.ds`, `.ia`, and `fix:*` requirement blocks.

For `fix:*`, coduction may depend on implementation context discovered in the current workspace. The resulting `.dsc` must make that context explicit enough for later `DSR` and `IMP` stages to operate without rereading arbitrary source files.

Generated by AI and reviewed by the coductor.

The `DSC` command performs coduction grooming here, while `DSR` consumes the stabilized result.

### 5. AIR

`.air`

Agent Interpretation Reference.

AIR stores high-value interpretation rationale only when it improves stability for weaker models.

AIR is not a requirement source and must not duplicate DS, IA, or FIX requirement statements.

AIR must never reference `bug:*` slugs or temporary bug-audit records. If a bug reveals a reusable interpretation trap, AIR records the stable interpretation decision only, without the bug identifier or bug workflow history.

### 6. Domain Sense Rendition

`.dsr`

Stack-specific implementation specification generated from `.dsc` plus relevant `.air` rationale.

A DSR is not code.

It is produced by the `DSR` command.

### 7. Fix Reports

`*.fix`

Markdown-compatible repair intake and bug audit files that may exist in any folder inside `ds/`.

Fix files are split by role:

- `./ds/fix/bug.fix` is the fixed central file for all `bug:*` audit items;
- `./ds/fix/bug.fix` is created on demand when the first bug item is captured; it is not required to exist in projects with no bugs;
- other `*.fix` files contain permanent `fix:*` requirements grouped by meaning;
- if a user writes a bug into another file, `FIX` moves it to `./ds/fix/bug.fix` before checksum or DSR work;
- if a user writes a fix into `./ds/fix/bug.fix`, `FIX` moves it to an appropriate semantic fix file before checksum or DSR work.

Checklist items use this state model:

- `- [ ]` means an open bug or fix item that must be investigated and processed.
- `- [x]` means a bug item that has already been fixed or a fix item that has already been implemented.

Bug and fix item format:

- a new user-entered item may start as plain checklist text or as `[bug]:` / `[fix]:` intake text without a slug;
- on the first `FIX` pass, every open bug receives a stable marker in the form `**[bug:slug]**\`;
- on the first `FIX` pass, every open fix receives a stable marker in the form `**[fix:slug]**\`;
- the marker stays with the checklist item until the item is removed or superseded;
- `bug:*` markers are workflow slugs and are not sense requirement slugs;
- `fix:*` markers are permanent sense requirement slugs and must be registered in `.dsmap`.

Example:

```markdown
- [ ] [bug]: User-entered bug without slug yet

- [ ] **[bug:mouth-shape]**\
  Mouth shape looks wrong in open and closed states.
  Source: web-canvas/src/fish.js#drawFishMouth

  AI:
  1. Need developer choice between redrawing the vector mouth and simplifying the open-mouth arc.

- [ ] **[fix:legacy-route-shape]**\
  Preserve the currently accepted route object shape while changing route internals.
  Source: src/router.js#normalizeRoute
```

Open fix items may reference existing sense requirements with `@ds`, `@ia`, `@fix`, `@fn`, `@eg`, `@it`, or `@do` links.

Fix items may also reference bug slugs from the same or another `.fix` file to connect related problems; use `@bug:slug` for an inline reference to `**[bug:slug]**\`.

Only `fix:*` requirements from semantic fix files are listed in `.dsmap`; `./ds/fix/bug.fix` is never listed because it contains only `bug:*` audit items. `bug:*` slugs are local fix-tracking identifiers and never appear in executable code as implementation refs.

### 8. Implementation

`imp/`

Generated executable source code derived from DSR.

It is produced by the `IMP` command.

## Project Structure

```text
sense/
  main.ds
  main.ia
  main.dsc
  main.air
  **/*.ds
  **/*.ia
  **/*.dsc
  **/*.air
  **/*.fix
dsr/
  use/
    **/*.dsr
  imp/
    **/*.dsr
fix/
  bug.fix      # created on demand; never listed in .dsmap
  **/*.fix     # semantic fix:* requirement files
imp/
  flutter/
  nextjs/
  py-backend/
.air/
  workspace.air
  local.air
```

## Usage Modes

Domain Sense has two independent mode dimensions:

- placement mode: `standard` or `extension`;
- ownership mode: full-ownership or `incremental`.

### Standard Mode

The full DS model lives at the workspace root alongside the generated implementation:

```text
sense/
  **/*.ds
  **/*.ia
  **/*.dsc
  **/*.air
dsr/
  use/
  imp/
imp/
  <generated code>
```

The `./imp` folder receives all generation results.

### Extension Mode

The DS model lives inside a dedicated `ds/` subfolder.
Generated implementation artifacts are placed in the workspace root, next to the existing project:

```text
ds/
  sense/
    **/*.ds
    **/*.ia
    **/*.dsc
    **/*.air
  dsr/
    use/
    imp/
<existing project files>
<generated implementation at workspace root>
```

In this mode the `ds/` folder can be added to an already existing project without disturbing its structure.

This mode is used when Domain Sense is applied as an **IA (Intelligence Amplifier)**: a structured knowledge layer that makes AI-agent-assisted work over an existing codebase significantly more effective.

Extension Mode may be either full-ownership or incremental:

- in full-ownership Extension Mode, generated implementation artifacts are expected to be DS-derived even though they live outside `ds/`;
- in incremental Extension Mode, Domain Sense governs only new or touched work, while untouched legacy code may remain without sense links.

### Incremental Mode

Incremental Mode is used when Domain Sense is introduced into an already executable project for ongoing maintenance, repair, and feature work.

It is intentionally less strict than Standard Mode about historical code:

- existing code may remain unmodeled and unlinked;
- the coductor and AI agent should not attempt a full project rewrite unless explicitly requested;
- lightweight reverse engineering is allowed to understand the current implementation context;
- all new or modified elements created during DS-driven work must receive links to stable sense requirements;
- absence of links in untouched existing code is not itself a violation;
- absence of links in newly generated or modified code is a violation unless the code is an inseparable part of a parent block that already has the correct sense link.

Incremental Mode may use `fix:*` requirements for implementation-aware repair work.

`fix:*` requirements are appropriate when the desired outcome is anchored in the current implementation, for example:

- preserve an existing behavior while changing internals;
- repair a defect whose full domain background is not yet modeled;
- describe a compatibility constraint discovered from current code;
- stabilize an integration point or UI behavior that already exists.

`ds:*` requirements remain preferred when adding or defining self-contained product/domain behavior.

`ia:*` requirements may supplement both `ds:*` and `fix:*` requirements with additional constraints, ambiguity reductions, or implementation-facing clarifications that still describe what must be true rather than how to code it.

> The current workspace is an example of Extension Mode: `ds/` contains the domain model, and `web-canvas/` at the workspace root is the generated implementation.

## DSR Dependency Rules

Reusable implementation descriptions live under:

```text
dsr/use/
```

Concrete implementation tasks live under:

```text
dsr/imp/
```

Rules:

- `use/*` may reference `use/*`
- `imp/*` may reference `use/*`
- `imp/*` may not reference `imp/*`

This ensures:

- reusable implementation knowledge stays centralized;
- concrete implementation tasks remain disposable;
- regeneration is localized.

## AIR Hierarchy

AIR files exist at different abstraction levels.

### Domain AIR

Lives next to requirement files (`.ds` / `.ia`) when needed.

Contains interpretation decisions for domain compilation.

```text
entity.ds
entity.ia
entity.dsc
entity.air
```

### Workspace AIR

`.air/`

Contains optional workspace-level interpretation knowledge.

Examples:

- preferred terminology;
- local engineering rules;
- reusable guidance;
- organization-specific conventions.

These files may intentionally be excluded from version control.

## Design Principles

### Source of Truth

`.ds` + `.ia` + `fix:*`

`.ds` is the primary semantic core authored by the developer. `.ia` contains AI-proposed requirement deltas that may be accepted, split, or retired during grooming. `fix:*` captures permanent incremental repair requirements that may rely on current implementation context.

### Stable Meaning

`.dsc`

Represents agreed formal interpretation.

### Persistent Understanding

`.air`

Preserves expensive AI understanding across generations.

### Stack Isolation

`.dsr`

Separates implementation planning from domain modeling.

Changing technology stacks should require regenerating DSR and implementation only.

### Disposable Implementation

`imp/`

Implementation is replaceable.

The project knowledge remains outside generated code.

## Requirement Traceability

Every generated or DS-modified code element must carry an annotation that links it back to its origin in the DS pipeline.

The primary requirement annotation types are:

### `@ds`

Links a code fragment to a named domain requirement in `.ds`.

Used for all code that directly implements domain entities, behaviors, or rules.

```js
// @ds 7ce238da
function updateVelocity(fish, dt) { ... }

// @ds c83f4c1e
function applyBoundaryWrap(fish, world) { ... }
```

### `@ia`

Links a code fragment to an IA requirement from `.ia` files.

IA requirements are requirement-level additions (what must be true), not implementation recipes (how to do it).

In implementation, `@ia` uses the decision SHA only. Human-readable slugs live in `.dsmap`, which resolves slug → SHA → code fragment.

```js
// @ia a1b2c3d4
function add(a, b) { ... }
```

This makes explicit what came from the human domain description and what was contributed by the agent.

### `@fix`

Links a code fragment to a permanent `fix:*` requirement.

Used in incremental projects when the fragment repairs, preserves, or extends behavior that depends on current implementation context.

In implementation, `@fix` uses the decision SHA only. Human-readable slugs live in `.dsmap`, which resolves slug → SHA → code fragment.

```js
// @fix 21cf09ab
function preserveLegacyRouteShape(route) { ... }
```

## Optional Implementation Proposals in DS/IA

DS/IA can also contain optional implementation-level guidance written by the developer.

These markers capture "how to do it" constraints that the developer wants to keep under direct control:

- `[fn:<name>]` for concrete method/function proposals.
- `[it:<name>]` for property/field group proposals.
- `[do:<name>]` for algorithm proposals that can span multiple functions and relations.
- `[eg:<name>]` for implementation examples.

These proposals do not replace requirement-level sense traceability.
They refine implementation intent, and they must have priority over AI-generated implementation guesses.

### Sense block structure

`Intent` and `Implementation` headings are optional in `.ds`, `.ia`, and `*.fix` files.

Semantic role is determined by slug prefixes:

- `ds:*`, `ia:*`, and `fix:*` -> intent-level requirements;
- `fn:*`, `do:*`, `eg:*`, `it:*` -> implementation-level proposals.

Ordering is free:

- intent and implementation blocks may be interleaved;
- hierarchy may be expressed by indentation from the left margin;
- hierarchy may also be expressed with markdown quote markers (`>`).

Parsers and grooming flows must rely on prefixes and structure, not on section titles.

### No orphan code

Code without an appropriate `@ds`, `@ia`, `@fix`, `@fn`, `@eg`, `@it`, or `@do` annotation is a traceability violation when it is generated or modified by a DS-controlled flow.

Every function, class, or significant block modified by a DS-controlled flow must carry enough SHA-only annotations to trace the requirements it materially implements. Multiple requirement links on the same code element are valid when that element serves multiple requirements.

### No orphan requirements

Requirement statements in `.ds`, `.ia`, and permanent `fix:*` blocks must be fully slugged before DSR.

During sense refinement and coduction drafts, temporary unslugged paragraphs are allowed.

At the transition gate to DSR (explicit command such as `Generate DSR`), AI must:

1. detect the unslugged normative paragraph;
2. assign a unique semantic slug;
3. insert the slug near the paragraph without rewriting author intent;
4. update `.dsmap` accordingly.

Developers may write requirements in any convenient structure; slug assignment and uniqueness are AI responsibilities.

### Linkage Map

`.dsmap`

A machine-readable index consumed by AI for partial regeneration and drift detection.

The canonical linkage index is a dotfile named `.dsmap`.

It contains two sections.

1. File index (top block): `.ds`, `.ia`, and any semantic `*.fix` file that contains `fix:*`; each line stores the requirement-source checksum. `./ds/fix/bug.fix` is always excluded.
2. Slug index: `ds:*`, `ia:*`, `fix:*`, `fn:*`, `eg:*`, `it:*`, and `do:*` slugs mapped to stable unique keys that identify the slug entry.

`.air` files are never listed in `.dsmap`.

Top block format is unified for requirement source files:

```text
<path>#<consumedDigest> - <sourceSha>
```

Where:

- `consumedDigest` is a control checksum of the requirement source at the latest successful DSR-consumption point;
- for `.ds` and `.ia`, the requirement source is the whole file;
- for semantic `*.fix`, the requirement source is only normalized `fix:*` blocks and excludes `bug:*` audit items;
- `./ds/fix/bug.fix` has no requirement source for `.dsmap`;
- `sourceSha` is a stable unique file key used by slug entries on the second block;
- for an existing file, `sourceSha` is immutable and must not be recalculated from `consumedDigest` or any other checksum;
- a new `sourceSha` is generated once, only when the file is first introduced into `.dsmap`.

Slug lines keep this format:

```text
<slug> - <slugSha> <sourceSha>
```

Where:

- `slugSha` is the stable unique key for the slug entry, not a checksum of the slug text;
- `sourceSha` links that slug entry back to the corresponding source file key in the top block.

Example:

```
ds/sense/main.ds#3f2a19bc - b7f7f9e7
ds/sense/world/world.ia#c41d8e22 - 8d13a5f1
ds/fix/router.fix#92caa710 - bfbac299

ds:world.bounds - c83f4c1e b7f7f9e7
ia:world.bounds.clamp - 7e8f9a0b 8d13a5f1
fix:web-canvas.event-compat - 21cf09ab bfbac299
```

`.dsmap` is assembled only at the DSR transition gate (for example, on `Generate DSR`) after reading all requirement source files.

Before this gate, sense files may be edited freely for semantic convergence without mandatory `.dsmap` updates.

If a checksum for a requirement file is not computed, that file must not appear in `.dsmap`.

### IA Lifecycle And Grooming

IA lifecycle is operational, not only conceptual, and is derived from content checksums.

Core states:

- **proposed**: requirement exists in `.ia` and is not yet consumed by the latest successful DSR cycle;
- **active**: requirement was consumed in the latest successful DSR cycle with the current digest;
- **retired**: requirement file or slug is removed.

No timestamps are required for this lifecycle.

Repository history is sourced from git log; `.dsmap` stores checksum state (`consumedDigest`) plus stable linkage keys (`sourceSha`, `slugSha`).

Split and overlap are grooming actions, not terminal states.

When DS changes, AI must run semantic grooming of IA:

1. detect DS ↔ IA overlaps;
2. surface overlaps explicitly;
3. remove IA parts fully covered by DS;
4. keep only the remaining IA delta when overlap is partial.

DS always has priority over IA on semantic conflicts.

### Semantic slug lifecycle

When a new requirement appears in `.ds`, `.ia`, or a permanent `fix:*` block, AI first assigns a semantic slug such as `ds:fish.energy`, `ia:world.bounds.clamp`, or `fix:web-canvas.event-compat`.
That slug is the human-meaningful identifier for the requirement.

Requirement wording immutability: AI must not rewrite the textual wording of an existing requirement block in `.ds` or `.ia` during `DSC`/`DSR`/`IMP` unless the developer explicitly requests `DS refine` or `DS expand`.
This immutability does not apply to slug assignment: if a requirement block has no slug, AI must assign a semantic slug and register it in the normal trace flow.

When reading delta-marked requirement text, AI treats a block marked with `+\` as a new requirement, a block marked with `~\` as an explicit change to an existing requirement block, and a block marked with `!\` as a correctness warning for an existing requirement whose implementation is suspected to be wrong, for example:
`**[ds:world.decor.bubbles]**\`
`~\`
`Updated requirement text...`
A `+\`-marked block should receive a new slug; a `~\`-marked block keeps the existing semantic lineage unless the meaning itself has changed; a `!\`-marked block keeps the existing slug and SHA because the requirement meaning is not being changed by the marker.

Correctness warning behavior:
- `!\` means the requirement may have been interpreted or implemented incorrectly and needs a stricter trace audit across `.dsc`, `.dsr`, and implementation code;
- the agent must compare every stage from `DSC` through `IMP`, find where the mismatch was introduced, and fix the affected downstream artifacts;
- when the root cause is an interpretation mistake that could recur, the agent must add or refine the relevant `.air` guidance with a concise rationale so weaker future models do not repeat the same mistake;
- `!\` is not a request to rewrite the requirement text unless the developer explicitly asks for `DS refine` or `DS expand`.

Marker cleanup after coduction:
- once a changed requirement block marked with `~\` is already reflected in `.dsc`, the `~\` marker should be removed from the source requirement text;
- once a new requirement block marked with `+\` receives its semantic slug, the `+\` marker should be removed and the block should remain as a normal slugged requirement.
- once a `!\` correctness warning has been audited, fixed in downstream artifacts, and captured in `.air` when needed, the `!\` marker should be removed from the source requirement text.

This cleanup is important for checksum stability: delta markers are temporary authoring signals, not durable requirement content. Leaving a consumed `~\`, `+\`, or `!\` marker in `.ds` / `.ia` makes the whole-file `consumedDigest` less stable and can cause unnecessary `.dsmap` churn on later DSR passes.

During coduction and later refinement, the requirement may be split, renamed, or extended.
If the underlying meaning stays the same, the SHA can remain stable while the slug becomes more precise, for example `ds:fish.energy` → `ds:fish.energy.consumption`.
If a new meaning is introduced, it receives a new slug and a new SHA.

When DSR generation runs, every new slug gets a unique SHA and `.dsmap` is updated using source SHAs from the top file index.
If a requirement is removed, its slug and references are removed as well, and the affected code is refactored at the call sites that depended on it.
This keeps traceability stable and reduces semantic clutter in the codebase.

### Dual audience

| Artifact | Reader | Purpose |
|---|---|---|
| `@ds` / `@ia` / `@fix` in code | Developer | Trace any fragment back to its origin via search |
| `.dsmap` | AI agent | Partial regeneration index |

### Partial regeneration

When a `.ds` or `.ia` element is modified:

1. Recompile only the affected `.dsc` section.
2. Update only the relevant `.air` entries.
3. Regenerate only the `.dsr` sections that reference the changed element.
4. Regenerate only the code fragments listed in `.dsmap` for that element.

Unaffected code is not touched.

## Concept Assessment

### What is strong

- The core idea is coherent: separate domain knowledge, interpretation, and implementation.
- The pipeline is useful for reducing repeated re-interpretation by AI.
- The `.ds` / `.ia` / `.dsc` / `.air` / `.dsr` split is practical and gives each layer a distinct responsibility.
- The notion of validating domain consistency before code generation is valuable and more robust than prompt-only workflows.

### Main risks

- The terminology is overloaded. `coduction`, `AIR`, and `DSR` are memorable but need very crisp definitions to avoid becoming jargon.
- The system may become too heavy if every change requires multiple derived artifacts and review steps.
- The boundary between `.dsc` and `.air` is conceptually useful, but in practice it may be hard to keep stable without strict rules.
- “Source of truth is the domain description” is strong, but codebases still need executable truth for debugging, tests, and runtime behavior.
- The idea depends on good tooling. Without editors, validators, and generation support, the workflow will feel bureaucratic.

### My verdict

This is a strong platform concept, especially if your goal is long-lived AI-assisted software development with preserved interpretation state.

It is not yet a product concept. It is a meta-architecture that needs:

- a precise grammar for `.ds`;
- deterministic rules for generating `.dsc`, `.air`, and `.dsr`;
- validation tooling for domain errors;
- a minimal end-to-end example;
- a clear migration path for existing projects.

If those are defined well, the concept is promising. If not, it risks becoming an elegant naming layer around ordinary docs plus generated code.

## Vision

Traditional software engineering treats source code as the primary artifact.

Domain Sense treats knowledge as the primary artifact.

The compilation pipeline transforms:

```text
Human Knowledge
  ↓
Formal Knowledge
  ↓
Implementation Knowledge
  ↓
Executable Software
```

Instead of asking AI to repeatedly generate code from prompts, Domain Sense enables AI to progressively formalize, validate, preserve, and implement a shared understanding of the problem domain.
