---
name: reference-images
description: How to get a reference image before making any visual asset, and how to pick a good one. Use before modelling, texturing or drawing anything the player will see, such as cars, wheels, cockpits, trackside props, environments and UI art.
---

# Reference images

Nothing visual gets made without a reference image first. A car or prop built from a
vague idea comes out generic; one built from a specific picture can be checked against
it.

## Where the reference comes from

1. **The owner gave one.** Use it. Do not generate alternatives, restyle it or
   "improve" it. If it is unclear from some angle, ask, or generate extra views that
   match it.
2. **The owner gave none — 3D / world assets.** Generate candidates following the steps
   below.
3. **The owner gave none — UI and menus.** Collect screenshots of real shipped games
   from public UI databases or captures; never generate AI mockups for UI reference.
   Store temporary screenshots in gitignored `reference/ui/` and commit the distilled
   design notes and source URLs in `reference/ui-notes.md`.

## Generating a reference

1. **Write the brief first.** What the object is, what it is for in the game, its
   real-world size, its materials, and how it fits the art direction in `AGENTS.md`.
   If the art direction is not decided and the owner has not described the look, ask
   before generating.
2. **Generate 3 to 5 candidates.** Separate images, not one image with several
   options in it. Vary something that matters between them (proportions, stance,
   material), not just the random seed.
3. **Look at every candidate.** Open each image and judge it against the checklist
   below. Do not pick from the prompts or the file names.
4. **Pick the best one, or none.** If no candidate passes, fix the prompt and generate
   another batch. A weak reference is never accepted because it was the best of a bad
   set.
5. **Tell the owner which one you picked and why**, in a sentence, and show it.
6. **Save the chosen image** as `reference/<asset-name>.png`. Delete the rejects.

## Which image model

Use GPT Image when the tool lets you choose. Do not use Qwen Image. If you cannot
choose the model, or GPT Image is unavailable, use the best mainstream model on offer
and say which one produced the image.

## What a good reference looks like

- One subject, whole, in frame, on a plain neutral background.
- Even, neutral lighting, so body colour and trim are not confused with glare or shadow.
- Views that can be modelled from: side profile, front, rear and three-quarter for
  cars; straight-on for wheels and dashboards; three-quarter for trackside props.
- A silhouette and stance that read at a glance and from a chase camera.
- It makes physical sense. Wheelbase, overhangs and ride height match a real car; wheels
  sit centred in their arches; pillars, mirrors, lights and intakes line up.
- Consistent with the art direction and with assets already in the game.
- Achievable within the budgets in the `models-and-assets` skill.

## Reject it if

- It shows any `no-slop` default: neon underglow, glowing trim lines, purple and cyan
  studio lighting, heavy lens flare, floating particles or speed streaks.
- It has text, garbled sponsor logos, watermarks, borders or a busy background.
- Detail is smeared, melted or noise that only looks like detail.
- Parts are asymmetrical where they should match, wheels are warped or off-axle, or the
  perspective is inconsistent.
- It copies a fictional car from another game or a film. Real-world cars, parts and
  motorsport hardware are what references should show.
- It is a dramatic motion-blurred "concept art" shot that looks exciting but hides the
  proportions needed to model it.

## Building from it

- Keep the reference open and compare as you go: wheelbase and overall proportions
  first, then silhouette and glasshouse, then materials, then lamps and trim.
- When done, put the result next to the reference and look. Where they differ, fix the
  model, not the reference.
- If the result does not hold up beside the reference, it is not finished. Say so.
