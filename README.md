# ND Blocking & Previs

ND Blocking & Previs is a browser-based cinematography blocking and previsualization workspace built with React, TypeScript, Three.js, and Vite.

Milestone 2H-C completes the current 18-pose library through shared semantic anatomical intent. Standing and Sitting remain locked; the five remaining Lying variants now use coherent Prone, Left Side, Right Side, Reclined, and Curled anatomy with explicit support-frame diagnostics. Runtime definitions are generated for both Male 01 and Female 01. Production cameras, timeline editing, project file controls, and preview export remain reserved for later milestones.

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
