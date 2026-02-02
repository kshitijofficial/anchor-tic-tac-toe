use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::commit_and_undelegate_accounts;

declare_id!("9eSXvKJh3tChbzBXKSUKHYABsK7z2YzYrjGq534PueYC");

// Board cell values: 0 = empty, 1 = X, 2 = O
const EMPTY: u8 = 0;
const PLAYER_X_MARK: u8 = 1;
const PLAYER_O_MARK: u8 = 2;
const BOARD_SIZE: usize = 9; // 3x3 grid = 9 cells


#[event]
pub struct GameCreated {
    pub game_id: u64,
    pub player_x: Pubkey,
}

#[event]
pub struct MoveMade {
    pub player: Pubkey,
    pub position: u8,
    pub game_id: u64,
}

#[event]
pub struct GameWon {
    pub winner: Pubkey,
    pub game_id: u64,
}
#[event]
pub struct GameDraw {
    pub game_id: u64,
}

#[error_code]
pub enum TicTacError {
    #[msg("Player is already registered")]
    PlayerAlreadyRegistered,

    #[msg("User is already initialized")]
    UserAlreadyInitialized,

    #[msg("Location is not empty")]
    LocationNotEmpty,

    #[msg("This is not your chance")]
    NotYourChance,

    #[msg("Player is not registered yet")]
    PlayerNotRegistered,

    #[msg("The position is invalid")]
    InvalidPosition,

    #[msg("The game is over")]
    GameOver,
    #[msg("The user is unauthorised")]
    Unauthorised,
    #[msg("Player O has not joined")]
    PlayerONotRegistered,
}

/// Checks if a player with the given mark has won the game.
///
/// # Arguments
/// * `board` - Reference to the game board array
/// * `mark` - The player's mark (PLAYER_X_MARK or PLAYER_O_MARK)
///
/// # Returns
/// `true` if the player has a winning combination, `false` otherwise
fn check_winner(board: &[u8; BOARD_SIZE], mark: u8) -> bool {
    const WINNING_COMBINATIONS: [[usize; 3]; 8] = [
        [0, 1, 2],
        [3, 4, 5],
        [6, 7, 8],
        [0, 3, 6],
        [1, 4, 7],
        [2, 5, 8],
        [0, 4, 8],
        [2, 4, 6],
    ];
    WINNING_COMBINATIONS
        .iter()
        .any(|combo| board[combo[0]] == mark && board[combo[1]] == mark && board[combo[2]] == mark)
}

/// Checks if the board is completely filled (no empty cells remaining).
///
/// # Arguments
/// * `board` - Reference to the game board array
///
/// # Returns
/// `true` if all cells are occupied, `false` if any cell is empty
fn is_board_full(board: &[u8; BOARD_SIZE]) -> bool {
    board.iter().all(|&cell| cell != EMPTY)
}
#[ephemeral]
#[program]
pub mod tic_tac {
    use super::*;
    
    /// Initializes a new tic-tac-toe game.
    ///
    /// Creates a new game board and sets the caller as Player X. The game starts
    /// in an active state waiting for Player O to join. A new PDA account is
    /// created for the board using the payer's public key and game count.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let board = &mut ctx.accounts.board_account;
        board.player_x = ctx.accounts.payer.key();
        board.player_o = Pubkey::default(); //111111111....1
        board.winner_address = Pubkey::default();
        board.current_player = board.player_x;
        board.board = [EMPTY; BOARD_SIZE as usize];
        board.is_active = true;

        board.game_id = ctx.accounts.user_games.game_count; // 0
        ctx.accounts.user_games.game_count =
            ctx.accounts.user_games.game_count.checked_add(1).unwrap();
        emit!(GameCreated {
            game_id: board.game_id,
            player_x: board.player_x,
        });

