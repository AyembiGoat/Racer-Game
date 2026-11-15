# Garage economy

Credits come only from completed laps. Nothing is granted for time, menus or purchases.

## What a lap is

A lap counts when the car crosses every checkpoint in order and then the finish line.
That is the existing rule in `src/core/game.ts`; cutting the infield or driving backwards
cannot complete a lap. A clean lap is one with no barrier contact between its start and
finish. Resetting to the grid or quitting discards the lap in progress and pays nothing.

## Rewards (`REWARDS` in `src/core/career.ts`)

| Line          | Credits | Condition                                                                                                         |
| ------------- | ------- | ----------------------------------------------------------------------------------------------------------------- |
| Lap completed | 500     | Every counted lap                                                                                                 |
| Clean lap     | 250     | No barrier contact during the lap                                                                                 |
| Personal best | 300     | First timed lap in that car, or a lap that beats the car's best by 0.25 s or more and is under the car's par time |

Par is 1.15 x the bot's standing-start lap in that car, rounded up to a tenth, and is
checked by a unit test. It bounds the personal-best bonus: a driver cannot start very
slowly and collect the bonus for every small step, because only improvements between
par and their real limit pay, and each must be at least 0.25 s. A lap that is a new best
by less than 0.25 s still updates the record; it does not pay the bonus and the result
panel says why.

## Prices

| Car              | Price        | Clean laps needed from zero                                                                                  |
| ---------------- | ------------ | ------------------------------------------------------------------------------------------------------------ |
| BMW M3           | Free starter | 0                                                                                                            |
| Mazda MX-5       | 4,500        | 6 (6 x 750 = 4,500; 5 with the first-lap bonus and one improvement: 5 x 750 + 2 x 300 = 4,350, so 6 at most) |
| Ford Mustang GT  | 12,000       | 16                                                                                                           |
| Porsche Cayman S | 18,000       | 24                                                                                                           |

A clean lap takes 25 to 29 s depending on the car, so the MX-5 is under three minutes of clean driving, and
the whole roster is 34,500 credits or about 46 clean laps (roughly 20 minutes). Each new
car also pays its own first-lap bonus.

## Banking

Each lap's reward is added and saved at the moment the lap event is produced by the
simulation. The event is produced once per finish-line crossing, so redrawing the result
or reloading the page cannot pay it again. There is no unbanked balance.

## Purchase and equip

`purchaseCar` checks, in order: the car exists, it is not already owned, the balance
covers the price. On success it deducts the price and adds the car in one returned
state; on failure the state is returned unchanged with the reason and any shortfall.
Buying never equips. `equipCar` refuses a car that is not owned.

## Persistence

Key `racer-game.career.v1`, separate from settings and bindings. Stored: schema version,
credits, owned car ids, equipped car id, and per car the best lap and distance driven.

- Loading validates every field. Unknown car ids are dropped, the starter is always
  owned, an equipped car that is not owned falls back to the starter, credits must be a
  whole number from 0 to 9,999,999, best laps must be finite and at least 5 s, distances
  finite and not negative. A bad field resets that field, not the whole save.
- Text that is not JSON, a value that is not an object, or a schema version other than 1
  loads a fresh career: starter car, zero credits. No earlier schema was ever shipped,
  so there is nothing to migrate; a future version adds its migration beside this rule.
- If the browser refuses storage the game keeps the career in memory and the garage
  shows that progress will not be kept.
- Saves happen on lap completion, purchase, equip, reset, and when a session is paused
  or left (distance driven). Never per frame.
- Reset career (garage, with confirmation) returns to the fresh state.

Distance driven per car is the simulation's own path length, added when a lap completes
or the session is paused or left.
