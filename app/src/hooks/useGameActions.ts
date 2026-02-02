import { useCallback, RefObject } from "react";
import { Program } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { GameState, MyGame, PlayerRole } from "../types";
import { TIC_TAC_TOE_PROGRAM, NOOP_PROGRAM_ID, MAGIC_BLOCK_PROGRAM, DEFAULT_PUBKEY } from "../constants";
import { getBoardPDA, getUserGamesPDA } from "../utils/pda";

interface UseGameActionsProps {
  connection: Connection;
  ephemeralConnection: RefObject<Connection | null>;
  gameProgramClient: RefObject<Program | null>;
  tempKeypair: RefObject<Keypair | null>;
  publicKey: PublicKey | null;
  submitTransaction: (
    transaction: Transaction,
    useTempKeypair?: boolean,
    ephemeral?: boolean,
    confirmCommitment?: "processed" | "confirmed" | "finalized"
  ) => Promise<string | null>;
  setTransactionError: (error: string | null) => void;
  setIsSubmitting: (submitting: boolean) => void;
}

/**
 * Hook to handle game actions (initialize, move, delegate, etc.)
 */
export const useGameActions = ({
  connection,
  ephemeralConnection,
  gameProgramClient,
  tempKeypair,
  publicKey,
  submitTransaction,
  setTransactionError,
  setIsSubmitting,
}: UseGameActionsProps) => {

  /**
   * Transfer SOL to temp keypair
   */
  const transferToTempKeypair = useCallback(async () => {
    if (!publicKey || !tempKeypair.current) return;
    await connection.requestAirdrop(publicKey, LAMPORTS_PER_SOL);
    await connection.requestAirdrop(tempKeypair.current.publicKey, LAMPORTS_PER_SOL);
  }, [publicKey, connection, tempKeypair]);

  /**
   * Initialize a new game (Player X creates game)
   */
  const initializeGame = useCallback(async (
    isDelegated: boolean,
    onSuccess: () => void
  ): Promise<void> => {
    if (!publicKey || !gameProgramClient.current) {
      setTransactionError("Please connect wallet first");
      return;
    }
    if (!tempKeypair.current) return;

    try {
      setIsSubmitting(true);
      setTransactionError(null);

      const [gamesPda] = getUserGamesPDA(tempKeypair.current.publicKey);

      // Get current game count
      let gameCount = 0;
      try {
        //@ts-ignore
        const userGame = await gameProgramClient.current.account.userGameCounter.fetch(gamesPda);
        gameCount = Number(userGame.gameCount.valueOf());
      } catch (e) {
        gameCount = 0;
      }

      const [boardPDA] = getBoardPDA(gameCount, tempKeypair.current.publicKey);

      const transaction = await gameProgramClient.current.methods
        .initialize()
        .accounts({
          userGames: gamesPda,
          boardAccount: boardPDA,
          payer: tempKeypair.current.publicKey,
        })
        .transaction() as Transaction;

      const signature = await submitTransaction(transaction, true, isDelegated, "confirmed");

      if (signature) {
        onSuccess();
      }
    } catch (error) {
      console.error("Error initializing game:", error);
      setTransactionError(`Failed to initialize game: ${error}`);
    } finally {
      setIsSubmitting(false);
    }
  }, [publicKey, submitTransaction, setTransactionError, setIsSubmitting, gameProgramClient, tempKeypair]);

  /**
   * Select and load a game
   */
  const selectGame = useCallback((
    game: MyGame, 
    role: PlayerRole
  ): {
    playerXAddress: string;
    gameId: number;
    role: PlayerRole;
    gameState: GameState;
    isDelegated: boolean;
  } => {
    return {
      playerXAddress: game.board.playerX.toString(),
      gameId: game.gameId,
      role,
      gameState: game.board,
      isDelegated: game.isDelegated || false,
    };
  }, []);

  /**
   * Register as Player O
   */
  const registerPlayerO = useCallback(async (
    joinAddress: string,
    joinGameId: string,
    onSuccess: (playerXAddress: string, gameId: number, isDelegated: boolean) => void
  ): Promise<void> => {
    if (!tempKeypair.current) return;
    if (!publicKey || !gameProgramClient.current) {
      setTransactionError("Please connect wallet first");
      return;
    }

    if (!joinAddress) {
      setTransactionError("Please enter Player X's address");
      return;
    }

    try {
      setTransactionError(null);

      const playerXPubKey = new PublicKey(joinAddress);
      const gameId = parseInt(joinGameId) || 0;

      const [boardPda] = getBoardPDA(gameId, playerXPubKey);

      // Check delegation status
      let gameDelegated = false;
      const devnetAccountInfo = await connection.getAccountInfo(boardPda);
      if (devnetAccountInfo) {
        gameDelegated = !devnetAccountInfo.owner.equals(TIC_TAC_TOE_PROGRAM);
        console.log(`Game delegation check: ${gameDelegated ? 'delegated to ephemeral' : 'on devnet'}`);
      }

      // If delegated, trigger refresh on ephemeral
      if (gameDelegated && ephemeralConnection.current) {
        try {
          await ephemeralConnection.current.requestAirdrop(boardPda, 1);
        } catch (_) {}
      }

      const transaction = await gameProgramClient.current.methods
        .playerORegister()
        .accounts({
          playerO: tempKeypair.current?.publicKey,
          boardAccount: boardPda,
        })
        .transaction() as Transaction;

      // Add noop instruction for unique transaction
      const noopInstruction = new TransactionInstruction({
        programId: NOOP_PROGRAM_ID,
        keys: [],
        data: Buffer.from(crypto.getRandomValues(new Uint8Array(5))),
      });
      transaction.add(noopInstruction);

      const signature = await submitTransaction(transaction, true, gameDelegated, "confirmed");

      if (signature) {
        onSuccess(joinAddress, gameId, gameDelegated);
      }
    } catch (error) {
      console.error("Error registering as Player O:", error);
      setTransactionError(`Failed to register as Player O: ${error}`);
    }
  }, [publicKey, connection, ephemeralConnection, gameProgramClient, tempKeypair, submitTransaction, setTransactionError]);

  /**
   * Rejoin a game (Player O already registered)
   */
  const rejoinGame = useCallback(async (
    joinAddress: string,
    joinGameId: string,
    onSuccess: (playerXAddress: string, gameId: number, isDelegated: boolean) => void
  ): Promise<void> => {
    if (!tempKeypair.current) return;
    if (!publicKey || !gameProgramClient.current) {
      setTransactionError("Please connect wallet first");
      return;
    }

    if (!joinAddress) {
      setTransactionError("Please enter Player X's address");
      return;
    }

    try {
      setTransactionError(null);

      const playerXPubKey = new PublicKey(joinAddress);
      const gameId = parseInt(joinGameId) || 0;
      const [boardPda] = getBoardPDA(gameId, playerXPubKey);

      // Check delegation status
      let gameDelegated = false;
      const devnetAccountInfo = await connection.getAccountInfo(boardPda);
      if (devnetAccountInfo) {
        gameDelegated = !devnetAccountInfo.owner.equals(TIC_TAC_TOE_PROGRAM);
        console.log(`Rejoin - Game delegation check: ${gameDelegated ? 'delegated to ephemeral' : 'on devnet'}`);
      }

      // If delegated, trigger refresh
      if (gameDelegated && ephemeralConnection.current) {
        try {
          await ephemeralConnection.current.requestAirdrop(boardPda, 1);
        } catch (_) {}
      }

      onSuccess(joinAddress, gameId, gameDelegated);
    } catch (error) {
      console.error("Error rejoining game:", error);
      setTransactionError(`Failed to rejoin game: ${error}`);
    }
  }, [publicKey, connection, ephemeralConnection, gameProgramClient, tempKeypair, setTransactionError]);

  /**
   * Make a move
   */
  const makeMove = useCallback(async (
    position: number,
    gameState: GameState,
    playerXAddress: string,
    selectedGameId: number,
    isDelegated: boolean,
    onSuccess: () => void
  ): Promise<void> => {
    if (!tempKeypair.current) return;
    if (!publicKey || !gameProgramClient.current || !gameState || !playerXAddress || selectedGameId === null) {
      setTransactionError("Game not ready");
      return;
    }

    if (!gameState.isActive) {
      setTransactionError("Game is over");
      return;
    }

    if (gameState.currentPlayer.toString() !== tempKeypair.current.publicKey.toBase58()) {
      setTransactionError("Not your turn");
      return;
    }

    if (gameState.board[position] !== 0) {
      setTransactionError("Position already taken");
      return;
    }

    if (gameState.playerO.toString() === DEFAULT_PUBKEY.toString()) {
      setTransactionError("Waiting for Player O to join");
      return;
    }

    try {
      setIsSubmitting(true);
      setTransactionError(null);

      const playerXPubKey = new PublicKey(playerXAddress);
      const [boardPda] = getBoardPDA(selectedGameId, playerXPubKey);

      const transaction = await gameProgramClient.current.methods
        .makeMove(position)
        .accounts({
          player: tempKeypair.current?.publicKey,
          boardAccount: boardPda,
        })
        .transaction() as Transaction;

      // Add noop instruction for unique transaction
      const noopInstruction = new TransactionInstruction({
        programId: NOOP_PROGRAM_ID,
        keys: [],
        data: Buffer.from(crypto.getRandomValues(new Uint8Array(5))),
      });
      transaction.add(noopInstruction);
      
      console.log("isDelegated:", isDelegated);
      const signature = await submitTransaction(transaction, true, isDelegated, "confirmed");

      if (signature) {
        onSuccess();
      }
    } catch (error) {
      console.error("Error making move:", error);
      setTransactionError(`Failed to make move: ${error}`);
    } finally {
      setIsSubmitting(false);
    }
  }, [publicKey, gameProgramClient, tempKeypair, submitTransaction, setTransactionError, setIsSubmitting]);

  /**
   * Delegate PDA to ephemeral
   */
  const delegatePdaTx = useCallback(async (
    gameState: GameState | null,
    playerXAddress: string | null,
    selectedGameId: number | null,
    onSuccess: () => void
  ): Promise<void> => {
    if (!tempKeypair.current) return;
    if (!publicKey || !gameProgramClient.current || !gameState || !playerXAddress || selectedGameId === null) {
      setTransactionError("Game not ready");
      return;
    }
    console.log("Delegate PDA transaction");
    
    const accountTmpWallet = await connection.getAccountInfo(tempKeypair.current.publicKey);
    if (!accountTmpWallet || accountTmpWallet.lamports <= 0.01 * LAMPORTS_PER_SOL) {
      await transferToTempKeypair();
    }
    
    const remainingAccounts =
      connection.rpcEndpoint.includes("localhost") ||
      connection.rpcEndpoint.includes("127.0.0.1")
        ? [
          {
            pubkey: MAGIC_BLOCK_PROGRAM,
            isSigner: false,
            isWritable: false,
          },
        ]
        : [];
    
    const playerXPubKey = new PublicKey(playerXAddress);
    const [boardPda] = getBoardPDA(selectedGameId, playerXPubKey);
    
    const transaction = await gameProgramClient.current?.methods
      .delegate()
      .accounts({
        payer: tempKeypair.current.publicKey,
        pda: boardPda,
        boardAccount: boardPda
      })
      .remainingAccounts(remainingAccounts)
      .transaction() as Transaction;
    
    const signature = await submitTransaction(transaction, true, false, "confirmed");
    
    if (signature) {
      // Trigger lazy reload on ephemeral
      if (ephemeralConnection.current) {
        try {
          await ephemeralConnection.current.requestAirdrop(boardPda, 1);
        } catch (_) {
          console.log("Triggered account refresh on ephemeral");
        }
        
        setTimeout(() => {
          onSuccess();
        }, 1000);
      } else {
        onSuccess();
      }
    }
  }, [connection, submitTransaction, transferToTempKeypair, publicKey, ephemeralConnection, gameProgramClient, tempKeypair, setTransactionError]);

  /**
   * Undelegate PDA from ephemeral
   */
  const undelegatePdaTx = useCallback(async (
    gameState: GameState | null,
    playerXAddress: string | null,
    selectedGameId: number | null,
    onSuccess: () => void
  ): Promise<void> => {
    if (!tempKeypair.current) return;
    if (!publicKey || !gameProgramClient.current || !gameState || !playerXAddress || selectedGameId === null) {
      setTransactionError("Game not ready");
      return;
    }
    console.log("Undelegate PDA transaction");
    
    const playerXPubKey = new PublicKey(playerXAddress);
    const [boardPda] = getBoardPDA(selectedGameId, playerXPubKey);
    
    const transaction = await gameProgramClient.current?.methods
      .undelegate()
      .accounts({
        payer: tempKeypair.current.publicKey,
        boardAccount: boardPda
      })
      .transaction() as Transaction;
    
    const signature = await submitTransaction(transaction, true, true);
    
    if (signature) {
      setTimeout(() => {
        onSuccess();
      }, 2000);
    }
  }, [publicKey, gameProgramClient, tempKeypair, submitTransaction, setTransactionError]);

  return {
    transferToTempKeypair,
    initializeGame,
    selectGame,
    registerPlayerO,
    rejoinGame,
    makeMove,
    delegatePdaTx,
    undelegatePdaTx,
  };
};
