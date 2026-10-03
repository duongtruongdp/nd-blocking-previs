# Performance Rules

These are architectural constraints for later Stage and playback work.

1. React does not own or drive the Three.js render loop.
2. Active-playback `currentFrame` updates must not trigger broad React tree rerenders.
3. Do not create Three.js objects, geometry, or materials every frame.
4. Reuse geometry and materials where appropriate.
5. Dispose GPU resources intentionally when runtime objects are removed or a Stage is torn down.
6. No expensive post-processing is enabled by default.
7. No photorealistic asset requirement is allowed to define the baseline performance target.
8. Evaluate only timeline tracks that matter to the active shot and current frame.
9. Avoid allocations inside hot playback and render loops.
10. Keep the Stage performance measurable with a small repeatable blocking fixture.
11. The runtime must be able to evaluate and render a requested integer frame independently of real-time playback speed.
12. Serialization remains a boundary operation; runtime references never enter the project document.

Milestone 0 establishes these as rules, not as a premature optimization subsystem.
