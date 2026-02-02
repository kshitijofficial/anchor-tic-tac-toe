import { useEffect, useRef, useState } from "react";
import { Connection } from "@solana/web3.js";
import { EPHEMERAL_ENDPOINT } from "../constants";

/**
 * Hook to manage the MagicBlock ephemeral connection
 */
export const useEphemeralConnection = () => {
  const ephemeralConnection = useRef<Connection | null>(null);
  const [ephemeralReady, setEphemeralReady] = useState<boolean>(false);

  useEffect(() => {
    const initializeEphemeralConnection = async () => {
      if (ephemeralConnection.current) {
        setEphemeralReady(true);
        return;
      }
      ephemeralConnection.current = new Connection(EPHEMERAL_ENDPOINT);
      setEphemeralReady(true);
      console.log("Ephemeral connection initialized:", EPHEMERAL_ENDPOINT);
    };
    initializeEphemeralConnection().catch(console.error);
  }, []);

  return {
    ephemeralConnection,
    ephemeralReady,
  };
};
