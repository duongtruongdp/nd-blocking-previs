# ND Blocking & Previs

ND Blocking & Previs is a browser-based cinematography blocking and previsualization workspace built with React, TypeScript, Three.js, and Vite.

Milestone 2I locks the production Actor system: Male 01 and Female 01 share 18 accepted semantic poses—six Standing, six Sitting, and six Lying—adapted through Rig Profiles with support/contact-aware blocking and preserved Actor height/placement. Pose Calibration is development-only and hidden from normal use. Production cameras, timeline editing, project file controls, and preview export remain reserved for later milestones.

## Development

```bash
npm install
npm run dev
```

Validation commands:

```bash
npm run build
npm run lint
npm test
```

Architecture and domain contracts live in [`docs/`](docs/), beginning with [`IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md).
