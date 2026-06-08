# Regras de Segurança e Autenticação (Security Rules)

## Sistema Acauã · NGD-PGDP-UEFS · 2026

---

## 1. Governança e Autenticação Institucional

O acesso ao Acauã é restrito a servidores e colaboradores autorizados do ecossistema Google Workspace do NGD/UEFS. 

### 1.1. Provedor de Autenticação (Google OAuth 2.0)
* A autenticação é configurada no Firebase Console ativando o provedor **Google** (Identity Platform).
* O redirecionamento de OAuth e autorizações são gerenciados pelo SDK cliente do Firebase Auth.

### 1.2. Restrição de Domínio de E-mail (Spark Plan Lockout)
Uma vez que o plano gratuito do Firebase não permite Cloud Functions de bloqueio antes do login (Blocking Functions), o bloqueio contra usuários externos é implementado em duas camadas complementares:
1. **Camada de Aplicação (Frontend):** O cliente Next.js inspeciona o token JWT retornado pelo Google Auth e desloga imediatamente o usuário caso seu e-mail não termine com `@uefs.br`.
2. **Camada de Banco de Dados (Firestore Security Rules):** O Firestore avalia o campo `email` do token de autenticação em todas as requisições de leitura e escrita. Se o e-mail não terminar com `@uefs.br`, a transação é bloqueada a nível de rede (`Permission Denied`), garantindo que dados corporativos nunca vazem mesmo que o front-end seja modificado.

---

## 2. Regras de Segurança do Firestore (`firestore.rules`)

As regras a seguir implementam de forma idêntica o controle de acesso Row-Level Security (RLS) que estava planejado no PostgreSQL.

