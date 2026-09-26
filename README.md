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
tech level, with more at a naval base. Silence them, keep armed ships in orbit
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

- **Bug: jump tenders.** Asking for tenders seems to be ignored, or at least is
  not shown: the fleet's orders do not mention them.

- **Admirals.** A commander for every fleet, with Tactics, morale and other
  skills and traits that change how it fights and how soon it breaks.
- **Shipyard slips.** A yard builds only so many ships at once: three at a
  class A starport, two at class B. Further orders queue until a slip is free.
- **Planetary defences, reviewed.** A world on its own barely scratches an
  attacker: small worlds have no guns, mid-tech batteries are lasers that bounce
  off armour, and high-tech bays miss anything small. Candidates: a floor of
  batteries on every peopled world, bay-sized ground weapons, no small-target
  penalty for ground fire control, missile silos, and defences firing first.
- **Wait for news waits for your news.** It should stop only for reports about
  your own fleets or systems. Today any world changing hands anywhere, or any
  faction being wiped out, wakes everybody.
- **Icons in the reports.** Every faction gets an emblem as well as a colour,
  shown beside its name so it is easy to see who is who. Every report gets an
  icon for its kind too: battle, capture, arrival, sighting, new ship, money,
  loss.
- **Buying abroad.** A rich empire with no class A yard, only class B, gets a
  chance to buy starships from another empire's yards. Which empires sell, the
  markup, and how the ship is delivered are still to decide.
- **Carriers.** Fighters carried aboard a carrier do not fight yet; only the
  carrier's own guns do. Go through the catalogue for ships whose designs carry
  fighters (the Hyperion, Arakoine and Azhanti among them) and let each carry a
  matching number of Rampart light or Kia heavy fighters as real ships, bought,
  launched and lost like any other.
- A cleverer computer opponent. It has time to think. A turn is a day, and
  nobody minds waiting a few seconds for one.

## What it is not

An unofficial fan work. *Traveller* is a trademark of Mongoose Publishing.
This repository contains none of their text. The ship designs are facts
about published ships, rebuilt in the Ship Designer's format.

The code is under the [PolyForm Noncommercial License](LICENSE.md), the same as
the Ship Designer it borrows its engine from.
