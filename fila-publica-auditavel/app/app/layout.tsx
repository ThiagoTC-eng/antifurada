import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import Providers from "./providers";
import { QUEUE_ID_PADRAO } from "@/lib/anchor";

export const metadata: Metadata = {
  title: "Fila Pública Auditável On-Chain",
  description: "Fila de espera para serviços públicos registrada na Solana Devnet",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen">
        <Providers>
          <header className="border-b bg-white">
            <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
              <Link href="/" className="font-semibold text-brand-700">
                🏛️ Fila Pública Auditável
              </Link>
              <nav className="flex gap-4 text-sm text-gray-600">
                <Link href="/" className="hover:text-brand-600">Entrar na fila</Link>
                <Link href={`/painel/${QUEUE_ID_PADRAO}`} className="hover:text-brand-600">
                  Painel público
                </Link>
                <Link href={`/gestor/${QUEUE_ID_PADRAO}`} className="hover:text-brand-600">
                  Painel do gestor
                </Link>
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
          <footer className="mx-auto max-w-4xl px-4 pb-8 text-xs text-gray-400">
            Rodando na Solana Devnet — MVP de hackathon, não use em produção sem auditoria.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
