# Relatório de Mapeamento de Dados e Catálogo de Indicadores - Sistema Acauã

Este documento serve como referência técnica e analítica para especialistas em gestão de processos e agentes de Inteligência Artificial. Ele descreve a estrutura de dados (NoSQL - Cloud Firestore) do Sistema Acauã, o comportamento de seus campos, as regras de integridade e propõe um catálogo completo de indicadores operacionais e estratégicos para a construção de painéis de controle (Dashboards).

---

## 1. Visão Geral da Arquitetura de Dados

O Sistema Acauã utiliza uma arquitetura **100% Serverless no Firebase Spark Plan (Free Tier)**. O banco de dados é o **Cloud Firestore** (NoSQL baseado em documentos). 

Como o Firestore cobra por operações de leitura e escrita e não suporta operações de junção (JOINs) nativas, a estrutura de dados adota **desnormalização controlada** e **atualizações atômicas incrementais** em lote (`writeBatch`).

### Convenções de Data e Hora
Todas as datas e horários no sistema são registrados no formato **ISO 8601** UTC (`YYYY-MM-DDTHH:mm:ss.sssZ`) para campos de data e hora cheios, ou no formato simples de data (`YYYY-MM-DD`) para campos organizados por dia.

---

## 2. Dicionário de Dados do Firestore (Coleções)

Abaixo estão listadas todas as coleções atualmente configuradas no Firestore do Sistema Acauã, com seus respectivos esquemas, propósitos e orientações para filtros analíticos.

### 2.1. Perfis de Usuário (`/profiles/{uid}`)
Armazena as credenciais, papéis de acesso, carga horária esperada e informações organizacionais de cada membro. O `uid` corresponde ao Firebase Auth UID do usuário.

| Campo | Tipo | Descrição / Valores Esperados | Utilidade Analítica e Filtros |
| :--- | :--- | :--- | :--- |
| `full_name` | `string` | Nome completo do usuário. | Agrupamento de produtividade por pessoa. |
| `email` | `string` | E-mail institucional do usuário (deve terminar em `@uefs.br`). | Chave única de login e auditoria. |
| `cargo` | `string` | Cargo oficial do usuário (ex: "Coordenador", "Desenvolvedor"). | Filtro de capacidade por hierarquia. |
| `funcao` | `string` | Função operacional do usuário (ex: "Líder de Projetos", "Suporte"). | Análise de especialidade de trabalho. |
| `setor` | `string` | Nome do setor associado ao usuário. Vinculado a `/sectors`. | **Crítico:** Agrupa métricas de esforço setorial. |
| `carga_horaria` | `number` | Carga horária semanal esperada em horas (ex: `40`, `20`). | Denominador para cálculo de ociosidade/capacidade. |
| `avatar_url` | `string` | Link para a imagem de avatar do usuário. | Apenas exibição na UI. |
| `role` | `string` | Papel no controle de acesso: `"admin"`, `"analista"` ou `"cliente"`. | Permissões de escrita/leitura operacionais. |
| `active` | `boolean` | Indica se o usuário está ativo no sistema. | Filtro para desconsiderar membros desligados de métricas de capacidade. |
| `created_at` | `string` | Data de criação do perfil no formato ISO 8601. | Análise de tempo de casa/turnover. |
| `updated_at` | `string` | Data da última atualização de dados. | Auditoria de mudanças cadastrais. |

---

### 2.2. Projetos (`/projects/{projectId}`)
Armazena a estrutura de projetos sob gestão do núcleo.

