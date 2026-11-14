---
name: models-and-assets
description: How to add 3D models, textures, animations and audio, including formats, budgets, naming and licensing. Use whenever a binary asset is added or changed.
---

# Models and assets

The game has no binary asset files yet: the baseline car and circuit are grey-box
geometry built in code. These are the rules for asset files once art direction is chosen
and real assets are added.

Start every asset from a reference image, following the `reference-images` skill.

## Formats

| Asset     | Format                                                   |
| --------- | -------------------------------------------------------- |
| Models    | glTF binary (`.glb`), loaded with Three.js `GLTFLoader`  |
| Textures  | KTX2 where possible; otherwise WebP or PNG. Power-of-two |
| Audio     | Ogg Vorbis or MP3; short effects mono                    |
| Materials | PBR metallic-roughness                                   |

## Location and naming

Shipped files go in `public/assets/<kind>/`, lowercase kebab-case:
`public/assets/models/mazda-mx5.glb`, `public/assets/textures/asphalt-worn-albedo.ktx2`.
Source files (`.blend`, `.psd`, `.fbx`) do not go in this repo.

## Authoring conventions

- One unit is one metre. Y up. Cars face -Z, with +X to the right.
- Apply transforms before export. Car origin sits on the ground plane (`y = 0`) midway
  between the front and rear axles; wheel origins sit at each wheel's axle centre so
  they spin without wobbling; prop origins sit at the base centre.
- Name nodes the code looks up (`wheel-fl`, `wheel-fr`, `wheel-rl`, `wheel-rr`,
  `brake-light-l`, `brake-light-r`, `steering-wheel`, `driver-eye`) and document them
  in the `cars` skill.

## Starting budgets

These are starting points for a browser target. Measure and revise them.

| Asset                     | Triangles | Texture size |
| ------------------------- | --------- | ------------ |
| Player car (exterior)     | up to 35k | 2048         |
| Cockpit interior          | up to 20k | 2048         |
| Opponent car              | up to 15k | 1024         |
| Large trackside structure | up to 8k  | 1024         |
| Small trackside prop      | up to 1k  | 512          |

Keep any single file under about 5 MB. If binary assets start to bloat the repository,
stop and raise it: the project will need Git LFS or external storage.

## Licensing

Every asset not made for this project needs a row in `public/assets/CREDITS.md`
(create it with the first asset): file, author, source URL, licence. Only use assets
whose licence permits redistribution in a game. Do not add assets ripped from other
games. If an asset was AI-generated, record the tool.

## Quality bar

Consistent art direction matters more than detail on any single car or prop. Before
adding an asset, compare it in-engine beside existing ones: real-world scale, texel
density, paint and roughness response under scene lighting, and silhouette from the
chase camera.

## Verification

Load it in `npm run dev`. Check the console for loader warnings, check car dimensions
against `CAR_TUNING` (length, width, wheelbase), and check the build size change with
`npm run build`.
