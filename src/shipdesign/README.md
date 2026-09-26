# Ship design engine

A copy of the rules tables and the `sheet(design)` engine from
[Traveller-Ship-Design](https://github.com/Doomy66/Traveller-Ship-Design) at
commit `70e0be0`, unchanged. Its spec, `ShipSpec.md`, is the contract and lives
in that repository; the clause numbers in these files refer to it.

The game never restates a ship's figures. A catalogue ship is a `.ship` file,
the same JSON the designer saves, and everything the game knows about it —
tonnage, hull points, armour, Thrust, jump, fuel, crew, weapons and price — is
read off `sheet(design)` or off the design's own choices.

Change the engine in the designer and copy it here again. Do not edit it here.
