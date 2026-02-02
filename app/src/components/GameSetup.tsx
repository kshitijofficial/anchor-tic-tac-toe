import React, { RefObject } from "react";
import { PublicKey, Keypair } from "@solana/web3.js";
import { MyGame, PlayerRole } from "../types";
import Button from "./Button";
import { GamesList } from "./GamesList";

interface GameSetupProps {
  myGames: MyGame[];
  joinedGames: MyGame[];
  tempKeypair: RefObject<Keypair | null>;
  publicKey: PublicKey | null;
  isSubmitting: boolean;
  registerLoading: boolean;
  ephemeralReady: boolean;
  joinAddress: string;
  joinGameId: string;
  onJoinAddressChange: (value: string) => void;
  onJoinGameIdChange: (value: string) => void;
  onSelectGame: (game: MyGame, role: PlayerRole) => void;
  onInitializeGame: () => void;
  onFetchMyGames: () => void;
  onRegisterPlayerO: () => void;
  onRejoinGame: () => void;
}

/**
 * Component for the game setup/lobby page
 */
export const GameSetup: React.FC<GameSetupProps> = ({
  myGames,
  joinedGames,
  tempKeypair,
  publicKey,
  isSubmitting,
  registerLoading,
  ephemeralReady,
  joinAddress,
  joinGameId,
  onJoinAddressChange,
  onJoinGameIdChange,
  onSelectGame,
  onInitializeGame,
  onFetchMyGames,
  onRegisterPlayerO,
  onRejoinGame,
}) => {
  return (
    <div className="game-setup">
      {/* My Games List (as Player X) */}
      <GamesList
        title="My Games as Player X"
        games={myGames}
        role="X"
        tempKeypair={tempKeypair}
        publicKey={publicKey}
        onSelectGame={onSelectGame}
      />

      {/* Joined Games List (as Player O) */}
      <GamesList
        title="Games I Joined as Player O"
        games={joinedGames}
        role="O"
        tempKeypair={tempKeypair}
        publicKey={publicKey}
        onSelectGame={onSelectGame}
      />

      {/* Create New Game */}
      <div className="form-section">
        <h3>Create New Game</h3>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Button
            title={isSubmitting ? "Creating..." : "Create Game as Player X"}
            resetGame={onInitializeGame}
            disabled={isSubmitting}
          />
          <Button
            title="Refresh Games"
            resetGame={onFetchMyGames}
            disabled={isSubmitting}
          />
        </div>
        <p style={{ color: ephemeralReady ? '#4CAF50' : '#888', fontSize: '0.8rem', marginTop: '8px' }}>
          MagicBlock Ephemeral: {ephemeralReady ? '✓ Connected' : 'Connecting...'}
        </p>
      </div>

      <div style={{ textAlign: 'center', margin: '20px 0', color: '#888' }}>OR</div>

      {/* Join Game as Player O */}
      <div className="form-section">
        <h3>Join Another Player's Game as Player O</h3>
        <input
          type="text"
          placeholder="Player X's wallet address"
          value={joinAddress}
          onChange={(e) => onJoinAddressChange(e.target.value)}
          style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '8px', border: '1px solid #ddd' }}
        />
        <input
          type="number"
          placeholder="Game ID (e.g., 0, 1, 2...)"
          value={joinGameId}
          onChange={(e) => onJoinGameIdChange(e.target.value)}
          style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '8px', border: '1px solid #ddd' }}
          min="0"
        />
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Button
            title={registerLoading ? "Registering..." : "Register as Player O (First Time)"}
            resetGame={onRegisterPlayerO}
            disabled={registerLoading || !joinAddress}
          />
          <Button
            title={registerLoading ? "Rejoining..." : "Rejoin Game (Already Registered)"}
            resetGame={onRejoinGame}
            disabled={registerLoading || !joinAddress}
          />
        </div>
      </div>
    </div>
  );
};