| Campo | Tipo | Descrição / Valores Esperados | Utilidade Analítica e Filtros |
| :--- | :--- | :--- | :--- |
| `id` | `string` | ID único gerado pelo Firestore. | Identificador do projeto. |
| `name` | `string` | Nome do projeto. | Rótulo principal para relatórios. |
| `description`| `string` | Descrição detalhada dos objetivos do projeto. | Processamento de linguagem natural (PLN). |
| `status` | `string` | `"planejamento"`, `"em_andamento"`, `"pausado"`, `"bloqueado"`, `"concluido"`, `"cancelado"`, `"arquivado"`. | **Filtro Primário:** Saúde da carteira de projetos. |
| `category` | `string` | Categoria normalizada (ex: `"automacao"`, `"dados"`, `"desenvolvimento"`). | Classificação estratégica do esforço. |
| `priority` | `string` | `"baixa"`, `"media"`, `"alta"`, `"critica"`. | Priorização de alocação de equipe. |
| `progress` | `number` | Progresso atual do projeto em percentual (0 a 100). | Cálculo de desvio de execução física. |
| `start_date` | `string` | Data de início real/planejada (`YYYY-MM-DD`). | Análise temporal de início de ciclos. |
| `end_date` | `string \| null` | Data em que o projeto foi concluído real (`YYYY-MM-DD` ou `null`). | Cálculo de tempo de ciclo (Cycle Time) real. |
| `deadline` | `string` | Prazo fatal de entrega estipulado (`YYYY-MM-DD`). | Cálculo de desvio de prazo e atrasos. |
| `codigo_processo_sei` | `string` | Código do processo SEI associado ao projeto. | Rastreabilidade burocrática institucional. |
| `numero_sei` | `string` | Número SEI opcional. | Rastreabilidade adicional. |
| `origem_demanda` | `string` | Nome do setor que solicitou o projeto (vinculado ao nome de `/sectors`). | Análise de demandas por setor externo. |
| `estimated_hours` | `number` | Total de horas estimadas para a entrega total do projeto. | Orçamento de esforço (Baseline). |
| `executed_hours` | `number` | Total de horas efetivamente executadas no projeto (soma de logs). | Custo atualizado do projeto em esforço. |
| `observations` | `string` | Observações gerais ou impedimentos. | Análise qualitativa de bloqueios. |
| `tags` | `array[string]` | Marcadores adicionais flexíveis. | Filtros dinâmicos customizados. |
| `archived` | `boolean` | Indica se o projeto foi arquivado. | Ocultação de projetos históricos da visão ativa. |
| `responsible_id` | `string` | UID do perfil responsável pelo projeto (`/profiles/{uid}`). | Identificação do Gerente de Projetos (GP). |
| `responsible_name` | `string` | Nome do perfil responsável (desnormalizado). | Evita leitura de perfil na renderização de locais/listas. |
| `members` | `array[object]`| Lista de membros alocados no projeto. Ver estrutura abaixo. | Análise de equipe e alocação de FTE. |
| `created_by` | `string` | UID do criador do documento. | Rastreabilidade de criação. |
| `created_at` | `string` | Data de criação (ISO 8601). | Data de entrada da demanda no funil. |
| `updated_at` | `string` | Data de última atualização (ISO 8601). | Controle de atualização das métricas do projeto. |

#### Estrutura do objeto dentro do array `members` (Membros do Projeto):
* `profile_id` (string): UID do usuário em `/profiles`.
* `full_name` (string): Nome do membro (desnormalizado).
* `role_in_project` (string): Papel no projeto (`"responsavel"`, `"colaborador"`, `"observador"`).
* `allocated_hours` (number): Horas dedicadas semanalmente a este projeto.

---

### 2.3. Atividades (`/activities/{activityId}`)
Registra tarefas atômicas associadas a projetos, rotinas de trabalho ou demandas espontâneas.

