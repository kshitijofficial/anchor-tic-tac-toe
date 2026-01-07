import dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(process.cwd(), ".env") });

import * as anchor from "@coral-xyz/anchor";
import { Program, web3 } from "@coral-xyz/anchor";
import { TicTac } from "../target/types/tic_tac";

import { LAMPORTS_PER_SOL, sendAndConfirmTransaction, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import {
  ConnectionMagicRouter, GetCommitmentSignature
} from "@magicblock-labs/ephemeral-rollups-sdk";

const anchorProvider = anchor.AnchorProvider.env();
const isLocalnet = anchorProvider.connection.rpcEndpoint.includes("localhost") ||
  anchorProvider.connection.rpcEndpoint.includes("127.0.0.1");

if (isLocalnet) {
  console.log("Skipping 'magic-router-and-multiple-atomic-ixs' test suite because it's running on localnet");
}

const testSuite = isLocalnet ? describe.skip : describe;

// Helper function to load Player O keypair
function loadPlayerOKeypair(privateKeyBase58?: string): Keypair {
  if (!privateKeyBase58) {
    console.warn('No PLAYER_O_PRIVATE_KEY found. Creating a new keypair for Player O.');
    return Keypair.generate();
  }

  try {
    const privateKeyBytes = bs58.decode(privateKeyBase58);
    if (privateKeyBytes.length === 32) {
      return Keypair.fromSeed(privateKeyBytes);
    } else if (privateKeyBytes.length === 64) {
      return Keypair.fromSecretKey(privateKeyBytes);
    } else {
      throw new Error(`Invalid private key length: ${privateKeyBytes.length}. Expected 32 or 64 bytes.`);
    }
  } catch (error) {
    console.error('Error loading Player O private key:', error);
    throw new Error('Failed to load Player O private key. Make sure it\'s in base58 format.');
  }
}

testSuite("Tic-Tac-Toe Game - Ephemeral Rollups Integration", () => {

  const connection = new ConnectionMagicRouter(
    process.env.ROUTER_ENDPOINT || "https://devnet-router.magicblock.app/",
    {
      wsEndpoint: process.env.WS_ROUTER_ENDPOINT || "wss://devnet-router.magicblock.app/"
    }
  )
  const providerMagic = new anchor.AnchorProvider(connection, anchor.Wallet.local());
  const provider = anchor.AnchorProvider.env();
  const solanaConnection = provider.connection;

  anchor.setProvider(provider);

  const program = anchor.workspace.ticTac as Program<TicTac>;

  // Create a separate program instance that uses the Magic Router connection for ER reads
  const programER = new anchor.Program<TicTac>(
    program.idl,
    providerMagic
  );


  const playerXPubkey = providerMagic.wallet.publicKey;
  const playerOKeyPair = loadPlayerOKeypair(process.env.PLAYER_O_PRIVATE_KEY);
  const playerOPubkey = playerOKeyPair.publicKey;

  const [gamesPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [anchor.utils.bytes.utf8.encode("user_games"), playerXPubkey.toBuffer()],
    program.programId,
  );


  const getBoardPDA = (gameCount: number | anchor.BN) => {
    const gameCountBuffer = Buffer.from(new anchor.BN(gameCount).toArray("le", 8));
    return anchor.web3.PublicKey.findProgramAddressSync(
      [
        anchor.utils.bytes.utf8.encode("board"),
        playerXPubkey.toBuffer(),
        gameCountBuffer
      ],
      program.programId,
    );
  };

  // Helper function to initialize a board
  async function initializeBoard(useCurrentGameCount = false): Promise<anchor.web3.PublicKey> {
    let gameCount = 0;

    if (useCurrentGameCount) {
      const userGameCounterAccount = await program.account.userGameCounter.fetch(gamesPDA);
      gameCount = Number(userGameCounterAccount.gameCount);
    } else {
      try {
        const userGameCounterAccount = await program.account.userGameCounter.fetch(gamesPDA);
        gameCount = Number(userGameCounterAccount.gameCount);
      } catch (err) {
        console.log("User games account doesn't exist yet, starting with gameCount = 0");
      }
    }

    const [boardPDA] = getBoardPDA(gameCount);

    let boardExists = false;
    try {
      await program.account.board.fetch(boardPDA);
      boardExists = true;
      console.log("Board account already exists, skipping initialization");
    } catch (err) {
      console.log("Board account doesn't exist, will initialize");
    }

    if (!boardExists) {
      try {
        const start = Date.now();
        const tx = await program.methods
          .initialize()
          .accountsPartial({
            payer: playerXPubkey,
            boardAccount: boardPDA,
          })
          .transaction();
        const txHash = await sendAndConfirmTransaction(connection, tx, [providerMagic.wallet.payer], {
          skipPreflight: true,
          commitment: "confirmed"
        });
        const duration = Date.now() - start;
        console.log(`${duration}ms (Base Layer) Initialize txHash: ${txHash}`);
      } catch (err: any) {
        if (err.message && err.message.includes("already in use")) {
          console.log("Board account was created between check and initialization, continuing...");
        } else {
          throw err;
        }
      }
    }

    return boardPDA;
  }

  // Helper function to register Player O
  async function registerPlayerO(boardPDA: anchor.web3.PublicKey): Promise<void> {
    let playerOAlreadyRegistered = false;
    try {
      const boardAccount = await program.account.board.fetch(boardPDA);
      if (boardAccount.playerO.toString() !== "11111111111111111111111111111111") {
        playerOAlreadyRegistered = true;
        console.log("Player O is already registered, skipping registration");
      }
    } catch (err) {
      console.log("Could not fetch board account, will attempt registration");
    }

    if (!playerOAlreadyRegistered) {
      try {
        await program.methods.playerORegister()
          .accountsPartial({
            playerO: playerOPubkey,
            boardAccount: boardPDA,
          })
          .signers([playerOKeyPair])
          .rpc();
      } catch (err: any) {
        if (err.message && (
          err.message.includes("PlayerAlreadyRegistered") ||
          err.message.includes("already registered")
        )) {
          console.log("Player O was already registered (race condition), continuing...");
        } else {
          throw err;
        }
      }
    }
  }

  // Helper function to play a game sequence
  async function playGameSequence(
    boardPDA: anchor.web3.PublicKey,
    connectionToUse: any,
    label: string,
    programForReading: Program<TicTac> = program
  ): Promise<{ totalTime: number; avgTime: number; moveCount: number }> {
    console.log(`\n🎮 Playing multiple rapid moves on ${label}...\n`);

    const moves = [
      { position: 4, player: playerXPubkey, signer: providerMagic.wallet.payer, name: "X" },
      { position: 0, player: playerOPubkey, signer: playerOKeyPair, name: "O" },
      { position: 1, player: playerXPubkey, signer: providerMagic.wallet.payer, name: "X" },
      { position: 2, player: playerOPubkey, signer: playerOKeyPair, name: "O" },
      { position: 3, player: playerXPubkey, signer: providerMagic.wallet.payer, name: "X" },
      { position: 5, player: playerOPubkey, signer: playerOKeyPair, name: "O" },
      { position: 6, player: playerXPubkey, signer: providerMagic.wallet.payer, name: "X" },
      { position: 7, player: playerOPubkey, signer: playerOKeyPair, name: "O" },
      { position: 8, player: playerXPubkey, signer: providerMagic.wallet.payer, name: "X" },
    ];

    const overallStart = Date.now();
    const moveTimes: number[] = [];

    for (const move of moves) {
      const moveStart = Date.now();
      try {
        let tx = await program.methods.makeMove(move.position)
          .accounts({
            player: move.player,
            boardAccount: boardPDA
          })
          .transaction();

        const signers = move.player.equals(playerOPubkey) ? [playerOKeyPair] : [providerMagic.wallet.payer];
        const txHash = await sendAndConfirmTransaction(connectionToUse, tx, signers, {
          skipPreflight: true,
        });

        const moveDuration = Date.now() - moveStart;
        moveTimes.push(moveDuration);
        console.log(`  ${moveDuration}ms (${label}) ${move.name} -> position ${move.position} | txHash: ${txHash}`);
      } catch (err: any) {
        if (err.message && (
          err.message.includes("LocationNotEmpty") ||
          err.message.includes("NotYourChance") ||
          err.message.includes("GameOver")
        )) {
          console.log(`  ⚠️  Move ${move.name} to position ${move.position} skipped: ${err.message.split('\n')[0]}`);
          break;
        } else {
          throw err;
        }
      }
    }

    const totalTime = Date.now() - overallStart;
    const avgTime = moveTimes.length > 0 ? moveTimes.reduce((a, b) => a + b, 0) / moveTimes.length : 0;

    console.log(`\n📊 ${label} Performance Summary:`);
    console.log(`   Total moves: ${moveTimes.length}`);
    console.log(`   Total time: ${totalTime}ms`);
    console.log(`   Average per move: ${avgTime.toFixed(0)}ms`);

    // Fetch final board state using the appropriate program instance
    try {
      const boardAccount = await programForReading.account.board.fetch(boardPDA);
      console.log(`Final board state on ${label}: ${boardAccount.board}`);
    } catch (err) {
      console.log("Could not fetch board state");
    }

    return { totalTime, avgTime, moveCount: moveTimes.length };
  }

  let ephemeralValidator;
  let createdBoardPDA: anchor.web3.PublicKey;

  before(async function () {
    console.log("Endpoint:", connection.rpcEndpoint.toString());

    ephemeralValidator = await connection.getClosestValidator();
    console.log("Detected validator identity:", ephemeralValidator);

    const balanceX = await connection.getBalance(anchor.Wallet.local().publicKey)
    console.log('Current X balance is', balanceX / LAMPORTS_PER_SOL, ' SOL', '\n')

    const balanceO = await connection.getBalance(playerOPubkey)
    console.log('Current O balance is', balanceO / LAMPORTS_PER_SOL, ' SOL', '\n')
  })

  describe("Setup: Board Initialization", () => {
    it("initializes board on Solana", async () => {
      createdBoardPDA = await initializeBoard();
    })

    it("registers player O", async () => {
      await registerPlayerO(createdBoardPDA);
    })
  })

  describe("Ephemeral Rollup Gameplay", () => {
    it("delegates board to ER", async () => {
      const start = Date.now();

      const validator = (await connection.getClosestValidator());
      console.log("Delegating to closest validator: ", JSON.stringify(validator));

      // Add local validator identity to the remaining accounts if running on localnet
      const remainingAccounts =
        connection.rpcEndpoint.includes("localhost") ||
          connection.rpcEndpoint.includes("127.0.0.1")
          ? [
            {
              pubkey: new web3.PublicKey("mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev"),
              isSigner: false,
              isWritable: false,
            },
          ]
          : [
            {
              pubkey: new web3.PublicKey(validator.identity),
              isSigner: false,
              isWritable: false,
            },
          ];
      const boardPDA = createdBoardPDA;
      let tx = await program.methods
        .delegate()
        .accountsPartial({
          payer: playerXPubkey,
          pda: boardPDA,
          boardAccount: boardPDA
        })
        .remainingAccounts(remainingAccounts)
        .transaction();
      const txHash = await sendAndConfirmTransaction(connection, tx, [providerMagic.wallet.payer], {
        skipPreflight: true,
        commitment: "confirmed"
      });
      const duration = Date.now() - start;
      console.log(`${duration}ms (Base Layer) Delegate txHash: ${txHash}`);
    })

    it("plays multiple rapid moves on ER (demonstrating speed advantage)", async () => {
      await playGameSequence(createdBoardPDA, connection, "ER", programER);
    })

    it("undelegates and commits all ER changes to base layer", async () => {
      const boardPDA = createdBoardPDA;

      console.log("🔄 Committing all ER state changes to Solana base layer...\n");

      const start = Date.now();
      const tx = await program.methods.undelegate().accountsPartial({
        payer: providerMagic.wallet.publicKey,
        boardAccount: boardPDA
      }).transaction();

      const txHash = await sendAndConfirmTransaction(connection, tx, [providerMagic.wallet.payer], {
        skipPreflight: true,
      });
      const duration = Date.now() - start;
      console.log(`${duration}ms (ER) Undelegate txHash: ${txHash}`);

      // Get the commitment signature on the base layer
      const comfirmCommitStart = Date.now();
      // Await for the commitment on the base layer
      const txCommitSgn = await GetCommitmentSignature(
        txHash,
        new anchor.web3.Connection(ephemeralValidator.fqdn),
      );
      const commitDuration = Date.now() - comfirmCommitStart;
      console.log(`${commitDuration}ms (Base Layer) Commit txHash: ${txCommitSgn}`);

      console.log("\n✅ All ER moves committed to Solana in ONE transaction!");

      // Verify final state on base layer
      try {
        const boardAccount = await program.account.board.fetch(boardPDA);
        console.log(`\nFinal board state on Solana: ${boardAccount.board}`);
        console.log(`Board layout:`);
        console.log(`  ${boardAccount.board[0]} | ${boardAccount.board[1]} | ${boardAccount.board[2]}`);
        console.log(`  ---------`);
        console.log(`  ${boardAccount.board[3]} | ${boardAccount.board[4]} | ${boardAccount.board[5]}`);
        console.log(`  ---------`);
        console.log(`  ${boardAccount.board[6]} | ${boardAccount.board[7]} | ${boardAccount.board[8]}`);
        console.log(`\n(0 = empty, 1 = X, 2 = O)\n`);
      } catch (err) {
        console.log("Could not fetch final board state");
      }
    })
  })

  describe("Base Layer Comparison", () => {
    it("initializes a new board on Solana", async () => {
      createdBoardPDA = await initializeBoard(true);
    })

    it("registers player O for new board", async () => {
      await registerPlayerO(createdBoardPDA);
    })

    it("plays multiple rapid moves on Solana directly", async () => {
      await playGameSequence(createdBoardPDA, solanaConnection, "Solana");
    })
  })

});