        Ok(())
    }

    /// Registers Player O to join an existing game.
    ///
    /// Allows a second player to register as Player O for a game created by Player X.
    /// This must be called before any moves can be made. Player O cannot be the same
    /// as Player X, and the game must be active (not finished).
    ///
    /// # Requirements
    /// * Game must be active (`is_active == true`)
    /// * Player O slot must be empty (`player_o == Pubkey::default()`)
    /// * Player O cannot be the same as Player X
    pub fn player_o_register(ctx: Context<RegisterPlayerO>) -> Result<()> {
        // require!(
        //     ctx.accounts.board_account.is_active,
        //     TicTacError::GameOver
        // );

        let board = &mut ctx.accounts.board_account;
        let player_o_key = ctx.accounts.player_o.key();

        require!(
            board.player_x != player_o_key,
            TicTacError::PlayerAlreadyRegistered
        );
        // require!(
        //     board.player_o == Pubkey::default() && board.player_x != player_o_key,
        //     TicTacError::PlayerAlreadyRegistered
        // );

        board.player_o = player_o_key;
        Ok(())
    }

    /// Allows Player O to rejoin an existing game they've already registered for.
    ///
    /// This function is useful for reconnecting to a game after disconnection.
    /// Player O must have previously registered using `player_o_register`.
    ///
    /// # Requirements
    /// * Game must be active (`is_active == true`)
    /// * Signer must match the registered Player O
    pub fn player_o_join(ctx: Context<PlayerOJoin>) -> Result<()> {
        require!(
            ctx.accounts.board_account.is_active == true,
            TicTacError::GameOver
        );
        let board = &ctx.accounts.board_account;

        require!(
            board.player_o == ctx.accounts.player_o.key() && board.player_o != Pubkey::default(),
            TicTacError::Unauthorised
        );

        msg!("Player O rejoined the game");
        Ok(())
    }

    /// Makes a move on the game board at the specified position.
    ///
    /// Places the current player's mark (X or O) at the given position and checks
    /// for win conditions or a draw. If a win or draw is detected, the game status
    /// is set to inactive. Otherwise, the turn switches to the other player.
    ///
    /// # Arguments
    /// * `position` - The board position (0-8) where the move should be made
    ///   - Positions are laid out as: 0|1|2, 3|4|5, 6|7|8
    pub fn make_move(ctx: Context<PlayerMove>, position: u8) -> Result<()> {
        require!(position < BOARD_SIZE as u8, TicTacError::InvalidPosition);
        let board = &mut ctx.accounts.board_account;
        let player_key = ctx.accounts.player.key();
        let index = position as usize;

        require!(board.board[index] == EMPTY, TicTacError::LocationNotEmpty);

        let mark = if player_key == board.player_x {
            PLAYER_X_MARK
        } else if player_key == board.player_o {
            PLAYER_O_MARK
        } else {
            return err!(TicTacError::Unauthorised);
        };

        board.board[index] = mark;
        emit!(MoveMade{
            player:player_key,
            position:position,
            game_id:board.game_id
        });

        if check_winner(&board.board, mark) {
            board.winner_address = player_key;
            board.is_active = false;
            emit!(GameWon {
                game_id: board.game_id,
                winner: player_key
            });
        } else if is_board_full(&board.board) {
            board.is_active = false;
            emit!(GameDraw {
                game_id: board.game_id
            });
        } else {
            board.current_player = if board.current_player == board.player_x {
                board.player_o
            } else {
                board.player_x
            };
        }
        Ok(())
    }

    /// Delegates the game board account to MagicBlock's Ephemeral Rollup.
    ///
    /// This transfers the board account to an ephemeral rollup validator, enabling
    /// faster and cheaper transactions during gameplay. After delegation, moves can
    /// be made on the ephemeral rollup with sub-second confirmation times.
    pub fn delegate(ctx: Context<DelegateBoard>) -> Result<()> {
        ctx.accounts.delegate_pda(
            &ctx.accounts.payer,
            &[b"board",ctx.accounts.payer.key().as_ref(),&ctx.accounts.board_account.game_id.to_le_bytes()],
            DelegateConfig {
                // Optionally set a specific validator from the first remaining account
                validator: ctx.remaining_accounts.first().map(|acc| acc.key()),
                ..Default::default()
            },
        )?;
        Ok(())
    }

    /// Undelegates the game board account and commits all state changes back to Solana.
    ///
    /// This function transfers the board account back from the ephemeral rollup to
    /// Solana's base layer, committing all moves made during ephemeral gameplay in
    /// a single transaction. The account ownership returns to the program.
    pub fn undelegate(ctx: Context<UndelegateAndCommit>) -> Result<()> {
        let board = &mut ctx.accounts.board_account;
        
        board.exit(&crate::ID)?;
        commit_and_undelegate_accounts(
            &ctx.accounts.payer,
            vec![&ctx.accounts.board_account.to_account_info()],
            &ctx.accounts.magic_context,
            &ctx.accounts.magic_program,
        )?;
        Ok(())
    }

}


