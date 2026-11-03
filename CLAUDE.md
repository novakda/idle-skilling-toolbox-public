
Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

### Live-save tests

`data/save.json` is the running game's save, refreshed whenever it is extracted, so it may be taken on any screen. Many stored
values are only rewritten while one screen or scene is open. **`web/src/screen-bound.ts` is the single list of them**: each entry
names its writer (CurrentlyViewedScreen id, ids in `web/src/data/screens.json`, or 'mastery-scene' for the Mastery scene, which sets
no id), the writer's offset in `Qno2x.js`, and the model that recomputes it, if any (`exact` when the tests confirm it), and the registry values its writer `reads` as stored
(a stale input makes it stale on its own screen too: CriticalDamage reads MasteryBonuses[3]). A newly
found screen-bound value goes there first, with its offset; never invent a writer.

- Tests: an assertion that compares a model value with a stored registry attribute is guarded with `fresh(s, key)` (writer's
  screen), or `fresh(s, key, model)` where only agreement can tell (the Mastery scene; a save taken there keeps the last screen id).
  Do not guard values that are always current (level counters and their REQ, written together) and never delete the assertion.
- App: read a registry attribute only through `current(s, key, model)` (stored when fresh, else the model).
- `bun src/live-save.ts --check` prints the screen a save was taken on and the registry values stale in it: run it first on a
  live-save test failure.

The frozen `data/fixture-save.json` is exempt: it is one consistent snapshot; `fullSave()` falls back to the live save when the
fixture is missing, so write fixture tests as if they might see a live one.

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.
