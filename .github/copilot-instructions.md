# Copilot Instructions for fish-ia

When working in this repository, always load and follow the Domain Sense concept from:

1. ds/Domain Sense IA.md

Command descriptions and stage behavior (DSC, DSR, IMP, REF, GO) are defined in this file and must be interpreted from it.

Required behavior before any code or requirement changes:

1. Read the stage pipeline and Command Gates sections (DSC, DSR, IMP, REF, GO).
2. Treat block semantics in .ds/.ia as prefix-driven (ds/ia vs fn/do/eg/it), not heading-driven (Intent/Implementation).
3. Enforce stage constraints:
   - DSC: do not modify .ds unless explicitly requested by the developer.
   - DSC AIR scope gate: .air keeps only interpretation notes/decisions derived from .ds + .ia; do not copy raw requirement bindings from .ds into .air unless they are IA-level interpretation.
   - DSR: do not modify .ds, .ia, or .air.
   - IMP: change only affected implementation fragments and keep requirement links valid.
   - REF: validate link completeness and correctness across the whole implementation codebase.
4. During GO, execute and report stages in order: DSC -> DSR -> IMP, with an explicit per-stage outcome before moving on.
5. If a request is ambiguous, first clarify which stage it belongs to.

Use this document as the project source of truth for all responses and edits.
