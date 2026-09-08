<h1>
  Security4Media C2PA Player
  <img src="react-c2pa-player/src/demo/assets/logos/s4m-logo.png" alt="Security4Media logo" width="120" align="right">
</h1>

Security4Media C2PA Player (published as [`@security4media/c2pa-player`](react-c2pa-player/README.md)) is a React and Video.js based player for inspecting C2PA and CAWG Content Credentials in video workflows, across three source kinds: monolithic MP4/WebM/MOV, HLS, and live DASH. It provides a standalone Vite application and reusable React components for loading media, validating manifests, and displaying trust, provenance, and attribution information in the player UI.

The project is maintained under Security4Media, with the European Broadcasting Union (EBU), WDR and CBC as contributing member organizations; see [Contributing members](#contributing-members) below. Manifest validation itself is provided by third-party engines from the Content Authenticity Initiative, Qualabs and Nettrek; see [Credits](#credits).

## Features

- C2PA and CAWG aware video playback built on React, TypeScript, Vite, and Video.js.
- Manifest validation across monolithic MP4, HLS and live DASH sources, each backed by a dedicated validation engine (see [Credits](#credits)).
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

- Follow UI/UX recommendations and best practices for C2PA, CAWG and Content Credentials presentation.
- Support custom trust list selection.
- Support multi-ingredient timeline-based display.

## Credits

This player is powered by validation engines from the Content Authenticity Initiative, Qualabs and Nettrek, each covering a different source kind:

- <img src="react-c2pa-player/src/demo/assets/logos/qualabs.png" alt="Qualabs" width="100" align="absmiddle"> Qualabs: [`@qualabs/c2pa-live-dashjs-plugin`](https://www.npmjs.com/package/@qualabs/c2pa-live-dashjs-plugin?activeTab=versions) validates live DASH playback.
- <img src="react-c2pa-player/src/demo/assets/logos/nettrek-logo.svg" alt="Nettrek" width="100" align="absmiddle"> Nettrek: [`@nettrek/c2pa-hls-bridge`](https://www.npmjs.com/package/@nettrek/c2pa-hls-bridge) and [`@nettrek/c2pa-web-crypto`](https://www.npmjs.com/package/@nettrek/c2pa-web-crypto) validate HLS playback, and are also the default engines for monolithic MP4.
- <img src="react-c2pa-player/src/demo/assets/logos/cai-logo.svg" alt="Content Authenticity Initiative" width="100" align="absmiddle"> Content Authenticity Initiative: [`@contentauth/c2pa-web`](https://www.npmjs.com/package/@contentauth/c2pa-web) is an alternate engine for monolithic MP4 playback, selectable via `?monolithicEngine=c2pa-web`.

## Contributing members

Security4Media C2PA Player is developed with contributions from the following member organizations:

- <img src="react-c2pa-player/src/demo/assets/logos/ebu-logo-dark.svg" alt="EBU" width="100" align="absmiddle"> European Broadcasting Union (EBU): originated the project and holds the copyright under which it is licensed.
- <img src="react-c2pa-player/src/demo/assets/logos/wdr.png" alt="WDR" width="100" align="absmiddle"> Westdeutscher Rundfunk (WDR)
- <img src="react-c2pa-player/src/demo/assets/logos/cbc.png" alt="CBC" width="100" align="absmiddle"> Canadian Broadcasting Corporation (CBC)

## License

Copyright 2026 European Broadcasting Union

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.
