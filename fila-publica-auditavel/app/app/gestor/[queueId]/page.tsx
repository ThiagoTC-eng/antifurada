"use client";

import { useCallback, useEffect, useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { SystemProgram, PublicKey } from "@solana/web3.js";
import {
  explorerTxUrl,
  getProgram,
  mensagemErroAmigavel,
  parseStatus,
  queuePda,
  type TicketView,
} from "@/lib/anchor";

export default function PainelGestor({ params }: { params: { queueId: string } }) {
  const { queueId } = params;
  const { connected, publicKey } = useWallet();
  const anchorWallet = useAnchorWallet();
  const { connection } = useConnection();

  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ultimaTx, setUltimaTx] = useState<string | null>(null);

  const [filaExiste, setFilaExiste] = useState<boolean | null>(null);
  const [admin, setAdmin] = useState<PublicKey | null>(null);
  const [tickets, setTickets] = useState<TicketView[]>([]);

  const ehAdmin = !!(publicKey && admin && publicKey.equals(admin));

  const carregarEstado = useCallback(async () => {
    if (!anchorWallet) return;
    try {
      const program = getProgram(anchorWallet);
      const queue = queuePda(queueId);
      const info = await connection.getAccountInfo(queue);

      if (!info) {
        setFilaExiste(false);
        setAdmin(null);
        setTickets([]);
        return;
      }
      setFilaExiste(true);

      const queueConta: any = await program.account.queue.fetch(queue);
      setAdmin(queueConta.admin);

      const contas = await program.account.ticket.all([
        { memcmp: { offset: 8, bytes: queue.toBase58() } },
      ]);
      const view: TicketView[] = contas
        .map((c: any) => ({
          pubkey: c.publicKey,
          queue: c.account.queue,
          cidadao: c.account.cidadao,
          numeroSenha: Number(c.account.numeroSenha),
          timestamp: Number(c.account.timestamp),
          status: parseStatus(c.account.status),
        }))
        .sort((a, b) => a.numeroSenha - b.numeroSenha);
      setTickets(view);
    } catch (err) {
      setErro(mensagemErroAmigavel(err));
    }
  }, [anchorWallet, connection, queueId]);

  useEffect(() => {
    carregarEstado();
  }, [carregarEstado]);

  async function criarFila() {
    if (!anchorWallet || !publicKey) return;
    setErro(null);
    setAviso(null);
    setCarregando(true);
    try {
      const program = getProgram(anchorWallet);
      const queue = queuePda(queueId);

      const assinatura = await program.methods
        .createQueue(queueId)
        .accounts({
          admin: publicKey,
          queue,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await connection.confirmTransaction(assinatura, "confirmed");
      setUltimaTx(assinatura);
      setAviso("Fila criada com sucesso! Você é o admin.");
      await carregarEstado();
    } catch (err) {
      setErro(mensagemErroAmigavel(err));
    } finally {
      setCarregando(false);
    }
  }

  async function chamarProximo() {
    if (!anchorWallet || !publicKey) return;
    setErro(null);
    setAviso(null);

    const proximo = tickets.find((t) => t.status === "Aguardando");
    if (!proximo) {
      setErro("Não há ninguém aguardando nesta fila no momento.");
      return;
    }

    setCarregando(true);
    try {
      const program = getProgram(anchorWallet);
      const queue = queuePda(queueId);

      const assinatura = await program.methods
        .callNext(new (await import("@coral-xyz/anchor")).BN(proximo.numeroSenha))
        .accounts({
          admin: publicKey,
          queue,
          ticket: proximo.pubkey,
        })
        .rpc();

      await connection.confirmTransaction(assinatura, "confirmed");
      setUltimaTx(assinatura);
      setAviso(`Senha #${proximo.numeroSenha} chamada.`);
      await carregarEstado();
    } catch (err) {
      setErro(mensagemErroAmigavel(err));
    } finally {
      setCarregando(false);
    }
  }

  const proximoNaFila = tickets.find((t) => t.status === "Aguardando");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Painel do gestor — {queueId}</h1>
          <p className="mt-1 text-sm text-gray-500">
            Só a carteira que criou a fila pode chamar a próxima senha.
          </p>
        </div>
        <WalletMultiButton />
      </div>

      {!connected && (
        <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
          Conecte a carteira do gestor para continuar.
        </div>
      )}

      {connected && filaExiste === false && (
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <p className="mb-4 text-sm text-gray-600">
            A fila <strong>{queueId}</strong> ainda não existe on-chain. Crie-a com a
            carteira conectada — ela virá como admin.
          </p>
          <button
            onClick={criarFila}
            disabled={carregando}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {carregando ? "Criando..." : "Criar esta fila"}
          </button>
        </div>
      )}

      {connected && filaExiste && !ehAdmin && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
          Você não é o admin desta fila. Conecte a carteira que criou{" "}
          <strong>{queueId}</strong>.
        </div>
      )}

      {connected && filaExiste && ehAdmin && (
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Próximo da fila</p>
              <p className="text-xl font-bold text-gray-800">
                {proximoNaFila ? `Senha #${proximoNaFila.numeroSenha}` : "Ninguém aguardando"}
              </p>
            </div>
            <button
              onClick={chamarProximo}
              disabled={carregando || !proximoNaFila}
              className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {carregando ? "Enviando..." : "Chamar próximo"}
            </button>
          </div>

          <button
            onClick={carregarEstado}
            className="text-xs text-gray-500 underline"
          >
            Atualizar lista
          </button>
        </div>
      )}

      {erro && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erro}</div>}
      {aviso && (
        <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
          {aviso}{" "}
          {ultimaTx && (
            <a className="underline" href={explorerTxUrl(ultimaTx)} target="_blank" rel="noreferrer">
              ver transação ↗
            </a>
          )}
        </div>
      )}

      {filaExiste && (
        <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-2">Senha</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Carteira</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.pubkey.toBase58()} className="border-t">
                  <td className="px-4 py-2 font-semibold">#{t.numeroSenha}</td>
                  <td className="px-4 py-2">{t.status}</td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">
                    {t.cidadao.toBase58().slice(0, 4)}…{t.cidadao.toBase58().slice(-4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
