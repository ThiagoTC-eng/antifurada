"use client";

import { useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { SystemProgram } from "@solana/web3.js";
import {
  QUEUE_ID_PADRAO,
  explorerAccountUrl,
  explorerTxUrl,
  getProgram,
  hashCpfParaBytes,
  mensagemErroAmigavel,
  queuePda,
  ticketPda,
} from "@/lib/anchor";

export default function PaginaCidadao() {
  const { connected, publicKey } = useWallet();
  const anchorWallet = useAnchorWallet();
  const { connection } = useConnection();

  const [queueId, setQueueId] = useState(QUEUE_ID_PADRAO);
  const [identificador, setIdentificador] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{
    numeroSenha: number;
    assinatura: string;
    ticketAddr: string;
  } | null>(null);

  async function entrarNaFila() {
    setErro(null);
    setResultado(null);

    if (!anchorWallet || !publicKey) {
      setErro("Conecte sua carteira primeiro.");
      return;
    }
    if (!identificador.trim()) {
      setErro("Digite um identificador (CPF simulado) para gerar seu hash.");
      return;
    }

    setCarregando(true);
    try {
      const program = getProgram(anchorWallet);
      const queue = queuePda(queueId);
      const hashCpf = hashCpfParaBytes(identificador);
      const ticket = ticketPda(queue, Uint8Array.from(hashCpf));

      // Checagem amigável: fila existe?
      const queueInfo = await connection.getAccountInfo(queue);
      if (!queueInfo) {
        setErro(
          `A fila "${queueId}" ainda não existe on-chain. Peça para o gestor criá-la no Painel do gestor.`
        );
        setCarregando(false);
        return;
      }

      const assinatura = await program.methods
        .joinQueue(hashCpf)
        .accounts({
          cidadao: publicKey,
          queue,
          ticket,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await connection.confirmTransaction(assinatura, "confirmed");

      const ticketConta: any = await program.account.ticket.fetch(ticket);

      setResultado({
        numeroSenha: Number(ticketConta.numeroSenha),
        assinatura,
        ticketAddr: ticket.toBase58(),
      });
    } catch (err) {
      setErro(mensagemErroAmigavel(err));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Entrar na fila pública</h1>
        <p className="mt-1 text-sm text-gray-500">
          Sua entrada na fila é uma transação assinada por você, registrada de forma
          pública e imutável na Solana Devnet. Ninguém — nem o gestor — pode furar a
          ordem depois que sua senha é emitida.
        </p>
      </div>

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-600">Sua carteira</span>
          <WalletMultiButton />
        </div>

        <label className="mb-1 block text-sm font-medium text-gray-700">
          Identificador da fila
        </label>
        <input
          className="mb-4 w-full rounded-lg border px-3 py-2 text-sm"
          value={queueId}
          onChange={(e) => setQueueId(e.target.value)}
          placeholder="sus-exame-001"
        />

        <label className="mb-1 block text-sm font-medium text-gray-700">
          CPF (simulado)
        </label>
        <input
          className="mb-1 w-full rounded-lg border px-3 py-2 text-sm"
          value={identificador}
          onChange={(e) => setIdentificador(e.target.value)}
          placeholder="000.000.000-00"
          disabled={!connected}
        />
        <p className="mb-4 text-xs text-gray-400">
          ⚠️ Não guardamos o CPF em nenhum lugar. Apenas o hash SHA-256 dele é enviado
          e gravado on-chain — o número original nunca sai do seu navegador.
        </p>

        <button
          onClick={entrarNaFila}
          disabled={!connected || carregando}
          className="w-full rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {carregando ? "Enviando transação..." : "Entrar na fila"}
        </button>

        {erro && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {erro}
          </div>
        )}

        {resultado && (
          <div className="mt-4 rounded-lg bg-green-50 p-4 text-sm text-green-800">
            <p className="font-semibold">
              ✅ Você entrou na fila! Sua senha é a nº {resultado.numeroSenha}.
            </p>
            <div className="mt-2 flex flex-col gap-1 text-xs">
              <a
                className="underline"
                href={explorerTxUrl(resultado.assinatura)}
                target="_blank"
                rel="noreferrer"
              >
                Ver transação no Solana Explorer ↗
              </a>
              <a
                className="underline"
                href={explorerAccountUrl(resultado.ticketAddr)}
                target="_blank"
                rel="noreferrer"
              >
                Ver conta do seu ticket on-chain ↗
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
