use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::commit_and_undelegate_accounts;

declare_id!("BTrnniVLXdKW2yeWZgrASoStVEKxS3PRMYuE3DRCJSFy");

const EMPTY: u8 = 0;
const PLAYER_X_MARK: u8 = 1;
const PLAYER_O_MARK: u8 = 2;
const BOARD_SIZE: usize = 9;

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

fn is_board_full(board: &[u8; BOARD_SIZE]) -> bool {
    board.iter().all(|&cell| cell != EMPTY)
}
#[ephemeral]
#[program]
pub mod tic_tac {
    use super::*;
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let board = &mut ctx.accounts.board_account;
        board.player_x = ctx.accounts.payer.key();
        board.player_o = Pubkey::default(); //111111111....1
        board.winner_address = Pubkey::default();
        board.current_player = board.player_x;
        board.board = [EMPTY; BOARD_SIZE as usize];
        board.game_status = true;

        board.game_id = ctx.accounts.user_games.game_count; // 0
        ctx.accounts.user_games.game_count =
            ctx.accounts.user_games.game_count.checked_add(1).unwrap();
        emit!(GameCreated {
            game_id: board.game_id,
            player_x: board.player_x,
        });

        Ok(())
    }

    pub fn player_o_register(ctx: Context<RegisterPlayerO>) -> Result<()> {
        require!(
            ctx.accounts.board_account.game_status == true,
            TicTacError::GameOver
        );

        let board = &mut ctx.accounts.board_account;
        let player_o_key = ctx.accounts.player_o.key();

        require!(
            board.player_o == Pubkey::default() && board.player_x != player_o_key,
            TicTacError::PlayerAlreadyRegistered
        );

        board.player_o = player_o_key;
        Ok(())
    }

    pub fn player_o_join(ctx: Context<PlayerOJoin>) -> Result<()> {
        require!(
            ctx.accounts.board_account.game_status == true,
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

        if check_winner(&board.board, mark) {
            board.winner_address = player_key;
            board.game_status = false;
            emit!(GameWon {
                game_id: board.game_id,
                winner: player_key
            });
        } else if is_board_full(&board.board) {
            board.game_status = false;
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

    /// Delegate the account to the delegation program
    /// Set specific validator based on ER, see https://docs.magicblock.gg/pages/get-started/how-integrate-your-program/local-setup
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

/// Add delegate function to the context
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
    pub board: [u8; BOARD_SIZE],
    pub game_status: bool,
    pub game_id: u64,
}

#[account]
#[derive(InitSpace)]
pub struct UserGameCounter {
    pub game_count: u64,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
     init_if_needed,
     payer = payer, 
     space = 8 + Board::INIT_SPACE,
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
        constraint = board_account.game_status == true @ TicTacError::GameOver,
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
        constraint = board_account.game_status == true @ TicTacError::GameOver,
        constraint = board_account.current_player == player.key() @ TicTacError::NotYourChance,
        constraint = board_account.player_o != Pubkey::default() @ TicTacError::PlayerONotRegistered,
    )]
    pub board_account: Account<'info, Board>,
}