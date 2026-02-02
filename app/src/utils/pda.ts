import { BN, utils } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { TIC_TAC_TOE_PROGRAM } from "../constants";

/**
 * Derive the Board PDA for a specific game
 * @param gameCount - The game ID/count
 * @param playerXAddr - Player X's public key
 * @returns The derived PDA and bump seed
 */
export const getBoardPDA = (gameCount: number | BN, playerXAddr: PublicKey): [PublicKey, number] => {
  const gameCountBuffer = Buffer.from(new BN(gameCount).toArray("le", 8));
  return PublicKey.findProgramAddressSync(
    [
      utils.bytes.utf8.encode("board"),
      playerXAddr.toBuffer(),
      gameCountBuffer
    ],
    TIC_TAC_TOE_PROGRAM,
  );
};

/**
 * Derive the UserGameCounter PDA for a user
 * @param userPubkey - User's public key
 * @returns The derived PDA and bump seed
 */
export const getUserGamesPDA = (userPubkey: PublicKey): [PublicKey, number] => {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("user_games"), userPubkey.toBuffer()],
    TIC_TAC_TOE_PROGRAM
  );
};
