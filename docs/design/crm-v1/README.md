# Hypedrive CRM v1 (design reference)

The CRM redrawn in the language of the Hypedrive creator Home v8 shell. Open `index.html` in a browser; it loads Inter and Tailwind from a CDN and the app's own icons from `icons.js` (regenerate with `node docs/design/crm-v1/build-icons.mjs`). Collapse, the nav indicator, segmented views, hovers, presses, the entrance stagger and count-up are live; reduced motion is respected.

Frames: Today, Deals board, Accounts list, Account detail, Reports, Sequences, Settings (profile), search and commands with the sidebar collapsed; phone Today, Deals, Account and the More sheet; empty, loading, couldn't load, and all caught up while offline. The PNGs are cuts of the same board.

Decisions are listed on the board. The two that shape everything:
- Rose is only for won revenue (won amounts, the Won column, Won this month, Won in period). Open pipeline, forecasts and weighted values stay ink.
- One ink button per screen; everything else is a well or outline secondary.
