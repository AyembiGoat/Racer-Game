# Car roster: sourced facts and simulation translation

Four cars. Each differs in mass, power, layout and era, not only in top speed. All are
rear-wheel drive because the handling model has one driven axle; a front- or
four-wheel-drive car would need drive forces at the steered axle, which the model does
not represent. That is a stated limit, not a hidden one.

Real-world figures below are stored in `src/core/cars.ts` under `real`. Anything under
`tuning` is a game-balance choice and is never shown to the player as a manufacturer
figure.

## Sources

| Id  | Source                                                                                                                                             | Facts taken                                                                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | https://bmwguide.net/bmw-3-series-e30-m3-1987-1989-specs/                                                                                          | E30 M3 1987-89: 2302 cc inline four, 147 kW (200 PS) at 6750 rpm, 240 Nm at 4750 rpm, 235 km/h, 0-100 km/h 6.7 s, 4345 x 1680 x 1370 mm, wheelbase 2565 mm, turning circle 11.1 m              |
| B   | https://www.auto-data.net/en/bmw-m3-convertible-e30-2.3-195hp-cat-9884 and https://www.auto-data.net/en/bmw-m3-coupe-e30-2.3-220hp-evolution-30385 | E30 M3 track 1414 / 1435 mm, Cd 0.36 (convertible page; coupe commonly quoted 0.33); used to confirm the 220 hp Evolution II is a different variant and is not mixed in                        |
| C   | http://e30mpower.com/M3-techspec.html                                                                                                              | European Getrag 265/5: 3.72 / 2.40 / 1.77 / 1.26 / 1.00, final drive 3.25, tyres 205/55 VR15, firing order 1-3-4-2                                                                             |
| D   | https://en.wikipedia.org/wiki/Mazda_MX-5_(NA)                                                                                                      | MX-5 NA 1.6: 85 kW at 6500 rpm, 136 Nm at 5500 rpm, redline 7200 rpm, 3970 x 1675 x 1235 mm, wheelbase 2265 mm, Cd 0.38                                                                        |
| E   | https://www.auto-data.net/en/mazda-mx-5-i-na-1.6-115hp-11261                                                                                       | MX-5 NA 1.6: kerb 955 kg, track 1410 / 1430 mm, height 1230 mm                                                                                                                                 |
| F   | https://www.encycarpedia.com/mazda/90-mx-5-1-6-roadster                                                                                            | MX-5 NA 1.6: 185/60 R14, 121 mph, 0-62 mph 8.8 s                                                                                                                                               |
| G   | https://projectjdm.org/blog/mazda-mx5-miata-na-specs                                                                                               | MX-5 NA 5-speed: 3.136 / 1.888 / 1.330 / 1.000 / 0.814, final drive 4.300 (1.6)                                                                                                                |
| H   | https://www.carsguide.com.au/mazda/mx-5/car-dimensions/1990                                                                                        | MX-5 turning circle 9.14 m                                                                                                                                                                     |
| I   | https://www.auto-data.net/en/porsche-cayman-987c-s-3.4-295hp-6693                                                                                  | Cayman S (987): 217 kW (295 PS) at 6250 rpm, 340 Nm at 4400-6000 rpm, maximum engine speed 7300 rpm, 275 km/h, 0-100 km/h 5.4 s, 4341 x 1801 x 1305 mm, wheelbase 2415 mm, front track 1486 mm |
| J   | https://www.carsales.com.au/research/porsche/cayman/2006/s/                                                                                        | Cayman S: rear track 1528 mm, tyres 235/40 R18 and 265/40 R18, mid-rear flat six                                                                                                               |
| K   | https://www.ultimatespecs.com/car-specs/Porsche/1810/Porsche-Cayman-(Typ-987c)-S.html                                                              | Cayman S: Cd 0.29                                                                                                                                                                              |
| L   | https://www.caymanregister.org/node/6393                                                                                                           | Cayman S owner's manual gearing: 3.31 / 1.95 / 1.41 / 1.13 / 0.97 / 0.82, final drive 3.88                                                                                                     |
| M   | https://www.carsguide.com.au/porsche/cayman/price/2006/s                                                                                           | Cayman S: kerb 1340 kg, turning circle 11.1 m                                                                                                                                                  |
| N   | https://www.caranddriver.com/ford/mustang/specs/2015/ford_mustang_ford-mustang-gt-convertible_2015                                                 | 2015 Mustang GT: MT-82 3.66 / 2.43 / 1.69 / 1.31 / 1.00 / 0.65, axle 3.31, track 62.3 / 64.9 in, P235/50 R18                                                                                   |
| O   | https://www.gardnerweb.com/articles/2015-ford-mustang-gt                                                                                           | 2015 Mustang GT: 435 hp at 6500 rpm, 400 lb-ft at 4250 rpm, wheelbase 107.1 in, 188.3 x 75.4 x 54.4 in                                                                                         |
| P   | https://carbuzz.com/cars/ford/mustang-gt-coupe/2015/                                                                                               | 2015 Mustang GT fastback kerb weight 3705 lb                                                                                                                                                   |