| Campo | Tipo | Descrição / Valores Esperados | Utilidade Analítica e Filtros |
| :--- | :--- | :--- | :--- |
| `id` | `string` | ID único da atividade. | Identificador único. |
| `title` | `string` | Título descritivo da atividade. | Descrição rápida da tarefa. |
| `description`| `string` | Descrição das tarefas realizadas. | Análise qualitativa de escopo. |
| `responsible_id` | `string` | UID do responsável pela execução. | Filtro de carga de trabalho individual. |
| `responsible_name` | `string` | Nome do executor (desnormalizado). | Agrupamento visual imediato. |
| `project_id` | `string \| null` | ID do projeto ou `null` se for atividade sem projeto. | Relacionamento com a carteira de projetos. |
| `project_name` | `string \| null` | Nome do projeto (desnormalizado) ou `null`. | Filtro e rotulação direta. |
| `routine_id` | `string \| null` | ID da rotina recorrente de origem (se houver) ou `null`. | Vinculação com o plano de rotinas. |
| `type` | `string` | Tipo de atividade (ex: `"rotina"`, `"projeto"`, `"capacitacao"`, `"reuniao"`, `"atendimento"`, `"suporte"`). | **Análise de Categoria de Tempo:** Onde a equipe gasta energia. |
| `status` | `string` | `"pendente"`, `"em_andamento"`, `"concluida"`, `"cancelada"`, `"bloqueada"`, `"arquivado"`. | Fluxo de entrega (SLA / Kanban). |
| `priority` | `string` | `"baixa"`, `"media"`, `"alta"`, `"critica"`. | Prioridade de atendimento. |
| `activity_date` | `string` | Dia planejado para a execução (`YYYY-MM-DD`). | Planejamento diário e prazos de conclusão. |
| `start_time_planned` | `string` | Hora de início planejada (`HH:MM`). | Grade de agendamento diário. |
| `end_time_planned` | `string` | Hora de término planejada (`HH:MM`). | Grade de agendamento diário. |
| `start_time_executed` | `string` | Hora de início real executada (`HH:MM`). | Análise de aderência à escala. |
| `end_time_executed` | `string` | Hora de término real executada (`HH:MM`). | Análise de aderência à escala. |
| `hours_planned` | `number` | Horas planejadas para execução desta tarefa. | Estimativa de esforço diário. |
| `hours_executed` | `number` | Horas executadas (somadas via `time_logs`). | Realizado de esforço diário. |
| `observations` | `string` | Observações adicionais ou notas de andamento. | Histórico de impedimentos. |
| `tags` | `array[string]`| Etiquetas dinâmicas. | Filtros cruzados. |
| `archived` | `boolean` | Indica se a atividade foi arquivada. | Limpeza visual de backlog. |
| `created_by` | `string` | UID do criador. | Rastreabilidade. |
| `created_at` | `string` | Data de criação (ISO 8601). | Tempo de vida da tarefa no backlog. |
| `updated_at` | `string` | Data de atualização (ISO 8601). | Controle de sincronização de status. |

---

### 2.4. Lançamentos de Horas (`/time_logs/{logId}`)
Registra o consumo real de tempo da equipe. Cada log aponta obrigatoriamente para um executor e pode apontar para uma atividade e/ou projeto específico.

| Campo | Tipo | Descrição / Valores Esperados | Utilidade Analítica e Filtros |
| :--- | :--- | :--- | :--- |
| `id` | `string` | ID único do lançamento. | Identificador único. |
| `person_id` | `string` | UID do usuário que executou as horas (`/profiles/{uid}`). | Controle de apropriação de tempo individual. |
| `person_name` | `string` | Nome do usuário (desnormalizado). | Agrupamento de horas trabalhadas por profissional. |
| `activity_id`| `string \| null`| ID da atividade relacionada ou `null` se log espontâneo. | Apropriação de esforço ao nível de tarefa. |
| `activity_title`| `string \| null`| Título da atividade (desnormalizado) ou `null`. | Contexto imediato da tarefa. |
| `project_id` | `string \| null`| ID do projeto relacionado ou `null`. | Apropriação de esforço ao nível de projeto. |
| `project_name`| `string \| null`| Nome do projeto (desnormalizado) ou `null`. | Agrupamento de horas por projeto. |
| `log_date` | `string` | Data em que o trabalho foi realizado (`YYYY-MM-DD`). | Série temporal de consumo de esforço. |
| `hours` | `number` | Quantidade de horas (ou frações decimais, ex: `2.5`). | **Métrica Base de Esforço.** |
| `description`| `string` | Detalhamento do que foi realizado no período lançado. | Descrição do entregável físico daquele bloco de tempo. |
| `is_overtime`| `boolean` | Marcação se as horas são consideradas extraordinárias. | Gestão de horas extras/banco de horas. |
| `created_at` | `string` | Data em que o lançamento foi criado (ISO 8601). | Rastreabilidade e análise de atraso de lançamento. |

---

