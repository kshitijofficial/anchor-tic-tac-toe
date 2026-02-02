import React, { useState, useCallback, RefObject } from "react";
import { Keypair } from "@solana/web3.js";
import { PlayerRole } from "../types";

interface WalletInfoProps {
  tempKeypair: RefObject<Keypair | null>;
  playerRole: PlayerRole;
  selectedGameId: number | null;
}

/**
 * Component to display wallet information and game address
 */
export const WalletInfo: React.FC<WalletInfoProps> = ({
  tempKeypair,
  playerRole,
  selectedGameId,
}) => {
  const [copiedAddress, setCopiedAddress] = useState<boolean>(false);

  const copyGameAddress = useCallback(async () => {
    if (!tempKeypair.current) return;
    try {
      await navigator.clipboard.writeText(tempKeypair.current.publicKey.toBase58());
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    } catch (err) {
      console.error("Failed to copy address:", err);
    }
  }, [tempKeypair]);

  return (
    <div style={{ marginTop: '10px' }}>
      {tempKeypair.current && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
          <p style={{ color: '#667eea', fontWeight: '600', margin: 0 }}>
            Your Game Address: {tempKeypair.current.publicKey.toBase58().slice(0, 4)}...{tempKeypair.current.publicKey.toBase58().slice(-4)}
          </p>
          <button
            onClick={copyGameAddress}
            style={{
              padding: '4px 12px',
              backgroundColor: copiedAddress ? '#28a745' : '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: '500',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => {
              if (!copiedAddress) {
                e.currentTarget.style.backgroundColor = '#5568d3';
              }
            }}
            onMouseLeave={(e) => {
              if (!copiedAddress) {
                e.currentTarget.style.backgroundColor = '#667eea';
              }
            }}
          >
            {copiedAddress ? '✓ Copied!' : 'Copy'}
          </button>
        </div>
      )}
      {playerRole && (
        <p style={{ color: '#667eea', fontWeight: '600' }}>
          You are Player {playerRole} (Game #{selectedGameId})
        </p>
      )}
    </div>
  );
};