## Roster

|                  | BMW M3 (E30)                        | Mazda MX-5 (NA)          | Ford Mustang GT (S550)            | Porsche Cayman S (987) |
| ---------------- | ----------------------------------- | ------------------------ | --------------------------------- | ---------------------- |
| Stable id        | `bmw-m3-e30`                        | `mazda-mx5-na`           | `ford-mustang-gt-s550`            | `porsche-cayman-s-987` |
| Year, variant    | 1989, European 2.3 without catalyst | 1990, 1.6                | 2015, GT fastback, 6-speed manual | 2006, 6-speed manual   |
| Layout           | Front engine, rear drive            | Front engine, rear drive | Front engine, rear drive          | Mid engine, rear drive |
| Engine           | 2.3 l inline four                   | 1.6 l inline four        | 5.0 l V8                          | 3.4 l flat six         |
| Power            | 147 kW at 6750                      | 85 kW at 6500            | 324 kW at 6500                    | 217 kW at 6250         |
| Torque           | 240 Nm at 4750                      | 136 Nm at 5500           | 542 Nm at 4250                    | 340 Nm at 4400         |
| Kerb mass        | 1200 kg                             | 955 kg                   | 1681 kg                           | 1340 kg                |
| L x W x H (mm)   | 4345 x 1680 x 1370                  | 3970 x 1675 x 1235       | 4783 x 1915 x 1382                | 4341 x 1801 x 1305     |
| Wheelbase (mm)   | 2565                                | 2265                     | 2720                              | 2415                   |
| Track F / R (mm) | 1414 / 1435                         | 1410 / 1430              | 1582 / 1648                       | 1486 / 1528            |
| Tyres            | 205/55 R15                          | 185/60 R14               | 235/50 R18                        | 235/40 R18, 265/40 R18 |
| Gears            | 5                                   | 5                        | 6                                 | 6                      |
| Top speed        | 235 km/h                            | 195 km/h                 | 250 km/h (limited)                | 275 km/h               |
| Price in game    | Free starter                        | 4,500 cr                 | 12,000 cr                         | 18,000 cr              |

## Uncertain or unsourced

- E30 M3 kerb mass: 1200 kg is the figure usually given for the 1986-89 car without
  catalyst; source A lists 1240 kg. 1200 kg is used.
- Redlines: 7250 rpm (M3) and 7000 rpm (Mustang GT) are the commonly quoted tachometer
  redlines; I did not find a primary source for either. 7200 rpm (MX-5) and 7300 rpm
  (Cayman S) are sourced (D, I).
- Front weight share (M3 52 %, MX-5 51 %, Mustang 53 %, Cayman S 45 %) comes from
  period road tests as generally reported, not from a source checked here.
- Mustang GT turning circle (11.5 m) and drag coefficient (0.35), and M3 drag
  coefficient (0.33), are commonly quoted values that were not verified.
- Frontal area is not sourced for any car. It is estimated as 0.8 x width x height.
- The Mustang's 250 km/h is the electronic limiter (155 mph), not a drag-limited speed.

## How real data becomes simulation values

Derived in `deriveSim` and checked by `cars.test.ts`:

- **Engine speed** is real: speed x gear ratio x final drive / rolling radius. Rolling
  radius comes from the rear tyre size. Each gear's top speed is where that reaches the
  redline.
- **Drive force** is the torque curve (idle, peak torque, torque at peak power, redline)
  through the gear ratios at 88 % driveline efficiency, divided by kerb mass plus a
  75 kg driver.
