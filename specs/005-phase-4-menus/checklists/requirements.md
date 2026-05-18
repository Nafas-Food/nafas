# Specification Quality Checklist: Menus, Items & Customer Discovery Surfaces

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-05-18
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- All `[NEEDS CLARIFICATION]` markers from the initial draft were resolved during the 2026-05-18 clarifications session (`/speckit-specify` Q1–Q3):
  - **FR-008** (chef stock UX): chef-side editor exposes an "unlimited" toggle that writes the platform-defined unlimited sentinel; reads surface the unlimited state unambiguously so the toggle can be preserved across edits.
  - **FR-012 / FR-012a / FR-013** (image-set management): uploads APPEND to the existing array (subject to the 5-image cap), plus a per-image remove path with idempotent "already removed" semantics; image-remove is logged as a distinct event (FR-032) and covered by SC-007a.
  - **FR-017** (timezone): Africa/Cairo wall clock is the platform-wide source of truth for the today-available filter and every Phase 4 weekday derivation. Weekday rollover happens exactly at midnight Cairo time; SC-002 anchors the assertion to Cairo.
- A follow-up `/speckit-clarify` session on 2026-05-18 added three impact-worthy decisions (Q1–Q3) and integrated them into the spec:
  - **FR-012b / SC-007b**: image-upload endpoint carries a per-chef throttle of 20 uploads / 60 s on top of Phase 1's `60 / 60 s / IP` default tier; refusals emit a `rate_limited` outcome in the FR-032 event stream.
  - **FR-001 / FR-007 / SC-007c**: per-locale character caps — `Menu.name` ≤ 60, `Item.name` ≤ 60, `Item.description` ≤ 500 — applied after server-side whitespace trim, refused (not truncated) on overflow.
  - **FR-002a / FR-009a / FR-006 / FR-018 / SC-007d / SC-007e**: server-side bulk-reorder normalisation on a dedicated endpoint (must cover exact set), with reads sorted by `(displayOrder ASC, createdAt ASC, id ASC)` on both customer-facing and chef-facing paths. Mirrors Phase 3 FR-027's atomic category-reorder contract.
- Spec is ready for `/speckit-plan`. No further clarification round required.
