# 🦅 Acauã — Plataforma de Gestão NGD-UEFS

O **Acauã** é um ecossistema serverless de governança operacional e gestão estratégica desenvolvido sob medida para o **Núcleo de Gestão de Dados (NGD)** da **Universidade Estadual de Feira de Santana (UEFS)**. O sistema atua como ponto centralizador para o planejamento, execução e monitoramento de projetos de engenharia de dados, automações, infraestrutura e suporte, fornecendo dados consolidados de produtividade e esforço de toda a equipe acadêmica e técnica.

Com foco em eficiência operacional máxima e custo zero de infraestrutura em nuvem, o Acauã foi concebido sob uma rigorosa filosofia serverless e modular, permitindo a colaboração em tempo real entre gestores, analistas e clientes institucionais da UEFS.

---

## 🎯 Objetivos Estratégicos e Módulos do Sistema

O Acauã organiza as operações do NGD em seis pilares funcionais integrados:

### 📈 1. Dashboard Estratégico (Consolidado)
* **Objetivo**: Centralizar e sintetizar indicadores globais de produtividade e alocação.
* **Métricas em Tempo Real**: Progresso médio de projetos, total de horas registradas no mês (vs. carga esperada), percentuais de produtividade e estimativa de ociosidade operacional.
* **Consumo Otimizado**: Consome exclusivamente o documento `/metrics/global` no Firestore, otimizando leituras do plano de gratuidade Spark.

### 🗂️ 2. Módulo de Projetos
* **Objetivo**: Planejamento e acompanhamento do ciclo de vida dos projetos do núcleo.
* **Atributos Integrados**: Classificação por status (Planejamento, Em andamento, Pausado, Bloqueado, Concluído, Cancelado, Arquivado), categorias (Automação, Dados, Sistemas, Capacitação, Inovação, etc.), prioridade (Baixa a Crítica), e integração com processos administrativos do SEI (Número SEI e Código de Processo).
* **Equipe e Horas**: Controle granular de responsáveis e membros alocados, estimativa de horas (*estimated_hours*) e acompanhamento de horas realmente executadas (*executed_hours*).

### 📋 3. Módulo de Atividades
* **Objetivo**: Controle de tarefas operacionais que compõem o dia a dia da equipe.
* **Integração e Rastreabilidade**: Cada atividade pode ser vinculada diretamente a um projeto cadastrado ou ser lançada como avulsa (ex: reuniões, licenças, capacitações).
* **Fluxo de Trabalho**: Definição de horas planejadas, execução real, tags de categorização e suporte ao arquivamento seguro após a conclusão.

### ⏱️ 4. Controle de Tempo (Time Tracking)
* **Objetivo**: Registro diário do esforço dos colaboradores com foco em transparência e dados de produtividade.
* **Lançamentos Detalhados**: Horas trabalhadas vinculadas a atividades e projetos específicos, com indicação de horas normais ou extras (*is_overtime*) e descrição detalhada do trabalho executado.
* **Sincronização**: Cada lançamento alimenta diretamente a consolidação das horas executadas no projeto e no dashboard geral.

### 🔄 5. Rotinas Recorrentes (Automação de Tarefas)
* **Objetivo**: Automatizar a criação de atividades repetitivas que ocorrem periodicamente.
* **Configuração Flexível**: Definição de periodicidade (diária, semanal, mensal, anual), com seleção de dias específicos da semana e cálculo automático da próxima execução (`next_run`).
* **Geração Automática**: O sistema ou workflows agendados avaliam as rotinas e geram novos registros de atividades no Firestore de forma transparente.

### 🔐 6. Usuários, Perfis e Permissões (RBAC)
* **Objetivo**: Governança e controle de acesso baseado em papéis específicos para os membros do NGD-UEFS.
* **Papéis Principais**:
  - `Administrador (admin)`: Acesso completo para configuração de permissões, pré-cadastro, projetos, e logs de auditoria.
  - `Analista (analista)`: Gerencia projetos, cria e altera atividades, executa lançamentos e visualiza dashboards.
  - `Cliente (cliente)`: Acompanha o progresso de projetos de seu interesse, com perfil focado em visualização de status.
* **Permissões Granulares**: Tela administrativa para gerenciar ações de criar, ler, atualizar e excluir (CRUD) de forma dinâmica para cada módulo do sistema.

---

## 🏗️ Arquitetura e Stack Tecnológica

O sistema foi arquitetado para ser **100% Serverless**, rodando integralmente sob o plano gratuito **Firebase Spark Plan**. Para viabilizar esta infraestrutura sem custos de execução, o frontend foi construído como uma aplicação estática (SPA) e toda a lógica complexa de processamento de segundo plano é delegada para Workers executados no GitHub Actions.

