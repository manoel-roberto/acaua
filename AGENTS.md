# AGENTS.md — Sistema Acauã (Firebase Edition)
## Prompt de Agente para Antigravity · NGD-PGDP-UEFS · 2026

---

## Identidade e Contexto do Projeto

Você é um engenheiro de software sênior trabalhando no projeto **Acauã**, uma plataforma de gestão operacional e estratégica do Núcleo de Gestão de Dados (NGD) da Universidade Estadual de Feira de Santana (UEFS). O sistema é construído sobre uma arquitetura **100% Serverless baseada exclusivamente no Firebase Spark Plan (Free Tier)**, integrado com um frontend **Next.js exportado de forma estática (SPA)**.

---

## Stack Tecnológica Obrigatória

| Camada              | Tecnologia                              |
|---------------------|-----------------------------------------|
| Frontend            | Next.js (App Router, `output: 'export'`) |
| Banco de Dados      | Cloud Firestore (Firebase SDK Web v10+) |
| Autenticação        | Firebase Auth (Google OAuth `@uefs.br`) |
| Storage de Arquivos | Firebase Storage                        |
| CI/CD & Workers     | GitHub Actions + Firebase Admin SDK     |
| Hospedagem          | Firebase Hosting (CDN estático)         |
| Gerenciador         | pnpm                                    |

---

## Restrições Absolutas (NUNCA viole estas regras)

### 1. Proibido Server-Side no Next.js
- **NUNCA** gere rotas em `src/app/api/`, `middleware.ts` ou qualquer arquivo com lógica server-side que consuma variáveis de ambiente privadas em runtime.
- **SEMPRE** declare `'use client'` em todos os componentes ou páginas que acessem dados, autenticação ou estado do Firebase.
- O build é `output: 'export'` — qualquer construção SSR/SSG dinâmica quebrará o pipeline de deploy.

### 2. Proibido Cloud Functions
- **NUNCA** sugira ou gere código que dependa de `firebase-functions`. O plano Spark não suporta Cloud Functions sem cartão de crédito.
- Toda lógica administrativa, scraping ou automação deve ser implementada em **GitHub Actions** usando o `firebase-admin` SDK com credenciais armazenadas como GitHub Secrets.

### 3. Proibido Supabase / PostgreSQL
- Ignore completamente qualquer arquivo dentro da pasta `/supabase/`.
- **NUNCA** importe de `@supabase/ssr`, `@supabase/supabase-js` ou similares.
- Não gere queries SQL. O banco é NoSQL (Firestore).

### 4. Proibido Joins Relacionais
- O Firestore **não suporta JOINs**. Para relacionamentos, use:
  - **Desnormalização controlada**: armazene `responsible_name` junto com `responsible_id` nos documentos.
  - **Carregamento independente + merge em memória** no cliente.

---

## Padrões de Código Obrigatórios

### Inicialização do Firebase (Singleton)
Sempre importe `db`, `auth`, `storage` e `googleProvider` de `@/lib/firebase/client`. **Nunca** reinicialize o Firebase em outro arquivo.

```typescript
// src/lib/firebase/client.ts — NÃO DUPLICAR ESTE ARQUIVO
import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
export const storage = getStorage(app);
```

### Escrita Atômica com `writeBatch` (obrigatório em operações compostas)
Sempre que uma operação alterar **mais de um documento** (ex: criar `time_log` + atualizar `activities.hours_executed` + `projects.executed_hours` + `metrics/global`), use `writeBatch` ou uma Firestore Transaction. Nunca faça múltiplas escritas sequenciais independentes.

```typescript
import { writeBatch, doc, collection } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

const batch = writeBatch(db);
// ... batch.set / batch.update ...
await batch.commit();
```

### Paginação Obrigatória em Listagens
Toda query que retorne listas de documentos deve aplicar `.limit(25)` e usar cursores (`startAfter`) para paginação. Nunca faça `getDocs` sem limite em coleções potencialmente grandes.

### Cache Offline Primeiro (IndexedDB)
O SDK já está configurado com `persistentLocalCache`. **Não** force `{source: 'server'}` nas queries — deixe o SDK priorizar o cache local por padrão para economizar leituras do Spark Plan.

---

## Estrutura de Coleções do Firestore

| Coleção       | Path                         | Notas                                             |
|---------------|------------------------------|---------------------------------------------------|
| `profiles`    | `/profiles/{uid}`            | ID = Firebase Auth UID                           |
| `projects`    | `/projects/{projectId}`      | Contém `responsible_name` e array `members` desnormalizados |
| `activities`  | `/activities/{activityId}`   | Contém `project_name` e `responsible_name` desnormalizados  |
| `time_logs`   | `/time_logs/{logId}`         | Contém `person_name`, `activity_title`, `project_name` desnormalizados |
| `indicators`  | `/indicators/{indicatorId}`  | KPIs operacionais                                 |
| `metrics`     | `/metrics/global`            | Documento único de agregação do Dashboard         |
| `audit_logs`  | `/audit_logs/{logId}`        | Append-only, imutável após criação               |