### 2.5. Rotinas Recorrentes (`/recurring_routines/{routineId}`)
Parametriza a geração automatizada de atividades recorrentes com base em intervalos de tempo pré-estabelecidos.

| Campo | Tipo | Descrição / Valores Esperados | Utilidade Analítica e Filtros |
| :--- | :--- | :--- | :--- |
| `id` | `string` | ID único da rotina. | Identificador único. |
| `title` | `string` | Título da rotina que será replicada nas atividades geradas. | Identificação do processo padronizado. |
| `description`| `string` | Detalhamento operacional do processo de rotina. | Instruções de trabalho padrão (POP). |
| `project_id` | `string \| null`| ID do projeto associado (se for rotina de projeto). | Vinculação com a carteira de projetos. |
| `project_name`| `string \| null`| Nome do projeto (desnormalizado) ou `null`. | Visualização simplificada. |
| `type` | `string` | Tipo da rotina (ex: `"rotina"`, `"capacitacao"`, `"reuniao"`, `"suporte"`). | Classificação do processo recorrente. |
| `priority` | `string` | `"baixa"`, `"media"`, `"alta"`, `"critica"`. | Prioridade padrão das tarefas criadas. |
| `start_time_planned`| `string` | Hora padrão de início (`HH:MM`). | Planejamento de grade. |
| `end_time_planned` | `string` | Hora padrão de término (`HH:MM`). | Planejamento de grade. |
| `hours_planned` | `number` | Horas planejadas de execução para cada ocorrência. | Previsibilidade de esforço futuro. |
| `observations` | `string` | Observações da parametrização. | Notas gerais de gestão. |
| `tags` | `array[string]`| Etiquetas dinâmicas. | Filtros dinâmicos. |
| `frequency` | `string` | `"hora"`, `"dia"`, `"semana"`, `"mes"`, `"ano"`. | Intervalo de repetição do processo. |
| `interval` | `number` | Intervalo numérico para a frequência (ex: a cada `2` semanas). | Multiplicador de periodicidade. |
| `week_days` | `array[number]`| Dias da semana da execução (0 = Dom, ..., 6 = Sab). | Agendamento semanal detalhado. |
| `active` | `boolean` | Se `true`, o worker gerará novas atividades operacionais. | Desativação temporária do processo. |
| `last_run` | `string \| null`| Data da última geração de atividade (`YYYY-MM-DD`). | Monitoramento da automação de processos. |
| `next_run` | `string` | Data planejada da próxima geração (`YYYY-MM-DD`). | Fila de execução do worker. |
| `created_by` | `string` | UID do criador do processo. | Rastreabilidade. |
| `created_at` | `string` | Data de criação (ISO 8601). | Data de padronização do processo. |
| `updated_at` | `string` | Data de última atualização (ISO 8601). | Auditoria de parâmetros do processo. |

---

### 2.6. Auditoria de Alterações (`/audit_logs/{logId}`)
Documentos append-only que registram mudanças críticas de status nos projetos e atividades do sistema.

| Campo | Tipo | Descrição / Valores Esperados | Utilidade Analítica e Filtros |
| :--- | :--- | :--- | :--- |
| `id` | `string` | ID único do log. | Identificador único. |
| `user_id` | `string` | UID do usuário que realizou a ação. | Identificação do autor da modificação. |
| `user_email` | `string` | E-mail do autor da modificação. | Rótulo legível para relatórios de auditoria. |
| `action` | `string` | `"INSERT"`, `"UPDATE_STATUS"`, `"DELETE"`. | Ação controlada. |
| `table_name` | `string` | `"projects"` ou `"activities"`. | Entidade que sofreu a modificação. |
| `record_id` | `string` | ID do documento modificado. | Rastreabilidade com o item original. |
| `old_status` | `string` | Status anterior à modificação. | Análise de tempo de permanência em status. |
| `new_status` | `string` | Novo status estabelecido. | Detecção de gargalos (ex: muitos bloqueios). |
| `created_at` | `string` | Data e hora exatas do evento (ISO 8601). | Linha do tempo da auditoria. |

---

