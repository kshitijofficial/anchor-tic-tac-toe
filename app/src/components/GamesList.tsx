import React, { RefObject } from "react";
import { PublicKey, Keypair } from "@solana/web3.js";
import { MyGame, PlayerRole } from "../types";
import Button from "./Button";

interface GamesListProps {
  title: string;
  games: MyGame[];
  role: PlayerRole;
  tempKeypair: RefObject<Keypair | null>;
  publicKey: PublicKey | null;
  onSelectGame: (game: MyGame, role: PlayerRole) => void;
}

/**
 * Component to display a list of games
 */
export const GamesList: React.FC<GamesListProps> = ({
  title,
  games,
  role,
  tempKeypair,
  publicKey,
  onSelectGame,
}) => {
  const defaultPubkey = PublicKey.default.toString();

  if (games.length === 0) return null;

  return (
    <div className="form-section">
      <h3>{title} ({games.length})</h3>
      <div className="games-list" style={{ maxHeight: '200px', overflowY: 'auto' }}>
        {games.map((game) => {
          const hasPlayerO = game.board.playerO.toString() !== defaultPubkey;
          const isActive = game.board.isActive;
          const winner = !isActive && game.board.winnerAddress.toString() !== defaultPubkey
            ? (game.board.winnerAddress.toString() === game.board.playerX.toString() ? "X" : "O")
            : null;
          
          if (!tempKeypair.current) return null;
          
          const isMyTurn = publicKey && game.board.currentPlayer.toString() === tempKeypair.current.publicKey.toBase58();
          const playerXAddr = game.board.playerX.toString();

          return (
            <div 
              key={role === 'X' ? game.gameId : `${playerXAddr}-${game.gameId}`} 
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px',
                background: isMyTurn && isActive && (role === 'O' || hasPlayerO) ? '#fff3cd' : '#f8f9fa',
                borderRadius: '8px',
                marginBottom: '8px',
                border: game.isDelegated 
                  ? '2px solid #4CAF50' 
                  : (isMyTurn && isActive && (role === 'O' || hasPlayerO) ? '2px solid #ffc107' : 'none')
              }}
            >
              <div>
                <strong>Game #{game.gameId}</strong>
                {game.isDelegated && (
                  <span style={{
                    marginLeft: '8px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '0.7rem',
                    background: '#4CAF50',
                    color: 'white'
                  }}>
                    ⚡ Ephemeral
                  </span>
                )}
                {role === 'O' && (
                  <span style={{ marginLeft: '8px', fontSize: '0.75rem', color: '#666' }}>
                    vs {playerXAddr.slice(0, 4)}...{playerXAddr.slice(-4)}
                  </span>
                )}
                <span style={{
                  marginLeft: '10px',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '0.8rem',
                  background: isActive 
                    ? (isMyTurn && (role === 'O' || hasPlayerO) ? '#ffc107' : '#d4edda') 
                    : '#e2e3e5',
                  color: isActive 
                    ? (isMyTurn && (role === 'O' || hasPlayerO) ? '#856404' : '#155724') 
                    : '#383d41'
                }}>
                  {isActive
                    ? (role === 'X' 
                        ? (hasPlayerO 
                            ? (isMyTurn ? "Your Turn!" : "Waiting...") 
                            : "Waiting for O")
                        : (isMyTurn ? "Your Turn!" : "Waiting..."))
                    : `Finished${winner ? ` - ${winner} Won` : ""}`}
                </span>
              </div>
              <Button
                title="Play"
                resetGame={() => onSelectGame(game, role)}
                disabled={false}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
