import { useCallback, RefObject } from "react";
import { Program } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { Keypair } from "@solana/web3.js";
import { GameState, MyGame } from "../types";
import { TIC_TAC_TOE_PROGRAM, DEFAULT_PUBKEY_STR } from "../constants";
import { getBoardPDA, getUserGamesPDA } from "../utils/pda";

interface UseGameFetchingProps {
  connection: Connection;
  ephemeralConnection: RefObject<Connection | null>;
  gameProgramClient: RefObject<Program | null>;
  tempKeypair: RefObject<Keypair | null>;
  publicKey: PublicKey | null;
}

/**
 * Hook to handle fetching game data from devnet and ephemeral
 */
export const useGameFetching = ({
  connection,
  ephemeralConnection,
  gameProgramClient,
  tempKeypair,
  publicKey,
}: UseGameFetchingProps) => {

  /**
   * Fetch board accounts from ephemeral connection
   */
  const fetchEphemeralBoardAccounts = useCallback(async (): Promise<Array<{publicKey: PublicKey, account: any}>> => {
    if (!ephemeralConnection.current || !gameProgramClient.current) {
      console.log("fetchEphemeralBoardAccounts: connections not ready");
      return [];
    }
    
    try {
      console.log("Querying ephemeral for program accounts...");
      
      const accounts = await ephemeralConnection.current.getProgramAccounts(TIC_TAC_TOE_PROGRAM, {
        commitment: 'confirmed',
      });
      
      console.log(`Found ${accounts.length} accounts on ephemeral`);
      
      const decodedAccounts: Array<{publicKey: PublicKey, account: any}> = [];
      
      for (const { pubkey, account } of accounts) {
        try {
          const decoded = gameProgramClient.current.coder.accounts.decode('board', account.data);
          decodedAccounts.push({
            publicKey: pubkey,
            account: decoded
          });
          console.log(`Decoded board account: ${pubkey.toBase58()}, gameId: ${decoded.gameId?.toNumber()}`);
        } catch (decodeErr) {
          console.log(`Skipping non-board account: ${pubkey.toBase58()}`);
        }
      }
      
      return decodedAccounts;
    } catch (err) {
      console.log("Error fetching ephemeral board accounts:", err);
      return [];
    }
  }, [ephemeralConnection, gameProgramClient]);

  /**
   * Fetch all games for the current user (both as Player X and Player O) for devnet and ephemeral
   */
  const fetchMyGames = useCallback(async (): Promise<{ gamesAsX: MyGame[], gamesAsO: MyGame[] }> => {
    if (!tempKeypair.current) {
      console.log("fetchMyGames: tempKeypair not ready");
      return { gamesAsX: [], gamesAsO: [] };
    }
    if (!publicKey || !gameProgramClient.current) {
      console.log("fetchMyGames: publicKey or gameProgramClient not ready");
      return { gamesAsX: [], gamesAsO: [] };
    }

    try {
      const walletAddr = tempKeypair.current.publicKey.toBase58();

      const gamesMapX = new Map<string, MyGame>();
      const gamesMapO = new Map<string, MyGame>();

      // 1. Fetch non-delegated games from devnet
      console.log("Fetching games from devnet...");
      //@ts-ignore
      const devnetBoardAccounts = await gameProgramClient.current.account.board.all();
      console.log(`Devnet returned ${devnetBoardAccounts.length} board accounts`);
      
      for (const account of devnetBoardAccounts) {
        const pdaKey = account.publicKey.toString();
        
        const gameData: MyGame = {
          gameId: account.account.gameId.toNumber(),
          board: account.account,
          pda: pdaKey,
          isDelegated: false
        };

        const playerX = account.account.playerX?.toString();
        const playerO = account.account.playerO?.toString();

        if (playerX === walletAddr) {
          gamesMapX.set(pdaKey, gameData);
        }
        if (playerO && playerO === walletAddr && playerO !== DEFAULT_PUBKEY_STR) {
          gamesMapO.set(pdaKey, gameData);
        }
      }

      // 2. Get my game count from UserGameCounter
      const [userGamesPda] = getUserGamesPDA(tempKeypair.current.publicKey);
      
      let myGameCount = 0;
      try {
        //@ts-ignore
        const userGames = await gameProgramClient.current.account.userGameCounter.fetch(userGamesPda);
        myGameCount = userGames.gameCount.toNumber();
        console.log(`My game count: ${myGameCount}`);
      } catch (e) {
        console.log("No UserGameCounter found, game count is 0");
      }

      // 3. Check for delegated games
      if (ephemeralConnection.current && myGameCount > 0) {
        console.log("Checking for delegated games on ephemeral...");
        
        for (let gameId = 0; gameId < myGameCount; gameId++) {
          const [boardPda] = getBoardPDA(gameId, tempKeypair.current.publicKey);
          const pdaKey = boardPda.toString();
          
          if (gamesMapX.has(pdaKey)) {
            continue;
          }
          
          const devnetAccountInfo = await connection.getAccountInfo(boardPda);
          if (devnetAccountInfo && !devnetAccountInfo.owner.equals(TIC_TAC_TOE_PROGRAM)) {
            console.log(`Game ${gameId} is delegated, fetching from ephemeral...`);
            
            try {
              try {
                await ephemeralConnection.current.requestAirdrop(boardPda, 1);
              } catch (_) {}
              
              const ephemeralAccountInfo = await ephemeralConnection.current.getAccountInfo(boardPda);
              if (ephemeralAccountInfo) {
                const boardAccount = gameProgramClient.current.coder.accounts.decode('board', ephemeralAccountInfo.data);
                
                const gameData: MyGame = {
                  gameId: boardAccount.gameId.toNumber(),
                  board: boardAccount,
                  pda: pdaKey,
                  isDelegated: true
                };
                
                console.log(`Found delegated game ${gameId} on ephemeral`);
                gamesMapX.set(pdaKey, gameData);
              }
            } catch (err) {
              console.log(`Could not fetch game ${gameId} from ephemeral:`, err);
            }
          }
        }
      }

      // 4. Fetch from ephemeral for games where I'm Player O
      if (ephemeralConnection.current && gameProgramClient.current) {
        console.log("Fetching all ephemeral accounts...");
        try {
          const ephemeralBoardAccounts = await fetchEphemeralBoardAccounts();
          console.log(`Ephemeral returned ${ephemeralBoardAccounts.length} board accounts`);
          
          for (const account of ephemeralBoardAccounts) {
            const pdaKey = account.publicKey.toString();
            
            if (gamesMapX.has(pdaKey) || gamesMapO.has(pdaKey)) {
              continue;
            }
            
            const gameData: MyGame = {
              gameId: account.account.gameId.toNumber(),
              board: account.account,
              pda: pdaKey,
              isDelegated: true
            };

            const playerX = account.account.playerX?.toString();
            const playerO = account.account.playerO?.toString();
            
            console.log(`Ephemeral game: id=${gameData.gameId}, playerX=${playerX}, playerO=${playerO}`);

            if (playerX === walletAddr) {
              gamesMapX.set(pdaKey, gameData);
            }
            if (playerO && playerO === walletAddr && playerO !== DEFAULT_PUBKEY_STR) {
              gamesMapO.set(pdaKey, gameData);
            }
          }
        } catch (err) {
          console.error("Could not fetch from ephemeral:", err);
        }
      }

      const gamesAsX = Array.from(gamesMapX.values()).sort((a, b) => a.gameId - b.gameId);
      const gamesAsO = Array.from(gamesMapO.values()).sort((a, b) => a.gameId - b.gameId);

      console.log(`Found ${gamesAsX.length} games as Player X, ${gamesAsO.length} games as Player O`);
      return { gamesAsX, gamesAsO };
    } catch (err) {
      console.error("Error fetching games:", err);
      return { gamesAsX: [], gamesAsO: [] };
    }
  }, [publicKey, connection, fetchEphemeralBoardAccounts, ephemeralConnection, gameProgramClient, tempKeypair]);

  /**
   * Fetch game state for a specific board
   */
  const fetchGameState = useCallback(async (
    playerXAddr: string, 
    gameId: number
  ): Promise<{ gameState: GameState | null, isDelegated: boolean }> => {
    if (!gameProgramClient.current) return { gameState: null, isDelegated: false };
    if (!tempKeypair.current) return { gameState: null, isDelegated: false };
    
    try {
      const playerXPubKey = new PublicKey(playerXAddr);
      const [boardPda] = getBoardPDA(gameId, playerXPubKey);
      
      const devnetAccountInfo = await connection.getAccountInfo(boardPda);
      
      if (devnetAccountInfo) {
        const accountIsDelegated = !devnetAccountInfo.owner.equals(TIC_TAC_TOE_PROGRAM);
        
        if (accountIsDelegated && ephemeralConnection.current) {
          console.log("Account is delegated, fetching from ephemeral...");
          
          try {
            await ephemeralConnection.current.requestAirdrop(boardPda, 1);
          } catch (_) {}
          
          const ephemeralAccountInfo = await ephemeralConnection.current.getAccountInfo(boardPda);
          if (ephemeralAccountInfo && gameProgramClient.current) {
            const boardAccount = gameProgramClient.current.coder.accounts.decode('board', ephemeralAccountInfo.data);
            return { gameState: boardAccount, isDelegated: true };
          }
        } else {
          const boardAccount = gameProgramClient.current.coder.accounts.decode('board', devnetAccountInfo.data);
          return { gameState: boardAccount, isDelegated: false };
        }
      }
      
      return { gameState: null, isDelegated: false };
    } catch (err) {
      console.error("Error fetching game state:", err);
      return { gameState: null, isDelegated: false };
    }
  }, [connection, ephemeralConnection, gameProgramClient, tempKeypair]);

  return {
    fetchEphemeralBoardAccounts,
    fetchMyGames,
    fetchGameState,
  };
};
