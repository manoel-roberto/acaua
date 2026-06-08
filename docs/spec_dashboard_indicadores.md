# Especificação Técnica de Implementação: Dashboard de Indicadores - Sistema Acauã

Esta especificação (SPEC) detalha a arquitetura, o design de interface, o fluxo de dados e os componentes necessários para implementar o **Dashboard Dinâmico e Reativo de Gestão** do Sistema Acauã. O painel deve consumir e renderizar de forma customizável os **42 KPIs cadastráveis** mapeados nos arquivos `catalogo_indicadores_acaua.json` e `gemini-code-1780497862613.json`.

---

## 1. Diretrizes de Arquitetura de Dados (Firebase Spark Plan Constraints)

Como o sistema opera sob o **plano gratuito do Firebase**, a arquitetura do Dashboard deve priorizar a economia de leituras e o processamento eficiente no cliente.

### 1.1. Otimização de Leituras
* **Agregações Globais Primeiro**: A tela inicial do Dashboard deve consumir exclusivamente o documento `/metrics/global` para carregar o resumo executivo imediato (FTE mensal, produtividade média, contagem de projetos por status).
* **Coleção `/indicators` (Metadados)**: Os 42 KPIs descritos nos arquivos JSON devem ser cadastrados no Firestore na coleção `/indicators`. O Dashboard carregará esta lista uma única vez para exibir a galeria de seleção ao gestor.
* **Processamento e Agrupamento em Memória (Client-Side)**: O Firestore não suporta `GROUP BY` ou operações de agregação nativas. 
  * O frontend deve carregar os documentos da coleção necessária (filtrando no Firestore por chaves indexadas, ex: `log_date >= inicio_do_mes` e limitando a consultas essenciais).
  * O agrupamento por setor, gerente, categoria ou indivíduo (especificados nos campos `group_by` dos indicadores) deve ser feito **em memória no cliente (JavaScript/TypeScript)** após a recuperação da lista.
* **Cache Offline Reativo**: Utilizar o `persistentLocalCache` configurado no singleton do Firebase para evitar novas requisições de rede ao alternar abas ou recarregar a página.

---

## 2. Layout da Interface (UX/UI Design)

O painel deve seguir a identidade visual escura (*dark theme*) de alta fidelidade do Sistema Acauã, utilizando a paleta de cores neutras e frias (Zinco, Emerald, Teal, Amber) e **eliminando tons de roxo/violeta** (restrição estética do Kit).

### 2.1. Grid do Dashboard e Abas de Visualização
O painel será dividido em 3 áreas principais:

```
┌────────────────────────────────────────────────────────────────────────┐
│  HEADER: Título, Setor do Usuário e Filtro Temporal Global             │
├────────────────────────────────────────────────────────────────────────┤
│  TABS: [Visão Geral]  [Projetos & Prazos]  [Capacidade & FTE]  [Rotinas]│
├────────────────────────────────────────────────────────────────────────┤
│  BARRA LATERAL DE FILTROS           │  GRID DE WIDGETS DINÂMICOS       │
│  - Setor (NGD, Financeiro...)       │  - Cards de KPIs                 │
│  - Gerente de Projeto               │  - Gráficos de Linha / Barras    │
│  - Colaborador                      │  - Matrizes e Tabelas de Alerta  │
│  - Prioridade                       │  - Botão (+) Adicionar Widget    │
└────────────────────────────────────────────────────────────────────────┘
```

1. **Visão Geral (Overview)**: Exibe a saúde geral do NGD com indicadores agregados (PFT geral, produtividade e alertas de subnotificação).
2. **Projetos & Prazos (Projects & Deadlines)**: Foco nos desvios de esforço, taxas de bloqueio e índices de aderência ao prazo (IAP).
3. **Capacidade & FTE (Capacity & Performance)**: Exibe alocações (IAC), ociosidade relativa por setor/cargo e horas extras.
4. **Rotinas & Operações (Operations)**: Foco em SLAs de atividades e aderência ao planejamento diário (APD).

### 2.2. Sistema de Filtros Avançados (Sidebar Reativa)
Os filtros aplicados na sidebar devem interagir dinamicamente com as queries do Firestore ou com as reduções feitas em memória:
* **Filtro Temporal**: Data de início e data de fim (recalcula dias úteis do mês para métricas de ociosidade).
* **Filtro Organizacional**: Filtra dados pelo setor associado ao projeto (`projects.setor`) ou do perfil (`profiles.setor`).
* **Filtro de Responsabilidade**: Filtra pelo Gerente de Projeto ou pelo Colaborador Executor.

---

## 3. Mecanismo de Renderização Dinâmica de Widgets

O frontend lerá a lista de documentos em `/indicators` que o gestor escolheu para o seu painel (armazenada no perfil do usuário, ex: `/profiles/{uid}.dashboard_widgets: []`) e renderizará o componente apropriado de acordo com `visualization.default_chart`:

### 3.1. Mapeamento de Tipos de Gráfico (usando Recharts ou similar)

#### 1. `"card"` (Métrica de Destaque Simples)
Exibe um número grande, título, descrição curta ao passar o mouse e uma barra de progresso ou indicador de desvio.
* **Exemplo**: `pfm_carteira_geral` (Progresso Físico Médio da Carteira).
* **Comportamento Visual**: 
  * Se o valor do indicador atingir o `target_benchmark.value` com base no `operator`: exibe em verde (`text-emerald-400`).
  * Se estiver abaixo: exibe em amarelo/laranja (`text-amber-500` / `text-orange-500`).

