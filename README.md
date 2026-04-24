# jsd-music-app

Mobile-first music learning web app. **v1** is a guitar tuner as the landing page — more learning features (songs, tools, lessons) will follow.

Built with Vite + React + TypeScript. Pitch detection runs entirely in the browser via `pitchy`; no backend.

## Getting started

```bash
npm install
npm run dev         # http://localhost:5173
npm run build
npm run preview

npm run test        # Vitest unit tests (watch)
npm run test:run    # Vitest single run
npm run test:e2e    # Playwright E2E tests
```

## Phone testing

To try it on your phone over the local network:

```bash
npm run dev -- --host
```

Then open `http://<your-laptop-ip>:5173` on the phone. `getUserMedia` on iOS Safari requires HTTPS for anything other than `localhost`, so you'll need either to plug the phone in and use Safari's device inspector with `localhost`, or serve over HTTPS with a self-signed cert (e.g. via `mkcert` + `@vitejs/plugin-basic-ssl`).

## Brand

Follows the jsd Markensystem (Musik cluster). Dark mode by default, light mode toggle in the top-left. See [CLAUDE.md](./CLAUDE.md) for durable project context.

## Contributing

The repo is public. External contributors go through **fork + pull request** — only the owner and invited collaborators can push directly. Open an issue or a PR; no sign-off required for small fixes.
