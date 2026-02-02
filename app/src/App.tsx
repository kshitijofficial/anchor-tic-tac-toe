import React, { useCallback, useEffect, useRef, useState } from "react";
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

import { GameState, MyGame, PlayerRole } from "./types";
import { getBoardPDA } from "./utils/pda";
import {
  useProgramClient,
  useEphemeralConnection,
  useTransactionSubmit,
  useGameFetching,
  useGameSubscriptions,
  useGameActions,
} from "./hooks";

import { WalletInfo } from "./components/WalletInfo";
import { GameSetup } from "./components/GameSetup";
import { GameBoard } from "./components/GameBoard";
import { LoadingSpinner } from "./components/LoadingSpinner";
import Alert from "./components/Alert";
import "./App.css";

const App: React.FC = () => {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const tempKeypair = useRef<Keypair | null>(null);

  // Initialize hooks
  const { provider, gameProgramClient, initializeProgramClient } = useProgramClient(connection, publicKey);
  const { ephemeralConnection, ephemeralReady } = useEphemeralConnection();

  // Game state
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerXAddress, setPlayerXAddress] = useState<string | null>(null);
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);
  const [playerRole, setPlayerRole] = useState<PlayerRole>(null);

  // Games lists
  const [myGames, setMyGames] = useState<MyGame[]>([]);
  const [joinedGames, setJoinedGames] = useState<MyGame[]>([]);

  // Form inputs
  const [joinAddress, setJoinAddress] = useState<string>("");
  const [joinGameId, setJoinGameId] = useState<string>("0");

  // UI state
  const [isDelegated, setIsDelegated] = useState<boolean>(false);
  const [registerLoading, setRegisterLoading] = useState<boolean>(false);

  // Transaction handling
  const {
    isSubmitting,
    setIsSubmitting,
    transactionError,
    setTransactionError,
    transactionSuccess,
    setTransactionSuccess,
    submitTransaction,
  } = useTransactionSubmit({
    provider,
    ephemeralConnection,
    tempKeypair,
  });

  // Game fetching
  const { fetchMyGames, fetchGameState } = useGameFetching({
    connection,
    ephemeralConnection,
    gameProgramClient,
    tempKeypair,
    publicKey,
  });

  // Game subscriptions
  const { subscribeToBoardOnDevnet, subscribeToBoardOnEphemeral, cleanupSubscriptions } = useGameSubscriptions({
    connection,
    ephemeralConnection,
    gameProgramClient,
    setGameState,
    setIsDelegated,
  });

  // Game actions
  const {
    transferToTempKeypair,
    initializeGame,
    selectGame,
    registerPlayerO,
    rejoinGame,
    makeMove,
    delegatePdaTx,
    undelegatePdaTx,
  } = useGameActions({
    connection,
    ephemeralConnection,
    gameProgramClient,
    tempKeypair,
    publicKey,
    submitTransaction,
    setTransactionError,
    setIsSubmitting,
  });

  // Fetch games wrapper
  const handleFetchMyGames = useCallback(async () => {
    const { gamesAsX, gamesAsO } = await fetchMyGames();
    setMyGames(gamesAsX);
    setJoinedGames(gamesAsO);
  }, [fetchMyGames]);

  // Initialize program client
  useEffect(() => {
    const init = async () => {
      await initializeProgramClient();
      if (publicKey && tempKeypair.current) {
        handleFetchMyGames();
      }
    };
    init().catch(console.error);
  }, [initializeProgramClient, publicKey, handleFetchMyGames]);

  // Handle wallet connection
  useEffect(() => {
    if (!publicKey) {
      tempKeypair.current = null;
      setMyGames([]);
      setJoinedGames([]);
      return;
    }
    const newTempKeypair = Keypair.fromSeed(publicKey.toBytes());
    if (!tempKeypair.current || !tempKeypair.current.publicKey.equals(newTempKeypair.publicKey)) {
      tempKeypair.current = newTempKeypair;
      if (gameProgramClient.current) {
        handleFetchMyGames();
      }
    }
  }, [publicKey, handleFetchMyGames, gameProgramClient]);

  // Check and transfer SOL to temp keypair
  useEffect(() => {
    const checkAndTransfer = async () => {
      if (tempKeypair.current) {
        const accountTmpWallet = await connection.getAccountInfo(tempKeypair.current.publicKey);
        if (!accountTmpWallet || accountTmpWallet.lamports <= 0.01 * LAMPORTS_PER_SOL) {
          await transferToTempKeypair();
        }
      }
    };
    checkAndTransfer();
  }, [isDelegated, connection, transferToTempKeypair]);

  // Re-fetch games when ephemeral is ready
  useEffect(() => {
    if (ephemeralReady && gameProgramClient.current && publicKey && tempKeypair.current) {
      console.log("Ephemeral ready, re-fetching games...");
      handleFetchMyGames();
    }
  }, [ephemeralReady, publicKey, handleFetchMyGames, gameProgramClient]);

  // Subscribe to board changes when a game is selected
  useEffect(() => {
    if (!playerXAddress || selectedGameId === null || !gameProgramClient.current) return;
    
    const setupSubscriptions = async () => {
      const playerXPubKey = new PublicKey(playerXAddress);
      const [boardPda] = getBoardPDA(selectedGameId, playerXPubKey);
      
      await subscribeToBoardOnDevnet(boardPda);
      await subscribeToBoardOnEphemeral(boardPda);
    };
    
    setupSubscriptions().catch(console.error);
    
    return () => {
      cleanupSubscriptions();
    };
  }, [playerXAddress, selectedGameId, subscribeToBoardOnDevnet, subscribeToBoardOnEphemeral, cleanupSubscriptions, gameProgramClient]);

  // Event listeners for game events
  useEffect(() => {
    if (!tempKeypair.current || !gameProgramClient.current) return;

    const program = gameProgramClient.current;
    const walletAddress = tempKeypair.current.publicKey.toBase58();

    const gameCreatedListener = program.addEventListener("GameCreated", (event: any) => {
      console.log("GameCreated event received:", event);
      if (event.playerX.toString() === walletAddress) {
        handleFetchMyGames();
      }
    });

    const moveMadeListener = program.addEventListener("MoveMade", (event: any) => {
      console.log("MoveMade event received:", event);
      if (playerXAddress && selectedGameId !== null && event.gameId.toNumber() === selectedGameId) {
        handleFetchGameState(playerXAddress, selectedGameId);
      }
    });

    const gameWonListener = program.addEventListener("GameWon", (event: any) => {
      if (playerXAddress && selectedGameId !== null && event.gameId.toNumber() === selectedGameId) {
        handleFetchGameState(playerXAddress, selectedGameId);
      }
    });

    const gameDrawListener = program.addEventListener("GameDraw", (event: any) => {
      if (playerXAddress && selectedGameId !== null && event.gameId.toNumber() === selectedGameId) {
        handleFetchGameState(playerXAddress, selectedGameId);
      }
    });

    return () => {
      program.removeEventListener(gameCreatedListener);
      program.removeEventListener(moveMadeListener);
      program.removeEventListener(gameWonListener);
      program.removeEventListener(gameDrawListener);
    };
  }, [publicKey, playerXAddress, selectedGameId, handleFetchMyGames, gameProgramClient]);

  // Auto-refresh game state polling
  useEffect(() => {
    if (playerXAddress && gameState && gameState.isActive && selectedGameId !== null) {
      const interval = setInterval(() => {
        handleFetchGameState(playerXAddress, selectedGameId);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [playerXAddress, gameState, selectedGameId]);

  // Fetch game state wrapper
  const handleFetchGameState = useCallback(async (playerXAddr: string, gameId: number) => {
    const { gameState: newGameState, isDelegated: newIsDelegated } = await fetchGameState(playerXAddr, gameId);
    if (newGameState) {
      setGameState(newGameState);
      setIsDelegated(newIsDelegated);
      setTransactionError(null);
    } else {
      setTransactionError("Failed to fetch game state");
    }
  }, [fetchGameState, setTransactionError]);

  // Action handlers
  const handleInitializeGame = useCallback(async () => {
    await initializeGame(isDelegated, handleFetchMyGames);
  }, [initializeGame, isDelegated, handleFetchMyGames]);

  const handleSelectGame = useCallback((game: MyGame, role: PlayerRole) => {
    const result = selectGame(game, role);
    setPlayerXAddress(result.playerXAddress);
    setSelectedGameId(result.gameId);
    setPlayerRole(result.role);
    setGameState(result.gameState);
    setIsDelegated(result.isDelegated);
  }, [selectGame]);

  const handleRegisterPlayerO = useCallback(async () => {
    setRegisterLoading(true);
    await registerPlayerO(joinAddress, joinGameId, async (playerXAddr, gameId, gameDelegated) => {
      setPlayerXAddress(playerXAddr);
      setPlayerRole('O');
      setSelectedGameId(gameId);
      setIsDelegated(gameDelegated);
      await handleFetchGameState(playerXAddr, gameId);
    });
    setRegisterLoading(false);
  }, [registerPlayerO, joinAddress, joinGameId, handleFetchGameState]);

  const handleRejoinGame = useCallback(async () => {
    setRegisterLoading(true);
    await rejoinGame(joinAddress, joinGameId, async (playerXAddr, gameId, gameDelegated) => {
      setPlayerXAddress(playerXAddr);
      setPlayerRole('O');
      setSelectedGameId(gameId);
      setIsDelegated(gameDelegated);
      await handleFetchGameState(playerXAddr, gameId);
    });
    setRegisterLoading(false);
  }, [rejoinGame, joinAddress, joinGameId, handleFetchGameState]);

  const handleMakeMove = useCallback(async (position: number) => {
    if (!gameState || !playerXAddress || selectedGameId === null) return;
    await makeMove(
      position,
      gameState,
      playerXAddress,
      selectedGameId,
      isDelegated,
      () => handleFetchGameState(playerXAddress, selectedGameId)
    );
  }, [makeMove, gameState, playerXAddress, selectedGameId, isDelegated, handleFetchGameState]);

  const handleBackToGameList = useCallback(() => {
    setPlayerXAddress(null);
    setPlayerRole(null);
    setGameState(null);
    setSelectedGameId(null);
    if (publicKey) {
      handleFetchMyGames();
    }
  }, [publicKey, handleFetchMyGames]);

  const handleDelegate = useCallback(async () => {
    await delegatePdaTx(gameState, playerXAddress, selectedGameId, () => {
      setIsDelegated(true);
      if (playerXAddress && selectedGameId !== null) {
        handleFetchGameState(playerXAddress, selectedGameId);
      }
    });
  }, [delegatePdaTx, gameState, playerXAddress, selectedGameId, handleFetchGameState]);

  const handleUndelegate = useCallback(async () => {
    await undelegatePdaTx(gameState, playerXAddress, selectedGameId, () => {
      setIsDelegated(false);
      if (playerXAddress && selectedGameId !== null) {
        handleFetchGameState(playerXAddress, selectedGameId);
      }
    });
  }, [undelegatePdaTx, gameState, playerXAddress, selectedGameId, handleFetchGameState]);

  return (
    <div className="app">
      <div className="container">
        <div className="wallet-section">
          <div className="wallet-buttons">
            <WalletMultiButton />
          </div>
          {publicKey && (
            <WalletInfo
              tempKeypair={tempKeypair}
              playerRole={playerRole}
              selectedGameId={selectedGameId}
            />
          )}
        </div>

        <h1>Tic-Tac-Toe on Solana</h1>

        {/* Error Display */}
        {transactionError && (
          <Alert type="error" message={transactionError} onClose={() => setTransactionError(null)} />
        )}

        {transactionSuccess && (
          <Alert type="success" message={transactionSuccess} onClose={() => setTransactionSuccess(null)} />
        )}

        {/* SETUP PAGE - shown when no game is loaded */}
        {publicKey && !gameState && (
          <GameSetup
            myGames={myGames}
            joinedGames={joinedGames}
            tempKeypair={tempKeypair}
            publicKey={publicKey}
            isSubmitting={isSubmitting}
            registerLoading={registerLoading}
            ephemeralReady={ephemeralReady}
            joinAddress={joinAddress}
            joinGameId={joinGameId}
            onJoinAddressChange={setJoinAddress}
            onJoinGameIdChange={setJoinGameId}
            onSelectGame={handleSelectGame}
            onInitializeGame={handleInitializeGame}
            onFetchMyGames={handleFetchMyGames}
            onRegisterPlayerO={handleRegisterPlayerO}
            onRejoinGame={handleRejoinGame}
          />
        )}

        {/* GAME BOARD PAGE - shown when a game is loaded */}
        {gameState && (
          <GameBoard
            gameState={gameState}
            playerXAddress={playerXAddress}
            selectedGameId={selectedGameId}
            playerRole={playerRole}
            isDelegated={isDelegated}
            isSubmitting={isSubmitting}
            tempKeypair={tempKeypair}
            publicKey={publicKey}
            onMakeMove={handleMakeMove}
            onBackToGameList={handleBackToGameList}
            onDelegate={handleDelegate}
            onUndelegate={handleUndelegate}
          />
        )}

        {/* Loading Spinner */}
        {isSubmitting && <LoadingSpinner />}

        <img 
          src={`${process.env.PUBLIC_URL}/magicblock_white.png`} 
          alt="Magic Block Logo"
          className="magicblock-logo" 
        />
      </div>
    </div>
  );
};

export default App;