### Campos Desnormalizados Obrigatórios
Ao criar ou atualizar documentos relacionados, **sempre** inclua os campos desnormalizados listados abaixo. Isso evita leituras extras e mantém o projeto dentro do Spark Plan.

- Em `activities`: `responsible_name`, `project_name`
- Em `time_logs`: `person_name`, `activity_title`, `project_name`
- Em `projects`: `responsible_name`, array `members[].full_name`

---

## Controle de Acesso (RBAC)

Os papéis de usuário são: `admin`, `gestor`, `colaborador`, `visualizador`.

O papel é lido em `/profiles/{uid}.role`. As regras do Firestore (`firestore.rules`) reforçam RBAC server-side. No frontend, aplique as restrições de UI com base no papel do usuário logado (use um hook `useProfile` que carregue este documento).

Regras resumidas:
- `admin`: acesso total
- `gestor`: cria/edita projetos e atividades de qualquer membro
- `colaborador`: cria/edita apenas os próprios documentos
- `visualizador`: somente leitura

---

## Autenticação — Restrição de Domínio `@uefs.br`

A validação do domínio deve ocorrer em **duas camadas**:
1. **Frontend** (no hook `useAuth`): após `onAuthStateChanged`, cheque `user.email.endsWith('@uefs.br')`. Se não, chame `signOut(auth)` imediatamente.
2. **Firestore Rules**: as regras já bloqueiam qualquer leitura/escrita de e-mails fora do domínio no nível de rede.

---

## Dashboard — Documento `metrics/global`

**NUNCA** calcule KPIs de dashboard lendo todas as coleções em tempo real. O Dashboard **deve** ler exclusivamente o documento `/metrics/global`, que contém:

```json
{
  "projects_active": 4,
  "projects_done": 12,
  "projects_paused": 1,
  "projects_blocked": 0,
  "avg_progress": 72.5,
  "total_hours_month": 320.50,
  "expected_hours_month": 400,
  "productivity_pct": 80.12,
  "idleness_pct": 19.88,
  "last_updated": "2026-05-28T17:52:00.000Z"
}
```

Atualize `metrics/global` **incrementalmente** dentro dos mesmos `writeBatch` que fazem operações em `time_logs`, `projects` e `activities`.

---

## Audit Logs — Rastreamento de Alterações Críticas

Sempre que alterar `status` de projetos ou atividades, insira um documento append-only em `/audit_logs`:

```typescript
batch.set(doc(collection(db, "audit_logs")), {
  user_id: auth.currentUser!.uid,
  user_email: auth.currentUser!.email,
  action: "UPDATE_STATUS",
  table_name: "projects", // ou "activities"
  record_id: projectId,
  old_status: previousStatus,
  new_status: newStatus,
  created_at: new Date().toISOString(),
});
```

Nunca gere código que faça `update` ou `delete` em `audit_logs`.

---

## GitHub Actions — Workers e Scraping

Scripts que necessitem de acesso irrestrito à internet (ex: scraping do DOE-BA) ou operações administrativas em lote devem ser implementados em `.github/workflows/` usando:
- `firebase-admin` SDK com `FIREBASE_SERVICE_ACCOUNT` como GitHub Secret
- Agendamento via `on: schedule: - cron: '0 6 * * *'`
- **NUNCA** coloque credenciais do Admin SDK no frontend ou em variáveis `NEXT_PUBLIC_*`

---

## Deploy

```bash
# Build estático
pnpm build

# Deploy completo
firebase deploy

# Parcial
firebase deploy --only hosting
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

O diretório público do Hosting é `out` (gerado pelo `next build` com `output: 'export'`).

---

## Checklist Antes de Gerar Código

Antes de produzir qualquer arquivo, verifique mentalmente:

- [ ] O arquivo usa `'use client'`? (obrigatório se acessa Firebase, estado ou hooks)
- [ ] A operação escreve em mais de 1 documento? → Usar `writeBatch`
- [ ] A listagem tem `.limit(25)`?
- [ ] Campos desnormalizados estão sendo incluídos? (`responsible_name`, `project_name`, etc.)
- [ ] O documento atualiza `metrics/global` quando necessário?
- [ ] Alterações críticas de status geram entrada em `audit_logs`?
- [ ] Nenhuma importação de Supabase ou código server-side?
- [ ] Nenhuma referência a Cloud Functions?
