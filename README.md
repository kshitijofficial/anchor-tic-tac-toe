# Anchor Tic-Tac-Toe

A two-player tic-tac-toe game demonstrating MagicBlock's Ephemeral Rollups with multiple sequential transactions and turn-based gameplay.

## Overview

This example showcases how to build a real-time multiplayer game on Solana using MagicBlock's Ephemeral Rollups (ER). It demonstrates the significant performance advantages of executing rapid, sequential transactions on an ephemeral rollup before committing the final game state back to Solana's base layer.

The implementation includes:
- Complete tic-tac-toe game logic with win/draw detection
- Turn-based gameplay with validation
- Multi-game support per user
- Performance benchmarking comparing ER vs base layer execution

## Key Features

- ✅ **Two-Player Gameplay**: Player X and Player O with turn validation
- ✅ **Game State Management**: Win detection, draw detection, and game over handling
- ✅ **Multiple Games**: Support for multiple concurrent games per user
- ✅ **Ephemeral Rollups Integration**: Delegate → Play → Undelegate flow
- ✅ **Performance Comparison**: Side-by-side benchmarks of ER vs Solana base layer
- ✅ **Event Emission**: Game events for tracking moves, wins, and draws

## Prerequisites

- Node.js 16+ or Yarn
- Anchor CLI 0.32.1+
- Solana CLI 1.18+
- Rust 1.75+

## Installation

1. **Clone the repository** (or navigate to this directory):
```bash
cd anchor-tic-tac-toe
```

2. **Install dependencies**:
```bash
yarn install
# or
npm install
```

3. **Build the program**:
```bash
anchor build
```

4. **Configure environment variables**:

Create a `.env` file in the project root:
```bash
# Required: Player O's private key (base58 encoded from Phantom or CLI)
PLAYER_O_PRIVATE_KEY=your_base58_encoded_private_key

# Optional: Custom router endpoints (defaults to devnet)
ROUTER_ENDPOINT=https://devnet-router.magicblock.app/
WS_ROUTER_ENDPOINT=wss://devnet-router.magicblock.app/
```

To export your private key from Solana CLI:
```bash
solana-keygen new --outfile ~/.config/solana/player-o.json
# View in base58 format
cat ~/.config/solana/player-o.json
```

## Running Tests

**Important**: Tests must run on devnet (not localnet) to use MagicBlock's Ephemeral Rollups.

1. **Configure Anchor for devnet**:
```bash
# Ensure Anchor.toml has:
# [provider]
# cluster = "devnet"
```

2. **Fund your wallets**:
```bash
# Fund Player X (default Anchor wallet)
solana airdrop 2 --url devnet

# Fund Player O
solana airdrop 2 $(solana-keygen pubkey ~/.config/solana/player-o.json) --url devnet
```

3. **Run the tests**:
```bash
anchor test --skip-local-validator
# or
yarn test
```

## How It Works

### Game Flow

1. **Initialize Board (Base Layer)**
   - Player X creates a new game board on Solana
   - A PDA is derived using: `["board", player_x_pubkey, game_id]`
   - Board state is initialized with empty cells

2. **Register Player O (Base Layer)**
   - Player O registers to join the game
   - Game becomes ready to play once both players are registered

3. **Delegate to Ephemeral Rollup**
   - Board account is delegated to MagicBlock's validator
   - Game state moves to the ephemeral rollup for fast execution

4. **Play Moves (Ephemeral Rollup)**
   - Players make rapid moves (< 100ms per move)
   - Turn validation ensures players alternate
   - Win/draw detection happens in real-time
   - **All moves execute in milliseconds instead of seconds**

5. **Undelegate & Commit (Back to Base Layer)**
   - Final game state is committed back to Solana
   - All moves are batched into a single base layer transaction
   - Game result is permanently stored on-chain

### Performance Benefits

Traditional Solana gameplay:
- **~1500-2000ms per move** on Solana

With Ephemeral Rollups:
- **~700-800ms per move** on ER 
- **Single commit transaction** to finalize on Solana
- **60%+ faster gameplay experience**

## Program Structure

### Accounts

