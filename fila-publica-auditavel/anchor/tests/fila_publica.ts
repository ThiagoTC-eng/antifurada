import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js";
import { sha256 } from "js-sha256";
import { assert } from "chai";

// O tipo `FilaPublica` vem do arquivo gerado em target/types depois do
// `anchor build`. Se o TS reclamar antes de buildar, isso é esperado.
import { FilaPublica } from "../target/types/fila_publica";

function hashCpf(cpf: string): Buffer {
  return Buffer.from(sha256.arrayBuffer(cpf));
}

describe("fila_publica", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.FilaPublica as Program<FilaPublica>;

  const queueId = `teste-${Math.floor(Math.random() * 1_000_000)}`;
  const admin = provider.wallet as anchor.Wallet;

  const [queuePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("queue"), Buffer.from(queueId)],
    program.programId
  );

  const cidadao1 = Keypair.generate();
  const cidadao2 = Keypair.generate();
  const cpf1 = hashCpf("11111111111");

  const [ticket1Pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("ticket"), queuePda.toBuffer(), cpf1],
    program.programId
  );

  before(async () => {
    // financia os cidadãos de teste com SOL de devnet/localnet
    for (const kp of [cidadao1, cidadao2]) {
      const sig = await provider.connection.requestAirdrop(
        kp.publicKey,
        anchor.web3.LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig, "confirmed");
    }
  });

  it("cria a fila", async () => {
    await program.methods
      .createQueue(queueId)
      .accounts({
        admin: admin.publicKey,
        queue: queuePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const queue = await program.account.queue.fetch(queuePda);
    assert.equal(queue.queueId, queueId);
    assert.equal(queue.admin.toBase58(), admin.publicKey.toBase58());
    assert.equal(queue.totalRegistrados.toNumber(), 0);
    assert.isTrue(queue.aberta);
  });

  it("cidadão 1 entra na fila e recebe senha #1", async () => {
    await program.methods
      .joinQueue(Array.from(cpf1))
      .accounts({
        cidadao: cidadao1.publicKey,
        queue: queuePda,
        ticket: ticket1Pda,
        systemProgram: SystemProgram.programId,
      })
      .signers([cidadao1])
      .rpc();

    const ticket = await program.account.ticket.fetch(ticket1Pda);
    assert.equal(ticket.numeroSenha.toNumber(), 1);
    assert.deepEqual(ticket.status, { aguardando: {} });

    const queue = await program.account.queue.fetch(queuePda);
    assert.equal(queue.totalRegistrados.toNumber(), 1);
  });

  it("REJEITA o mesmo CPF (hash) tentando entrar de novo na mesma fila", async () => {
    let falhou = false;
    try {
      await program.methods
        .joinQueue(Array.from(cpf1))
        .accounts({
          cidadao: cidadao1.publicKey,
          queue: queuePda,
          ticket: ticket1Pda, // mesma PDA, já existe
          systemProgram: SystemProgram.programId,
        })
        .signers([cidadao1])
        .rpc();
    } catch (err) {
      falhou = true;
      // a conta já existe -> o runtime da Solana rejeita o `init`
      assert.match(String(err), /already in use|0x0|custom program error/i);
    }
    assert.isTrue(falhou, "esperava que a segunda entrada com o mesmo CPF falhasse");
  });

  it("cidadão 2 (CPF diferente) entra e recebe senha #2", async () => {
    const cpf2 = hashCpf("22222222222");
    const [ticket2Pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("ticket"), queuePda.toBuffer(), cpf2],
      program.programId
    );

    await program.methods
      .joinQueue(Array.from(cpf2))
      .accounts({
        cidadao: cidadao2.publicKey,
        queue: queuePda,
        ticket: ticket2Pda,
        systemProgram: SystemProgram.programId,
      })
      .signers([cidadao2])
      .rpc();

    const ticket = await program.account.ticket.fetch(ticket2Pda);
    assert.equal(ticket.numeroSenha.toNumber(), 2);
  });

  it("REJEITA chamar a senha #2 antes da #1 (fora de ordem)", async () => {
    const cpf2 = hashCpf("22222222222");
    const [ticket2Pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("ticket"), queuePda.toBuffer(), cpf2],
      program.programId
    );

    let falhou = false;
    try {
      await program.methods
        .callNext(new anchor.BN(2))
        .accounts({
          admin: admin.publicKey,
          queue: queuePda,
          ticket: ticket2Pda,
        })
        .rpc();
    } catch (err) {
      falhou = true;
      assert.match(String(err), /ForaDeOrdem|6008|custom program error/i);
    }
    assert.isTrue(falhou, "esperava rejeição por pular a ordem");
  });

  it("admin chama a senha #1", async () => {
    await program.methods
      .callNext(new anchor.BN(1))
      .accounts({
        admin: admin.publicKey,
        queue: queuePda,
        ticket: ticket1Pda,
      })
      .rpc();

    const ticket = await program.account.ticket.fetch(ticket1Pda);
    assert.deepEqual(ticket.status, { chamado: {} });
  });

  it("REJEITA quem não é admin tentando chamar a próxima senha", async () => {
    let falhou = false;
    try {
      await program.methods
        .callNext(new anchor.BN(2))
        .accounts({
          admin: cidadao2.publicKey, // não é o admin da fila
          queue: queuePda,
          ticket: ticket1Pda,
        })
        .signers([cidadao2])
        .rpc();
    } catch (err) {
      falhou = true;
    }
    assert.isTrue(falhou, "esperava rejeição por autorização");
  });

  it("lista todos os tickets da fila ordenados por numero_senha", async () => {
    const todos = await program.account.ticket.all([
      {
        memcmp: {
          offset: 8, // depois do discriminator de 8 bytes vem o campo `queue: Pubkey`
          bytes: queuePda.toBase58(),
        },
      },
    ]);

    const ordenados = todos
      .map((t) => t.account)
      .sort((a, b) => a.numeroSenha.toNumber() - b.numeroSenha.toNumber());

    assert.equal(ordenados.length, 2);
    assert.equal(ordenados[0].numeroSenha.toNumber(), 1);
    assert.equal(ordenados[1].numeroSenha.toNumber(), 2);
  });
});
