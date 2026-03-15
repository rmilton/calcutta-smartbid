# DESIGN.md

This file captures the current visual and interaction direction for Calcutta SmartBid so future work does not drift back to legacy panel styling.

## Design Direction

The app uses a premium live-market interface:

- dual dark/light theme controlled by `data-theme` on `<html>`; dark is the default
- `ThemeToggle` in session, admin center, and session admin headers persists choice to `localStorage`; an inline `<script>` in `<head>` reads it before first paint to prevent flash of wrong theme
- all colours come from CSS custom properties defined in `src/app/globals.css` — never hardcode rgba or hex values directly in components
- dark neutral surfaces (`--bg: #0c0c0e`, `--panel`) with high contrast text; light surfaces (`--bg: #f7f7f9`) with matching hierarchy
- sharp signal colors for buy, caution, pass, success, and destructive actions
- strong hierarchy around the current nomination, live bid, and target/max recommendation
- sportsbook-inspired urgency without turning the product into a betting app
- predictable grid layouts and reusable components over bespoke one-off styling

## Product Surfaces

### Operator board

- centered on a live decision board and recommendation call
- keyboard-assisted workflow for team focus, bid entry, winner selection, and save
- workspace navigation model: `Auction`, `Analysis`, `Portfolio`, `Bracket`, `Overrides`
- action controls should feel compact, direct, and operational
- `Auction` is the fast action surface
- `Analysis` is the deeper reasoning surface using the same selected team and recommendation payload
- `Bracket` is the tournament-state surface and should feel like part of the same live room, not a separate tool

### Viewer board

- read-only and optimized for passive watching
- active team should be the dominant visual signal
- current bid is intentionally hidden from viewers, even though it remains live operator state
- viewer workspace navigation should stay minimal and currently includes `Auction` plus `Bracket`
- viewer layout should emphasize Mothership context, sold-team flow, and compact ownership scanning
- live-update affordances can pulse or animate, but should stay clean and readable

### Admin surfaces

- use the same shell, spacing, buttons, and field treatments as the operator experience
- prefer dense tables and compact settings forms over decorative cards
- session admin should clearly separate payouts, analysis settings, shared code, tracked participants, and access controls

## Visual Rules

- Use the shared tokens in `src/app/globals.css`.
- Prefer `surface-card`, `button`, `button-secondary`, `button-ghost`, `field-shell`, `workspace-tab`, `status-pill`, and the admin grid primitives before adding new one-off classes.
- Keep section headers consistent with `eyebrow` plus a strong heading and one short support line when needed.
- Avoid reintroducing the old warm parchment or vintage auction look.
- Avoid flat utility-only layouts that weaken hierarchy.
- Never hardcode colours that should vary by theme — use `var(--token-name)` so both dark and light modes work automatically.

## Layout Rules

- The primary decision area should always stay above secondary detail.
- Forms should be grouped into clear sections with consistent spacing.
- Admin surfaces should prefer table density and short, direct labels.
- `Auction` and `Analysis` should feel like two views into one model, not two separate apps stitched together.
- Mobile support matters most for viewer mode. Operator mode can remain desktop-first as long as it degrades cleanly.

## Implementation Guardrails

- Designs should map cleanly to reusable React components and predictable CSS grids.
- Avoid fragile absolute positioning and complex custom CSS for core flows.
- Prefer additive extensions to the design system over reviving legacy compatibility classes.
- If a new screen is added, it should look like it belongs to the current system in both dark and light modes on first render.
