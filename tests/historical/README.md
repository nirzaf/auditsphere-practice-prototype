# Historical browser contracts

`legacy-browser-contract.ts` preserves the pre-refactor 39-module browser suite. Its jobs, GL, consolidation, packages and EQR UI contracts are retired. It is not included in the current product acceptance command.

Current browser acceptance is `tests/e2e/targetLifecycle.test.ts`: canonical command journey with genuine artifacts, rendered lifecycle checkpoints, reload, redirects, mobile layout and client isolation. Retained primitive regression contracts remain in `tests/unit` and are run by `npm run test:unit`.

The current browser journey invokes store commands in Chrome and renders selected checkpoints. It does not claim a click-by-click walkthrough of every form or independent professional acceptance.
