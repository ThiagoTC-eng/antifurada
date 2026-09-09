import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program, type Idl } from "@coral-xyz/anchor";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import { sha256 } from "js-sha256";
import idl from "./idl.json";

// --------------------------------------------------------------------
// Configuração de rede — Devnet
// --------------------------------------------------------------------

export const SOLANA_NETWORK = "devnet";
export const RPC_ENDPOINT = clusterApiUrl(SOLANA_NETWORK);

// Depois do `anchor deploy --provider.cluster devnet`, cole aqui o
// Program ID exato que a CLI imprimir (o mesmo que fica em
// anchor/Anchor.toml e em declare_id! no lib.rs).
export const PROGRAM_ID = new PublicKey(
  (idl as any).metadata?.address ?? "FiLA1PubAud1t0r1a1QueueProgram11111111111"
);

// Fila padrão usada pela UI se o usuário não escolher outra.
export const QUEUE_ID_PADRAO = "sus-exame-001";

export function explorerTxUrl(signature: string) {
  return `https://explorer.solana.com/tx/${signature}?cluster=${SOLANA_NETWORK}`;
}

export function explorerAccountUrl(pubkey: string | PublicKey) {
  return `https://explorer.solana.com/address/${pubkey.toString()}?cluster=${SOLANA_NETWORK}`;
}

export function getConnection() {
  return new Connection(RPC_ENDPOINT, "confirmed");
}

export function getProgram(wallet: AnchorWallet) {
  const provider = new AnchorProvider(getConnection(), wallet, {
    preflightCommitment: "confirmed",
  });
  return new Program(idl as Idl, PROGRAM_ID, provider);
}

// --------------------------------------------------------------------
// PDAs
// --------------------------------------------------------------------

export function queuePda(queueId: string) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("queue"), Buffer.from(queueId)],
    PROGRAM_ID
  )[0];
}

export function ticketPda(queue: PublicKey, hashCpf: Uint8Array) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("ticket"), queue.toBuffer(), Buffer.from(hashCpf)],
    PROGRAM_ID
  )[0];
}

// --------------------------------------------------------------------
// Hash do "CPF" — nunca enviamos o CPF em texto para a blockchain,
// apenas o sha256 dele.
// --------------------------------------------------------------------

export function hashCpfParaBytes(cpfOuIdentificador: string): number[] {
  const limpo = cpfOuIdentificador.replace(/\D/g, "") || cpfOuIdentificador;
  const digest = sha256.arrayBuffer(limpo);
  return Array.from(new Uint8Array(digest));
}

// --------------------------------------------------------------------
// Tipos usados pela UI
// --------------------------------------------------------------------

export type StatusTicket = "Aguardando" | "Chamado" | "Atendido";

export interface TicketView {
  pubkey: PublicKey;
  queue: PublicKey;
  cidadao: PublicKey;
  numeroSenha: number;
  timestamp: number;
  status: StatusTicket;
}

export function parseStatus(statusRaw: any): StatusTicket {
  if ("aguardando" in statusRaw) return "Aguardando";
  if ("chamado" in statusRaw) return "Chamado";
  return "Atendido";
}

/** Mapeia mensagens de erro comuns do runtime/programa para texto amigável em PT-BR. */
export function mensagemErroAmigavel(err: unknown): string {
  const texto = String((err as any)?.message ?? err ?? "");

  if (/already in use/i.test(texto)) {
    return "Você já está nessa fila (este identificador já gerou uma senha).";
  }
  if (/insufficient (lamports|funds)/i.test(texto) || /0x1\b/.test(texto)) {
    return "Sua carteira está sem SOL suficiente na Devnet. Use o faucet e tente de novo.";
  }
  if (/NaoAutorizado/i.test(texto)) {
    return "Apenas o admin desta fila pode fazer isso.";
  }
  if (/FilaFechada/i.test(texto)) {
    return "Esta fila já foi fechada para novas entradas.";
  }
  if (/User rejected/i.test(texto)) {
    return "Transação cancelada na carteira.";
  }
  if (/Account does not exist/i.test(texto)) {
    return "Esta fila ainda não existe on-chain. Peça para o gestor criá-la primeiro.";
  }
  return texto || "Ocorreu um erro inesperado.";
}