#[commit]
#[derive(Accounts)]
pub struct UndelegateAndCommit<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    
    #[account(mut, seeds = [b"board",payer.key().as_ref(),&board_account.game_id.to_le_bytes()], bump)]
    pub board_account: Account<'info, Board>,
}


#[delegate]
#[derive(Accounts)]
pub struct DelegateBoard<'info> {
    pub payer: Signer<'info>,
    /// CHECK The pda to delegate
    #[account(mut, del, constraint = pda.key() == board_account.key() @ TicTacError::Unauthorised)]
    pub pda: AccountInfo<'info>,

    #[account(
        mut,
        seeds=[b"board",payer.key().as_ref(),&board_account.game_id.to_le_bytes()],
        bump
    )]
    pub board_account: Account<'info, Board>,
}


#[account]
#[derive(InitSpace)]
pub struct Board {
    pub winner_address: Pubkey,
    pub player_x: Pubkey,
    pub player_o: Pubkey,
    pub current_player: Pubkey,
    /// The game board state as a flat array of 9 cells (0=empty, 1=X, 2=O)
    /// Layout: [0,1,2,3,4,5, 6,7,8] represents a 3x3 grid
    pub board: [u8; BOARD_SIZE],
    pub is_active: bool,
    /// Unique identifier for this game (incremented per player X)
    pub game_id: u64,
}

/// Account structure tracking the number of games created by a user.
///
/// This PDA account stores a counter that increments each time the user creates
/// a new game. It's used to generate unique game IDs and derive board PDAs.
#[account]
#[derive(InitSpace)]
pub struct UserGameCounter {
    /// Total number of games created by this user (used as game_id for new games)
    pub game_count: u64,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
     init_if_needed,
     payer = payer, 
     space = 8 + UserGameCounter::INIT_SPACE,
     seeds=[b"user_games",payer.key().as_ref()],
     bump
    )]
    pub user_games: Account<'info, UserGameCounter>,

    #[account(init,
     payer = payer, 
     space = 8 + Board::INIT_SPACE,
     seeds=[b"board",payer.key().as_ref(),&user_games.game_count.to_le_bytes()],
     bump
    )]
    pub board_account: Account<'info, Board>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterPlayerO<'info> {
    pub player_o: Signer<'info>,

    #[account(
        mut,
        constraint = board_account.is_active == true @ TicTacError::GameOver,
        constraint = board_account.player_o == Pubkey::default() @ TicTacError::PlayerAlreadyRegistered
    )]
    pub board_account: Account<'info, Board>,
}

#[derive(Accounts)]
pub struct PlayerOJoin<'info> {
    #[account(mut)]
    pub player_o: Signer<'info>,

    #[account(mut)]
    pub board_account: Account<'info, Board>,
}

#[derive(Accounts)]
pub struct PlayerMove<'info> {
    pub player: Signer<'info>,

    #[account(
        mut,
        constraint = board_account.is_active == true @ TicTacError::GameOver,
        constraint = board_account.current_player == player.key() @ TicTacError::NotYourChance,
        constraint = board_account.player_o != Pubkey::default() @ TicTacError::PlayerONotRegistered,
        constraint = (board_account.current_player == board_account.player_x || 
            board_account.current_player == board_account.player_o) 
           @ TicTacError::Unauthorised
    )]
    pub board_account: Account<'info, Board>,
}