#### 2. `"bar_chart"` (Gráfico de Barras)
Exibe comparações categóricas.
* **Exemplo**: `desvio_esforco_por_categoria` ou `tor_ociosidade_por_cargo_mensal`.
* **Configuração**: Eixo X definido pelo campo `visualization.x_axis` e Eixo Y definido por `visualization.y_axis`. Barras estilizadas com gradiente de `emerald-500` para `teal-600`.

#### 3. `"line_chart"` (Gráfico de Linhas)
Exibe tendências ao longo do tempo.
* **Exemplo**: `ihe_serie_temporal_mensal` (Evolução Mensal de Horas Extras).
* **Configuração**: Linhas suaves (*monotone*) com marcador circular nos pontos de dados. Eixo X indexado por `mes_ano` ou `semana_ano`.

#### 4. `"pie_chart"` / `"donut_chart"` (Distribuição de Partes)
Exibe composição percentual.
* **Exemplo**: `dte_distribuicao_tematica_equipe` (Distribuição Temática do Esforço).
* **Configuração**: Cores distintas e harmoniosas para cada fatia (Emerald, Teal, Cyan, Slate, Zinc) com legenda interativa.

#### 5. `"table"` (Tabela de Dados Operacional)
Exibe listas ordenáveis e acionáveis para controle interno.
* **Exemplo**: `subnotificacao_critica_time_logs_diario` (Alerta Diário de Perfis sem Lançamento).
* **Configuração**: Cabeçalhos ordenáveis, paginação local, destaque em vermelho/laranja para linhas que violam o benchmark (ex: IAC > 100%).

---

## 4. Algoritmos de Cálculo em Memória (Fórmulas NoSQL)

Para os indicadores mais complexos que exigem cruzamentos e joins lógicos, o frontend executará as seguintes rotinas:

### 4.1. Cálculo da Taxa de Ociosidade Relativa (TOR)
```typescript
/**
 * Calcula a TOR individual ou agrupada por setor/cargo.
 * Requer: /time_logs do período e /profiles dos membros.
 */
function calcularOciosidade(
  timeLogs: TimeLog[], 
  profiles: UserProfile[], 
  diasUteis: number
) {
  return profiles.map(profile => {
    const horasEsperadas = (profile.carga_horaria / 5) * diasUteis;
    const horasLancadas = timeLogs
      .filter(log => log.person_id === profile.id)
      .reduce((sum, log) => sum + log.hours, 0);
      
    const ociosidadePercentual = horasEsperadas > 0
      ? Math.max(0, ((horasEsperadas - horasLancadas) / horasEsperadas) * 100)
      : 0;
      
    return {
      person_id: profile.id,
      person_name: profile.full_name,
      setor: profile.setor,
      cargo: profile.cargo,
      horas_esperadas: horasEsperadas,
      horas_executadas: horasLancadas,
      ociosidade_percentual: Number(ociosidadePercentual.toFixed(2))
    };
  });
}
```

### 4.2. Cálculo do Índice de Alocação de Capacidade (IAC)
```typescript
/**
 * Calcula o comprometimento de horas semanais em projetos ativos.
 * Requer: /projects ativos e /profiles dos colaboradores.
 */
function calcularIAC(projects: Project[], profiles: UserProfile[]) {
  return profiles.map(profile => {
    // Soma as horas alocadas do membro em todos os projetos vigentes
    const horasAlocadas = projects
      .filter(proj => proj.status === 'em_andamento' || proj.status === 'planejamento')
      .flatMap(proj => proj.members || [])
      .filter(member => member.id === profile.id)
      .reduce((sum, member) => sum + (member.allocated_hours || 0), 0);
      
    const iacPercentual = profile.carga_horaria > 0
      ? (horasAlocadas / profile.carga_horaria) * 100
      : 0;
      
    return {
      profile_id: profile.id,
      full_name: profile.full_name,
      setor: profile.setor,
      horas_alocadas: horasAlocadas,
      carga_horaria: profile.carga_horaria,
      iac_percentual: Number(iacPercentual.toFixed(2))
    };
  });
}
```

---

## 5. Script de Carga Inicial (Seeding)

Para carregar os metadados dos 42 indicadores no banco de dados Firestore, criaremos um script administrativo que executa uma transação de `writeBatch` carregando os arquivos JSON para a coleção `/indicators`.

### Exemplo de Estrutura de Documento em `/indicators/{indicatorId}`:
Cada documento cadastrado conterá a definição completa para que o interpretador de componentes do Dashboard saiba como renderizá-lo e que consulta disparar:

```json
{
  "title": "Progresso Físico Médio da Carteira (Geral)",
  "description": "Avalia a evolução física média de todos os projetos ativos...",
  "category": "prazo_e_entrega",
  "aggregation_type": "avg",
  "aggregation_field": "progress",
  "filter_collection": "projects",
  "filters": {
    "status": ["em_andamento", "planejamento", "bloqueado"],
    "archived": false
  },
  "group_by": null,
  "default_chart": "card",
  "target_benchmark_operator": ">=",
  "target_benchmark_value": 50,
  "target_benchmark_unit": "%"
}
```

---

## 6. Plano de Validação do Dashboard

Para garantir a acurácia dos dados exibidos e o controle de performance:
1. **Teste de Carga de Leituras**: Auditar a aba Network no console de desenvolvimento ao carregar o Dashboard para certificar que o cache do Firestore (`persistentLocalCache`) está impedindo leituras redundantes.
2. **Validação Matemática Cruzada**: Comparar o resultado do indicador `produtividade_global_mensal` gerado dinamicamente com o valor armazenado de forma incremental em `/metrics/global.productivity_pct`. Eles devem ser idênticos.
3. **Auditoria de Retrabalho e Reversão**: Validar se o widget de auditoria está identificando corretamente status anteriores usando as entradas da coleção `audit_logs` correspondentes a `UPDATE_STATUS`.
