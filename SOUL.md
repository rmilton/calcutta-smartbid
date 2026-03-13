# SOUL.md

This file explains what Calcutta SmartBid is trying to be so future work does not drift into generic dashboard software.

## Core Idea

Calcutta SmartBid is not a bracket game and not a passive analytics site. It is a live decision-support system for Mothership in the middle of a fast-moving auction, with an admin control plane that prepares the room before bidding starts.

The product succeeds when it helps the operator make a better bid decision in seconds, with enough confidence to act in the room.

## Product Surfaces

Calcutta SmartBid currently has four product surfaces:

- a shared landing/login entrypoint
- an admin control plane for setup and governance
- an operator live board for real-time decisions
- a synchronized viewer board for trusted Mothership teammates

These surfaces can look and feel related, but they should not converge into one generic dashboard. Each exists to serve a different job.

## Primary User

The primary user is the auction operator for Mothership.

This person is:

- under time pressure
- making decisions out loud in front of other buyers
- balancing expected value against portfolio collision risk
- tracking who owns what and how much money is left in the room

Everything in the app should be optimized around that reality.

## Secondary Users

- Mothership teammates watching the same board
- platform admins configuring access, syndicates, and data sources before the event
- analysts who want to inspect auction outcomes after the event
- future Mothership operators reusing the tool in later tournaments

Secondary users matter, but they should not make the main live workflow slower or noisier.

## Product Principles

### Fast over ornate

The operator needs immediate signals, not a dense research interface. Any new feature should justify its screen space during a live nomination.

The product can feel premium and market-aware, but visual energy must still serve speed, confidence, and decision clarity.

The admin center can be deeper than the live board, but it still needs to stay operational and clear rather than `enterprise` for its own sake.

### Recommendations must be explainable

The user should be able to answer:

- why is the max bid what it is
- why did it change
- what risk is driving caution

Opaque scores without drivers are not enough.

At a minimum, recommendation output should make visible:

- the current target bid and max bid
- what changed since the last recommendation state
- the top drivers behind the recommendation
- the main caution or ownership risk suppressing aggression

The operator should not have to reconcile two different recommendation engines. `Auction` and `Analysis` should present the same recommendation truth at different depths.

### Portfolio context matters

A team is not valuable in isolation. Owning teams that likely collide early changes the real value of a bid. The app should keep modeling ownership exposure, not just pure team EV.

Live portfolio truth should come from actual Mothership purchases in the session, not a parallel manual-owned list in a separate tool.

### Mothership is the fixed strategy subject

The app is not neutral between syndicates. Every room is evaluated from Mothership's perspective.

Other syndicates still matter, but as opponents in the room:

- they can win purchases
- they shape ownership conflict and room spend
- they provide market context against Mothership decisions

The product should not ask admins or operators to choose which syndicate the model is optimizing for.

### Purchases are the truth

Auction state should be anchored around completed purchases and current live nomination state. The product is not trying to be a perfect tick-by-tick bid history recorder in v1.

Projected values are estimates until the room closes. The app can forecast against a projected pot, but completed purchases are the only real market facts during the auction.

That said, purchases must still be correctable through explicit, auditable operator workflows. A corrected purchase becomes the new authoritative state. Silent or ad hoc mutation is not acceptable.

### Recovery matters

Live auction software cannot be fragile. Refreshing the page, reconnecting, or reopening the session should not lose the room.

Recovery also applies to human error. High-impact actions such as purchases and payout edits should either be reversible or leave a clear audit trail.

## State Truth Rules

- completed purchases are authoritative unless superseded by an audited correction
- the active nominated team and current bid are live operational state, not long-term history
- projected pot is provisional and can drive recommendation math before the room closes
- actual locked pot, once set, should override projected assumptions everywhere relevant
- viewer state must be derived from the same persisted session truth as operator state
- Mothership is the always-on strategy lens for recommendation math and bankroll framing

## Current Modeling Assumptions

The app currently makes some useful but provisional assumptions. These are implementation constraints, not sacred product truths:

- recommendation and payout forecasting use round percentages plus a projected pot
- per-syndicate remaining bankroll/headroom is still an assumption layer, not a final accounting model
- completed purchases are more trustworthy than any forecast-derived value

Future work should improve these assumptions, but should not hide them.

## UX Truths

- the operator should always know the currently nominated team
- operator mode should keep current bid, target bid, and max bid visible at a glance
- viewer mode should center the nominated team and Mothership context, not the current bid
- `Analysis` should exist inside the live room, not as a second disconnected product surface
- the ledger should answer "who owns what" and "how much do they have left"
- the product should make clear whether "money left" is forecast headroom or locked actual room state
- viewer mode should feel synchronized, Mothership-centered, and never editable
- validation errors should be domain language, not raw schema text
- admin workflows should happen before the live room, not inside the live room

## What This App Is Not

- not a generic sports betting interface
- not a fantasy dashboard
- not a data warehouse first
- not a full auctioneer bid-tape replay product

Those may inform future features, but they are not the product center.

## Near-Term Product Direction

The strongest next product improvements are:

1. better live-room correction workflows
2. richer explanation of recommendation changes inside the in-room `Analysis` workspace
3. stronger actual-pot modeling as teams are sold
4. better external projection ingestion and import ergonomics

## Quality Bar

Before shipping a change, ask:

- does this make a live auction decision easier or safer
- does it preserve fast operator flow
- does it keep persisted state trustworthy
- does it preserve auditability and correction safety for live-state mutations
- does it improve explanation instead of adding noise

If the answer is no, the feature is probably off-center.
