# LOA: 2 days is now the minimum

Flipped, and both bounds are configurable so you're not stuck with either.

```ts
loa: {
    minDays: 2,
    maxDays: 30,   // 0 for no limit
},
```

Add that block to `config.ts` — top level, next to `quota`.

## Why a maximum too

A minimum on its own leaves nothing stopping someone filing a five-year leave.
30 days is a guess; change it, or set `maxDays: 0` to remove the limit
entirely.

## Verified

```
6h    -> REJECTED (too short)
1d    -> REJECTED (too short)
47h   -> REJECTED (too short)     just under, correctly caught
2d    -> accepted
48h   -> accepted                  same duration, different unit
3d    -> accepted
1w    -> accepted
30d   -> accepted
31d   -> REJECTED (too long)
60d   -> REJECTED (too long)
0d    -> INVALID
```

With `maxDays: 0`, `365d` is accepted.

The rejection embeds read the config, so if you change `minDays` to 3 the
message says three days without any code change.

## Files

```
src/commands/events/loa.ts     min/max check
src/handlers/locale.ts         "Too Short" embed added, "Too Long" reworded
src/structures/types.d.ts      loa config type
src/config.ts                  add the block by hand
```

No schema change — the `Loa` model already stores real start and end
timestamps, so nothing about storage depends on the limits.

## Worth reconsidering

The quota integration was built around leave being short. Officers on leave are
listed in a separate "On leave" section of `/quotas` rather than being excused,
which made sense when leave capped at 2 days.

With leave now running weeks, an officer could be on leave for a whole month and
still show up every week with `0/1` under "On leave". That's arguably correct —
it's visible and you decide — but if you'd rather they drop off the report
entirely while on leave, that's a small change. Say the word.
