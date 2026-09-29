# Changelog

## Unreleased

- A victory screen: who won and how, the final standings as bars against the winning line, and your
  campaign in numbers, with your finest hour. It opens when the game ends, and from the top bar after.
- Each computer Empire has a character, varied from its personality: aggression, resolve, expansion and
  caution. They set the odds it attacks at, when its fleets break off, which worlds it prizes and how much
  it keeps at home. The Empire tab's standings describe each one.
- No more endless stand-offs. Computer fleets fought for months at gas giants they had stopped at to
  refuel, and a fleet that fights cannot refuel. A fleet now refuels where no enemy waits if it can; a
  computer fleet that has fought three days in one place to no end keeps out of battle until on its way;
  a siege that has not silenced the defences in five days is given up; fleets on the move no longer chase
  ships across systems they pass through, and the computer builds no more armed civilian ships. In
  simulations, runs of two weeks or more of daily battles in one place fell from over thirty to none.
- Saves are about a tenth the size. Reports meant only for computer Empires, which nothing reads, are no
  longer kept (they were nine tenths of a long game's save, most of it their battles, shot by shot), and
  saves are written without indentation. Older saves shed them when loaded; your own reports are all kept.
- Victory can be by population, and is by default: rule a share of the sector's people rather than of
  its peopled worlds. Games saved before the choice keep counting worlds.
- The Empire tab can switch the victory rule between population and worlds at any time.
- The Empire tab shows your population and share of the sector, the standings by worlds and population,
  and the independent worlds' count and people.
- The System tab shows a yard's slips: what is on each, on how many slips, and when she is due, with
  free slips and orders waiting. Another Empire's ship at an independent yard shows only as taken.
- Ships ordered together no longer share a name: names on order count as taken.
- Add to defences: a fleet at one of your worlds can be given to its defences for good. It guards the
  world's orbit with any garrison already there, leaves your fleets and the map, and is lost with the
  world.
- A world's defences no longer soak up a fleet's fire: gunners treat them as no bigger than the largest
  ship defending the world, where before they counted as a million tons and drew two shots in three.
  Orbital-strike and bombardment weapons still go for them first.
- Carry on offered an old game once a game grew past about 5 MB, the most a browser's local storage
  holds: the autosave failed without a word. It now lives in the browser's database, which has room, and
  if a save is ever refused the top bar says so.
- The panel on the right is a fifth wider, and can be dragged wider or narrower by its left edge.
- Carriers in the Shipyard say which fighters they come with, and how many. A fleet with craft that no
  hangar holds says so, and merging fleets asks first when it would leave craft with no hangar.
- Two new fighters: the Snub, a 20-ton TL9 fighter, and the Snub 2, the same airframe rebuilt at TL12.
  The Hyperion escort carrier now comes with ten Snubs instead of Rampart light fighters, and costs a
  little less.
- Carriers and ships with boats cost slightly more: a carried fighter, cutter, pinnace or ship's boat
  now costs its full price, which the carrier's own discount already covers, rather than being
  discounted twice. The Arakoine goes up about MCr360, most others by a few megacredits.
- Big ships build much faster: time on the slips beyond a month is cut by modular building, as High
  Guard allows. A 5,000-ton carrier takes about three months instead of a year and a half, an Azhanti
  seven and a half instead of thirteen years; ships of a month or less are unchanged.
- Ships of 1,000 tons or more take any spare slips at their yard, and build that much faster; a later
  order takes a slip back. Their due days move to match, including for ships already on the slips.
- Resting the pointer on a system shows a short card: its name and holder, starport, population, tech
  level and any other Empire's fleets there. It appears anywhere over the hex, not just on the dot.
- Fleets on the map are little ships. Other Empires' fleets head up and are ringed in red; a faint
  dashed one is an old sighting.
- A saved game picks up ships added to the catalogue since it began.
- The catalogue is in sections: warships, system defence, capital ships and
  civilian and support, the last two closed until opened.
- Carriers are tagged in the catalogue with the number of fighters they bring.
- Five new designs in the catalogue: the FOO3 special operations ship, the
  Maul-class bombardment ship, the Roam Pod, the Tern-class fighter carrier
  and its Wasp heavy fighters.
- Orbital strike and bombardment weapons take High Guard's -8 and -12 against
  ships that can manoeuvre, and nothing against a world's defences.
- The Ship Designer's engine updated to the version with carried squadrons.
- Mains are called Empires.
- A new title screen in the style PlanetHex and the Traveller Ship Designer share,
  with links to both, release notes, and Mongoose Publishing's fair use notice.
- **One header across the family.** The start screen's mark and name, and the
  20px mark and gold name heading the working screens, the same size in
  MainLine, PlanetHex and the Traveller Ship Designer.

## 0.4.0

- Battle reports show every weapon's fire: what it needed to hit and why, what
  was shot down, and what each hit did.
- Worlds keep a planetary navy of system defence boats beside their ground
  batteries, lost in battle and replaced a boat a week.
- Ground batteries aim less uncannily: fire control +1 to +2, no sensor bonus;
  TL12-13 batteries are barbette-sized. TL14 and up are left as fortresses.
- The Dragon system defence boat rebuilt to High Guard's own design, page 193.
- Only an armed, armoured ship in a real force can keep a fleet from breaking
  off.
- A help section on planetary defences, their strengths and weaknesses.

## 0.3.0

- Jump tenders asked for are hired: the order had been dropped before it
  reached the fleet. Orders say when tenders are coming.
- Wait for news stops only for news of your own fleets and worlds.
- Faction emblems beside their names, icons for each kind of report, and
  other factions' news dimmed.
- Faction colours chosen so neighbours differ, brighter, and more of them.
- Shipyard slips: three ships at a time at class A, two at B, one at C;
  further orders wait their turn.
- Losing a capital brings 28 days of disorder, and worlds may break away.
- Carriers come with their fighters, which jump in the hangars and fight as
  ships.
- News arrives instantly by default in a new game.
- A Suggestions link to the project's issues.

## 0.2.0

- Enemy fleets are reported arriving, with the day they came, and reported
  gone, with the days they were there.
- Full fog of war, on or off at any time: your own fleets report by courier,
  and your orders take as long to reach them. Off, news of your own fleets'
  battles and arrivals reaches you at once.
- How fast news travels can be changed mid-game.
- Jump tenders for hire at class A and B starports, to carry ships with no jump
  drive.
- A starting wealth slider at setup, one to five times the opening treasury.
- A fleet on a route no longer besieges the worlds it stops at to refuel, which
  had been throwing fleets into fights with fortresses.

## 0.1.0

The first playable game.

- Sectors read from the `.sec` file PlanetHex saves, drawn as PlanetHex draws
  them, with two bundled.
- Every Main of four or more worlds is a faction; players take theirs, the
  computer the rest.
- 33 ship classes rebuilt from published designs, each run through the Ship
  Designer's High Guard engine. More can be imported from `.ship` files.
- Day turns, week-long jumps, fuel, refuelling and routes planned through
  places to refuel.
- Standing orders for every fleet.
- High Guard combat: attack rolls, damage multiples, missile salvos and point
  defence, sandcasters and screens, critical hits and breaking off.
- Sieges, independent worlds, weekly income, shipyards by starport class.
- News that reaches your capital a week per courier jump.
- Hot-seat play for up to six players, waiting for news, and games saved as one
  `.game` file.
