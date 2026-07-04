Status: done
Commit: feat(laneC-c2): join route
Validation:
- Wrote `__tests__/join-page.test.tsx` first and verified red with `npx jest -- join-page` while the route was missing.
- Added `app/join/[token]/page.tsx` for login redirect, join redirect, and invalid invite UI.
- Passed `npx jest -- join-page`.
- Passed full suite: `npx jest`.
Concerns: None.