### 2.7. Agregações Dashboard (`/metrics/global`)
Documento único e centralizado para leitura rápida das principais estatísticas de desempenho operacional no Dashboard principal, reduzindo a cobrança de queries pesadas no Firestore Spark Plan.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `projects_active` | `number` | Quantidade de projetos nos status `em_andamento` ou `planejamento`. |
| `projects_done` | `number` | Quantidade de projetos concluídos (`status == "concluido"`). |
| `projects_paused` | `number` | Quantidade de projetos pausados (`status == "pausado"`). |
| `projects_blocked` | `number` | Quantidade de projetos bloqueados (`status == "bloqueado"`). |
| `avg_progress` | `number` | Média aritmética do progresso de todos os projetos ativos. |
| `total_hours_month` | `number` | Soma total de horas registradas (`time_logs`) no mês corrente. |
| `expected_hours_month`| `number` | Horas de trabalho contratadas esperadas no mês (soma dos perfis ativos). |
| `productivity_pct` | `number` | Taxa de produtividade agregada calculada para a equipe (%). |
| `idleness_pct` | `number` | Taxa de ociosidade agregada calculada para a equipe (%). |
| `archive_days_limit`| `number` | Prazo limite de dias para arquivamento automático (ex: 30 dias). |
| `last_updated` | `string` | Data e hora da última sincronização agregada (ISO 8601). |

---

### 2.8. Tabelas de Configuração Auxiliares
As coleções abaixo representam registros de apoio cadastrados de forma dinâmica para padronização de campos de seleção e filtros no frontend:

#### Setores organizacionais (`/sectors/{sectorId}`)
* `id` (string): ID único do setor.
* `name` (string): Nome do setor institucional (ex: `"NGD"`, `"PROAD"`, `"DCCA"`).
* `created_at` (string): Data de criação (ISO 8601).

#### Categorias de Projeto (`/categories/{categoryId}`)
* `id` (string): ID único da categoria.
* `name` (string): Nome amigável (ex: `"Infraestrutura"`).
* `key` (string): Chave normalizada para vinculação no banco (ex: `"infraestrutura"`).
* `created_at` (string): Data de criação (ISO 8601).

#### Tipos de Atividade (`/activity_types/{typeId}`)
* `id` (string): ID único do tipo.
* `name` (string): Nome amigável (ex: `"Reunião"`).
* `key` (string): Chave normalizada para vinculação no banco (ex: `"reuniao"`).
* `created_at` (string): Data de criação (ISO 8601).

---

## 3. Catálogo de Indicadores e Métricas de Controle de Processos

Esta seção detalha o catálogo de indicadores que podem ser selecionados para compor o Dashboard do Gestor. Cada indicador aponta a sua fórmula exata e quais filtros o especialista pode utilizar para navegar nos desvios.

### 3.1. Indicadores de Gestão de Projetos e Demandas

#### 3.1.1. Progresso Físico Médio da Carteira (PFM)
* **Objetivo:** Avaliar a evolução física média dos projetos em andamento.
* **Fórmula:** 
  $$\text{PFM} = \frac{\sum_{i=1}^{N} \text{Project.progress}_i}{N}$$
  *(Onde $N$ é o número de projetos ativos com `status` em `["em_andamento", "planejamento", "bloqueado"]` e `archived == false`)*
* **Coleções Envolvidas:** `/projects`
* **Filtros de Apoio:** Por `category` (Categoria do Projeto) e por `responsible_id` (Gerente Responsável).
* **Interpretação:** Valores baixos indicam que os projetos estão travados nas etapas iniciais ou intermediárias.

#### 3.1.2. Desvio de Escopo e Esforço (Orçado vs. Realizado)
* **Objetivo:** Identificar projetos com subestimativa ou superestimativa de horas.
* **Fórmula:**
  $$\text{Desvio Esforço} = \frac{\text{Project.executed_hours} - \text{Project.estimated_hours}}{\text{Project.estimated_hours}} \times 100$$
* **Coleções Envolvidas:** `/projects`
* **Filtros de Apoio:** Por `category` (tipo de desenvolvimento) e por `responsible_id`.
* **Interpretação:** 
  * Acima de $0\%$: Projeto estourou o orçamento de horas.
  * Abaixo de $0\%$: Projeto economizou horas ou está subdimensionado.

