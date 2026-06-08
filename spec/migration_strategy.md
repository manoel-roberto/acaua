# Mapeamento de Transição e Refatoração de Código

## Sistema Acauã · NGD-PGDP-UEFS · 2026

---

## 1. Mapeamento de Dependências e Bibliotecas

Para iniciar a migração de código, remova as dependências do Supabase do seu `package.json` e adicione as dependências oficiais do Firebase:

```bash
# Remover dependências antigas
pnpm remove @supabase/ssr @supabase/supabase-js

# Instalar dependências do Firebase SDK Web (v10+)
pnpm add firebase
```

---

## 2. Refatoração do Inicializador de Banco (`src/lib`)

Substitua a estrutura antiga do Supabase pelo cliente integrado do Firebase configurado com persistência offline agressiva.

### 2.1. Criar [NEW] [client.ts](file:///home/manoel/projetos/acaua_old/src/lib/firebase/client.ts)
```typescript
import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager 
} from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Inicializa a aplicação
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Inicializa Firestore com persistência offline ativa
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

// Inicializa Auth e Storage
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const storage = getStorage(app);
```

---

## 3. Refatoração das Camadas de Serviço (`src/services`)

Substitua as chamadas do cliente SQL do Supabase pelas chamadas assíncronas NoSQL do Firestore SDK. Abaixo está o mapeamento detalhado da refatoração das atividades.

### 3.1. Arquivo: [MODIFY] [activities.ts](file:///home/manoel/projetos/acaua_old/src/services/activities.ts)

Abaixo está o exemplo prático de conversão das principais operações do arquivo de serviços de atividades:

```typescript
import { db } from "@/lib/firebase/client";
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  getDocs, 
  addDoc, 
  updateDoc, 
  doc, 
  deleteDoc, 
  writeBatch 
} from "firebase/firestore";
import { Activity, TimeLog } from "@/types";

// 1. LISTAR ATIVIDADES (Com Cache local priorizado pelo SDK)
export async function getActivities(
  responsibleId?: string,
  projectId?: string
): Promise<Activity[]> {
  const activitiesRef = collection(db, "activities");
  let q = query(activitiesRef, orderBy("created_at", "desc"));

  if (responsibleId) {
    q = query(q, where("responsible_id", "==", responsibleId));
  }
  if (projectId) {
    q = query(q, where("project_id", "==", projectId));
  }

  const querySnapshot = await getDocs(q);
  const activities: Activity[] = [];
  querySnapshot.forEach((doc) => {
    activities.push({ id: doc.id, ...doc.data() } as unknown as Activity);
  });
  return activities;
}

// 2. CRIAR ATIVIDADE (Gravando e associando o UID)
export async function createActivity(
  activity: Omit<Activity, 'id' | 'created_at' | 'updated_at'>
): Promise<Activity> {
  const docRef = await addDoc(collection(db, "activities"), {
    ...activity,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  return { id: docRef.id, ...activity } as unknown as Activity;
}

// 3. ATUALIZAR STATUS
export async function updateActivityStatus(
  activityId: string,
  status: string
): Promise<void> {
  const activityDocRef = doc(db, "activities", activityId);
  await updateDoc(activityDocRef, {
    status,
    updated_at: new Date().toISOString()
  });
}

// 4. LANÇAR HORAS COM ESCRITA ATÔMICA (Write Batch)
// Atualiza o log, incrementa os totais do projeto, tarefa e indicadores gerais
export async function logHours(
  log: Omit<TimeLog, 'id' | 'created_at'>
): Promise<void> {
  const batch = writeBatch(db);

  // 4.1. Criar novo documento de Time Log
  const logRef = doc(collection(db, "time_logs"));
  batch.set(logRef, {
    ...log,
    created_at: new Date().toISOString()
  });

  // 4.2. Incrementar horas executadas na Atividade
  if (log.activity_id) {
    const activityRef = doc(db, "activities", log.activity_id);
    // Nota: Como não temos increment nativo em valores flutuantes decimais no client-side sem ler o documento,
    // recomenda-se efetuar uma transação ou ler e somar no cliente antes de submeter o Batch.
  }

  // 4.3. Incrementar horas executadas no Projeto
  if (log.project_id) {
    const projectRef = doc(db, "projects", log.project_id);
    // Atualiza campo 'executed_hours'
  }

  // Commit no lote de escritas
  await batch.commit();
}
```

---

## 4. Refatoração da Autenticação do Usuário

A lógica de autenticação deve ser substituída para usar o Google Sign-In e validar o domínio institucional.

### 4.1. Exemplo de Gancho de Autenticação (`useAuth` Hook)
```typescript
import { useEffect, useState } from "react";
import { auth, googleProvider } from "@/lib/firebase/client";
import { signInWithPopup, signOut, onAuthStateChanged, User } from "firebase/auth";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        // Validação estrita do domínio institucional no frontend
        if (currentUser.email && currentUser.email.endsWith("@uefs.br")) {
          setUser(currentUser);
        } else {
          // Desconecta se e-mail não for do domínio permitido
          signOut(auth);
          setUser(null);
          alert("Acesso permitido apenas para e-mails institucionais @uefs.br");
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Erro na autenticação:", error);
    }
  };

  const logout = () => signOut(auth);

  return { user, loading, loginWithGoogle, logout };
}
```

---

## 5. Instruções de Adaptação dos Agentes (`spec-kit` & `ag-kit`)

Ao utilizar os assistentes de desenvolvimento automatizados na IDE Antigravity, garanta que suas diretrizes estejam instruídas a:

1. **Uso Exclusivo do Client SDK:** Nunca instrua os agentes a gerarem arquivos de back-end dinâmicos com acesso a banco no diretório `src/app/api` ou no `middleware.ts` do Next.js (pois causariam erros no build estático). Toda persistência deve ser gerida via Client SDK do Firebase.
2. **Priorização de Transações Locais:** Sempre que os agentes forem codificar novas lógicas de atualização cadastral, eles devem verificar se as alterações exigem atualizações de agregados (ex: Dashboard KPIs em `metrics/global`) e usar `writeBatch` ou transações atômicas para garantir a consistência dos dados agregados.
3. **Padrão de Criação de Modelos:** Obrigue os agentes a incluírem metadados redundantes úteis (ex: `responsible_name` ao invés de apenas `responsible_id`) para evitar gargalos de consultas complexas.
4. **Sem Arquivos de Configuração PostgreSQL:** Os agentes devem ignorar os arquivos localizados na pasta `/supabase` do projeto. Todos os scripts automáticos de verificação (`lint`, `tests` ou `checklist.py`) devem usar o Firebase Emulator Local ou simulações locais.
5. **Auditoria por Documentos:** Em vez de Triggers de Banco de Dados SQL tradicionais, as inserções na coleção `/audit_logs` devem ser acionadas explicitamente no código de serviço da aplicação no momento em que as atualizações críticas ocorrerem.