| Camada | Tecnologia | Descrição / Detalhes |
| :--- | :--- | :--- |
| **Frontend** | [Next.js 16](https://nextjs.org/) | App Router com exportação estática (`output: 'export'`) |
| **Estilização** | [Tailwind CSS v4](https://tailwindcss.com/) | Estilização moderna e responsiva de alta fidelidade |
| **Banco de Dados** | [Cloud Firestore](https://firebase.google.com/docs/firestore) | Banco NoSQL usando o SDK Web v10+ com Cache Offline (IndexedDB) |
| **Autenticação** | [Firebase Auth](https://firebase.google.com/docs/auth) | Google OAuth restrito para domínio corporativo `@uefs.br` |
| **Storage** | [Firebase Storage](https://firebase.google.com/docs/storage) | Armazenamento de arquivos e avatares |
| **CI/CD & Workers** | [GitHub Actions](https://github.com/features/actions) | Execução de automações de dados e rotinas administrativas via SDK Admin |
| **Hospedagem** | [Firebase Hosting](https://firebase.google.com/docs/hosting) | Distribuição estática global via CDN do Firebase |
| **Gerenciador** | [pnpm](https://pnpm.io/) | Gerenciamento rápido e eficiente de dependências |

---

## 🚀 Como Iniciar (Quick Start)

### 📋 Pré-requisitos

Certifique-se de ter instalado em sua máquina:
- **Node.js** (versão 20 ou superior recomendada)
- **pnpm** (`npm i -g pnpm`)
- **Firebase CLI** (`npm i -g firebase-tools`)

### 🔧 Instalação

1. Clone o repositório:
   ```bash
   git clone https://github.com/sua-organizacao/acaua.git
   cd acaua
   ```

2. Instale as dependências:
   ```bash
   pnpm install
   ```

3. Configure as variáveis de ambiente:
   Crie um arquivo `.env.local` na raiz do projeto contendo as credenciais públicas do Firebase e a flag dos emuladores:
   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=sua_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=seu_auth_domain.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=seu_project_id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=seu_storage_bucket.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=seu_messaging_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=seu_app_id
   NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true
   ```

### 💻 Execução Local

O projeto está totalmente preparado para desenvolvimento local isolado utilizando o **Firebase Suite Emulators**, evitando o consumo de cotas de produção.

1. **Inicie os Emuladores do Firebase** (em um terminal separado):
   ```bash
   pnpm emulators
   ```
   > 💡 O Firebase Emulator Suite disponibiliza uma interface visual administrativa em [http://localhost:4000](http://localhost:4000).

2. **Inicie o servidor de desenvolvimento do Next.js**:
   ```bash
   pnpm dev
   ```

3. Abra [http://localhost:3000](http://localhost:3000) no seu navegador. O código detectará a execução local e redirecionará as chamadas de autenticação e banco de dados para os emuladores (`localhost:8080` e `localhost:9099`).

---

## 🛠️ Scripts Disponíveis

| Script | Comando | Descrição |
| :--- | :--- | :--- |
| `pnpm dev` | `next dev` | Inicia o servidor de desenvolvimento Next.js local |
| `pnpm build` | `next build` | Realiza o build de produção e exporta estaticamente para o diretório `/out` |
| `pnpm start` | `next start` | Inicia o servidor Next.js em modo produção (não aplicável para deploy estático SPA) |
| `pnpm lint` | `eslint` | Executa o validador de sintaxe e estilo de código |
| `pnpm emulators` | `firebase emulators:start` | Inicia a suíte de emuladores locais (Auth, Firestore, Hosting) |

---

## ⚡ Restrições e Padrões Obrigatórios de Código

Para manter o projeto em conformidade com o Firebase Spark Plan e garantir a segurança dos dados, todos os desenvolvedores devem seguir estritamente as regras de desenvolvimento definidas em [AGENTS.md](AGENTS.md):

### 1. 🚫 Proibição de Server-Side no Next.js
* Como o deploy é baseado em **Static Export SPA** (`output: 'export'`), variáveis de ambiente privadas não estão disponíveis em runtime do servidor.
* **NUNCA** crie arquivos em `src/app/api/` ou `middleware.ts`.
* **SEMPRE** use a diretiva `'use client'` no topo de componentes ou páginas que façam chamadas ao Firebase ou utilizem hooks de estado do React.

### 2. 🚫 Proibição de Cloud Functions
* O plano gratuito Spark não suporta Cloud Functions.
* Lógicas automatizadas, cron jobs (ex: scraping do Diário Oficial) ou rotinas pesadas são executadas por meio de **GitHub Actions** usando o `firebase-admin` SDK com credenciais protegidas como Secrets.

### 3. 📂 Estrutura e Desnormalização de Dados
O Firestore não suporta operações de `JOIN`. Para garantir alto desempenho e o menor número de leituras possível, aplicamos **desnormalização controlada**.

#### Principais Coleções do Firestore:
* `/profiles/{uid}`: Perfis de usuários. O ID é o UID do Firebase Auth.
* `/projects/{projectId}`: Projetos ativos e arquivados.
* `/activities/{activityId}`: Atividades planejadas ou em andamento.
* `/time_logs/{logId}`: Lançamentos de tempo de cada usuário.
* `/indicators/{indicatorId}`: Métricas e KPIs estratégicos.
* `/metrics/global`: Documento único que resume as estatísticas do Dashboard.
* `/audit_logs/{logId}`: Logs imutáveis para alterações críticas.

#### Campos Desnormalizados Obrigatórios:
Sempre que criar ou editar um documento, garanta a consistência dos dados inserindo:
* Em **`activities`**: `responsible_name` e `project_name`
* Em **`time_logs`**: `person_name`, `activity_title` e `project_name`
* Em **`projects`**: `responsible_name` e a lista `members[].full_name`

### 4. 🔀 Operações Atômicas (`writeBatch`)
Operações que modifiquem múltiplos documentos de forma lógica (ex: criar um `time_log` e atualizar o progresso do projeto) **devem** ser executadas juntas usando `writeBatch`.
```typescript
import { writeBatch, doc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

const batch = writeBatch(db);
// ... Adicionar escritas ao batch ...
await batch.commit();
```

### 5. 📑 Paginação em Consultas
Toda consulta Firestore que retorne listas extensas de documentos deve limitar o retorno utilizando `.limit(25)` e implementar paginação por cursor (`startAfter`).

### 6. 🔐 Autenticação com Restrição de Domínio
Apenas e-mails do domínio `@uefs.br` têm permissão de acesso ao sistema. Esta restrição é validada em duas camadas:
1. **Frontend**: Verificação no hook `useAuth`, deslogando imediatamente contas externas via `signOut(auth)`.
2. **Firestore Rules**: Regras de rede bloqueiam leitura e escrita para e-mails fora do domínio `@uefs.br`.

---

## 📈 Dashboard e Consolidação (`metrics/global`)

Para minimizar os custos de leitura no Firestore, o Dashboard não faz queries em lote nas coleções. Em vez disso, consome unicamente o documento consolidado em `/metrics/global`.
Qualquer alteração que afete o dashboard (conclusão de projetos, novas horas registradas, etc.) deve calcular o incremento correspondente e atualizar `/metrics/global` de forma atômica utilizando `writeBatch`.

---

## 📝 Logs de Auditoria (`audit_logs`)

Toda alteração crítica de status de projetos ou atividades deve gerar uma entrada **imutável** e **exclusiva para escrita** na coleção `audit_logs`:
```typescript
batch.set(doc(collection(db, "audit_logs")), {
  user_id: auth.currentUser!.uid,
  user_email: auth.currentUser!.email,
  action: "UPDATE_STATUS",
  table_name: "projects",
  record_id: projectId,
  old_status: previousStatus,
  new_status: newStatus,
  created_at: new Date().toISOString(),
});
```
*Não é permitida a atualização ou remoção de qualquer log já registrado nesta coleção.*

---

## 🚀 Pipeline de Deploy

O build é gerado estaticamente para o diretório `/out`. Os comandos de deploy são gerenciados via Firebase CLI:

```bash
# Build de produção do Next.js
pnpm build

# Deploy completo da plataforma (Hosting, Regras de Firestore e Índices)
firebase deploy

# Deploy parcial (apenas alterações do frontend)
firebase deploy --only hosting

# Deploy das Regras de Segurança do Banco de Dados
firebase deploy --only firestore:rules

# Deploy de Índices do Firestore
firebase deploy --only firestore:indexes
```

---

## 👥 Contribuição e Desenvolvimento

Para garantir a qualidade e segurança do sistema, antes de realizar um commit ou submeter um Pull Request, execute os scripts de auditoria integrados ao AG Kit:

```bash
# Executa validação rápida de segurança, lint e testes
python .agent/scripts/checklist.py .

# Executa suite completa de validação pré-deploy (Lighthouse, E2E, i18n, etc.)
python .agent/scripts/verify_all.py . --url http://localhost:3000
```
