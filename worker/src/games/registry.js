// Registry of server-side game modules the GameRoom can host.
// Add a new multiplayer game by writing a module here — the room, transport,
// lobby, and persistence are all reused unchanged.

import { BlasterGame } from './blaster.js';

export const GAME_MODULES = {
  blaster: BlasterGame,
  // run:    RunGame,     // future
  // knight: KnightGame,  // future
};
