/**
 * Ready-made vehicles from Mongoose's *Vehicle Handbook*, for a ship to carry.
 * Not part of High Guard: the design rules take a carried vehicle as a name, a
 * tonnage and a price (ShipSpec 4.11.3), and this list only fills those in.
 *
 * `tons` is the book's Shipping size, which is what a vehicle takes aboard a
 * ship and what its berth is sized from. `cost` is MCr, full price. `page` is
 * the PDF page; the printed page is one less. Figures are transcribed from the
 * vehicles' stat blocks and nothing else of the book is reproduced.
 * ShipSpec 4.11.3.3.
 */

export interface VehicleRule {
  readonly label: string;
  readonly tl: number;
  /** Shipping size, in tons. */
  readonly tons: number;
  /** MCr. */
  readonly cost: number;
  readonly page: number;
}

/** In the book's order: by its Tech Level chapters, alphabetical within each. */
export const VEHICLES: readonly VehicleRule[] = [
  { label: "Galleon", tl: 3, tons: 200, cost: 0.34, page: 71 },
  { label: "Personal Land Yacht", tl: 3, tons: 1, cost: 0.0006, page: 72 },
  { label: "Raider's Land Yacht", tl: 3, tons: 5, cost: 0.004, page: 73 },
  { label: "Sloop", tl: 3, tons: 36, cost: 0.065, page: 74 },
  { label: "Hargrave H-6 Submersible Boat", tl: 5, tons: 28, cost: 0.483, page: 75 },
  { label: "Liberty-Class Ironclad", tl: 4, tons: 50, cost: 0.666, page: 76 },
  { label: "Steam Car", tl: 4, tons: 1.5, cost: 0.002025, page: 77 },
  { label: "Terror-Roc Patrol Fighter", tl: 4, tons: 3, cost: 0.1, page: 78 },
  { label: "Vanguard Air Superiority Fighter", tl: 5, tons: 5, cost: 0.376, page: 79 },
  { label: "Behemoth Transport Helicopter", tl: 7, tons: 75, cost: 3.76, page: 80 },
  { label: "Cougar Battle Tank", tl: 6, tons: 15, cost: 0.64, page: 81 },
  { label: "Dirigible", tl: 6, tons: 20, cost: 0.0675, page: 82 },
  { label: "Dune Buggy", tl: 6, tons: 2, cost: 0.0019, page: 83 },
  { label: "Gecko All-Terrain Assault Vehicle", tl: 7, tons: 4.5, cost: 0.04245, page: 84 },
  { label: "GVR Minicoin", tl: 6, tons: 4, cost: 0.149, page: 85 },
  { label: "Herkul Heavy Utility Vehicle", tl: 7, tons: 6, cost: 0.068, page: 86 },
  { label: "Humphead Armoured Personnel Carrier", tl: 6, tons: 50, cost: 0.72, page: 87 },
  { label: "Hydrofoil", tl: 7, tons: 15, cost: 0.195, page: 88 },
  { label: "Impala Scout Helicopter", tl: 7, tons: 6, cost: 0.243, page: 89 },
  { label: "Parthian Wheeled Scout", tl: 7, tons: 6, cost: 0.15, page: 90 },
  { label: "Power Boat", tl: 7, tons: 2.5, cost: 0.04, page: 91 },
  { label: "Termite Excavating Tunneller", tl: 7, tons: 10, cost: 0.76, page: 92 },
  { label: "Achilles-Class Frigate", tl: 9, tons: 1750, cost: 26.28, page: 93 },
  { label: "ACV-3 Martinique IFV", tl: 9, tons: 9, cost: 0.946, page: 94 },
  { label: "Aigle Aerial Scout/Attack UAV", tl: 9, tons: 3, cost: 0.221, page: 95 },
  { label: "Air/Raft", tl: 8, tons: 4, cost: 0.25, page: 96 },
  { label: "Armoured Van", tl: 8, tons: 5, cost: 0.01, page: 97 },
  { label: "Cargo Lifter", tl: 8, tons: 3, cost: 0.07, page: 98 },
  { label: "Concordia II Hypersonic Airliner", tl: 8, tons: 300, cost: 165, page: 99 },
  { label: "Deep Sea Submersible", tl: 9, tons: 1.5, cost: 1.05, page: 100 },
  { label: "Dirt Bike", tl: 8, tons: 1, cost: 0.0063, page: 101 },
  { label: "Dirtside Armoured Personnel Carrier", tl: 9, tons: 10, cost: 0.39, page: 102 },
  { label: "Dragonflyer Gravcopter", tl: 8, tons: 10, cost: 4.41, page: 103 },
  { label: "Fury Helicopter Gunship", tl: 8, tons: 16, cost: 1.21, page: 104 },
  { label: "G/Racer", tl: 9, tons: 3, cost: 0.3, page: 105 },
  { label: "Ground Car", tl: 8, tons: 3, cost: 0.0065, page: 106 },
  { label: "Gun Transport", tl: 9, tons: 22.5, cost: 0.988, page: 107 },
  { label: "Legionary Battle Tank", tl: 8, tons: 30, cost: 2.86, page: 108 },
  { label: "Paladin Laser Grav Tank", tl: 9, tons: 34, cost: 24.39, page: 109 },
  { label: "Research Ship", tl: 9, tons: 150, cost: 3.31, page: 110 },
  { label: "Skystrike G/Fighter", tl: 9, tons: 7, cost: 2.75, page: 111 },
  { label: "Socrates Field Car", tl: 9, tons: 5, cost: 0.143, page: 112 },
  { label: "Thunder Hover Tank", tl: 8, tons: 15, cost: 17.2, page: 113 },
  { label: "Tracked Exploration Vehicle", tl: 9, tons: 15, cost: 2.25, page: 114 },
  { label: "Violator Strategic Bomber", tl: 8, tons: 240, cost: 34.58, page: 115 },
  { label: "All-Terrain Vehicle (ATV)", tl: 12, tons: 10, cost: 0.155, page: 116 },
  { label: "Architeuthis Biotech Airship", tl: 11, tons: 20, cost: 0.455, page: 117 },
  { label: "Armoured Fighting Vehicle (AFV)", tl: 12, tons: 10, cost: 0.198, page: 118 },
  { label: "Arthur Mining Robot", tl: 11, tons: 10, cost: 0.235, page: 119 },
  { label: "Assault Cycle", tl: 10, tons: 1, cost: 0.02, page: 120 },
  { label: "Avante Jet Fighter", tl: 10, tons: 33, cost: 15.9, page: 121 },
  { label: "Birdseye Reconnaissance Aircraft", tl: 11, tons: 7, cost: 2.75, page: 122 },
  { label: "Brutus Heavy Cargo Truck", tl: 10, tons: 40, cost: 0.241, page: 123 },
  { label: "Bulette", tl: 10, tons: 25, cost: 1.81, page: 124 },
  { label: "Chameleon Scout Walker", tl: 12, tons: 10, cost: 3.39, page: 125 },
  { label: "Crusader Self-Propelled Gun", tl: 12, tons: 25, cost: 15.095, page: 126 },
  { label: "G/Bike", tl: 12, tons: 0.5, cost: 0.046, page: 127 },
  { label: "G/Runner City Car", tl: 10, tons: 1.5, cost: 0.0495, page: 128 },
  { label: "Grav Floater", tl: 11, tons: 0.5, cost: 0.024, page: 129 },
  { label: "Gunskiff", tl: 10, tons: 10, cost: 0.31375, page: 130 },
  { label: "Heaven70 Gunship Drone", tl: 10, tons: 3, cost: 0.178, page: 131 },
  { label: "HEV-12", tl: 12, tons: 17.5, cost: 0.982, page: 132 },
  { label: "Liberator G/Carrier", tl: 10, tons: 15, cost: 7.24, page: 133 },
  { label: "Lynx Fast Assault Tank", tl: 12, tons: 12.5, cost: 1.1, page: 134 },
  { label: "M-90 Urban Assault Vehicle", tl: 11, tons: 15, cost: 0.565, page: 135 },
  { label: "Pegasus Personal Ornithopter", tl: 12, tons: 3, cost: 0.125, page: 136 },
  { label: "Tempest Supercar", tl: 11, tons: 2, cost: 0.075, page: 137 },
  { label: "Abel Thermospheric Reconnaissance Drone", tl: 15, tons: 8, cost: 5.27, page: 138 },
  { label: "Borderguard Ground Attack Drone", tl: 13, tons: 15, cost: 0.565, page: 139 },
  { label: "Firehammer G/Fighter", tl: 15, tons: 30, cost: 44.95, page: 140 },
  { label: "Grinder Subterranean Assault Capsule", tl: 13, tons: 15, cost: 1.83, page: 141 },
  { label: "Hydra Heavy Support Walker", tl: 13, tons: 60, cost: 49.23, page: 142 },
  { label: "Manticore Fighting Walker", tl: 13, tons: 30, cost: 10.8, page: 143 },
  { label: "Newpoint Grav APC", tl: 13, tons: 12, cost: 49.23, page: 144 },
  { label: "Predator Ambush-Hunter Tank", tl: 13, tons: 24, cost: 1.13, page: 145 },
  { label: "Rakatama G/Carrier", tl: 15, tons: 15, cost: 11.58, page: 146 },
  { label: "Walkure Fighting Grav Assault Vehicle", tl: 15, tons: 20, cost: 3.8, page: 147 },
  { label: "Zircon Nuclear Gun Drone", tl: 13, tons: 5, cost: 0.444, page: 148 },
];

/** The book's Tech Level chapters, which the picker groups vehicles under. */
export function vehicleBand(tl: number): string {
  if (tl <= 3) return "TL1-3";
  if (tl <= 5) return "TL4-5";
  if (tl <= 7) return "TL6-7";
  if (tl <= 9) return "TL8-9";
  if (tl <= 12) return "TL10-12";
  return "TL13-15";
}