#### 3.1.3. Índice de Aderência ao Prazo (IAP)
* **Objetivo:** Medir a pontualidade na entrega dos projetos concluídos.
* **Fórmula:**
  $$\text{Dias de Desvio} = \text{Project.end_date} - \text{Project.deadline}$$
  *(Se a data de conclusão for anterior ou igual ao prazo limite, o atraso é nulo ou negativo - adiantado)*
* **Coleções Envolvidas:** `/projects`
* **Filtros de Apoio:** Por `origem_demanda` (setor cliente) para identificar gargalos de homologação externa.
* **Interpretação:** Média de dias de desvio deve ser próxima ou menor que 0. Valores consistentemente positivos indicam falhas crônicas de planejamento temporal.

#### 3.1.4. Taxa de Bloqueio da Carteira (TBC)
* **Objetivo:** Monitorar o volume de projetos paralisados por impedimentos externos ou internos.
* **Fórmula:**
  $$\text{TBC} = \frac{\text{Qtd. Projetos com status == "bloqueado"}}{\text{Qtd. Total de Projetos Ativos}} \times 100$$
* **Coleções Envolvidas:** `/projects`
* **Filtros de Apoio:** Mapear através de `/audit_logs` os motivos de bloqueio informados nas `observations`.
* **Interpretação:** Acima de $15\%$ da carteira bloqueada aponta para alta dependência externa ou problemas de governança institucional.

---

### 3.2. Indicadores de Produtividade, Tempo e Alocação (FTE)

#### 3.2.1. Taxa de Ociosidade Relativa (TOR)
* **Objetivo:** Avaliar se a carga horária contratual acordada está sendo convertida em lançamentos de atividades produtivas.
* **Fórmula:**
  $$\text{Horas Esperadas Individuais} = \frac{\text{Profile.carga_horaria}}{5} \times \text{Dias Úteis no Período}$$
  $$\text{TOR} = \left( 1 - \frac{\sum \text{TimeLog.hours}}{\text{Horas Esperadas Individuais}} \right) \times 100$$
* **Coleções Envolvidas:** `/time_logs` (agrupando por `person_id`), `/profiles`
* **Filtros de Apoio:** Por `profiles.setor` (Setor organizacional) e `profiles.cargo`.
* **Interpretação:** Taxa ideal está entre $10\%$ e $20\%$ (margem para atividades administrativas não documentadas, pausas e treinamento). Valores acima de $30\%$ sugerem subnotificação de logs de tempo ou falta de distribuição de trabalho.

#### 3.2.2. Índice de Horas Extraordinárias (IHE)
* **Objetivo:** Monitorar sobrecarga de membros da equipe ou desalinhamento de capacidade.
* **Fórmula:**
  $$\text{IHE} = \frac{\sum \text{TimeLog.hours} \text{ (onde is\_overtime == true)}}{\sum \text{TimeLog.hours} \text{ (total)}} \times 100$$
* **Coleções Envolvidas:** `/time_logs`
* **Filtros de Apoio:** Agrupamento temporal por `log_date` (Mês/Semana) e individual por `person_id`.
* **Interpretação:** Valores altos indicam gargalo de equipe (necessidade de contratação ou redução de escopo).

#### 3.2.3. Distribuição Temática do Esforço (DTE)
* **Objetivo:** Entender a matriz de investimento de tempo da equipe por tipo de trabalho.
* **Fórmula:**
  $$\text{DTE (tipo)} = \frac{\sum \text{TimeLog.hours} \text{ (lançados em atividades do tipo } X)}{\sum \text{TimeLog.hours} \text{ (total lançados no período)}} \times 100$$
* **Coleções Envolvidas:** `/time_logs` mapeado ao `type` da `/activities` correspondente.
* **Filtros de Apoio:** Agrupado por `activity.type` (ex: Rotina, Suporte, Projeto, Reunião, Capacitação).
* **Interpretação:** Idealmente, equipes de desenvolvimento devem ter esforço concentrado em `"projeto"` e `"capacitacao"` ($> 50\%$). Um percentual excessivo em `"suporte"` ($> 30\%$) indica instabilidade nos sistemas desenvolvidos. Um percentual alto em `"reuniao"` ($> 20\%$) aponta excesso de reuniões (reuniófase).

