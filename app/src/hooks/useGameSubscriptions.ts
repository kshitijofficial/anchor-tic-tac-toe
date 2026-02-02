import { useCallback, useRef, RefObject } from "react";
import { Program } from "@coral-xyz/anchor";
import { AccountInfo, Connection, PublicKey } from "@solana/web3.js";
import { GameState } from "../types";
import { TIC_TAC_TOE_PROGRAM } from "../constants";

interface UseGameSubscriptionsProps {
  connection: Connection;
  ephemeralConnection: RefObject<Connection | null>;
  gameProgramClient: RefObject<Program | null>;
  setGameState: (state: GameState | null) => void;
  setIsDelegated: (delegated: boolean) => void;
}

/**
 * Hook to manage account change subscriptions on devnet and ephemeral
 */
export const useGameSubscriptions = ({
  connection,
  ephemeralConnection,
  gameProgramClient,
  setGameState,
  setIsDelegated,
}: UseGameSubscriptionsProps) => {
  const gameSubscriptionId = useRef<number | null>(null);
  const ephemeralGameSubscriptionId = useRef<number | null>(null);

  /**
   * Handle account changes from either devnet or ephemeral
   * @param accountInfo - The account info from the subscription
   * @param isEphemeral - Whether this change came from ephemeral connection
   */
  const createBoardChangeHandler = useCallback((isEphemeral: boolean) => {
    return (accountInfo: AccountInfo<Buffer>) => {
      console.log(`Board changed on ${isEphemeral ? 'ephemeral' : 'devnet'}`, accountInfo);
      if (!gameProgramClient.current) return;

      // For devnet, check delegation status and skip if delegated
      if (!isEphemeral) {
        const accountIsDelegated = !accountInfo.owner.equals(TIC_TAC_TOE_PROGRAM);
        setIsDelegated(accountIsDelegated);
        if (accountIsDelegated) return;
      }

      try {
        const decodedData = gameProgramClient.current.coder.accounts.decode('board', accountInfo.data);
        setGameState(decodedData);
      } catch (err) {
        console.error(`Error decoding ${isEphemeral ? 'ephemeral' : 'devnet'} board data:`, err);
      }
    };
  }, [gameProgramClient, setGameState, setIsDelegated]);

  /**
   * Subscribe to board updates on devnet
   */
  const subscribeToBoardOnDevnet = useCallback(async (boardPda: PublicKey): Promise<void> => {
    if (gameSubscriptionId.current) {
      await connection.removeAccountChangeListener(gameSubscriptionId.current);
    }
    console.log("Subscribing to board on devnet", boardPda.toBase58());
    gameSubscriptionId.current = connection.onAccountChange(
      boardPda, 
      createBoardChangeHandler(false), 
      { commitment: 'processed' }
    );
  }, [connection, createBoardChangeHandler]);

  /**
   * Subscribe to board updates on ephemeral
   */
  const subscribeToBoardOnEphemeral = useCallback(async (boardPda: PublicKey): Promise<void> => {
    if (!ephemeralConnection.current) return;
    if (ephemeralGameSubscriptionId.current) {
      await ephemeralConnection.current.removeAccountChangeListener(ephemeralGameSubscriptionId.current);
    }
    console.log("Subscribing to board on ephemeral", boardPda.toBase58());
    ephemeralGameSubscriptionId.current = ephemeralConnection.current.onAccountChange(
      boardPda, 
      createBoardChangeHandler(true), 
      { commitment: 'confirmed' }
    );
  }, [ephemeralConnection, createBoardChangeHandler]);

  /**
   * Cleanup subscriptions
   */
  const cleanupSubscriptions = useCallback(() => {
    if (gameSubscriptionId.current) {
      connection.removeAccountChangeListener(gameSubscriptionId.current);
      gameSubscriptionId.current = null;
    }
    if (ephemeralGameSubscriptionId.current && ephemeralConnection.current) {
      ephemeralConnection.current.removeAccountChangeListener(ephemeralGameSubscriptionId.current);
      ephemeralGameSubscriptionId.current = null;
    }
  }, [connection, ephemeralConnection]);

  return {
    gameSubscriptionId,
    ephemeralGameSubscriptionId,
    subscribeToBoardOnDevnet,
    subscribeToBoardOnEphemeral,
    cleanupSubscriptions,
  };
};
