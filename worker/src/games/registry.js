// Registry of server-side game modules the GameRoom can host.
// Add a new multiplayer game by writing a module here — the room, transport,
// lobby, and persistence are all reused unchanged.

import { BlasterGame } from './blaster.js';
import { GtaGame } from './gta.js';

export const GAME_MODULES = {
  blaster: BlasterGame,
  gta: GtaGame,        // free-roam online relay (Season 2, Sprint 9)
  // run:    RunGame,     // future
  // knight: KnightGame,  // future
};