- **Drag** is 0.5 x 1.2 kg/m3 x Cd x frontal area x v2, plus rolling resistance.
- **Steering lock** comes from the real turning circle and wheelbase.
- **Traction limit** of the driven axle is grip x (rear weight share + 0.10 for weight
  transfer).

Deliberate game balance, applied identically to every car (`SIM_BALANCE`):

- All drive, drag and engine-braking forces are multiplied by 2.5, so the cars cover a
  790 m circuit at an arcade pace while each car's top speed and the ratios between
  cars stay as the real data sets them.
- Cornering grip is `gripG` x 9.81 x 2.5 and braking is `brakeG` x 9.81 x 2.85. The
  starter M3 lands on the 21 m/s2 and 27 m/s2 the game had before this change.

Per-car tuning (not real-world data): `gripG`, `brakeG`, `yawResponse`,
`yawAuthority`, `alignGain`, `peakSlip`, `steerQuickness`, `trailRotation`.

|                   | M3   | MX-5 | Mustang GT | Cayman S | Why                                             |
| ----------------- | ---- | ---- | ---------- | -------- | ----------------------------------------------- |
| gripG             | 0.86 | 0.84 | 0.93       | 0.97     | 1980s tyres against modern wide ones            |
| brakeG            | 0.95 | 0.92 | 1.00       | 1.08     |                                                 |
| yawResponse (1/s) | 13   | 15   | 10.5       | 16       | Short, light and mid-engined cars rotate sooner |
| yawAuthority      | 1.08 | 1.06 | 1.05       | 1.10     | How far full lock can push past the grip limit  |
| alignGain         | 2.2  | 2.6  | 2.0        | 1.7      | How strongly a slide straightens itself         |
| trailRotation     | 0.06 | 0.05 | 0.04       | 0.10     | Extra rotation while braking into a corner      |

## Visual identity

| Car        | Paint                               | Read at a glance                                                                                                                        |
| ---------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| M3         | Red (as `reference/bmw-m3-e30.png`) | Upright three-box saloon, box arches, quad round lamps, twin kidneys, raised boot lid and wing, cross-spoke wheels, twin tailpipes left |
| MX-5       | Green                               | Low open two-seater, rounded nose with oval intake, flat tail with oval lamps, seven-spoke wheels, single tailpipe right                |
| Mustang GT | Blue                                | Long bonnet, fastback roof, wide haunches, trapezoid grille, three-bar tail lamps, twin tailpipes at the corners                        |
| Cayman S   | Silver                              | Cab-forward mid-engine coupe, roof falling to the tail, side intakes ahead of the rear wheels, oval lamps, central twin tailpipe        |

Reference photographs (not committed; kept in `reference/ui/cars/`):

- M3: `reference/bmw-m3-e30.png`; https://www.gallery-aaldering.com/bmw-m3-e30-1989/
- MX-5: https://commons.wikimedia.org/wiki/File:1990_Mazda_MX-5_Miata_in_Classic_Red,_Front_Right,_06-25-2022.jpg
- Cayman S: https://bringatrailer.com/listing/2006-porsche-cayman-s-279/ ; https://elferspot.com/en/car/porsche-987-cayman-s-2006-6292737
- Mustang GT: https://mustangattitude.com/mustang/2015/2015_00013_02.shtml ; https://torquenews.com/gallery/side-profile-2015-ford-mustang-gt-premium

## Shared model contract

Axes: +X right, +Y up, nose along -Z, origin on the ground midway between the axles.
`carAnchors(car)` in `src/core/cars.ts` gives every consumer the same numbers: wheel
centres (half track, rolling radius, half wheelbase), bonnet camera, chase camera,
bounds and showroom orbit target. The model must fit the real length, width and height
within 30 mm and the wheel centres exactly.

## Limits of this document

- The code in `src/core/cars.ts` is the authority. Where a figure here differs, the code
  is what the game uses and what the tests check.
- Front overhang values and the body proportions in `src/game/cars/shapes.ts` were
  estimated from photographs, not taken from drawings.
- Paint is described by plain colour (Red, Green, Blue, Silver); no factory colour
  names are claimed.
- The models are recognisable low-detail shapes built from lofted sections. They have no
  badges and are not accurate replicas.
