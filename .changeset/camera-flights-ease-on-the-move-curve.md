---
'uno-blueprint': minor
---

Camera flights ease on the shared move curve. Jumping to a cell, zooming to a phase and double-clicking into a frame now ride `cubic-bezier(.65, 0, .35, 1)` from `lib/motion.ts` instead of the camera's own smoothstep, with the same distance-scaled duration (240–650 ms). A flight retargeted mid-air starts on move launched at the camera's current speed, so it neither stalls nor jumps, and a wheel, pinch or drag mid-flight takes over from the frame the flight last drew. Focus dimming and the compare panel's fade move with it: `--ease-camera` is now `var(--ease-move)`, and `MOTION_CAMERA_EASE` is `MOTION_EASE.move`. `easeCameraTransition` is removed from `lib/cameraTransition.ts`; read `easeMove` or `easeMoveFrom` from `lib/motion.ts` instead.
