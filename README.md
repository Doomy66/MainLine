# Mainline

A turn-based war of fleets across a Traveller sector. Each player starts as
the ruler of a **Main**, a chain of worlds a jump-1 ship can cross. Every Main
nobody takes is played by the computer. One turn is a day and a jump takes a
week, as it always has.

**[Play it here.](https://doomy66.github.io/MainLine/)** It runs in the
browser and sends nothing anywhere. A game saves as one `.game` file.

## Claude

I have 50 years of hand coding, I even reproduced the Spinward Marches on my
ZX-Spectrum, so I have earned the right and have the skills to use AI. At time
of writing, this is 100% Claude generated to my exacting requirements.

## Where things come from

- **The sector is PlanetHex's.** Every sector
  [PlanetHex](https://doomy66.github.io/PlanetHex/) saves comes with a `.sec`
  file beside it, in the standard tab-separated sector format with one system
  per line. Mainline reads that file and nothing else, so it generates no worlds of
  its own. The map is drawn the way PlanetHex draws its sector map, with the
  same hexes, dots and colours, so a sector looks the same in both. Two sectors
  come with the game in [sectors/](sectors/), each with the `.sector` file that
  opens it in PlanetHex.
- **The ships are the Ship Designer's.** A ship class is a `.ship` file from
  the [Traveller Ship Designer](https://doomy66.github.io/Traveller-Ship-Design/),
  run through a copy of its High Guard engine in
  [src/shipdesign/](src/shipdesign/). Tonnage, hull points, armour, drives,
  fuel, weapons, crew and price all come off the design sheet, and nothing is
  typed in twice. The catalogue in [ships/](ships/) has 33 classes, from a
  10-ton fighter to the 60,000-ton Azhanti High Lightning. They are rebuilt from
  published designs, and each one's source is in
  [ships/SOURCES.md](ships/SOURCES.md). You can import more at any shipyard
  during a game.

## How it plays

**Setting up.** Pick a sector and the subsectors in play. Every Main of at
least four worlds becomes a faction; smaller Mains and lone worlds are
independent and there to be taken. Players pick their Mains and share one
screen, taking turns. Each faction starts with credits in proportion to what
its worlds are worth, or with equal shares if you choose, and spends them on a
first fleet from the whole catalogue. A slider multiplies every opening
treasury by up to five without touching weekly income.

**A day.** Give orders, then end the day. Everybody's orders happen at once.
In a day a fleet can reach anywhere in its system, whether the main world's
orbit, a gas giant, the planetoid belt or the jump point. It can also jump, refuel or repair.
**Wait for news** lets the days run until something happens that you should see.

**Jumping.** A jump takes a week and costs a tenth of each hull in fuel for
each parsec. A fleet jumps as far as its shortest-legged ship. Order a jump
beyond range and the fleet plans a route, refuelling on the way:
- starports sell fuel, refined at A and B and unrefined at C and D;
- ships with scoops skim gas giants;
- streamlined ships can take on water from an ocean.

Unrefined fuel risks a rough jump that arrives late.

**A Main is a trap for jump-1.** A Main is every world a jump-1 ship can
reach, so a jump-1 ship can never leave its own. To take anybody else's
worlds you need jump-2 or better.

**Standing orders.** Every fleet has standing orders for when it meets the
enemy and nobody is there to tell it what to do:
- which fleets to engage: any, only weaker ones, or only when attacked;
- whether to besiege worlds it does not hold;
- whether to intercept enemies elsewhere in the system;
- whether to try to evade;
- what to shoot at first;
- at what share of its hull to withdraw.

Presets include Seek and destroy, Raider, Patrol, Guard and Avoid battle.

**Combat** follows High Guard, cut down to what can be settled without asking
anybody anything:
- An attack hits on 8+, modified by gunnery, Fire Control software, sensors
  and the target's Evade.
- Damage is the weapon's dice plus the Effect, less armour, times the
  mounting's multiple. That is 3 for a barbette, 10 to 100 for a bay and 1,000
  for a spinal mount.
- Missiles fly in salvos from finite magazines, and point defence and laser
  turrets shoot some of them down.
- Sandcasters, meson screens and nuclear dampers blunt the weapons they are
  built against.
- Critical hits knock out drives, weapons, sensors and crew.
- A fleet that wants out tries to break off, and Thrust decides whether it can.

A day of battle is three rounds.

**Taking a world.** Every peopled world has defences, sized by population and
tech level, with more at a naval base: ground batteries dug into armour that
lasers cannot touch, and a planetary navy of system defence boats. Worlds of
TL14 and up are fortresses, as in Traveller's setting. Silence them, keep armed ships in orbit
with orders to besiege, and the world submits in a few days. That is two days
plus one for every two population digits. Defences rebuild once nobody is
shooting at them.

**Losing a capital** moves the government to your next biggest world and
throws the faction into disorder for four weeks: a quarter of the income, idle
yards, and worlds far from the new capital, or with little law, breaking away.

**Money.** At the end of each week every world pays its owner. It pays more
for more people, higher tech, a better starport and a rich or industrial
economy.
Upkeep comes out of the same treasury. Worlds you hold repair and rearm your
ships.

**Shipyards.** What a world can build depends on its starport:
- class A builds starships;
- class B builds spacecraft without a jump drive;
- class C builds small craft.

None builds above its world's tech level. Independent class A yards build for
anybody, at a markup.

**News can travel by ship.** News arrives instantly unless you choose
otherwise. Set it to travel by express boat, courier or trader and a report
reaches your capital a week for every jump it takes to carry it. This covers enemy fleets
arriving and leaving, other factions' battles, and who holds which world. News
of your own fleets comes at once, and they act on their standing orders the
moment they meet the enemy. Turn on **full fog of war** and your own fleets
report by courier too, while your orders take as long to reach them. Both can
be changed at any time during a game.

**Carriers** come with the fighters their designs carry, as ships in their
fleet that jump in the hangars and fight and die like any other.

**Jump tenders.** Ships with no jump drive can be carried to war by jump tenders
hired at a class A or B starport, for Traveller's freight rates per ton per
jump.

**Winning.** Hold half the peopled worlds in play, or be the last faction
standing. You can change the share at setup.

## Running it

```
npm install
npm run dev
```

`npm test` runs the suite, which includes a hundred-day game played by the
computer on every side. `npm run build` typechecks and bundles. To watch a whole
game play itself and print how it went:

```
npx vite-node scripts/simulate.ts sectors/Driftwater-Reach.sec 300
```

`npx vite-node scripts/check-ships.ts` runs every catalogue ship through the
design engine and reports anything that breaks the rules.

## Still to come

- A cleverer computer opponent. It has time to think. A turn is a day, and
  nobody minds waiting a few seconds for one.

## What it is not

An unofficial fan work. *Traveller* is a trademark of Mongoose Publishing.
This repository contains none of their text. The ship designs are facts
about published ships, rebuilt in the Ship Designer's format.

The code is under the [PolyForm Noncommercial License](LICENSE.md), the same as
the Ship Designer it borrows its engine from.
