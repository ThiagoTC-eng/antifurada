# Fila Pública Auditável On-Chain

MVP de hackathon (Solana + Cursor): um sistema de fila de espera para
serviços públicos (ex.: exame do SUS) em que cada entrada é uma
transação assinada pelo próprio cidadão, registrada na Solana Devnet,
com ordem pública e imutável — impossível furar fila.

## Como funciona (resumo)

- **`Queue`** (PDA `["queue", queue_id]`): guarda `queue_id`, `admin`,
  `total_registrados` (contador sequencial) e `aberta`.
- **`Ticket`** (PDA `["ticket", queue, hash_cpf]`): guarda `queue`,
  `cidadao`, `hash_cpf` (SHA-256 do CPF — nunca o CPF em texto),
  `numero_senha`, `timestamp` e `status`.
- Como a PDA do `Ticket` usa o **hash do CPF** como parte da seed, o
  próprio runtime da Solana impede duas entradas da mesma pessoa na
  mesma fila: a segunda tentativa falha com "already in use".
- `call_next` só pode ser assinado pela carteira `admin` da fila.

```
fila-publica-auditavel/
├── anchor/                  # programa on-chain (Rust/Anchor) + testes
│   ├── Anchor.toml
│   ├── Cargo.toml
│   ├── programs/fila_publica/src/lib.rs
│   └── tests/fila_publica.ts
└── app/                     # frontend Next.js (App Router)
    ├── app/page.tsx                    # tela do cidadão
    ├── app/painel/[queueId]/page.tsx   # painel público
    ├── app/gestor/[queueId]/page.tsx   # painel do gestor
    └── lib/anchor.ts                   # conexão, PDAs, IDL
```

---

## 1. Pré-requisitos