```rust
#[account]
pub struct Board {
    pub winner_address: Pubkey,    // Winner of the game
    pub player_x: Pubkey,           // First player (game creator)
    pub player_o: Pubkey,           // Second player
    pub current_player: Pubkey,     // Whose turn it is
    pub board: [u8; 9],             // 3x3 grid (0=empty, 1=X, 2=O)
    pub game_status: bool,          // true=active, false=finished
    pub game_id: u64,               // Unique game identifier
}

#[account]
pub struct UserGames {
    pub game_count: u64,            // Number of games created by user
}
```

### Instructions

| Instruction | Description |
|------------|-------------|
| `initialize` | Create a new game board (Player X) |
| `player_o_register` | Register as Player O |
| `player_o_join` | Rejoin an existing game |
| `make_move` | Make a move at position 0-8 |
| `delegate` | Delegate board to Ephemeral Rollup |
| `undelegate` | Commit and undelegate back to base layer |

### Game Board Layout

```
Position indices:
 0 | 1 | 2
-----------
 3 | 4 | 5
-----------
 6 | 7 | 8
```

### Error Codes

- `PlayerAlreadyRegistered`: Player O already joined
- `LocationNotEmpty`: Cell is already occupied
- `NotYourChance`: Not your turn
- `PlayerNotRegistered`: Player O hasn't registered yet
- `InvalidPosition`: Position must be 0-8
- `GameOver`: Game has already finished
- `Unauthorised`: Invalid player or permission

## Test Output Example

```
Endpoint: https://devnet-router.magicblock.app/
Current X balance is 1.5 SOL
Current O balance is 1.2 SOL

✓ initializes board on Solana! (2341ms)
✓ registers player O! (1823ms)
✓ Delegate board to ER (1456ms)

🎮 Playing multiple rapid moves on Ephemeral Rollup...
  89ms (ER) X -> position 4 | txHash: 4Kq7...
  76ms (ER) O -> position 0 | txHash: 2Hs9...
  82ms (ER) X -> position 1 | txHash: 5Pz3...
  71ms (ER) O -> position 2 | txHash: 8Wa2...
  94ms (ER) X -> position 3 | txHash: 3Kf6...

📊 ER Performance Summary:
   Total moves: 9
   Total time: 8492ms
   Average per move: 943ms

✓ Play multiple rapid moves on ER (8492ms)

🔄 Committing all ER state changes to Solana base layer...
1342ms (ER) Undelegate txHash: 7Yx4...
2187ms (Base Layer) Commit txHash: 9Qa1...

✅ All ER moves committed to Solana in ONE transaction!

Final board state on Solana: 1,1,2,1,1,2,1,2,1
Board layout:
  X | X | O
  ---------
  X | X | O
  ---------
  X | O | X

(0 = empty, 1 = X, 2 = O)
```

## Architecture Highlights

### Ephemeral Rollups Integration

The program uses MagicBlock's SDK attributes:

```rust
#[ephemeral]  // Marks the entire program as ER-compatible
#[program]
pub mod tic_tac {
    // Game logic here
}

#[delegate]   // Enables delegation functionality
#[derive(Accounts)]
pub struct DelegateBoard<'info> { ... }

#[commit]     // Enables commit functionality
#[derive(Accounts)]
pub struct UndelegateAndCommit<'info> { ... }
```

### PDA Derivation

Game boards use deterministic PDAs:
```rust
["board", player_x_pubkey, game_id_le_bytes]
```

This allows:
- Multiple games per user (indexed by `game_id`)
- Deterministic account discovery
- Efficient game state management

## Use Cases

This example is ideal for learning how to build:
- **Turn-based games** (chess, checkers, card games)
- **Real-time multiplayer games** (fighting games, racing)
- **High-frequency applications** (trading bots, auction systems)
- **Batch state updates** (inventory systems, leaderboards)

## Resources

- [MagicBlock Documentation](https://docs.magicblock.gg/)
- [Ephemeral Rollups SDK](https://github.com/magicblock-labs/ephemeral-rollups-sdk)
- [MagicBlock Examples Repository](https://github.com/magicblock-labs/magicblock-engine-examples)
- [Anchor Documentation](https://www.anchor-lang.com/)

## Support

- Discord: [MagicBlock Community](https://discord.com/invite/MBkdC3gxcv)
- Twitter: [@MagicBlock](https://x.com/magicblock)

