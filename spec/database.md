# Modelagem de Banco de Dados NoSQL (Cloud Firestore)

## Sistema Acauã · NGD-PGDP-UEFS · 2026

---

## 1. Princípios de Modelagem NoSQL para Firestore

Diferente do banco relacional PostgreSQL (Supabase), o **Cloud Firestore** é orientado a documentos e coleções. Como a cobrança e os limites do plano Spark são contabilizados por **documento lido e gravado**, a modelagem do Acauã adota três regras essenciais de otimização de custo:

1. **Desnormalização Controlada (Read-Optimization):** Armazenar informações redundantes (como nome de projetos ou responsáveis) diretamente nos documentos relacionados para evitar múltiplas leituras (`GetDoc`) durante listagens.
2. **Arquitetura de Agregação (Pre-computation):** Agregar métricas críticas de dashboard (como contagem de projetos e horas) em um único documento (`metrics/global`), atualizado de maneira incremental, eliminando a necessidade de ler todas as atividades/projetos para renderizar a tela inicial.
3. **Coleções Planas (Flat Collections):** Evitar subcoleções muito profundas (como `projects/{id}/tasks/{id}/logs/{id}`) em favor de coleções de primeiro nível para facilitar consultas flexíveis e indexação simplificada.

---

## 2. Estrutura de Coleções e Modelos de Documentos

### 2.1. Coleção: `profiles`
* **Path:** `/profiles/{uid}`
* **Descrição:** Cadastro de colaboradores. O ID do documento é o `uid` do Firebase Authentication.
* **Modelo do Documento:**
```json
{
  "full_name": "Manoel Souza",
  "email": "manoel.souza@uefs.br",
  "cargo": "Analista de TI",
  "funcao": "Líder Técnico de Desenvolvimento",
  "setor": "NGD",
  "carga_horaria": 40,
  "avatar_url": "https://firebasestorage.googleapis.com/.../avatars/uid.png",
  "role": "colaborador", // admin | gestor | colaborador | visualizador
  "active": true,
  "created_at": "2026-05-28T17:52:00.000Z", // String ISO 8601 ou Timestamp
  "updated_at": "2026-05-28T17:52:00.000Z"
}
```

### 2.2. Coleção: `projects`
* **Path:** `/projects/{projectId}`
* **Descrição:** Projetos gerenciados pelo NGD.
* **Desnormalização:** O documento contém dados do responsável (`responsible_name`) e um array com os membros ativos para evitar ler a coleção `profiles` individualmente para cada membro na listagem.
* **Modelo do Documento:**
```json
{
  "name": "Migração Firebase Acauã",
  "description": "Consolidação da infraestrutura do sistema no Firebase Spark Plan",
  "status": "em_andamento", // planejamento | em_andamento | pausado | bloqueado | concluido | cancelado
  "category": "desenvolvimento", // automacao | desenvolvimento | capacitacao | infraestrutura | dados | relatorios | sistemas | suporte | inovacao
  "priority": "alta", // baixa | media | alta | critica
  "progress": 35, // 0 a 100
  "start_date": "2026-05-20", // YYYY-MM-DD
  "end_date": null,
  "deadline": "2026-06-30",
  "codigo_processo_sei": "00055-000213/2026-44",
  "numero_sei": "1234567",
  "origem_demanda": "PGDP",
  "estimated_hours": 120,
  "executed_hours": 42.5, // Atualizado incrementalmente nas transações de time_logs
  "observations": "Foco em permanecer na cota gratuita",
  "tags": ["Firebase", "Serverless", "NoSQL"],
  "archived": false,
  "responsible_id": "uid_do_responsavel",
  "responsible_name": "Manoel Souza", // Desnormalizado para visualização imediata
  "members": [ // Desnormalização N:M integrada
    {
      "profile_id": "uid_membro_1",
      "full_name": "João Silva",
      "role_in_project": "colaborador", // responsavel | colaborador | observador
      "allocated_hours": 20
    }
  ],
  "created_by": "uid_criador",
  "created_at": "2026-05-28T17:52:00.000Z",
  "updated_at": "2026-05-28T17:52:00.000Z"
}
```

