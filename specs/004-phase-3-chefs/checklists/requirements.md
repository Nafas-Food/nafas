# Specification Quality Checklist: Categories, Chef Application & Verification

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-05-15
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

- Validation pass 2 (post `/speckit-clarify`, 2026-05-15): all items
  still pass after five clarification answers were integrated. The
  clarifications added new FRs (FR-012a / FR-012b / FR-012c — admin
  revocation contract) and tightened FR-006, FR-016, FR-022, FR-030,
  FR-038 to commit to concrete values:
  - Q1 → FR-022: chef logo / banner uploads accept JPEG / PNG / WebP,
    5 MB max per file (XSS-prone formats excluded by whitelist).
  - Q2 → FR-016: discovery default radius 15 km, hard cap 50 km.
  - Q3 → FR-006: 24-hour cooldown after rejection (and FR-012b after
    revocation); cooldown refusal is its own observable outcome
    (`rejected_cooldown_in_effect`) on the FR-038 event stream.
  - Q4 → FR-016: when no radius filter applies, sort is open-first
    then verified-newest-first within each group (deterministic).
  - Q5 → FR-012a / FR-012b / FR-012c (new): admin revocation soft-
    deletes the chef row AND atomically reverts user.role from chef
    back to customer; nav switch (FR-030 expanded) carries the user
    back to the customer tab bar on next session refresh.
- Validation pass 1 (initial draft, 2026-05-15): all items pass.
  - Vendor-agnostic on map and reverse-geocoding provider (reuses
    Phase 2's stated assumption), on image storage, on the geographic-
    radius distance algorithm, and on persistence layer (only the
    Foundation phase, Phase 1, and Phase 2 are referenced as existing
    capabilities).
  - Six user stories prioritized P1–P3. Each is independently testable
    against the stated test contract.
  - Three intentional v1 simplifications are recorded as Assumptions
    (re-application after rejection is allowed; admin dashboard surfaces
    ship English-only; chef-kitchen coordinate edits are permitted
    after verification — mirroring Phase 2's address-edit stance) so
    they cannot be mistaken for omissions during planning.
  - The PII-redaction discipline established in Phase 1 (passwords, OTP
    codes) and Phase 2 (customer address coordinates) is extended to
    chef kitchen coordinates here (FR-039 / SC-019 / SC-020) so the
    project keeps one uniform observability surface across phases.
  - The role-transition gate (customer → chef on verification, FR-009 /
    FR-011 / FR-030 / SC-005 / SC-006) is named explicitly because it
    is the load-bearing server-authoritative decision of this phase
    (constitution principle II).
  - The Phase 2 in-flight-order delete safety rule (Phase 2 FR-013)
    is referenced for the soft-delete edge case on a chef row; the
    actual order entity ships in Phase 6.
- Items marked incomplete require spec updates before
  `/speckit-clarify` or `/speckit-plan`.
