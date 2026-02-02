import { PublicKey } from "@solana/web3.js";

/**
 * Tic-Tac-Toe program ID deployed on Solana
 */
export const TIC_TAC_TOE_PROGRAM = new PublicKey("9eSXvKJh3tChbzBXKSUKHYABsK7z2YzYrjGq534PueYC");

/**
 * Default public key (used for checking empty player slots)
 */
export const DEFAULT_PUBKEY = PublicKey.default;
export const DEFAULT_PUBKEY_STR = DEFAULT_PUBKEY.toString();

/**
 * MagicBlock ephemeral endpoint
 */
export const EPHEMERAL_ENDPOINT = process.env.REACT_APP_EPHEMERAL_PROVIDER_ENDPOINT || "https://devnet.magicblock.app";

/**
 * Noop program ID (for unique transactions)
 */
export const NOOP_PROGRAM_ID = new PublicKey('noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV');

/**
 * MagicBlock program ID (for localhost delegation)
 */
export const MAGIC_BLOCK_PROGRAM = new PublicKey("mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev");
