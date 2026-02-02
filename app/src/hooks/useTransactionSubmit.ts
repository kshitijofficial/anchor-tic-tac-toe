import { useCallback, useState, RefObject } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Provider } from "@coral-xyz/anchor";
import {
  Commitment,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";

interface UseTransactionSubmitProps {
  provider: RefObject<Provider>;
  ephemeralConnection: RefObject<Connection | null>;
  tempKeypair: RefObject<Keypair | null>;
}

/**
 * Hook to handle transaction submission logic
 */
export const useTransactionSubmit = ({
  provider,
  ephemeralConnection,
  tempKeypair,
}: UseTransactionSubmitProps) => {
  const { publicKey, sendTransaction } = useWallet();
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [transactionError, setTransactionError] = useState<string | null>(null);
  const [transactionSuccess, setTransactionSuccess] = useState<string | null>(null);

  /**
   * Submit a transaction to devnet or ephemeral
   */
  const submitTransaction = useCallback(async (
    transaction: Transaction,
    useTempKeypair: boolean = false,
    ephemeral: boolean = false,
    confirmCommitment: Commitment = "processed"
  ): Promise<string | null> => {
    if (!publicKey) return null;
    if (!tempKeypair.current) return null;
    if (!ephemeralConnection.current) return null;
    
    setIsSubmitting(true);
    setTransactionError(null);
    setTransactionSuccess(null);

    let conn = ephemeral ? ephemeralConnection.current : provider.current.connection;

    try {
      const {
        context: { slot: minContextSlot },
        value: { blockhash, lastValidBlockHeight }
      } = await conn.getLatestBlockhashAndContext();

      console.log("Submitting transaction...");

      if (!transaction.recentBlockhash) transaction.recentBlockhash = blockhash;
      if (!transaction.feePayer) {
        transaction.feePayer = useTempKeypair 
          ? tempKeypair.current.publicKey 
          : publicKey;
      }
      if (useTempKeypair) transaction.sign(tempKeypair.current);
      
      let signature;
      if (!ephemeral && !useTempKeypair) {
        signature = await sendTransaction(transaction, conn, { minContextSlot });
      } else {
        signature = await conn.sendRawTransaction(transaction.serialize(), { skipPreflight: true });
      }
      await conn.confirmTransaction({ blockhash, lastValidBlockHeight, signature }, confirmCommitment);
      
      setTransactionSuccess(`Transaction confirmed`);
      return signature;
    } catch (error) {
      setTransactionError(`Transaction failed: ${error}`);
    } finally {
      setIsSubmitting(false);
    }
    return null;
  }, [publicKey, sendTransaction, provider, ephemeralConnection, tempKeypair]);

  return {
    isSubmitting,
    setIsSubmitting,
    transactionError,
    setTransactionError,
    transactionSuccess,
    setTransactionSuccess,
    submitTransaction,
  };
};