- Rust + `cargo` (https://rustup.rs)
- Solana CLI ≥ 1.18: `sh -c "$(curl -sSfL https://release.solana.com/stable/install)"`
- Anchor CLI (via `avm`): 
  ```bash
  cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
  avm install 0.30.1
  avm use 0.30.1
  ```
- Node.js ≥ 18 e Yarn ou npm
- Carteira Phantom ou Solflare (extensão do navegador), configurada para **Devnet**

## 2. Configurar sua carteira de deploy (CLI) e pegar SOL de Devnet

```bash
# gera um keypair local para deploy (se ainda não tiver um)
solana-keygen new -o ~/.config/solana/id.json

# aponta a CLI para devnet
solana config set --url https://api.devnet.solana.com

# pega SOL de teste via faucet oficial (pode repetir se cair o limite)
solana airdrop 2

# se o airdrop da CLI estiver com rate-limit, use o faucet web:
# https://faucet.solana.com  (cole o endereço público: `solana address`)
```

Na extensão da carteira (Phantom/Solflare) também troque a rede para
**Devnet** e use o mesmo faucet (https://faucet.solana.com) colando o
endereço da carteira do navegador — é essa carteira que vai assinar as
transações no frontend.

## 3. Build e testes do programa Anchor

```bash
cd anchor
yarn install     # ou npm install

anchor build
```

Isso gera `target/idl/fila_publica.json` e `target/types/fila_publica.ts`
(necessários para os testes e, opcionalmente, para o frontend).

Rodar os testes (usam a Devnet configurada em `Anchor.toml`, com
airdrop automático para as carteiras de teste):

```bash
anchor test --skip-local-validator
```

Os testes cobrem: criar fila → cidadão entra e recebe senha #1 →
segunda tentativa com o **mesmo hash de CPF falha** → segundo cidadão
(CPF diferente) recebe senha #2 → admin chama a senha #1 → não-admin
tentando chamar é rejeitado → listagem ordenada por `numero_senha`.

## 4. Deploy na Devnet

```bash
anchor deploy --provider.cluster devnet
```

A CLI vai imprimir algo como:

```
Program Id: 7xKX...9fQ2
```

**Depois do deploy, atualize o Program ID em 3 lugares:**

1. `anchor/programs/fila_publica/src/lib.rs` → macro `declare_id!("...")`
2. `anchor/Anchor.toml` → `[programs.devnet] fila_publica = "..."`
3. `app/lib/idl.json` → campo `"metadata": { "address": "..." }`
   (ou simplesmente copie o `target/idl/fila_publica.json` gerado pelo
   `anchor build` por cima de `app/lib/idl.json`, já que ele inclui o
   endereço correto automaticamente)

Depois de trocar o `declare_id!`, rode `anchor build` e
`anchor deploy --provider.cluster devnet` de novo para publicar com o
ID final.

> **Program ID (preencher depois do seu deploy):** `_________________`

## 5. Rodar o frontend

```bash
cd app
npm install
npm run dev
```

Abra http://localhost:3000:

- `/` — tela do cidadão (conectar carteira, digitar CPF simulado, entrar na fila)
- `/painel/sus-exame-001` — painel público (não exige carteira)
- `/gestor/sus-exame-001` — painel do gestor (conectar como admin, criar a fila e chamar próximos)

Fluxo de demo sugerido:

1. Conecte a carteira A em `/gestor/sus-exame-001` e clique em **"Criar esta fila"**.
2. Abra `/` em outra aba (ou outro navegador), conecte a carteira B e clique **"Entrar na fila"** — receberá a senha #1.
3. Repita com a carteira C — senha #2. Tente de novo com o **mesmo CPF simulado** da carteira B — deve mostrar o erro "você já está nessa fila".
4. Abra `/painel/sus-exame-001` (sem conectar nada) e veja a lista ordenada, com link para o Explorer.
5. Volte para `/gestor/sus-exame-001` (carteira A) e clique **"Chamar próximo"** — o status muda para "Chamado" e reflete no painel público em segundos.

## 6. Tratamento de erros na UI

O helper `mensagemErroAmigavel` em `app/lib/anchor.ts` traduz os erros
mais comuns para mensagens em português, entre eles:

- Conta já existe (mesmo CPF tentando entrar de novo) → *"Você já está nessa fila..."*
- Saldo insuficiente de SOL → *"Sua carteira está sem SOL suficiente na Devnet..."*
- Carteira não é admin → *"Apenas o admin desta fila pode fazer isso."*
- Fila fechada → *"Esta fila já foi fechada para novas entradas."*
- Usuário cancelou na extensão da carteira → *"Transação cancelada na carteira."*
- Fila inexistente on-chain → *"Esta fila ainda não existe on-chain..."*

## 7. Sobre o vídeo de demonstração

Não foi possível gerar automaticamente um vídeo do app rodando (isso
exigiria uma carteira real conectada à Devnet e uma gravação de tela,
que este ambiente não tem como produzir). Em vez disso, segue um
**roteiro cronometrado de até 3 minutos** para você gravar localmente
(OBS Studio, Loom, ou o gravador nativo do SO) depois de subir o
projeto:

| Tempo | Cena |
|---|---|
| 0:00–0:20 | Contextualize o problema: fura-fila em serviços públicos. Mostre o código do `Ticket` PDA usando `hash_cpf` na seed. |
| 0:20–0:50 | Tela do gestor: conecte a carteira A, clique "Criar esta fila", mostre o toast de sucesso e o link do Explorer. |
| 0:50–1:40 | Tela do cidadão: conecte a carteira B, digite um CPF simulado, clique "Entrar na fila", mostre a senha #1 e o link da transação no Explorer. Repita rapidamente com a carteira C → senha #2. |
| 1:40–2:05 | Tente entrar de novo com o CPF da carteira B → mostre o erro "Você já está nessa fila" — este é o ponto-chave do pitch (anti fura-fila garantido pelo próprio runtime da Solana). |
| 2:05–2:35 | Abra o painel público em uma aba anônima (sem carteira) e mostre a lista ordenada, ao vivo, com os status. |
| 2:35–3:00 | Volte ao painel do gestor, clique "Chamar próximo", e mostre o painel público atualizando o status para "Chamado" — feche com uma frase de impacto sobre auditabilidade pública.

Isso cobre 100% do fluxo ponta a ponta dentro do limite de 3 minutos.

## 8. Próximos passos (fora do escopo do MVP)

- Assinatura de CPF real com verificação de identidade (ex.: gov.br) antes do hash.
- Paginação/streaming em vez de `getProgramAccounts` completo para filas muito grandes.
- Notificação push/SMS quando a senha for chamada.
- Múltiplas filas por unidade de saúde com um "hub" de seleção.
