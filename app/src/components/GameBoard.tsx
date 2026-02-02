import React, { RefObject } from "react";
import { PublicKey, Keypair } from "@solana/web3.js";
import { GameState, PlayerRole } from "../types";
import { DEFAULT_PUBKEY } from "../constants";
import Button from "./Button";
import Square from "./Square";

interface GameBoardProps {
  gameState: GameState;
  playerXAddress: string | null;
  selectedGameId: number | null;
  playerRole: PlayerRole;
  isDelegated: boolean;
  isSubmitting: boolean;
  tempKeypair: RefObject<Keypair | null>;
  publicKey: PublicKey | null;
  onMakeMove: (position: number) => void;
  onBackToGameList: () => void;
  onDelegate: () => void;
  onUndelegate: () => void;
}

/**
 * Component for the game board view
 */
export const GameBoard: React.FC<GameBoardProps> = ({
  gameState,
  playerXAddress,
  selectedGameId,
  playerRole,
  isDelegated,
  isSubmitting,
  tempKeypair,
  publicKey,
  onMakeMove,
  onBackToGameList,
  onDelegate,
  onUndelegate,
}) => {
  // Helper: render cell content
  const renderCell = (index: number): string => {
    const value = gameState.board[index];
    if (value === 1) return "X";
    if (value === 2) return "O";
    return "";
  };

  // Helper: check if it's my turn
  const isMyTurn = (): boolean => {
    if (!tempKeypair.current) return false;
    return gameState.currentPlayer.toString() === tempKeypair.current.publicKey.toBase58();
  };

  // Helper: get game status message
  const getGameStatus = (): string => {
    const defaultPubkey = DEFAULT_PUBKEY.toString();
    const playerOEmpty = gameState.playerO.toString() === defaultPubkey;

    if (!gameState.isActive) {
      if (gameState.winnerAddress.toString() !== defaultPubkey) {
        const winnerRole = gameState.winnerAddress.toString() === gameState.playerX.toString() ? "X" : "O";
        const isWinner = publicKey && gameState.winnerAddress.toString() === publicKey.toBase58();
        return `Game Over! Player ${winnerRole} wins${isWinner ? " 🎉" : ""}`;
      }

      const isBoardFull = gameState.board.every(cell => cell !== 0);
      if (isBoardFull) {
        return "Game Over! It's a draw!";
      }
      return "Game Not Started!";
    }

    if (playerOEmpty) {
      return "Waiting for Player O to join...";
    }

    const currentPlayerRole = gameState.currentPlayer.toString() === gameState.playerX.toString() ? "X" : "O";

    if (isMyTurn()) {
      return `Your turn! (You are Player ${playerRole})`;
    } else {
      return `Waiting for Player ${currentPlayerRole}...`;
    }
  };

  return (
    <div className="game-area">
      {/* Game Status */}
      <div style={{
        background: '#f8f9fa',
        padding: '20px',
        borderRadius: '12px',
        marginBottom: '20px',
        textAlign: 'center'
      }}>
        {/* Delegation Status Badge */}
        <div style={{
          display: 'inline-block',
          padding: '6px 16px',
          borderRadius: '20px',
          marginBottom: '12px',
          background: isDelegated ? '#4CAF50' : '#2196F3',
          color: 'white',
          fontSize: '0.85rem',
          fontWeight: '600'
        }}>
          {isDelegated ? '⚡ Ephemeral Mode (MagicBlock)' : '🔗 Solana Devnet'}
        </div>
        
        <h2 style={{
          color: '#667eea',
          fontSize: '1.5rem',
          marginBottom: '10px',
          fontWeight: '700'
        }}>
          {getGameStatus()}
        </h2>
        <p style={{ color: '#888', fontSize: '0.85rem' }}>
          Game #{selectedGameId} | Player X: {playerXAddress?.slice(0, 4)}...{playerXAddress?.slice(-4)}
        </p>
        {gameState.playerO.toString() !== "11111111111111111111111111111111" && (
          <p style={{ color: '#888', fontSize: '0.85rem' }}>
            Player O: {gameState.playerO.toString().slice(0, 4)}...{gameState.playerO.toString().slice(-4)}
          </p>
        )}
      </div>

      {/* Game Board */}
      <div className="board">
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((index) => (
          <Square
            key={index}
            ind={index}
            updateSquares={(idx: string | number) => onMakeMove(Number(idx))}
            value={renderCell(index)}
          />
        ))}
      </div>

      {/* Back Button */}
      <div style={{ marginTop: '20px', textAlign: 'center' }}>
        <Button
          title={gameState.isActive ? "Back to Games" : "Back to Game List"}
          resetGame={onBackToGameList}
          disabled={false}
        />
      </div>

      {/* Delegation Controls */}
      <div className="form-section" style={{ marginTop: '20px' }}>
        <h3>Delegation Controls</h3>
        <p style={{ color: '#666', fontSize: '0.85rem', marginBottom: '12px' }}>
          {isDelegated 
            ? 'Game is on MagicBlock ephemeral rollup. Transactions are fast and cheap!' 
            : 'Delegate to MagicBlock for faster, cheaper transactions during gameplay.'}
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <Button 
            title={"Delegate to Ephemeral"} 
            resetGame={onDelegate} 
            disabled={isDelegated || isSubmitting} 
          />
          <Button 
            title={"Undelegate to Devnet"} 
            resetGame={onUndelegate} 
            disabled={!isDelegated || isSubmitting} 
          />
        </div>
      </div>
    </div>
  );
};
