"use client";

import { useCallback, useEffect, useState } from "react";
import { AnchorProvider, Program, type Idl } from "@coral-xyz/anchor";
import idl from "@/lib/idl.json";
import {
  PROGRAM_ID,
  explorerAccountUrl,
  getConnection,
  parseStatus,
  queuePda,
  type TicketView,
} from "@/lib/anchor";

// Painel público não exige assinatura, então usamos um "wallet" fake
// somente de leitura — nenhuma transação é enviada por esta tela.
const readonlyWallet = {
  publicKey: null,
  signTransaction: async () => {
    throw new Error("Painel público é somente leitura.");
  },
  signAllTransactions: async () => {
    throw new Error("Painel público é somente leitura.");
  },
} as any;

function corStatus(status: string) {
  if (status === "Aguardando") return "bg-gray-100 text-gray-700";
  if (status === "Chamado") return "bg-amber-100 text-amber-800";
  return "bg-green-100 text-green-800";
}

export default function PainelPublico({ params }: { params: { queueId: string } }) {
  const { queueId } = params;
  const [tickets, setTickets] = useState<TicketView[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [existeFila, setExisteFila] = useState(true);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const connection = getConnection();
      const provider = new AnchorProvider(connection, readonlyWallet, {
        preflightCommitment: "confirmed",
      });
      const program = new Program(idl as Idl, PROGRAM_ID, provider);
      const queue = queuePda(queueId);

      const queueInfo = await connection.getAccountInfo(queue);
      if (!queueInfo) {
        setExisteFila(false);
        setTickets([]);
        return;
      }
      setExisteFila(true);

      // filtra pelo campo `queue` dentro do Ticket (offset 8 = depois do discriminator)
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
    } catch (err: any) {
      setErro(err?.message ?? "Erro ao carregar a fila.");
    } finally {
      setCarregando(false);
    }
  }, [queueId]);

  useEffect(() => {
    carregar();
    const intervalo = setInterval(carregar, 8000); // atualização automática
    return () => clearInterval(intervalo);
  }, [carregar]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Painel público — {queueId}</h1>
          <p className="mt-1 text-sm text-gray-500">
            Qualquer pessoa pode ver esta ordem sem conectar carteira. Cada linha é uma
            transação real e auditável na Solana Devnet.
          </p>
        </div>
        <button
          onClick={carregar}
          className="rounded-lg border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          Atualizar
        </button>
      </div>

      {erro && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erro}</div>}

      {!existeFila && !erro && (
        <div className="rounded-lg bg-yellow-50 p-4 text-sm text-yellow-800">
          Esta fila ainda não foi criada on-chain.
        </div>
      )}

      {carregando ? (
        <p className="text-sm text-gray-500">Carregando…</p>
      ) : (
        existeFila && (
          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2">Senha</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Carteira do cidadão</th>
                  <th className="px-4 py-2">Registrado em</th>
                  <th className="px-4 py-2">Explorer</th>
                </tr>
              </thead>
              <tbody>
                {tickets.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                      Ninguém entrou nesta fila ainda.
                    </td>
                  </tr>
                )}
                {tickets.map((t) => (
                  <tr key={t.pubkey.toBase58()} className="border-t">
                    <td className="px-4 py-2 font-semibold">#{t.numeroSenha}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${corStatus(t.status)}`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-500">
                      {t.cidadao.toBase58().slice(0, 4)}…{t.cidadao.toBase58().slice(-4)}
                    </td>
                    <td className="px-4 py-2 text-gray-500">
                      {new Date(t.timestamp * 1000).toLocaleString("pt-BR")}
                    </td>
                    <td className="px-4 py-2">
                      <a
                        className="text-brand-600 underline"
                        href={explorerAccountUrl(t.pubkey)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        ver ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
