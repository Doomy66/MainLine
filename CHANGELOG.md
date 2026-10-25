# Changelog

## Unreleased

- No more winning on the first day with Empires from Mains: a Main worth more than about a third of what
  winning takes is split into several Empires, each ruled from one of its biggest worlds, which start as
  friends but can fall out. The new game screen shows which Main each came from. A world with enough
  people to win on its own starts independent. With Empires from allegiances, the early-lead warning now
  suggests only what would help.
- Diplomacy fixes from long test runs. A computer Empire really keeps no more than two allies: an offer
  accepted after it has found two no longer stands. A new alliance starts warm enough to last the day.
  Offers from a fallen Empire vanish. A renewed war wearies from its own start. Fear of a leader starts at
  three quarters of the way to victory, is half as strong, touches only its neighbours and no longer keeps
  a war with it going. Restlessness counts only worlds the Empire could beat, never turns on allies and
  waits four months after a peace. A capture or a declaration sours only the victim's friends nearby, and
  not those already at war. A computer Empire far stronger than you is much harder to talk into peace.
- A fallen capital's government moves to a world that is not under siege, at the heart of the Empire.
- An Empire with no worlds and no ship that can jump is finished, and a game with no Empire left ends
  with no winner.
- Battle reports of big battles list the heaviest fire, damage and criticals of each round and sum up the
  rest, so long games save far smaller.
- Days with big carrier fleets take a fraction of a second rather than several.
- With slow news, Needs attention no longer warns of allies' or neutral fleets, and still warns of
  enemies seen far away.
- Official sectors: Vargr polities whose codes look alike no longer start as kin, separate client
  states of one patron no longer start as one polity, and polities with several codes, such as the Aslan,
  get distinct Empire names.
- Alliances and diplomacy. Empires can be allies: they see what each other sees, their fleets in the same
  place fight on the same side, an ally's fleet in orbit stops a siege, and each can repair at the other's
  ports. From the Empire tab you can offer peace, propose an alliance and leave one, as well as declare
  war; the computer answers the next day, weighing the standing, the war and common enemies. The computer
  makes offers too, which wait under Needs attention to be accepted or declined. A computer Empire keeps
  at most two allies and will not ally with one close to winning.
- War and peace. Empires are no longer all at war with all: each pair has a standing and is at war or at
  peace. Empires at peace do not fight or besiege each other and can buy fuel at each other's ports.
  Empires of one polity start as friends, and Empires from Mains start mostly at peace, with a few wars
  between rivals. Taking worlds, battles, sieges, borders, common enemies, a leader close to winning and
  an Empire with nothing left to take move the standings, and the computer declares war and makes peace
  as they do, saying why in the news. The Empire tab shows how each Empire stands with you and lets you
  declare war. Older saves keep everyone at war.
- A sector whose worlds belong to polities, such as an official one imported in PlanetHex, can start with
  them: under Empires from, choose Existing allegiances and each polity's worlds become Empires of its
  own, named for it, such as Darrian Confederation or Third Imperium (Regina). Non-aligned worlds start
  independent. Mains, ignoring allegiance, starts as before. The new game screen warns when an Empire
  starts close to winning.
- A world with both a naval and a scout base, written A in a sector file, shows both.
- Sectors are opened from the `.sector` file PlanetHex saves rather than the `.sec` beside it. Mainline
  carries PlanetHex's generator and rolls the same worlds from the file, so one file does, and the two
  sectors that come with the game are unchanged. An official sector imported in PlanetHex opens the same
  way, with its subsector names, which show when you hover over a letter under Area in play.
- The help has a new section, The ships: every warship in the catalogue with its tonnage, price, tech
  level, jump and armour, how it ranks against fleets and against worlds from fought-out trials, and a
  note on its strengths and weaknesses.
- A carrier's worth counts the fighters that come with it: the computer weighs carriers with their
  fighters when choosing what to build, as their price already includes them, and a carrier's sheet
  gives its strength both alone and with its fighters.
- Strength, the fighting value shown for ships and fleets and used by the computer to judge odds and
  what to build, now counts armour properly: damage is reckoned against an armoured hull, armour makes a
  hull tougher rather than adding a little to it, and orbital-strike and bombardment weapons, which
  never hit a dodging ship, count for almost nothing. Fought out class against class, it now picks the
  winner in 84% of pairings, against 78%. Fighter swarms and laser boats show much lower strength.
- The computer's reckoning of a world's defences is refitted to match, from fights of fleets against
  worlds: a planetary navy counts for far more than its boats alone, and its judgement is steadier at
  high tech levels.
- The Wasp heavy fighter is refitted: a dual cockpit seats a gunner, enhanced stealth makes it harder to find,
  and its cargo space carries more missiles. It costs more, and so does the Tern carrier with its 24 Wasps.
- Small craft carry one weapon to a firmpoint, as High Guard says, and only one may be a turret. The Snub
  and Snub 2 fly with a missile rack, the Wasp with a pulse laser and a missile rack, and the Kia keeps its
  fusion gun turret with its missile rack fixed. They cost a little less, and so do the carriers that buy them.
- A Repair order at a class D port ends once the hulls are whole, with word that damaged drives and
  weapons need a class A to C starport, instead of going on for ever; admirals, and the computer's
  fleets, take broken drives to a yard that can fix them.
- Admirals say why: every change an admiral makes to its fleet's orders is in the reports with the reason,
  in plain words: a good target, an enemy sighted, the odds, low fuel, damage, a siege that is not
  working, a fight that has got nowhere, nothing in sight.
- Fuel is shared within a fleet where there is none to be had: ships with fuel beyond their own jump,
  a Hydrogen Fleet Tanker above all, fill the tanks of those short of it. A jump that needs it takes it,
  and Refuel becomes Share fuel in such a place. The fleet pane shows the fuel a fleet has to spare.
- Admirals: hand a fleet to one, in the Fleets tab, and it gives itself orders every day, either taking
  worlds near a base you choose or defending your worlds near it, boldly, steadily or carefully. It
  refuels, mends when hurt, and says in your reports where it is going and why. Any order you give by
  hand relieves it.
- The fleet list is one line a fleet, grouped into Needs orders, Busy and At home, with a search box and
  sorting by name, place or strength.
- Next fleet: a button in the top bar, and the key N, picks the next fleet waiting on orders and shows it
  on the map. E ends the day, W waits for news, and 1 to 5 open the tabs.
- Needs attention, at the top of the Reports tab: sieges of your worlds, enemies at them, the day's losses,
  fleets waiting on orders and class A yards with nothing on the slips, each a click from the place.
- The computer builds a little for its enemies: it keeps a rough, slow-moving average of the armour on
  the enemy ships it has fought, and leans its yard orders towards weapons that get through it. The lean
  is deliberately light; in head-to-head simulations it is a small edge, about a quarter of what acting on
  it fully would give.
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
