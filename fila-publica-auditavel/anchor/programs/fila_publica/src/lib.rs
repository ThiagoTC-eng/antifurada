use anchor_lang::prelude::*;

// IMPORTANTE: depois de rodar `anchor build`, rode `anchor keys list`,
// pegue o Program ID gerado e substitua a linha abaixo e o valor
// correspondente em Anchor.toml e em app/lib/anchor.ts.
declare_id!("FiLA1PubAud1t0r1a1QueueProgram11111111111");

#[program]
pub mod fila_publica {
    use super::*;

    /// Cria uma nova fila pública. Quem assina a transação vira o admin.
    pub fn create_queue(ctx: Context<CreateQueue>, queue_id: String) -> Result<()> {
        require!(
            queue_id.as_bytes().len() <= Queue::MAX_QUEUE_ID,
            ErrorCode::QueueIdMuitoLongo
        );

        let queue = &mut ctx.accounts.queue;
        queue.queue_id = queue_id;
        queue.admin = ctx.accounts.admin.key();
        queue.total_registrados = 0;
        queue.proximo_a_chamar = 0;
        queue.aberta = true;
        queue.bump = ctx.bumps.queue;

        msg!("Fila criada: admin = {}", queue.admin);
        Ok(())
    }

    /// Cidadão entra na fila. A seed da PDA do Ticket usa o hash do CPF,
    /// então a mesma pessoa fisicamente não consegue criar dois tickets
    /// na mesma fila: a segunda tentativa falha porque a conta já existe
    /// (erro nativo do runtime Solana "already in use").
    pub fn join_queue(ctx: Context<JoinQueue>, hash_cpf: [u8; 32]) -> Result<()> {
        let queue = &mut ctx.accounts.queue;
        require!(queue.aberta, ErrorCode::FilaFechada);

        queue.total_registrados = queue
            .total_registrados
            .checked_add(1)
            .ok_or(ErrorCode::Overflow)?;

        let ticket = &mut ctx.accounts.ticket;
        ticket.queue = queue.key();
        ticket.cidadao = ctx.accounts.cidadao.key();
        ticket.hash_cpf = hash_cpf;
        ticket.numero_senha = queue.total_registrados;
        ticket.timestamp = Clock::get()?.unix_timestamp;
        ticket.status = StatusTicket::Aguardando;
        ticket.bump = ctx.bumps.ticket;

        msg!("Ticket #{} criado para {}", ticket.numero_senha, ticket.cidadao);
        Ok(())
    }

    /// Apenas o admin da fila pode chamar o próximo — e só em ordem: o
    /// número da senha tem que ser exatamente proximo_a_chamar + 1. Pular
    /// alguém é rejeitado pelo próprio programa, não só pela interface.
    pub fn call_next(ctx: Context<GerenciarTicket>, numero_senha: u64) -> Result<()> {
        let queue = &mut ctx.accounts.queue;
        let ticket = &mut ctx.accounts.ticket;
        require!(ticket.numero_senha == numero_senha, ErrorCode::SenhaIncorreta);
        require!(
            ticket.status == StatusTicket::Aguardando,
            ErrorCode::TicketJaProcessado
        );
        require!(
            numero_senha == queue.proximo_a_chamar + 1,
            ErrorCode::ForaDeOrdem
        );
        ticket.status = StatusTicket::Chamado;
        queue.proximo_a_chamar = numero_senha;
        msg!("Senha #{} chamada", numero_senha);
        Ok(())
    }

    /// Marca um ticket já chamado como efetivamente atendido.
    pub fn marcar_atendido(ctx: Context<GerenciarTicket>, numero_senha: u64) -> Result<()> {
        let ticket = &mut ctx.accounts.ticket;
        require!(ticket.numero_senha == numero_senha, ErrorCode::SenhaIncorreta);
        require!(
            ticket.status == StatusTicket::Chamado,
            ErrorCode::TicketNaoChamado
        );
        ticket.status = StatusTicket::Atendido;
        msg!("Senha #{} atendida", numero_senha);
        Ok(())
    }

