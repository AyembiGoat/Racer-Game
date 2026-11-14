---
name: cameras
description: Checklist for chase, bonnet and cockpit cameras, camera follow damping and field of view. Use whenever camera positions, smoothing or FOV are added or changed.
---

# Cameras

A racing camera has one job: let the driver judge speed, yaw angle, road edges and the
next apex cleanly.

Currently supported camera modes (`C` key in play, `setCamera` in `playtest`):

- `chase`: behind and slightly above the car, looking ahead down the car's path.
- `bonnet`: mounted just above the bonnet/hood near the base of the windscreen, showing
  the front nose and open road ahead.

When a `cockpit` view is added later, mount it at the driver's eye anchor inside the
cabin so the top of the steering wheel and A-pillars frame the view without hiding the
apex.

## Rules

- Read only interpolated render state (`previous`, `current`, `alpha`). Camera code in
  `src/game` never changes `src/core` state.
- Keep field of view stable. Do not swing FOV wildly with speed; a huge FOV jump warps
  corner distances and makes braking points impossible to judge. If any speed-based FOV
  is ever requested by the owner, cap it to a few degrees.
- In `chase` mode, follow yaw smoothly enough that small steering corrections feel
  composed and a slight slide is visible in the car's body angle, without lagging so far
  behind in hairpins that the car turns sideways across the screen.
- Never let the chase camera dip below the road (`y = 0`) or clip behind a barrier in a
  way that hides the car.

## Checklist

Run `npm run playtest` and check both automated assertions and screenshots:

1. `camera()` reports the active camera mode, and cycling switches cleanly between modes
   and back.
2. In `chase` view (`01-grid.png` and lap shots), the whole car sits in the lower third
   of the frame and the road ahead through the next turn is clearly visible above the
   roofline.
3. In `bonnet` view (`02-bonnet-camera.png`), the horizon is level, the front of the
   bonnet sits cleanly at the bottom edge without blocking the road, and barriers do not
   clip the near plane.
4. No per-frame object allocations in camera update code; reuse `Vector3` and
   `Quaternion` scratch instances.

## What a script cannot tell you

Whether chase stiffness feels natural mid-corner or causes motion discomfort. Tell the
owner to drive a lap and judge it directly.