Salve o código abaixo em um arquivo chamado `firestore.rules` na raiz do seu projeto local para deploy via Firebase CLI.

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // =========================================================================
    // HELPER FUNCTIONS (Funções Auxiliares de Segurança)
    // =========================================================================

    // Verifica se o usuário está autenticado no Firebase Auth
    function isAuthenticated() {
      return request.auth != null;
    }

    // Garante a restrição do domínio de e-mail institucional @uefs.br
    function isInstitutionalEmail() {
      return isAuthenticated() && request.auth.token.email.matches('.*@uefs.br$');
    }

    // Obtém o documento de perfil do usuário atual na coleção profiles
    function getUserProfile() {
      return get(/databases/$(database)/documents/profiles/$(request.auth.uid)).data;
    }

    // Obtém o papel (role) do usuário atual
    function getUserRole() {
      return getUserProfile().role;
    }

    // Verifica se o usuário possui papel de Administrador
    function isAdmin() {
      return isInstitutionalEmail() && getUserRole() == 'admin';
    }

    // Verifica se o usuário possui papel de Gestor
    function isGestor() {
      return isInstitutionalEmail() && getUserRole() == 'gestor';
    }

    // Verifica se o usuário é Administrador ou Gestor
    function isAdminOrGestor() {
      return isInstitutionalEmail() && (getUserRole() == 'admin' || getUserRole() == 'gestor');
    }

    // =========================================================================
    // REGRAS POR COLEÇÃO
    // =========================================================================

    // Coleção: profiles
    match /profiles/{uid} {
      allow read: if isInstitutionalEmail();
      // O usuário pode criar seu próprio perfil padrão durante o primeiro login como colaborador
      allow create: if isInstitutionalEmail() && request.auth.uid == uid && request.resource.data.role == 'colaborador';
      // Colaboradores atualizam apenas o próprio perfil (sem alterar seu papel 'role')
      allow update: if isInstitutionalEmail() && (
        (request.auth.uid == uid && request.resource.data.role == resource.data.role) ||
        getUserRole() == 'admin'
      );
      // Apenas administradores podem excluir perfis de usuários
      allow delete: if isAdmin();
    }

    // Coleção: projects
    match /projects/{projectId} {
      allow read: if isInstitutionalEmail();
      // Apenas gestores ou administradores criam novos projetos
      allow create: if isAdminOrGestor();
      // O responsável pelo projeto ou a equipe gestora/admin pode atualizar os dados do projeto
      allow update: if isInstitutionalEmail() && (
        request.auth.uid == resource.data.responsible_id ||
        isAdminOrGestor()
      );
      // Apenas administradores podem excluir projetos
      allow delete: if isAdmin();
    }

    // Coleção: activities
    match /activities/{activityId} {
      // Colaboradores veem apenas suas tarefas atribuídas. Gestor/Admin veem todas.
      allow read: if isInstitutionalEmail() && (
        request.auth.uid == resource.data.responsible_id ||
        isAdminOrGestor()
      );
      // Um colaborador só pode criar atividades atribuídas a ele mesmo
      allow create: if isInstitutionalEmail() && request.resource.data.responsible_id == request.auth.uid;
      // Usuários modificam suas próprias atividades, gestores atualizam qualquer atividade
      allow update: if isInstitutionalEmail() && (
        request.auth.uid == resource.data.responsible_id ||
        isAdminOrGestor()
      );
      allow delete: if isAdminOrGestor();
    }

    // Coleção: time_logs
    match /time_logs/{logId} {
      // Colaboradores visualizam apenas seus próprios lançamentos de horas
      allow read: if isInstitutionalEmail() && (
        request.auth.uid == resource.data.person_id ||
        isAdminOrGestor()
      );
      // Só é permitido criar lançamentos de horas sob o próprio UID
      allow create: if isInstitutionalEmail() && request.resource.data.person_id == request.auth.uid;
      // Colaborador atualiza apenas seu próprio log, gestor atualiza qualquer um
      allow update: if isInstitutionalEmail() && (
        request.auth.uid == resource.data.person_id ||
        isAdminOrGestor()
      );
      allow delete: if isInstitutionalEmail() && (
        request.auth.uid == resource.data.person_id ||
        isAdminOrGestor()
      );
    }

    // Coleção: indicators
    match /indicators/{indicatorId} {
      allow read: if isInstitutionalEmail();
      allow create, update, delete: if isAdminOrGestor();
    }

    // Coleção: metrics (consolidação de dashboard)
    match /metrics/{document} {
      allow read: if isInstitutionalEmail();
      // Permite escritas atômicas sincronizadas a partir dos clientes durante transações de time logs/atividades
      allow write: if isInstitutionalEmail();
    }

    // Coleção: audit_logs
    match /audit_logs/{logId} {
      allow read: if isAdmin();
      // Permite gravação append-only por usuários autenticados para rastrear alterações críticas
      allow create: if isInstitutionalEmail();
      allow update, delete: if false; // Logs de auditoria são imutáveis
    }
  }
}
```

---

## 3. Segurança Física dos Arquivos (Firebase Storage)

Os arquivos anexados nos projetos ou perfis de usuários (avatars) serão armazenados no Firebase Storage. As regras de segurança aplicadas em `storage.rules` devem ser:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    
    // Helper: Verifica autenticação e domínio institucional
    function isInstitutionalEmail() {
      return request.auth != null && request.auth.token.email.matches('.*@uefs.br$');
    }

    // Imagens de Avatar da equipe (Público para leitura, gravação própria)
    match /avatars/{userId} {
      allow read: if isInstitutionalEmail();
      allow write: if isInstitutionalEmail() && request.auth.uid == userId
                   && request.resource.size < 5 * 1024 * 1024 // Limite de 5MB
                   && request.resource.contentType.matches('image/.*');
    }

    // Documentos anexados nos projetos (Privado, autenticados leem e gravam)
    match /attachments/{projectId}/{fileName} {
      allow read, write: if isInstitutionalEmail()
                        && request.resource.size < 50 * 1024 * 1024; // Limite de 50MB
    }
  }
}
```
