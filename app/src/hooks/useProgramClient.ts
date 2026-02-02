import { useCallback, useRef, useEffect } from "react";
import { Program, Provider } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { SimpleProvider } from "../components/Wallet";
import { TIC_TAC_TOE_PROGRAM } from "../constants";

/**
 * Hook to manage the program client initialization
 */
export const useProgramClient = (connection: Connection, publicKey: PublicKey | null) => {
  const provider = useRef<Provider>(new SimpleProvider(connection));
  const gameProgramClient = useRef<Program | null>(null);

  // Update provider when publicKey changes
  useEffect(() => {
    provider.current = new SimpleProvider(connection, publicKey ?? undefined);
  }, [connection, publicKey]);

  /**
   * Fetch IDL and initialize the program client
   */
  const getProgramClient = useCallback(async (program: PublicKey): Promise<Program> => {
    const idl = await Program.fetchIdl(program, provider.current);
    if (!idl) throw new Error('IDL not found');
    return new Program(idl, provider.current);
  }, []);

  /**
   * Initialize the program client if not already initialized
   */
  const initializeProgramClient = useCallback(async (): Promise<Program | null> => {
    if (gameProgramClient.current) return gameProgramClient.current;
    gameProgramClient.current = await getProgramClient(TIC_TAC_TOE_PROGRAM);
    return gameProgramClient.current;
  }, [getProgramClient]);

  return {
    provider,
    gameProgramClient,
    getProgramClient,
    initializeProgramClient,
  };
};
