# DESIGN.md

This file captures the current visual and interaction direction for Calcutta SmartBid so future work does not drift back to legacy panel styling.

## Design Direction

The app uses a premium live-market interface:

- dark neutral surfaces with high contrast text
- sharp signal colors for buy, caution, pass, success, and destructive actions
- strong hierarchy around the current nomination, live bid, and max-bid recommendation
- sportsbook-inspired urgency without turning the product into a betting app
- predictable grid layouts and reusable components over bespoke one-off styling

## Product Surfaces

### Operator board

- centered on a live decision board and recommendation call
- keyboard-assisted workflow for team focus, bid entry, winner selection, and save
- split navigation model: `Auction`, `Portfolio`, `Overrides`, `Session`
- action controls should feel compact, direct, and operational

### Viewer board

- read-only and optimized for passive watching
- current bid should be the dominant visual signal
- live-update affordances can pulse or animate, but should stay clean and readable

### Admin surfaces

- use the same shell, spacing, buttons, and field treatments as the operator experience
- prefer summary cards plus structured forms, not legacy panel stacks
- session admin should clearly separate access, payouts, syndicates, and data-source controls

## Visual Rules

- Use the shared tokens in `src/app/globals.css`.
- Prefer `surface-card`, `button`, `button-secondary`, `button-ghost`, `field-shell`, `workspace-tab`, `status-pill`, and the admin grid primitives before adding new one-off classes.
- Keep section headers consistent with `eyebrow` plus a strong heading and one short support line when needed.
- Avoid reintroducing the old warm parchment or vintage auction look.
- Avoid flat utility-only layouts that weaken hierarchy.

## Layout Rules

- The primary decision area should always stay above secondary detail.
- Forms should be grouped into clear sections with consistent spacing.
- Tables are acceptable when precision matters, but summary cards or structured rows should lead when readability matters more than density.
- Mobile support matters most for viewer mode. Operator mode can remain desktop-first as long as it degrades cleanly.

## Implementation Guardrails

- Designs should map cleanly to reusable React components and predictable CSS grids.
- Avoid fragile absolute positioning and complex custom CSS for core flows.
- Prefer additive extensions to the design system over reviving legacy compatibility classes.
- If a new screen is added, it should look like it belongs to the current dark premium system on first render.