    /// Permite ao admin fechar a fila (para não aceitar mais entradas).
    pub fn fechar_fila(ctx: Context<FecharFila>) -> Result<()> {
        ctx.accounts.queue.aberta = false;
        Ok(())
    }
}

// ---------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------

#[account]
pub struct Queue {
    pub queue_id: String,        // identificador legível, ex: "sus-exame-001"
    pub admin: Pubkey,           // quem criou a fila
    pub total_registrados: u64,  // contador sequencial, também é a última senha emitida
    pub proximo_a_chamar: u64,   // última senha efetivamente chamada, em ordem
    pub aberta: bool,
    pub bump: u8,
}

impl Queue {
    pub const MAX_QUEUE_ID: usize = 50;
    // discriminator(8) + string(4+50) + admin(32) + total(8) + proximo(8) + aberta(1) + bump(1)
    pub const SPACE: usize = 8 + 4 + Self::MAX_QUEUE_ID + 32 + 8 + 8 + 1 + 1;
}

#[account]
pub struct Ticket {
    pub queue: Pubkey,       // a qual fila este ticket pertence
    pub cidadao: Pubkey,     // carteira que assinou a entrada na fila
    pub hash_cpf: [u8; 32],  // sha256(cpf) — nunca o CPF em texto puro
    pub numero_senha: u64,   // posição sequencial na fila
    pub timestamp: i64,      // Clock::get().unix_timestamp no momento da entrada
    pub status: StatusTicket,
    pub bump: u8,
}

impl Ticket {
    // discriminator(8) + queue(32) + cidadao(32) + hash(32) + senha(8) + ts(8) + status(1) + bump(1)
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 8 + 8 + 1 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum StatusTicket {
    Aguardando,
    Chamado,
    Atendido,
}

// ---------------------------------------------------------------------
// Contexts (contas de cada instrução)
// ---------------------------------------------------------------------

#[derive(Accounts)]
#[instruction(queue_id: String)]
pub struct CreateQueue<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = Queue::SPACE,
        seeds = [b"queue", queue_id.as_bytes()],
        bump
    )]
    pub queue: Account<'info, Queue>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(hash_cpf: [u8; 32])]
pub struct JoinQueue<'info> {
    #[account(mut)]
    pub cidadao: Signer<'info>,

    #[account(mut)]
    pub queue: Account<'info, Queue>,

    #[account(
        init,
        payer = cidadao,
        space = Ticket::SPACE,
        seeds = [b"ticket", queue.key().as_ref(), hash_cpf.as_ref()],
        bump
    )]
    pub ticket: Account<'info, Ticket>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct GerenciarTicket<'info> {
    #[account(constraint = admin.key() == queue.admin @ ErrorCode::NaoAutorizado)]
    pub admin: Signer<'info>,

    pub queue: Account<'info, Queue>,

    #[account(mut, constraint = ticket.queue == queue.key() @ ErrorCode::TicketDeOutraFila)]
    pub ticket: Account<'info, Ticket>,
}

#[derive(Accounts)]
pub struct FecharFila<'info> {
    #[account(constraint = admin.key() == queue.admin @ ErrorCode::NaoAutorizado)]
    pub admin: Signer<'info>,

    #[account(mut)]
    pub queue: Account<'info, Queue>,
}

// ---------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------

#[error_code]
pub enum ErrorCode {
    #[msg("Fila está fechada para novas entradas")]
    FilaFechada,
    #[msg("Overflow no contador de registrados")]
    Overflow,
    #[msg("Apenas o admin da fila pode executar esta ação")]
    NaoAutorizado,
    #[msg("Número de senha informado não corresponde ao ticket")]
    SenhaIncorreta,
    #[msg("Ticket já foi processado (não está mais aguardando)")]
    TicketJaProcessado,
    #[msg("Só é possível chamar a próxima senha em ordem — não é possível pular")]
    ForaDeOrdem,
    #[msg("Ticket ainda não foi chamado")]
    TicketNaoChamado,
    #[msg("queue_id muito longo (máx 50 caracteres)")]
    QueueIdMuitoLongo,
    #[msg("Este ticket pertence a outra fila")]
    TicketDeOutraFila,
}
