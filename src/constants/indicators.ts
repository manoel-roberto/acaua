export interface Indicator {
  id: string;
  title: string;
  description: string;
  category: "prazo_e_entrega" | "esforco_e_capacidade" | "eficiencia" | "qualidade_e_operacoes" | "auditoria_e_controle";
  aggregation: {
    type: "sum" | "avg" | "count" | "percentage" | "ratio";
    field: string;
  };
  dimensions: {
    filter_collection: "projects" | "activities" | "time_logs" | "profiles" | "audit_logs";
    filters: Record<string, any>;
    group_by: string | null;
  };
  formula_logic: string;
  visualization: {
    default_chart: "card" | "bar_chart" | "line_chart" | "pie_chart" | "table";
    x_axis: string | null;
    y_axis: string;
  };
  target_benchmark: {
    operator: "==" | ">=" | "<=" | ">" | "<";
    value: number;
    unit: string;
  };
}

export const ALL_INDICATORS: Indicator[] = [
  // --- INDICADORES DE PRAZO E ENTREGA ---
  {
    id: "pfm_carteira_geral",
    title: "Progresso Físico Médio da Carteira (Geral)",
    description: "Avalia a evolução física média de todos os projetos ativos de forma unificada. Serve como termômetro do avanço global dos cronogramas.",
    category: "prazo_e_entrega",
    aggregation: { type: "avg", field: "projects.progress" },
    dimensions: {
      filter_collection: "projects",
      filters: { status: ["em_andamento", "planejamento", "bloqueado"], archived: false },
      group_by: null
    },
    formula_logic: "Lógica: Média de progress (avanço físico) para todos os documentos da coleção /projects onde status está em ['em_andamento', 'planejamento', 'bloqueado'] AND archived == false.",
    visualization: { default_chart: "card", x_axis: null, y_axis: "progresso_medio" },
    target_benchmark: { operator: ">=", value: 50, unit: "%" }
  },
  {
    id: "pfm_carteira_por_setor",
    title: "Progresso Físico Médio da Carteira por Setor",
    description: "Apresenta o avanço médio dos projetos agrupado pelo setor organizacional ao qual pertencem. Útil para identificar desequilíbrios de ritmo entre áreas.",
    category: "prazo_e_entrega",
    aggregation: { type: "avg", field: "projects.progress" },
    dimensions: {
      filter_collection: "projects",
      filters: { status: ["em_andamento", "planejamento", "bloqueado"], archived: false },
      group_by: "setor"
    },
    formula_logic: "Lógica: Média de progress (avanço físico) agrupada pelo setor do responsável do projeto para todos os documentos da coleção /projects onde status está em ['em_andamento', 'planejamento', 'bloqueado'] AND archived == false.",
    visualization: { default_chart: "bar_chart", x_axis: "setor", y_axis: "progresso_medio" },
    target_benchmark: { operator: ">=", value: 50, unit: "%" }
  },
  {
    id: "sla_resolucao_atividades_criticas",
    title: "SLA de Resolução de Atividades Críticas e de Alta Prioridade",
    description: "Mede o tempo médio (em horas) desde a criação até a conclusão de atividades de prioridade 'critica' ou 'alta'. Fundamental para monitorar contratos de nível de serviço.",
    category: "prazo_e_entrega",
    aggregation: { type: "avg", field: "activities.updated_at" },
    dimensions: {
      filter_collection: "activities",
      filters: { priority: ["critica", "alta"], status: "concluida" },
      group_by: null
    },
    formula_logic: "Lógica: Média de horas decorridas entre a data de criação (created_at) e a de conclusão (updated_at) para todas as atividades da coleção /activities onde status == 'concluida' AND priority está em ['critica', 'alta'].",
    visualization: { default_chart: "card", x_axis: null, y_axis: "horas_resolucao" },
    target_benchmark: { operator: "<=", value: 48, unit: "horas" }
  },
  {
    id: "sla_resolucao_por_tipo_atividade",
    title: "SLA Médio de Resolução por Tipo de Atividade",
    description: "Compara o tempo médio de conclusão entre os diferentes tipos de atividade (suporte, reuniao, projeto, etc.), evidenciando quais categorias de trabalho demoram mais para ser finalizadas.",
    category: "prazo_e_entrega",
    aggregation: { type: "avg", field: "activities.updated_at" },
    dimensions: {
      filter_collection: "activities",
      filters: { status: "concluida" },
      group_by: "type"
    },
    formula_logic: "Lógica: Média de horas decorridas entre a data de criação (created_at) e a de conclusão (updated_at) agrupada pelo tipo da atividade para todos os documentos da coleção /activities onde status == 'concluida'.",
    visualization: { default_chart: "bar_chart", x_axis: "type", y_axis: "horas_resolucao_media" },
    target_benchmark: { operator: "<=", value: 72, unit: "horas" }
  },
  {
    id: "iap_desvio_prazo_por_categoria",
    title: "Índice de Aderência ao Prazo por Categoria de Projeto",
    description: "Avalia o atraso médio em dias agrupado por categoria estratégica. Permite identificar se projetos de uma natureza específica (ex: dados) sofrem gargalos crônicos de prazo.",
    category: "prazo_e_entrega",
    aggregation: { type: "avg", field: "projects.end_date" },
    dimensions: {
      filter_collection: "projects",
      filters: { status: "concluido" },
      group_by: "category"
    },
    formula_logic: "Lógica: Média da diferença de dias entre a data de conclusão (end_date) e o prazo limite planejado (deadline) agrupada pela categoria estratégica para todos os documentos da coleção /projects onde status == 'concluido'.",
    visualization: { default_chart: "bar_chart", x_axis: "category", y_axis: "desvio_dias_medio" },
    target_benchmark: { operator: "<=", value: 0, unit: "dias" }
  },
  {
    id: "tempo_ciclo_medio_por_setor_demandante",
    title: "Tempo de Ciclo Médio de Projetos por Setor Demandante",
    description: "Mede o lead time médio (em dias) do início à conclusão de projetos, agrupado pelo setor que originou a demanda. Revela se as requisições de determinados clientes internos sofrem com lentidão estrutural.",
    category: "prazo_e_entrega",
    aggregation: { type: "avg", field: "projects.end_date" },
    dimensions: {
      filter_collection: "projects",
      filters: { status: "concluido" },
      group_by: "origem_demanda"
    },
    formula_logic: "Lógica: Média do tempo de ciclo em dias entre a data de conclusão (end_date) e de início (start_date) agrupada por origem_demanda (setor demandante) para todos os documentos da coleção /projects onde status == 'concluido'.",
    visualization: { default_chart: "bar_chart", x_axis: "origem_demanda", y_axis: "cycle_time_dias" },
    target_benchmark: { operator: "<=", value: 90, unit: "dias" }
  },
  {
    id: "progresso_fisico_vs_esforco_realizado",
    title: "Comparativo: Progresso Físico vs. Esforço Realizado por Projeto",
    description: "Cruza o progresso declarado (%) com o percentual de horas já consumidas do total estimado. Divergências elevadas (ex: 30% físico com 70% de horas consumidas) sinalizam projetos em colapso de esforço.",
    category: "prazo_e_entrega",
    aggregation: { type: "ratio", field: "projects.progress" },
    dimensions: {
      filter_collection: "projects",
      filters: { status: ["em_andamento", "planejamento"], archived: false },
      group_by: "id"
    },
    formula_logic: "Lógica: Cálculo do progresso físico declarado (progress) dividido pelo percentual de esforço gasto (executed_hours / estimated_hours) para cada documento da coleção /projects onde status está em ['em_andamento', 'planejamento'] AND archived == false.",
    visualization: { default_chart: "table", x_axis: "name", y_axis: "eficiencia_fisica" },
    target_benchmark: { operator: ">=", value: 0.9, unit: "ratio" }
  },
  {
    id: "evolucao_progresso_medio_mensal",
    title: "Evolução Mensal do Progresso Médio da Carteira",
    description: "Série temporal do progresso físico médio da carteira de projetos mês a mês. Permite verificar se a equipe está acelerando entregas ou estagnando ao longo do tempo.",
    category: "prazo_e_entrega",
    aggregation: { type: "avg", field: "projects.progress" },
    dimensions: {
      filter_collection: "projects",
      filters: { archived: false },
      group_by: "mes_ano_updated_at"
    },
    formula_logic: "Lógica: Média de progress (avanço físico) consolidada na data final de cada mês agrupada por mês/ano para todos os documentos da coleção /projects onde archived == false.",
    visualization: { default_chart: "line_chart", x_axis: "mes_ano", y_axis: "progresso_medio_percentual" },
    target_benchmark: { operator: ">=", value: 5, unit: "%" }
  },

  // --- INDICADORES DE ESFORÇO E CAPACIDADE ---
  {
    id: "fte_efetivo_carteira_mensal",
    title: "FTE Efetivo Alocado na Carteira de Projetos (Mensal)",
    description: "Converte o total de horas executadas em projetos no mês para equivalente de pessoal em tempo integral (1 FTE = 160 horas úteis/mês). Mede o tamanho real da força de trabalho consumida pela carteira.",
    category: "esforco_e_capacidade",
    aggregation: { type: "sum", field: "time_logs.hours" },
    dimensions: {
      filter_collection: "time_logs",
      filters: { project_id: "!= null" },
      group_by: null
    },
    formula_logic: "Lógica: Soma de todas as horas registradas (hours) dividida pela constante de 160 horas para todos os logs da coleção /time_logs onde project_id != null.",
    visualization: { default_chart: "card", x_axis: null, y_axis: "fte_efetivo" },
    target_benchmark: { operator: ">=", value: 2.5, unit: "FTEs" }
  },
  {
    id: "fte_efetivo_por_setor_mensal",
    title: "FTE Efetivo Alocado por Setor (Mensal)",
    description: "Apresenta a força de trabalho consumida em projetos segmentada pelo setor dos profissionais. Revela quais departamentos estão mais absorvidos por projetos.",
    category: "esforco_e_capacidade",
    aggregation: { type: "sum", field: "time_logs.hours" },
    dimensions: {
      filter_collection: "time_logs",
      filters: { project_id: "!= null" },
      group_by: "setor"
    },
    formula_logic: "Lógica: Soma de todas as horas registradas (hours) dividida por 160 horas agrupada pelo setor do colaborador (setor obtido em /profiles) para todos os logs da coleção /time_logs onde project_id != null.",
    visualization: { default_chart: "bar_chart", x_axis: "setor", y_axis: "fte_setor" },
    target_benchmark: { operator: ">=", value: 0.5, unit: "FTE" }
  },
  {
    id: "iac_comprometimento_planejado_equipe",
    title: "Índice de Alocação de Capacidade (IAC) - Comprometimento Individual",
    description: "Calcula a razão (%) entre o total de horas planejadas/alocadas para o membro nos projetos vigentes e sua carga horária contratual semanal. Detecta profissionais subalocados (<80%) ou sobrealocados (>100%).",
    category: "esforco_e_capacidade",
    aggregation: { type: "percentage", field: "projects.members.allocated_hours" },
    dimensions: {
      filter_collection: "projects",
      filters: { status: ["em_andamento", "planejamento"], archived: false },
      group_by: "member_id"
    },
    formula_logic: "Lógica: Soma das horas de dedicação semanais planejadas (allocated_hours) dividida pela carga_horaria contratual semanal (do respectivo perfil) * 100 agrupada por member_id para todos os projetos da coleção /projects onde status está em ['em_andamento', 'planejamento'] AND archived == false.",
    visualization: { default_chart: "bar_chart", x_axis: "full_name", y_axis: "iac_percentual" },
    target_benchmark: { operator: "<=", value: 100, unit: "%" }
  },
  {
    id: "iac_sobrealocados_setor_resumo",
    title: "Total de Colaboradores Sobrealocados por Setor",
    description: "Métrica consolidada que contabiliza quantos colaboradores ativos em cada setor estão com o Índice de Alocação de Capacidade (IAC) acima de 100%. Direciona decisões de contratação ou remanejamento de pessoal entre setores.",
    category: "esforco_e_capacidade",
    aggregation: { type: "count", field: "projects.members.allocated_hours" },
    dimensions: {
      filter_collection: "projects",
      filters: { status: ["em_andamento", "planejamento"], archived: false },
      group_by: "setor"
    },
    formula_logic: "Lógica: Contagem total de colaboradores ativos cujas somas de allocated_hours superam sua carga_horaria semanal agrupada pelo setor do colaborador (setor obtido em /profiles) com base nos projetos da coleção /projects onde status está em ['em_andamento', 'planejamento'] AND archived == false.",
    visualization: { default_chart: "bar_chart", x_axis: "setor", y_axis: "quantidade_pessoas" },
    target_benchmark: { operator: "==", value: 0, unit: "contagem" }
  },
  {
    id: "ihe_horas_extraordinarias_total_mensal",
    title: "Índice de Horas Extraordinárias Realizadas (IHE) - Geral",
    description: "Contabiliza a soma total de horas lançadas como horas extras (is_overtime == true) no mês corrente. É um medidor crítico de sobrecarga estrutural da equipe.",
    category: "esforco_e_capacidade",
    aggregation: { type: "sum", field: "time_logs.hours" },
    dimensions: {
      filter_collection: "time_logs",
      filters: { is_overtime: true },
      group_by: null
    },
    formula_logic: "Lógica: Soma de todas as horas registradas (hours) no período para todos os logs da coleção /time_logs onde is_overtime == true.",
    visualization: { default_chart: "card", x_axis: null, y_axis: "horas_extras_totais" },
    target_benchmark: { operator: "<=", value: 40, unit: "horas" }
  },
  {
    id: "horas_extras_serie_temporal_anual",
    title: "Evolução Anual de Horas Extraordinárias (Série Temporal)",
    description: "Visão macro e de longo prazo da sobrecarga da equipe. Identifica sazonalidades institucionais de picos de trabalho e ciclos críticos ao longo dos meses do ano civil.",
    category: "esforco_e_capacidade",
    aggregation: { type: "sum", field: "time_logs.hours" },
    dimensions: {
      filter_collection: "time_logs",
      filters: { is_overtime: true },
      group_by: "mes_ano"
    },
    formula_logic: "Lógica: Soma de todas as horas registradas (hours) agrupada por mês/ano obtida a partir do log_date para todos os logs da coleção /time_logs onde is_overtime == true.",
    visualization: { default_chart: "line_chart", x_axis: "mes_ano", y_axis: "horas_extras_totais" },
    target_benchmark: { operator: "<=", value: 120, unit: "horas" }
  },
  {
    id: "ihe_horas_extras_por_colaborador_mensal",
    title: "Horas Extraordinárias por Colaborador (Mensal)",
    description: "Apresenta o acumulado de horas extras no mês segmentado individualmente, ajudando a identificar se a sobrecarga está concentrada em indivíduos específicos.",
    category: "esforco_e_capacidade",
    aggregation: { type: "sum", field: "time_logs.hours" },
    dimensions: {
      filter_collection: "time_logs",
      filters: { is_overtime: true },
      group_by: "person_id"
    },
    formula_logic: "Lógica: Soma de todas as horas registradas (hours) agrupada por person_id no período para todos os logs da coleção /time_logs onde is_overtime == true.",
    visualization: { default_chart: "bar_chart", x_axis: "person_name", y_axis: "horas_extras" },
    target_benchmark: { operator: "<=", value: 10, unit: "horas" }
  },
  {
    id: "horas_por_projeto_serie_temporal",
    title: "Consumo de Horas por Projeto ao Longo do Tempo",
    description: "Exibe a evolução do consumo de horas executadas em cada projeto semana a semana, identificando aceleração ou desaceleração na execução.",
    category: "esforco_e_capacidade",
    aggregation: { type: "sum", field: "time_logs.hours" },
    dimensions: {
      filter_collection: "time_logs",
      filters: { project_id: "!= null" },
      group_by: "project_id"
    },
    formula_logic: "Lógica: Soma de todas as horas registradas (hours) agrupada por projeto (project_id) e por semana epidemiológica para todos os logs da coleção /time_logs onde project_id != null.",
    visualization: { default_chart: "line_chart", x_axis: "semana", y_axis: "horas_executadas" },
    target_benchmark: { operator: ">=", value: 0, unit: "horas" }
  },

  // --- INDICADORES DE EFICIÊNCIA ---
  {
    id: "tor_ociosidade_global_mensal",
    title: "Taxa de Ociosidade Relativa (TOR) - Geral",
    description: "Mede o percentual de capacidade horária disponível que não foi preenchida com lançamentos de time_log. Expressa em: 100 - (Total_Horas_Lancadas / Total_Horas_Esperadas) * 100.",
    category: "eficiencia",
    aggregation: { type: "percentage", field: "time_logs.hours" },
    dimensions: {
      filter_collection: "time_logs",
      filters: {},
      group_by: null
    },
    formula_logic: "Lógica: Razão percentual de ociosidade calculada em [1 - (Soma de hours lançadas / Soma de carga_horaria contratual esperada de todos os colaboradores ativos no período)] * 100 para todos os logs da coleção /time_logs e perfis da coleção /profiles.",
    visualization: { default_chart: "card", x_axis: null, y_axis: "ociosidade_percentual" },
    target_benchmark: { operator: "<=", value: 15, unit: "%" }
  },
  {
    id: "tor_ociosidade_por_setor_mensal",
    title: "Taxa de Ociosidade Relativa por Setor (Mensal)",
    description: "A TOR calculada e agrupada por setor, identificando quais equipes possuem maior capacidade ociosa ou sob-registro de horas.",
    category: "eficiencia",
    aggregation: { type: "percentage", field: "time_logs.hours" },
    dimensions: {
      filter_collection: "time_logs",
      filters: {},
      group_by: "setor"
    },
    formula_logic: "Lógica: Razão percentual de ociosidade calculada em [1 - (Soma de hours do setor / Soma de carga_horaria esperada do respectivo setor no período)] * 100 agrupada pelo setor do colaborador para todos os logs da coleção /time_logs e perfis da coleção /profiles.",
    visualization: { default_chart: "bar_chart", x_axis: "setor", y_axis: "ociosidade_percentual" },
    target_benchmark: { operator: "<=", value: 15, unit: "%" }
  },
  {
    id: "tor_ociosidade_por_cargo_mensal",
    title: "Taxa de Ociosidade Relativa por Cargo (Mensal)",
    description: "Agrega a taxa de ociosidade com base no cargo institucional (ex: Desenvolvedor, Coordenador). Permite à liderança identificar se determinado nível hierárquico está com subnotificação sistemática ou subutilização de capacidade.",
    category: "eficiencia",
    aggregation: { type: "percentage", field: "time_logs.hours" },
    dimensions: {
      filter_collection: "time_logs",
      filters: {},
      group_by: "cargo"
    },
    formula_logic: "Lógica: Razão percentual de ociosidade calculada em [1 - (Soma de hours do cargo / Soma de carga_horaria esperada dos membros do cargo no período)] * 100 agrupada pelo cargo do colaborador para todos os logs da coleção /time_logs e perfis da coleção /profiles.",
    visualization: { default_chart: "bar_chart", x_axis: "cargo", y_axis: "ociosidade_percentual" },
    target_benchmark: { operator: "<=", value: 20, unit: "%" }
  },
  {
    id: "dte_distribuicao_tematica_equipe",
    title: "Distribuição Temática do Esforço da Equipe",
    description: "Segmenta o total de horas registradas na equipe por tipo de atividade (Reunião, Desenvolvimento, Suporte, Capacitação). Mede a distribuição do tempo investido.",
    category: "eficiencia",
    aggregation: { type: "percentage", field: "time_logs.hours" },
    dimensions: {
      filter_collection: "time_logs",
      filters: {},
      group_by: "activity_type"
    },
    formula_logic: "Lógica: Soma das horas registradas (hours) agrupada por tipo de atividade dividida pelo total geral de horas de esforço registradas * 100 para todos os logs da coleção /time_logs no período.",
    visualization: { default_chart: "pie_chart", x_axis: "tipo_atividade", y_axis: "percentual_esforco" },
    target_benchmark: { operator: ">=", value: 0, unit: "%" }
  },
  {
    id: "dte_distribuicao_tematica_por_funcao_mensal",
    title: "Distribuição Temática do Esforço por Função Operacional",
    description: "Cruza a matriz de alocação de tempo (Projetos, Reuniões, Suporte) com a função prática do colaborador (ex: Líder de Projetos, Suporte). Avalia o desvio de escopo funcional (ex: Líder gastando muito tempo operacional).",
    category: "eficiencia",
    aggregation: { type: "percentage", field: "time_logs.hours" },
    dimensions: {
      filter_collection: "time_logs",
      filters: {},
      group_by: "funcao"
    },
    formula_logic: "Lógica: Soma de horas (hours) agrupada pela função do colaborador (funcao em /profiles) e por tipo de atividade dividida pelo total lançado de cada função * 100 para todos os logs da coleção /time_logs no período.",
    visualization: { default_chart: "table", x_axis: "funcao", y_axis: "percentual_esforco" },
    target_benchmark: { operator: ">=", value: 0, unit: "%" }
  },
  {
    id: "iddt_desvio_duracao_por_colaborador",
    title: "Índice de Desvio de Duração de Tarefa por Colaborador",
    description: "Identifica colaboradores com padrão sistemático de subestimativa ou superestimativa na duração de suas tarefas. Fundamenta ações de mentoria e capacitação em estimativas.",
    category: "eficiencia",
    aggregation: { type: "avg", field: "activities.hours_executed" },
    dimensions: {
      filter_collection: "activities",
      filters: { status: "concluida" },
      group_by: "responsible_id"
    },
    formula_logic: "Lógica: Média percentual da diferença entre horas executadas e horas planejadas [((hours_executed - hours_planned) / hours_planned) * 100] agrupada por responsible_id para todas as atividades da coleção /activities onde status == 'concluida' AND hours_planned > 0.",
    visualization: { default_chart: "bar_chart", x_axis: "responsible_name", y_axis: "desvio_medio_percentual" },
    target_benchmark: { operator: "<=", value: 20, unit: "%" }
  },
  {
    id: "total_horas_registradas_setor_mensal",
    title: "Total de Horas Registradas por Setor (Mensal)",
    description: "Soma de todas as horas lançadas por membros de cada setor no mês. Indica o volume de trabalho registrado e permite comparações de produção entre setores.",
    category: "eficiencia",
    aggregation: { type: "sum", field: "time_logs.hours" },
    dimensions: {
      filter_collection: "time_logs",
      filters: {},
      group_by: "setor"
    },
    formula_logic: "Lógica: Soma total de todas as horas registradas (hours) agrupada pelo setor do colaborador (setor obtido em /profiles) no período para todos os logs da coleção /time_logs.",
    visualization: { default_chart: "bar_chart", x_axis: "setor", y_axis: "total_horas" },
    target_benchmark: { operator: ">=", value: 0, unit: "horas" }
  },
  {
    id: "horas_suporte_vs_projeto_mensal",
    title: "Razão Horas de Suporte vs. Horas de Projeto (Mensal)",
    description: "Compara o volume de horas gastas em atividades de suporte versus atividades de projeto. Percentual de suporte acima de 30% pode indicar instabilidade nos sistemas mantidos.",
    category: "eficiencia",
    aggregation: { type: "ratio", field: "time_logs.hours" },
    dimensions: {
      filter_collection: "time_logs",
      filters: {},
      group_by: "activity_type"
    },
    formula_logic: "Lógica: Razão simples da soma de horas de atividades de suporte dividida pela soma de horas de atividades de projeto para todos os logs da coleção /time_logs no período.",
    visualization: { default_chart: "card", x_axis: null, y_axis: "ratio_suporte_projeto" },
    target_benchmark: { operator: "<=", value: 0.3, unit: "ratio" }
  },
  {
    id: "horas_reuniao_percentual_mensal",
    title: "Percentual de Horas em Reuniões (Mensal)",
    description: "Percentual do esforço total consumido em reuniões no mês. Acima de 20% aponta 'reuniofagia' e necessidade de revisão da cultura de reuniões.",
    category: "eficiencia",
    aggregation: { type: "percentage", field: "time_logs.hours" },
    dimensions: {
      filter_collection: "time_logs",
      filters: {},
      group_by: null
    },
    formula_logic: "Lógica: Soma de todas as horas em reuniões dividida pela soma total de horas registradas * 100 para todos os logs da coleção /time_logs no período.",
    visualization: { default_chart: "card", x_axis: null, y_axis: "percentual_reuniao" },
    target_benchmark: { operator: "<=", value: 20, unit: "%" }
  },
  {
    id: "horas_capacitacao_percentual_mensal",
    title: "Percentual de Horas em Capacitação (Mensal)",
    description: "Monitora o investimento da equipe em desenvolvimento de competências. Percentuais muito baixos podem indicar cultura organizacional de baixo investimento em formação.",
    category: "eficiencia",
    aggregation: { type: "percentage", field: "time_logs.hours" },
    dimensions: {
      filter_collection: "time_logs",
      filters: {},
      group_by: null
    },
    formula_logic: "Lógica: Soma de todas as horas em capacitação dividida pela soma total de horas registradas * 100 para todos os logs da coleção /time_logs no período.",
    visualization: { default_chart: "card", x_axis: null, y_axis: "percentual_capacitacao" },
    target_benchmark: { operator: ">=", value: 5, unit: "%" }
  },
  {
    id: "esforco_capacitacao_por_colaborador",
    title: "Horas de Capacitação por Colaborador (Mensal)",
    description: "Mostra o investimento individual em capacitação de cada membro, permitindo identificar quem está se desenvolvendo e quem pode precisar de incentivo ou acesso a treinamentos.",
    category: "eficiencia",
    aggregation: { type: "sum", field: "time_logs.hours" },
    dimensions: {
      filter_collection: "time_logs",
      filters: {},
      group_by: "person_id"
    },
    formula_logic: "Lógica: Soma de todas as horas (hours) registradas agrupada por person_id para todos os logs da coleção /time_logs no período onde o tipo da atividade associada é 'capacitacao'.",
    visualization: { default_chart: "bar_chart", x_axis: "person_name", y_axis: "horas_capacitacao" },
    target_benchmark: { operator: ">=", value: 2, unit: "horas" }
  },
  {
    id: "aderencia_escala_horaria_individual",
    title: "Aderência à Escala Horária Planejada por Colaborador",
    description: "Mede o percentual de atividades em que o horário de início executado coincide com o planejado (tolerância de ±15 min). Avalia disciplina no cumprimento da grade de trabalho diária.",
    category: "eficiencia",
    aggregation: { type: "percentage", field: "activities.start_time_executed" },
    dimensions: {
      filter_collection: "activities",
      filters: { status: "concluida" },
      group_by: "responsible_id"
    },
    formula_logic: "Lógica: Percentual de atividades onde o horário de início real (start_time_executed) diverge em no máximo 15 minutos do planejado (start_time_planned) agrupado por responsible_id para todas as atividades da coleção /activities onde status == 'concluida'.",
    visualization: { default_chart: "bar_chart", x_axis: "responsible_name", y_axis: "aderencia_percentual" },
    target_benchmark: { operator: ">=", value: 70, unit: "%" }
  },
  {
    id: "eficiencia_estimativa_projetos_concluidos",
    title: "Eficiência de Estimativa de Projetos Concluídos por Responsável",
    description: "Avalia a qualidade do planejamento de cada gerente ao comparar horas estimadas com realizadas nos projetos que finalizaram. Gerentes com desvio acima de 30% necessitam de suporte em planejamento.",
    category: "eficiencia",
    aggregation: { type: "avg", field: "projects.executed_hours" },
    dimensions: {
      filter_collection: "projects",
      filters: { status: "concluido" },
      group_by: "responsible_id"
    },
    formula_logic: "Lógica: Média percentual da diferença absoluta entre horas executadas (executed_hours) e estimadas (estimated_hours) do projeto [(ABS(executed_hours - estimated_hours) / estimated_hours) * 100] agrupada por responsible_id para todos os documentos da coleção /projects onde status == 'concluido'.",
    visualization: { default_chart: "bar_chart", x_axis: "responsible_name", y_axis: "desvio_estimativa_percentual" },
    target_benchmark: { operator: "<=", value: 30, unit: "%" }
  },

  // --- INDICADORES DE QUALIDADE E OPERAÇÕES ---
  {
    id: "tbc_taxa_bloqueio_carteira",
    title: "Taxa de Bloqueio da Carteira (TBC) - Geral",
    description: "Razão (%) entre a quantidade de projetos com status bloqueado e a quantidade total de projetos ativos da carteira. Um indicador de travamento de fluxo operacional.",
    category: "qualidade_e_operacoes",
    aggregation: { type: "percentage", field: "projects.status" },
    dimensions: {
      filter_collection: "projects",
      filters: { status: ["em_andamento", "planejamento", "bloqueado"], archived: false },
      group_by: null
    },
    formula_logic: "Lógica: Razão percentual de projetos bloqueados [(Quantidade de projetos com status == 'bloqueado' / total de projetos ativos com status em ['em_andamento', 'planejamento', 'bloqueado']) * 100] para todos os documentos da coleção /projects onde archived == false.",
    visualization: { default_chart: "card", x_axis: null, y_axis: "percentual_bloqueados" },
    target_benchmark: { operator: "<=", value: 15, unit: "%" }
  },
  {
    id: "tbc_taxa_bloqueio_serie_temporal_semanal",
    title: "Histórico Semanal da Taxa de Bloqueio da Carteira",
    description: "Acompanha a volatilidade e a tendência da Taxa de Bloqueio da Carteira semana a semana. Avalia se ações gerenciais estão surtindo efeito rápido no destravamento de projetos.",
    category: "qualidade_e_operacoes",
    aggregation: { type: "percentage", field: "projects.status" },
    dimensions: {
      filter_collection: "audit_logs",
      filters: { table_name: "projects" },
      group_by: "semana_ano"
    },
    formula_logic: "Lógica: Percentual de projetos que estavam bloqueados no último dia de cada semana em relação ao total ativo medido na data correspondente com base nos logs de status da coleção /audit_logs onde table_name == 'projects'.",
    visualization: { default_chart: "line_chart", x_axis: "semana_ano", y_axis: "percentual_bloqueados" },
    target_benchmark: { operator: "<=", value: 15, unit: "%" }
  },
  {
    id: "projetos_por_prioridade_status_matriz",
    title: "Matriz de Projetos Ativos por Prioridade e Status",
    description: "Cruza o nível de prioridade (crítica, alta, média, baixa) com o status atual do projeto. Crucial para identificar projetos críticos que estejam paralisados (bloqueados ou pausados).",
    category: "qualidade_e_operacoes",
    aggregation: { type: "count", field: "projects.id" },
    dimensions: {
      filter_collection: "projects",
      filters: { archived: false },
      group_by: "priority"
    },
    formula_logic: "Lógica: Contagem total de projetos agrupada por priority (prioridade) e status para todos os documentos da coleção /projects onde archived == false.",
    visualization: { default_chart: "table", x_axis: "status", y_axis: "contagem" },
    target_benchmark: { operator: ">=", value: 0, unit: "contagem" }
  },
  {
    id: "atividades_concluidas_por_tipo_mensal",
    title: "Volume de Entregas Operacionais por Tipo de Atividade (Mensal)",
    description: "Mapeia a quantidade absoluta de tarefas concluídas com sucesso pela equipe no mês, segmentada por tipo. Demonstra a vazão operacional da esteira de serviços.",
    category: "qualidade_e_operacoes",
    aggregation: { type: "count", field: "activities.status" },
    dimensions: {
      filter_collection: "activities",
      filters: { status: "concluida", archived: false },
      group_by: "type"
    },
    formula_logic: "Lógica: Contagem total de atividades agrupada por tipo da atividade (type) no período para todos os documentos da coleção /activities onde status == 'concluida' AND archived == false.",
    visualization: { default_chart: "bar_chart", x_axis: "type", y_axis: "contagem_concluidas" },
    target_benchmark: { operator: ">=", value: 20, unit: "contagem" }
  },
  {
    id: "volume_projetos_por_gerente_status",
    title: "Distribuição de Projetos por Gerente e Status",
    description: "Apresenta a carga de projetos sob a responsabilidade de cada Gerente de Projetos (GP), dividida por status. Expõe visualmente desequilíbrios de carga gerencial.",
    category: "qualidade_e_operacoes",
    aggregation: { type: "count", field: "projects.id" },
    dimensions: {
      filter_collection: "projects",
      filters: { archived: false },
      group_by: "responsible_id"
    },
    formula_logic: "Lógica: Contagem total de projetos agrupada por gerente responsável (responsible_id) e por status para todos os documentos da coleção /projects onde archived == false.",
    visualization: { default_chart: "bar_chart", x_axis: "responsible_name", y_axis: "contagem_projetos" },
    target_benchmark: { operator: "<=", value: 5, unit: "contagem" }
  },
  {
    id: "atividades_canceladas_por_responsavel",
    title: "Volume de Atividades Canceladas por Colaborador",
    description: "Mapeia a quantidade de tarefas que foram movidas para o status 'cancelada' por responsável. Padrões elevados podem apontar desperdício de esforço em planejamento ou mudança repentina de prioridades.",
    category: "qualidade_e_operacoes",
    aggregation: { type: "count", field: "activities.status" },
    dimensions: {
      filter_collection: "activities",
      filters: { status: "cancelada", archived: false },
      group_by: "responsible_id"
    },
    formula_logic: "Lógica: Contagem total de atividades agrupada por responsible_id no período para todos os documentos da coleção /activities onde status == 'cancelada' AND archived == false.",
    visualization: { default_chart: "bar_chart", x_axis: "responsible_name", y_axis: "contagem_canceladas" },
    target_benchmark: { operator: "<=", value: 4, unit: "contagem" }
  },
  {
    id: "tempo_medio_em_andamento_kanban",
    title: "Tempo Médio de Tarefas no Status 'em_andamento' (Kanban WIP)",
    description: "Mede quanto tempo as atividades ficam no status em_andamento antes de avançar. Tempos longos indicam tarefas grandes demais (necessidade de quebra) ou bloqueios não declarados.",
    category: "qualidade_e_operacoes",
    aggregation: { type: "avg", field: "audit_logs.created_at" },
    dimensions: {
      filter_collection: "audit_logs",
      filters: { table_name: "activities", old_status: "em_andamento" },
      group_by: null
    },
    formula_logic: "Lógica: Média de horas transcorridas que as atividades permanecem no status 'em_andamento' (calculado pela diferença de tempo entre a entrada e a saída de status registrada em audit_logs) para todas as atividades da coleção /activities.",
    visualization: { default_chart: "card", x_axis: null, y_axis: "dias_em_andamento" },
    target_benchmark: { operator: "<=", value: 3, unit: "dias" }
  },
  {
    id: "tempo_medio_bloqueada_kanban",
    title: "Tempo Médio de Tarefas no Status 'bloqueada' (TMSB)",
    description: "Mede a velocidade da gestão em resolver impedimentos. Quanto menor o TMSB, mais ágil é a liderança na remoção de bloqueios.",
    category: "qualidade_e_operacoes",
    aggregation: { type: "avg", field: "audit_logs.created_at" },
    dimensions: {
      filter_collection: "audit_logs",
      filters: { table_name: "activities", old_status: "bloqueada" },
      group_by: null
    },
    formula_logic: "Lógica: Média de horas transcorridas que as atividades permanecem no status 'bloqueada' (calculado pela diferença de tempo entre a entrada e a saída do status bloqueado registrado em audit_logs) para todas as atividades da coleção /activities.",
    visualization: { default_chart: "card", x_axis: null, y_axis: "horas_bloqueado" },
    target_benchmark: { operator: "<=", value: 24, unit: "horas" }
  },
  {
    id: "tmsb_bloqueio_projetos",
    title: "Tempo Médio em Bloqueio – Projetos",
    description: "Similar ao TMSB de atividades, mas focado em projetos. Mede quanto tempo projetos inteiros ficam bloqueados antes de retonar ao fluxo ativo.",
    category: "qualidade_e_operacoes",
    aggregation: { type: "avg", field: "audit_logs.created_at" },
    dimensions: {
      filter_collection: "audit_logs",
      filters: { table_name: "projects", old_status: "bloqueado" },
      group_by: null
    },
    formula_logic: "Lógica: Média de dias transcorridos que os projetos permanecem no status 'bloqueado' (calculado pela diferença de tempo entre a entrada e a saída do status bloqueado registrado em audit_logs) para todos os projetos da coleção /projects.",
    visualization: { default_chart: "card", x_axis: null, y_axis: "dias_bloqueado" },
    target_benchmark: { operator: "<=", value: 5, unit: "dias" }
  },
  {
    id: "egr_desvio_execucao_rotinas",
    title: "Eficiência de Geração de Rotinas Recorrentes (Desvio de Execução)",
    description: "Verifica se as tarefas de rotinas recorrentes estão sendo criadas na data esperada pelo worker/cron. Qualquer desvio indica falha no processo de automação.",
    category: "qualidade_e_operacoes",
    aggregation: { type: "count", field: "activities.routine_id" },
    dimensions: {
      filter_collection: "activities",
      filters: { routine_id: "!= null" },
      group_by: "routine_id"
    },
    formula_logic: "Lógica: Contagem total de atividades da rotina cuja data real de execução (activity_date) diverge da data planejada pelo cronograma agrupada por routine_id para todos os documentos da coleção /activities onde routine_id != null.",
    visualization: { default_chart: "table", x_axis: "routine_title", y_axis: "contagem_desvios" },
    target_benchmark: { operator: "==", value: 0, unit: "contagem" }
  },
  {
    id: "ratio_rotinas_vs_tarefas_espontaneas",
    title: "Proporção de Tarefas Automáticas vs. Espontâneas",
    description: "Compara a quantidade de atividades geradas automaticamente por rotinas recorrentes versus tarefas criadas manualmente. Elevado percentual de tarefas espontâneas pode indicar falta de padronização de processos.",
    category: "qualidade_e_operacoes",
    aggregation: { type: "percentage", field: "activities.routine_id" },
    dimensions: {
      filter_collection: "activities",
      filters: { archived: false },
      group_by: null
    },
    formula_logic: "Lógica: Razão percentual calculada em [Quantidade de atividades automáticas (routine_id != null) / Quantidade total de atividades criadas (automáticas + manuais) * 100] no período para todos os documentos da coleção /activities onde archived == false.",
    visualization: { default_chart: "pie_chart", x_axis: "origem", y_axis: "percentual" },
    target_benchmark: { operator: ">=", value: 40, unit: "%" }
  },
  {
    id: "contagem_atividades_bloqueadas_atual",
    title: "Quantidade Atual de Atividades Bloqueadas",
    description: "Snapshot em tempo real do número de atividades no status bloqueada. Permite ação imediata da liderança para remoção de impedimentos.",
    category: "qualidade_e_operacoes",
    aggregation: { type: "count", field: "activities.status" },
    dimensions: {
      filter_collection: "activities",
      filters: { status: "bloqueada", archived: false },
      group_by: null
    },
    formula_logic: "Lógica: Contagem total de atividades com status == 'bloqueada' para todos os documentos da coleção /activities onde archived == false.",
    visualization: { default_chart: "card", x_axis: null, y_axis: "contagem_bloqueadas" },
    target_benchmark: { operator: "==", value: 0, unit: "contagem" }
  },
  {
    id: "contagem_atividades_por_status",
    title: "Distribuição de Atividades por Status (Kanban)",
    description: "Visão geral do quadro Kanban: quantas atividades existem em cada status (pendente, em_andamento, concluida, bloqueada, cancelada). Identifica gargalos na esteira de entrega.",
    category: "qualidade_e_operacoes",
    aggregation: { type: "count", field: "activities.status" },
    dimensions: {
      filter_collection: "activities",
      filters: { archived: false },
      group_by: "status"
    },
    formula_logic: "Lógica: Contagem total de atividades agrupada por status para todos os documentos da coleção /activities onde archived == false.",
    visualization: { default_chart: "bar_chart", x_axis: "status", y_axis: "contagem" },
    target_benchmark: { operator: ">=", value: 0, unit: "contagem" }
  },
  {
    id: "backlog_atividades_pendentes_por_responsavel",
    title: "Backlog de Atividades Pendentes por Responsável",
    description: "Conta quantas atividades estão aguardando execução para cada colaborador, identificando gargalos individuais e sobrecarga de backlog.",
    category: "qualidade_e_operacoes",
    aggregation: { type: "count", field: "activities.status" },
    dimensions: {
      filter_collection: "activities",
      filters: { status: "pendente", archived: false },
      group_by: "responsible_id"
    },
    formula_logic: "Lógica: Contagem total de atividades pendentes agrupada por responsible_id para todos os documentos da coleção /activities onde status == 'pendente' AND archived == false.",
    visualization: { default_chart: "bar_chart", x_axis: "responsible_name", y_axis: "contagem_pendentes" },
    target_benchmark: { operator: "<=", value: 10, unit: "contagem" }
  },
  {
    id: "distribuicao_demandas_por_setor_ativo",
    title: "Volume de Projetos Ativos por Setor Originador",
    description: "Mostra quantos projetos ativos foram originados de cada setor. Permite entender a distribuição da carga de demanda de desenvolvimento entre os clientes internos.",
    category: "qualidade_e_operacoes",
    aggregation: { type: "count", field: "projects.origem_demanda" },
    dimensions: {
      filter_collection: "projects",
      filters: { status: ["em_andamento", "planejamento"], archived: false },
      group_by: "origem_demanda"
    },
    formula_logic: "Lógica: Contagem total de projetos ativos agrupada por origem_demanda (setor demandante) para todos os documentos da coleção /projects onde status está em ['em_andamento', 'planejamento'] AND archived == false.",
    visualization: { default_chart: "bar_chart", x_axis: "origem_demanda", y_axis: "contagem_projetos" },
    target_benchmark: { operator: ">=", value: 0, unit: "contagem" }
  },

  // --- INDICADORES DE AUDITORIA E CONTROLE ---
  {
    id: "subnotificacao_critica_time_logs_diario",
    title: "Alerta Diário de Perfis sem Lançamento de Horas",
    description: "Identifica em tempo real colaboradores ativos que não realizaram nenhum lançamento de time_log no dia útil anterior. Ferramenta de controle higiênico de dados.",
    category: "auditoria_e_controle",
    aggregation: { type: "count", field: "profiles.id" },
    dimensions: {
      filter_collection: "profiles",
      filters: { active: true, role: ["admin", "analista"] },
      group_by: null
    },
    formula_logic: "Lógica: Contagem de colaboradores ativos com papéis operacionais ('admin' ou 'analista') que não possuem nenhum log de tempo registrado em /time_logs com log_date igual à data de verificação.",
    visualization: { default_chart: "table", x_axis: "full_name", y_axis: "status_pendencia" },
    target_benchmark: { operator: "==", value: 0, unit: "contagem" }
  },
  {
    id: "volume_retrabalho_retorno_pendente",
    title: "Volume de Retrabalho – Tarefas que Retornaram a 'pendente'",
    description: "Conta quantas atividades tiveram seu status revertido de 'em_andamento' ou 'concluida' de volta para 'pendente'. Alto volume indica retrabalho e instabilidade de execução.",
    category: "auditoria_e_controle",
    aggregation: { type: "count", field: "audit_logs.new_status" },
    dimensions: {
      filter_collection: "audit_logs",
      filters: { table_name: "activities", new_status: "pendente", old_status: ["em_andamento", "concluida"] },
      group_by: null
    },
    formula_logic: "Lógica: Contagem total de transições de status onde o novo status (new_status) é 'pendente' e o anterior (old_status) era 'em_andamento' ou 'concluida' no período para todos os logs da coleção /audit_logs onde table_name == 'activities'.",
    visualization: { default_chart: "card", x_axis: null, y_axis: "contagem_retrabalho" },
    target_benchmark: { operator: "<=", value: 5, unit: "contagem" }
  },
  {
    id: "volume_retrabalho_por_projeto",
    title: "Volume de Retrabalho por Projeto",
    description: "Identifica projetos com maior incidência de reversão de status em suas atividades. Pode indicar escopo mal definido ou dependências não resolvidas naquele projeto.",
    category: "auditoria_e_controle",
    aggregation: { type: "count", field: "audit_logs.new_status" },
    dimensions: {
      filter_collection: "audit_logs",
      filters: { table_name: "activities", new_status: "pendente", old_status: ["em_andamento", "concluida"] },
      group_by: "record_id"
    },
    formula_logic: "Lógica: Contagem total de reversões de atividades para o status 'pendente' agrupada pelo projeto associado à atividade no período com base nos logs de status da coleção /audit_logs.",
    visualization: { default_chart: "bar_chart", x_axis: "project_name", y_axis: "contagem_retrabalho" },
    target_benchmark: { operator: "<=", value: 3, unit: "contagem" }
  },
  {
    id: "fac_frequencia_alteracoes_criticas",
    title: "Frequência de Alterações Críticas de Status (Geral)",
    description: "Conta o total de mudanças de status registradas no audit_log em um período. Alta frequência pode indicar instabilidade operacional ou boa prática de atualização. Cruzar com contexto.",
    category: "auditoria_e_controle",
    aggregation: { type: "count", field: "audit_logs.action" },
    dimensions: {
      filter_collection: "audit_logs",
      filters: { action: "UPDATE_STATUS" },
      group_by: null
    },
    formula_logic: "Lógica: Contagem total de logs de modificação com ação == 'UPDATE_STATUS' no período para todos os documentos da coleção /audit_logs.",
    visualization: { default_chart: "card", x_axis: null, y_axis: "contagem_alteracoes" },
    target_benchmark: { operator: ">=", value: 0, unit: "contagem" }
  },
  {
    id: "fac_alteracoes_por_usuario",
    title: "Frequência de Alterações de Status por Usuário",
    description: "Identifica quem mais altera status no sistema. Permite distinguir usuários hiperativos (boa prática de atualização) de possíveis erros ou mudanças excessivas.",
    category: "auditoria_e_controle",
    aggregation: { type: "count", field: "audit_logs.action" },
    dimensions: {
      filter_collection: "audit_logs",
      filters: { action: "UPDATE_STATUS" },
      group_by: "user_id"
    },
    formula_logic: "Lógica: Contagem total de logs de modificação com ação == 'UPDATE_STATUS' agrupada pelo ID do usuário autor da ação (user_id) no período para todos os documentos da coleção /audit_logs.",
    visualization: { default_chart: "bar_chart", x_axis: "user_email", y_axis: "contagem_alteracoes" },
    target_benchmark: { operator: ">=", value: 0, unit: "contagem" }
  },
  {
    id: "conformidade_preenchimento_log",
    title: "Conformidade de Preenchimento de Time Logs (Retroatividade)",
    description: "Analisa se os lançamentos de horas são feitos no mesmo dia do trabalho ou retroativamente. Lançamentos muito tardios reduzem a confiabilidade dos dados de produtividade.",
    category: "auditoria_e_controle",
    aggregation: { type: "percentage", field: "time_logs.created_at" },
    dimensions: {
      filter_collection: "time_logs",
      filters: {},
      group_by: "person_id"
    },
    formula_logic: "Lógica: Razão percentual de logs cuja diferença em dias entre a data de gravação do log (created_at) e a data do trabalho executado (log_date) é de no máximo 1 dia agrupada por person_id no período para todos os logs da coleção /time_logs.",
    visualization: { default_chart: "bar_chart", x_axis: "person_name", y_axis: "conformidade_percentual" },
    target_benchmark: { operator: ">=", value: 80, unit: "%" }
  }
];
