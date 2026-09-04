<h1>
  EBU C2PA Player
  <img src="react-c2pa-player/src/assets/logos/ebu-logo-dark.svg" alt="EBU logo" width="180" align="right">
</h1>

EBU C2PA Player is a React and Video.js based player prototype for inspecting C2PA Content Credentials in video workflows. It provides a standalone Vite application and reusable React components for loading media, validating C2PA manifests, and displaying trust, provenance, and attribution information in the player UI.

## Features

- C2PA-aware video playback built on React, TypeScript, Vite, and Video.js.
- Manifest validation using `@contentauth/c2pa-web`.
- Trust store configuration and sample media for development and demonstrations.
- Player overlays for C2PA status, validation warnings, provenance details, and timeline-related UI.
- Reusable hooks, components, and utility functions under `react-c2pa-player/src`.

## Repository Structure

```text
.
├── LICENSE
├── package.json
├── react-c2pa-player/
│   ├── src/
│   ├── public/
│   ├── trust/
│   └── package.json
├── trust/
└── design/
```

The root package is an npm workspace. The application package is in `react-c2pa-player`.

## Prerequisites

- Node.js 18 or later.
- npm, using the committed `package-lock.json`.

## Install

```bash
npm install
```

## Development

Run the Vite development server from the workspace package:

```bash
npm run dev --workspace react-c2pa-player
```

Build the application:

```bash
npm run build --workspace react-c2pa-player
```

Build the GitHub Pages deployment variant:

```bash
npm run build-deploy --workspace react-c2pa-player
```

Preview a production build:

```bash
npm run preview --workspace react-c2pa-player
```

## Trust Stores and Sample Media

Trust configuration lives in one place, `react-c2pa-player/trust/`, split into
`prod/` (the pinned production bundle, which is what a deployment trusts),
`tsa/` (timestamp-authority anchors, read by every profile) and `dev/` (test
roots and broadcaster test identities, reachable only through
`?trust=full-dev`). A duplicate `trust/` directory used to sit here at the
repository root; it was read by no code and has been removed. See
`react-c2pa-player/trust/README.md`.

Demonstration media is under `react-c2pa-player/public/mp4s/`. Review both
before publishing a public release to confirm they are suitable for
redistribution: the media is third-party broadcaster content, and `dev/`
contains test certificates belonging to named organisations.

## Roadmap

Planned next steps include:

- Support HLS and DASH streaming formats.
- Follow UI/UX recommendations and best practices for C2PA, CAWG and Content Credentials presentation.
- Support custom trust list selection.
- Support multi-ingredient timeline-based display.

## License

Copyright 2026 European Broadcasting Union

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.