#### 3.2.4. Índice de Alocação de Capacidade (IAC)
* **Objetivo:** Verificar se a soma dos compromissos alocados aos membros nos projetos ativos excede ou subtrai a capacidade produtiva deles.
* **Fórmula:**
  $$\text{IAC (individual)} = \frac{\sum \text{Project.members[i].allocated\_hours}}{\text{Profile.carga\_horaria}} \times 100$$
* **Coleções Envolvidas:** `/projects`, `/profiles`
* **Filtros de Apoio:** Por `profile.setor` ou indivíduo.
* **Interpretação:** 
  * Acima de $100\%$: O profissional está sobrealocado (risco de burnout/atrasos).
  * Abaixo de $70\%$: O profissional possui capacidade ociosa para novos projetos.

---

### 3.3. Indicadores de Controle de Operações e Rotinas

#### 3.3.1. Aderência ao Planejamento Diário de Tarefas (APD)
* **Objetivo:** Medir se as tarefas programadas para um determinado dia estão sendo realizadas no prazo pactuado.
* **Fórmula:**
  $$\text{APD} = \frac{\text{Qtd. Atividades concluídas com success em (activity\_date)}}{\text{Qtd. Total de Atividades planejadas para (activity\_date)}} \times 100$$
* **Coleções Envolvidas:** `/activities`
* **Filtros de Apoio:** Por `responsible_id` e por `project_id`.
* **Interpretação:** Valores inferiores a $80\%$ indicam planejamento irreal de atividades diárias ou constantes interrupções inesperadas (urgências).

#### 3.3.2. Índice de Desvio de Duração de Tarefa (IDDT)
* **Objetivo:** Avaliar a precisão da equipe em estimar a duração de tarefas específicas.
* **Fórmula:**
  $$\text{IDDT} = \frac{\text{Activity.hours\_executed} - \text{Activity.hours\_planned}}{\text{Activity.hours\_planned}} \times 100$$
* **Coleções Envolvidas:** `/activities`
* **Filtros de Apoio:** Por `activity.type` e `activity.responsible_id`.
* **Interpretação:** Desvios sistemáticos acima de $+20\%$ mostram necessidade de capacitação em estimativas. Desvios negativos severos ($-50\%$) podem apontar para tarefas superestimadas.

#### 3.3.3. SLA de Atendimento de Atividades
* **Objetivo:** Medir o tempo de resposta/resolução de tarefas urgentes.
* **Fórmula:**
  $$\text{Tempo de Resolução} = \text{Activity.updated\_at} \text{ (quando status for concluida)} - \text{Activity.created\_at}$$
* **Coleções Envolvidas:** `/activities`
* **Filtros de Apoio:** Filtrar por atividades onde `priority == "critica"` ou `priority == "alta"`.
* **Interpretação:** Mede em horas ou dias o tempo de atendimento. Ideal para monitorar suporte e infraestrutura.

#### 3.3.4. Eficiência de Geração de Rotinas Recorrentes (EGR)
* **Objetivo:** Garantir que processos repetitivos ocorram sem interrupções humanas e nos prazos corretos.
* **Fórmula:**
  $$\text{Desvio da Execução da Rotina} = \text{Activity.activity\_date} - \text{RecurringRoutine.next\_run} \text{ (esperado)}$$
* **Coleções Envolvidas:** `/activities`, `/recurring_routines`
* **Filtros de Apoio:** Filtrar por `recurring_routine.id`.
* **Interpretação:** Qualquer valor diferente de 0 aponta para falhas de processamento no worker/cron que gera as tarefas automáticas.

---

### 3.4. Indicadores de Auditoria e Controle Interno

#### 3.4.1. Frequência de Alterações Críticas (FAC)
* **Objetivo:** Medir a estabilidade da carteira de projetos e das atividades (evitar constantes mudanças de status sem entrega efetiva).
* **Fórmula:**
  $$\text{FAC} = \text{Contagem de documentos em } /audit\_logs \text{ no período de tempo } T$$
