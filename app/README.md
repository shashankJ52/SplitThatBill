# SplitThatBill app

Phase 1 foundation of the SplitThatBill web app (installable PWA).

- `npm run dev` start the dev server
- `npm run build` type-check and build to `dist/` (also generates the web manifest and service worker)
- `npm run preview` serve the production build
- `npm test` run the money engine tests
- `npm run lint` run the linter

The money engine lives in `src/money/`. It is plain TypeScript with no UI imports, and every amount is whole cents.
The approved wireframe (`../wireframe/index.html`) and decisions (`../docs/DECISIONS.md`) are the spec for the screens.
