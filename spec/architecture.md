# Arquitetura de Sistemas Serverless (Firebase Edition)

## Plataforma Acauã · NGD-PGDP-UEFS · 2026

---

## 1. Visão Geral da Arquitetura

O sistema **Acauã** adota uma arquitetura **JAMstack (JavaScript, APIs, e Markup)** pura. Para funcionar integralmente no plano gratuito do Firebase (Spark Plan), a infraestrutura abandona o modelo de execução dinâmico tradicional de servidores Node.js em favor de uma aplicação web estática (Single Page Application - SPA) de alto desempenho combinada a serviços nativos de nuvem (BaaS) e orquestradores de tarefas externos (GitHub Actions).

```mermaid
graph TD
    subgraph Cliente [Ambiente do Usuário (Navegador)]
        A[Next.js Frontend - SPA] -->|Autenticação OAuth| B[Firebase Auth]
        A -->|Gravação/Leitura de Dados| C[SDK Firestore Web]
        C -->|IndexedDB Local Cache| D[(Persistência Offline)]
        A -->|Geração PDF/Excel| E[Client-Side Tools]
    end

    subgraph Firebase [Infraestrutura Spark Plan]
        F[Firebase Hosting] -->|Serviço de Arquivos Estáticos| A
        G[(Cloud Firestore)] <-->|Sincronização Ativa| C
    end

    subgraph GitHub [Integrações e Tarefas Agendadas]
        H[GitHub Actions Workflow] -->|Admin SDK| G
        H -->|Scraping| I[Diário Oficial DOE-BA]
        H -->|Notificações e Emails| J[Gmail API / SMTP]
    end
```

---

## 2. Componentes da Solução

### 2.1. Next.js Frontend (Firebase Hosting)
* **Estratégia de Build:** Exportação Estática Pura (`output: 'export'`).
* **Justificativa:** O Next.js com App Router por padrão tenta rodar páginas no servidor (SSR/Server-side Rendering). No Spark Plan do Firebase, não é possível rodar código de servidor Next.js dinâmico diretamente na CDN sem Cloud Functions (Plano Blaze). O build estático compila a aplicação inteira em arquivos estáticos de HTML, CSS e JavaScript (SPA) que são servidos de forma rápida e global via CDN gratuita do Firebase Hosting.
* **Comunicação com o Banco:** Toda a chamada de dados é feita diretamente do navegador para o Firestore através do **Firebase JavaScript SDK v10 (Client-side)**.

### 2.2. Autenticação e Gestão de Sessão (Firebase Auth)
* **Provedor Primário:** Google OAuth institucional (`@uefs.br`).
* **Verificação de Domínio:** O processo de login é validado via client-side no Next.js e bloqueado a nível de segurança do banco pelas regras do Firestore, aceitando apenas conexões onde o token de e-mail termine com o domínio institucional.
* **Modelo de Permissões (RBAC):** Os perfis de acesso (`admin`, `gestor`, `colaborador`, `visualizador`) são armazenados em um documento associado à ID do usuário na coleção `profiles` do Firestore. A segurança das operações é validada por regras do Firestore (`firestore.rules`) consultando este perfil.

### 2.3. Banco de Dados e Cache Offline (Cloud Firestore)
* **Mecanismo de Persistência:** Firestore SDK Web com persistência offline habilitada (`enableIndexedDbPersistence()`).
* **Sincronização Unidirecional/Bidirecional:** Sempre que o usuário realiza uma operação, os dados são atualizados no banco local (IndexedDB) e enviados de forma assíncrona ao Firestore. 
* **Redução de Custo de Leituras:** Toda consulta de dados tenta primeiro resolver a partir do cache local. Triggers de "Snapshot Listeners" são usados pontualmente para manter o status das atividades atualizado sem realizar chamadas completas repetidas.

### 2.4. Motor de Scraping e ETL (GitHub Actions + Admin SDK)
* **Justificativa:** A raspagem de dados do Diário Oficial da Bahia (DOE-BA) exige rotinas pesadas de processamento em segundo plano e acesso livre à internet externa (bloqueado no plano Spark).
* **Fluxo de Trabalho:**
  1. Um workflow do GitHub Actions é agendado (cron) para rodar diariamente às 06:00.
  2. O runner do GitHub executa um script Node.js/Python que extrai o texto do DOE-BA.
  3. O runner processa os dados e, utilizando a chave do **Firebase Admin SDK** (armazenada de forma segura como `GitHub Secret`), grava as novas nomeações e portarias diretamente no Firestore.

### 2.5. Serviço de E-mails e Notificações (Gmail API / SMTP)
* **Justificativa:** O envio de e-mails automáticos para candidatos convocados requer SMTP ou APIs de e-mail externas.
* **Fluxo de Trabalho:**
  * **Operação em Tempo Real (Interação do Usuário):** Para ações pontuais (ex: notificar candidato), o sistema abre uma janela usando esquemas de link `mailto:` preenchidos no cliente (Outlook, Thunderbird ou Gmail institucional do próprio usuário), transferindo o processamento para a máquina local.
  * **Notificações Automáticas em Lote:** O mesmo workflow do GitHub Actions diário pode enviar e-mails de alerta e notificação de atividades pendentes aos gestores e membros do NGD utilizando as credenciais OAuth do Gmail institucional cadastrado nas Secrets do GitHub.

---

## 3. Fluxo de Dados e Ciclo de Vida do Cliente

```
[ Usuário acessa o Acauã ]
          │
          ▼
[ Hosting serve arquivos estáticos Next.js (CDN) ]
          │
          ▼
[ Inicializa Firebase SDK + Habilita Cache IndexedDB ]
          │
          ├─► [ Se Desconectado ] ─► Renderiza tela de Login (Google OAuth)
          │
          └─► [ Se Autenticado ]
                    │
                    ▼
[ Firestore valida regras de domínio @uefs.br ]
          │
          ▼
[ Busca perfil na coleção `/profiles/{uid}` ]
          │
          ▼
[ Carrega interface e Dashboard baseado no cache IndexedDB ]
          │
          ▼
[ Sincroniza em background novas alterações feitas no banco central ]
```

---

## 4. Diretrizes de Desenvolvimento e Restrições de Código

1. **Uso de SSR em Next.js:** **Proibido**. Toda página que consome dados ou estado de autenticação deve declarar a diretiva `'use client'` e obter os dados usando React Hooks (`useEffect` ou hooks customizados como `useAuth` e `useFirestore`).
2. **Consultas Relacionais (Joins):** O Firestore não suporta junções de tabelas. Lógicas como "buscar atividades e o nome do projeto vinculado" devem ser resolvidas:
   * Carregando as coleções de forma independente e mapeando em memória no cliente;
   * Ou salvando de forma desnormalizada dados pequenos (ex: armazenar `project_id` e `project_name` diretamente dentro do documento da atividade).
3. **Escritas em Lote (Batches/Transactions):** Utilizar `writeBatch` ou transações para garantir consistência em gravações que alteram múltiplos documentos simultaneamente (ex: registrar um `time_log` e atualizar o contador de horas do respectivo `project`).
