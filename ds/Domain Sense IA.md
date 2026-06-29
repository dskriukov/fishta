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
.ds + .ia
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
  imp/  (@ds / @ia annotations)
  ↓
.dsmap  (linkage index)
```

### Command Gates

Each stage is invoked through a command name, with aliases accepted by the agent.

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

- read all `.ds` files;
- find new requirements and changes;
- groom `.dsc`, `.air`, and `.ia` files;
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
- register all `ds | ia | fn | eg | it | do` requirements in `.dsmap`;
- do not modify previous-stage files (`.ds`, `.ia`, `.air`);
- provide feedback to the developer in chat when needed.

Aliases:

- `dsr`
- `compile`
- `prepare`
- `Опиши реализацию`
- similar requests with the same intent.

#### IMP - implementation

Command: `IMP`

Purpose:

- implement executable code based on `.dsr` files;
- link all new and changed code fragments to `ds | ia | fn | eg | it | do` requirements;
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

Sense requirement here means any of: `ds`, `ia`, `fn`, `eg`, `it`, `do`.

Aliases:

- `ref`
- `refine`
- `Проверь связи`
- similar requests with the same intent.

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

No sense requirement may form recursive dependency links. This applies to all sense slugs (`ds`, `ia`, `fn`, `eg`, `it`, `do`) including IA→IA references.

All requirement-reference chains must be finite and acyclic (no loops).

### 3. Domain Sense Coduction

`.dsc`

Formal interpretation of merged requirements from `.ds` and `.ia`.

Generated by AI and reviewed by the coductor.

The `DSC` command performs coduction grooming here, while `DSR` consumes the stabilized result.

### 4. AIR

`.air`

Agent Interpretation Reference.

AIR stores high-value interpretation rationale only when it improves stability for weaker models.

AIR is not a requirement source and must not duplicate DS or IA requirement statements.

### 5. Domain Sense Rendition

`.dsr`

Stack-specific implementation specification generated from `.dsc` plus relevant `.air` rationale.

A DSR is not code.

It is produced by the `DSR` command.

### 6. Implementation

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
dsr/
  use/
    **/*.dsr
  imp/
    **/*.dsr
imp/
  flutter/
  nextjs/
  py-backend/
.air/
  workspace.air
  local.air
```

## Usage Modes

Domain Sense can be applied in two modes.

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

`.ds` + `.ia`

`.ds` is the primary semantic core authored by the developer. `.ia` contains AI-proposed requirement deltas that may be accepted, split, or retired during grooming.

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

Every generated code element must carry an annotation that links it back to its origin in the DS pipeline.

Two annotation types are defined:

### `@ds`

Links a code fragment to a named domain requirement in `.ds`.

Used for all code that directly implements domain entities, behaviors, or rules.

```js
// @ds fish.behavior.swim
function updateVelocity(fish, dt) { ... }

// @ds world.bounds.wrap
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

## Optional Implementation Proposals in DS/IA

DS/IA can also contain optional implementation-level guidance written by the developer.

These markers capture "how to do it" constraints that the developer wants to keep under direct control:

- `[fn:<name>]` for concrete method/function proposals.
- `[it:<name>]` for property/field group proposals.
- `[do:<name>]` for algorithm proposals that can span multiple functions and relations.
- `[eg:<name>]` for implementation examples.

These proposals do not replace requirement-level DS/IA traceability.
They refine implementation intent, and they must have priority over AI-generated implementation guesses.

### DS/IA block structure

`Intent` and `Implementation` headings are optional in `.ds` and `.ia` files.

Semantic role is determined by slug prefixes:

- `ds:*` and `ia:*` -> intent-level requirements;
- `fn:*`, `do:*`, `eg:*`, `it:*` -> implementation-level proposals.

Ordering is free:

- intent and implementation blocks may be interleaved;
- hierarchy may be expressed by indentation from the left margin;
- hierarchy may also be expressed with markdown quote markers (`>`).

Parsers and grooming flows must rely on prefixes and structure, not on section titles.

### No orphan code

Code without an `@ds` or `@ia` annotation is a traceability violation.

Every function, class, or significant block must carry exactly one annotation.

### No orphan requirements

Requirement statements in `.ds` and `.ia` must be fully slugged.

During DS/IA refinement and coduction drafts, temporary unslugged paragraphs are allowed.

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

1. File index (top block): only `.ds` and `.ia` files.
2. Slug index: `ds:*` and `ia:*` slugs mapped to SHAs.

`.air` files are never listed in `.dsmap`.

Top block format is unified for both DS and IA requirement files:

```text
<path>#<consumedDigest> - <sourceSha>
```

Where:

- `consumedDigest` is a control checksum of the requirement file content at the latest successful DSR-consumption point;
- `sourceSha` is a stable file-source identifier used by slug entries.

Slug lines keep this format:

```text
<slug> - <slugSha> <sourceSha>
```

Example:

```
ds/sense/main.ds#3f2a19bc - b7f7f9e7
ds/sense/world/world.ia#c41d8e22 - 8d13a5f1

ds:world.bounds - c83f4c1e b7f7f9e7
ia:world.bounds.clamp - 7e8f9a0b 8d13a5f1
```

`.dsmap` is assembled only at the DSR transition gate (for example, on `Generate DSR`) after reading all `.ds` and `.ia` files.

Before this gate, DS/IA files may be edited freely for semantic convergence without mandatory `.dsmap` updates.

If a checksum for a requirement file is not computed, that file must not appear in `.dsmap`.

### IA Lifecycle And Grooming

IA lifecycle is operational, not only conceptual, and is derived from content checksums.

Core states:

- **proposed**: requirement exists in `.ia` and is not yet consumed by the latest successful DSR cycle;
- **active**: requirement was consumed in the latest successful DSR cycle with the current digest;
- **retired**: requirement file or slug is removed.

No timestamps are required for this lifecycle.

Repository history is sourced from git log; `.dsmap` stores only checksum-derived state.

Split and overlap are grooming actions, not terminal states.

When DS changes, AI must run semantic grooming of IA:

1. detect DS ↔ IA overlaps;
2. surface overlaps explicitly;
3. remove IA parts fully covered by DS;
4. keep only the remaining IA delta when overlap is partial.

DS always has priority over IA on semantic conflicts.

### Semantic slug lifecycle

When a new requirement appears in `.ds` or `.ia`, AI first assigns a semantic slug such as `ds:fish.energy` or `ia:world.bounds.clamp`.
That slug is the human-meaningful identifier for the requirement.

During coduction and later refinement, the requirement may be split, renamed, or extended.
If the underlying meaning stays the same, the SHA can remain stable while the slug becomes more precise, for example `ds:fish.energy` → `ds:fish.energy.consumption`.
If a new meaning is introduced, it receives a new slug and a new SHA.

When DSR generation runs, every new slug gets a unique SHA and `.dsmap` is updated using source SHAs from the top file index.
If a requirement is removed, its slug and references are removed as well, and the affected code is refactored at the call sites that depended on it.
This keeps traceability stable and reduces semantic clutter in the codebase.

### Dual audience

| Artifact | Reader | Purpose |
|---|---|---|
| `@ds` / `@ia` in code | Developer | Trace any fragment back to its origin via search |
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