* **Coleções Envolvidas:** `/audit_logs`
* **Filtros de Apoio:** Filtrar por `table_name` (saber se mudam mais projetos ou tarefas) e por `user_id` (quem está alterando).
* **Interpretação:** Um alto volume de mudanças de status de `"em_andamento"` para `"pausado"` ou `"bloqueado"` indica desalinhamento de planejamento.

#### 3.4.2. Tempo Médio em Status de Bloqueio (TMSB)
* **Objetivo:** Medir a velocidade de resposta da gestão para destravar atividades/projetos.
* **Fórmula:**
  Para um mesmo `record_id` no `/audit_logs`:
  $$\text{Tempo Bloqueio} = \text{AuditLog.created\_at} \text{ (status != "bloqueado")} - \text{AuditLog.created\_at} \text{ (status == "bloqueado")}$$
* **Coleções Envolvidas:** `/audit_logs`
* **Filtros de Apoio:** Por `table_name` e pelo gerente do projeto/tarefa.
* **Interpretação:** Quanto menor o TMSB, mais ágil é a resolução de problemas pela gerência e liderança do núcleo.

---

## 4. Guia de Implementação e Filtros para o Dashboard do Gestor

Para disponibilizar esses indicadores para seleção do gestor, a interface do dashboard deve permitir o cruzamento dessas métricas a partir dos seguintes filtros comuns:

### 1. Eixo Temporal (Período)
* **Mapeamento:** Comparar `time_logs.log_date`, `activities.activity_date` ou `projects.start_date` com o intervalo de datas selecionado.
* **Granularidade:** Diária, Semanal, Mensal ou Anual.

### 2. Eixo Organizacional (Setor)
* **Mapeamento:** Filtrar os logs de horas com base no `profile.setor` do usuário executor.
* **Utilidade:** Permite comparar o consumo de esforço de desenvolvimento do setor **NGD** em relação às demandas originadas de outros setores (e.g. **PROAD**).

### 3. Eixo de Responsabilidade (Pessoas)
* **Mapeamento:** Filtrar por `responsible_id` (nas tabelas de projetos e atividades) ou `person_id` (nos logs de horas).
* **Utilidade:** Identificação de gargalos individuais e análise de sobrecarga de trabalho.

### 4. Eixo Operacional (Projetos e Processos)
* **Mapeamento:** Filtrar atividades por `project_id` (vinculado a projetos específicos) ou por `routine_id` (vinculado a processos recorrentes).
* **Utilidade:** Ajuda o gestor a entender se o tempo do setor está sendo consumido por projetos estratégicos ou por rotinas de manutenção.

---

## 5. Fluxos de Sincronização e Regras de Negócio do Banco NoSQL

Para garantir que o especialista de gestão entenda como os dados são consolidados, as seguintes regras do backend devem ser observadas:

1. **Apropriação de Esforço em Tempo Real (Logs para Projetos/Atividades):**
   * Ao criar um `/time_logs` (consumo de esforço), o sistema executa um `writeBatch` que adiciona as horas ao log, incrementa o campo `hours_executed` na `/activities` correspondente, e incrementa o campo `executed_hours` no `/projects` associado.
   * O dashboard de indicadores deve se apoiar nesses campos consolidados nos documentos principais, evitando ler todos os `time_logs` individuais para calcular o total de esforço de um projeto.
2. **Histórico Imutável de Auditoria:**
   * Qualquer alteração de status em `/projects` ou `/activities` dispara um registro em `/audit_logs`. Esse registro é append-only e as regras do Firestore bloqueiam qualquer alteração ou exclusão deste log para garantir a confiabilidade dos dados para indicadores de ciclo.
3. **Consolidação de Métricas Globais:**
   * O documento `/metrics/global` centraliza métricas de alto nível que mudam dinamicamente. Ele deve ser atualizado de forma incremental sempre que as operações de mudança ocorrem, permitindo que a IA do gestor acesse um resumo do status da operação em uma única leitura.
