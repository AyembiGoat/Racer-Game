# Garage and dealership screens

Grounding: `reference/ui-notes.md` (the existing verified study of shipped racing
interfaces) sets type, colour and motion. For this screen the pattern taken from shipped
garage and dealer screens (Gran Turismo 7 garage and Brand Central, Forza Motorsport car
select; discussion and captures at https://www.gtplanet.net/forum/threads/gt7-hud.424809/,
where fan redesigns in the thread were ignored) is: the car stands in a lit bay and fills
the middle of the screen, a list of cars runs down one side, a specification panel sits
on the other, and one action bar along the bottom holds the primary action and the
price. No screenshots are committed.

## Layout

```
+--------------------------------------------------------------------------------+
| GARAGE  [Garage] [Dealership]                              Credits 4,500 cr    |
+----------------+------------------------------------------+--------------------+
| car list       |                                          | car name           |
| (buttons)      |          live 3D bay                     | manufacturer data  |
|                |          drag or arrow keys to orbit     | game estimates     |
|                |                                          | records / compare  |
+----------------+------------------------------------------+--------------------+
| Rotate  Rotate  Reset view              reason text    [Buy / Equip]   [Back]  |
+--------------------------------------------------------------------------------+
```

Below 1100 px wide the specification panel narrows; the list and panel never cover the
car's centre.

## Garage tab

Owned cars. Each row: year and name, engine summary, `Equipped` tag on the active car.
Panel: manufacturer data (power, torque, kerb mass, layout, engine, gearbox, size),
game estimates (top speed, 0-100 km/h and cornering grip, all computed by running the
simulation), and records (best lap, distance driven). Actions: Equip (disabled and
labelled `Equipped` on the active car), Reset career.

## Dealership tab

Cars not yet owned, with price. Panel compares the selected car with the equipped car
row by row using the same values as above, with the difference. Actions: Buy. When the
balance is short the button is marked unavailable, stays focusable, and the reason
(`4,500 cr short`) is shown beside it and announced; activating it plays the denied cue
and changes nothing. When every car is owned the list says so.

## Dialogs

- Purchase: names the car, price, balance now and balance after. Confirm or Cancel.
  After a successful purchase the same dialog offers `Equip now` and `Keep current car`.
- Equip during a paused session: states that the session restarts on the grid.
- Reset career: states what is lost.

Dialogs trap focus, open with focus on the safe choice (Cancel) and close on Escape.

## Navigation

Title and pause menus both have Garage and Dealership. Back or Escape returns to
whichever opened it. A paused session is kept unless the driver confirms equipping a
different car.

## Bay and camera

One key light with a soft shadow, a sky fill, two rim lights without shadows, a matte
concrete floor and dark walls. No post-processing. Default view is a front three-quarter
at a distance set from the car's length so the whole car fits at 16:9 and 21:9 with the
side panels in place. Pointer drag orbits; Left and Right arrows or the Rotate buttons
step 15 degrees; Up and Down change height within limits; Reset view restores the
default. The camera never moves by itself, so reduced motion needs no special case
beyond the existing shorter transitions on panels.

While the bay is shown the race scene is not drawn and engine audio is silent.