### 2.3. Coleção: `activities`
* **Path:** `/activities/{activityId}`
* **Descrição:** Quadro de tarefas (Kanban) e rotinas do núcleo.
* **Desnormalização:** Contém `project_name` e `responsible_name` desnormalizados.
* **Modelo do Documento:**
```json
{
  "title": "Configurar Firebase Hosting",
  "description": "Fazer setup do firebase.json e configurar deploy estático",
  "responsible_id": "uid_do_responsavel",
  "responsible_name": "Manoel Souza", // Desnormalizado
  "project_id": "projectId_123", // Opcional (obrigatório se tipo = 'projeto')
  "project_name": "Migração Firebase Acauã", // Desnormalizado
  "type": "projeto", // rotina | projeto | planejamento | capacitacao | reuniao | atendimento | suporte | licenca_medica | ausente
  "status": "em_andamento", // pendente | em_andamento | concluida | cancelada | bloqueada
  "priority": "alta", // baixa | media | alta | critica
  "activity_date": "2026-05-28", // YYYY-MM-DD
  "hours_planned": 8.00,
  "hours_executed": 4.50, // Atualizado incrementalmente via logs de tempo
  "observations": "",
  "tags": ["hosting", "infra"],
  "created_by": "uid_criador",
  "created_at": "2026-05-28T17:52:00.000Z",
  "updated_at": "2026-05-28T17:52:00.000Z"
}
```

### 2.4. Coleção: `time_logs`
* **Path:** `/time_logs/{logId}`
* **Descrição:** Lançamentos de horas da equipe.
* **Modelo do Documento:**
```json
{
  "person_id": "uid_colaborador",
  "person_name": "Manoel Souza", // Desnormalizado
  "activity_id": "activityId_123", // Opcional
  "activity_title": "Configurar Firebase Hosting", // Desnormalizado
  "project_id": "projectId_123", // Opcional
  "project_name": "Migração Firebase Acauã", // Desnormalizado
  "log_date": "2026-05-28", // YYYY-MM-DD
  "hours": 2.50,
  "description": "Ajuste do arquivo de deploy firebase.json local",
  "is_overtime": false,
  "created_at": "2026-05-28T17:52:00.000Z"
}
```

### 2.5. Coleção: `indicators`
* **Path:** `/indicators/{indicatorId}`
* **Descrição:** KPIs operacionais.
* **Modelo do Documento:**
```json
{
  "name": "Taxa de Conclusão de Projetos",
  "description": "Porcentagem de projetos previstos que foram concluídos no trimestre",
  "unit": "%", // %, horas, total
  "target": 90.00,
  "current": 85.00,
  "period": "mensal",
  "project_id": "projectId_123", // Opcional
  "owner_id": "uid_responsavel",
  "created_at": "2026-05-28T17:52:00.000Z",
  "updated_at": "2026-05-28T17:52:00.000Z"
}
```

### 2.6. Coleção: `metrics` (Consolidação de Dashboard)
* **Path:** `/metrics/global`
* **Descrição:** Documento único contendo todos os totais calculados para renderizar o Dashboard operacional instantaneamente.
* **Modelo do Documento:**
```json
{
  "projects_active": 4,
  "projects_done": 12,
  "projects_paused": 1,
  "projects_blocked": 0,
  "avg_progress": 72.5,
  "total_hours_month": 320.50, // Horas acumuladas de time_logs no mês corrente
  "expected_hours_month": 400, // Carga horária acumulada da equipe
  "productivity_pct": 80.12,
  "idleness_pct": 19.88,
  "last_updated": "2026-05-28T17:52:00.000Z"
}
```

### 2.7. Coleção: `audit_logs`
* **Path:** `/audit_logs/{logId}`
* **Descrição:** Histórico de alterações críticas de status.
* **Modelo do Documento:**
```json
{
  "user_id": "uid_operador",
  "user_email": "manoel.souza@uefs.br",
  "action": "UPDATE_STATUS", // INSERT | UPDATE_STATUS | DELETE
  "table_name": "projects", // projects | activities
  "record_id": "projectId_123",
  "old_status": "planejamento",
  "new_status": "em_andamento",
  "created_at": "2026-05-28T17:52:00.000Z"
}
```

---

## 3. Transações de Escrita Segura (Atomic Write Batch)

Sempre que um usuário realiza alterações que afetam somas ou estatísticas desnormalizadas, o front-end deve executar as operações em um **Write Batch** ou em uma **Firestore Transaction** para garantir a atomicidade e consistência dos contadores.

### Exemplo Lógico: Gravar `time_log`
Ao salvar um novo log de horas:
1. Criar o documento na coleção `/time_logs`.
2. Ler a atividade vinculada, adicionar as novas horas em seu campo `hours_executed`.
3. Ler o projeto vinculado, adicionar as novas horas em seu campo `executed_hours`.
4. Atualizar o documento `/metrics/global` somando as horas lançadas em `total_hours_month`.

Esta operação sincronizada garante que a aplicação não precise realizar consultas sob demanda de agregação cara, mantendo os custos do Spark Plan estritamente dentro da margem gratuita.

---

## 4. Configuração de Cache e Persistência do SDK Web

No cliente Next.js (SPA), a inicialização do Firebase deve ativar explicitamente o cache local.

```typescript
import { initializeApp } from "firebase/app";
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager 
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);

// Inicializa Firestore com persistência local em múltiplas abas
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});
```
