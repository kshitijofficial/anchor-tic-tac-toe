import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

/**
 * Game state from on-chain Board account
 */
export interface GameState {
  playerX: PublicKey;
  playerO: PublicKey;
  currentPlayer: PublicKey;
  winnerAddress: PublicKey;
  board: number[];
  isActive: boolean;
  gameId: BN;
}

/**
 * Representation of a game in the games list
 */
export interface MyGame {
  gameId: number;
  board: GameState;
  pda: string;
  isDelegated?: boolean;
}

/**
 * Player role in a game
 */
export type PlayerRole = 'X' | 'O' | null;
