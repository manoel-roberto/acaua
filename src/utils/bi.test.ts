import { describe, it, expect } from "vitest";
import { calculateIndicators, BIData } from "./bi";
import { ALL_INDICATORS } from "../constants/indicators";
import { Project, Activity, TimeLog, UserProfile } from "../types";

// Helper para gerar dados de teste vazios
const createEmptyData = (): BIData => ({
  projects: [],
  activities: [],
  timeLogs: [],
  profiles: [],
  auditLogs: [],
});

describe("Dashboard BI Engine - Lógica de Indicadores", () => {
  it("deve carregar e processar com sucesso todas as coleções vazias sem quebras ou divisão por zero", () => {
    const emptyData = createEmptyData();
    const results = calculateIndicators(emptyData, [], "todos", "todos", 22, {});

    // Verifica se todos os 42 indicadores foram processados
    expect(Object.keys(results).length).toBe(ALL_INDICATORS.length);

    // Cada resultado deve possuir valor e flag de benchmark
    ALL_INDICATORS.forEach((ind) => {
      const result = results[ind.id];
      expect(result).toBeDefined();
      expect(result).toHaveProperty("benchmark");

      // Valores numéricos para coleções vazias devem ser 0 ou o fallback padrão
      if (ind.dimensions.group_by && ind.aggregation.type !== "ratio") {
        expect(result.value).toBe(0);
        expect(result.list).toEqual([]);
      } else {
        expect(result.value).toBe(0);
      }
    });
  });

  it("deve calcular corretamente o Progresso Físico Médio da Carteira (Geral)", () => {
    const data = createEmptyData();
    data.projects = [
      { id: "p1", name: "Proj 1", progress: 60, status: "em_andamento", archived: false } as Project,
      { id: "p2", name: "Proj 2", progress: 80, status: "planejamento", archived: false } as Project,
      { id: "p3", name: "Proj 3", progress: 100, status: "concluido", archived: false } as Project, // Concluído não entra no filtro do pfm_carteira_geral
      { id: "p4", name: "Proj 4", progress: 20, status: "bloqueado", archived: false } as Project,
      { id: "p5", name: "Proj 5", progress: 50, status: "em_andamento", archived: true } as Project, // Arquivado não entra
    ];

    const results = calculateIndicators(data, [], "todos", "todos", 22, {});
    // Projetos válidos: p1(60), p2(80), p4(20). Média = (60+80+20)/3 = 53.3%
    expect(results["pfm_carteira_geral"].value).toBe(53.3);
    // Target benchmark padrão é >= 50
    expect(results["pfm_carteira_geral"].benchmark).toBe(true);
  });

  it("deve respeitar os benchmarks customizados passados por parâmetro", () => {
    const data = createEmptyData();
    data.projects = [
      { id: "p1", name: "Proj 1", progress: 40, status: "em_andamento", archived: false } as Project,
    ];

    // Média = 40. Target padrão >= 50 (deve falhar no benchmark)
    const resDefault = calculateIndicators(data, [], "todos", "todos", 22, {});
    expect(resDefault["pfm_carteira_geral"].value).toBe(40);
    expect(resDefault["pfm_carteira_geral"].benchmark).toBe(false);

    // Com benchmark customizado de >= 35, deve passar
    const resCustom = calculateIndicators(data, [], "todos", "todos", 22, {
      pfm_carteira_geral: 35,
    });
    expect(resCustom["pfm_carteira_geral"].benchmark).toBe(true);
  });

  it("deve validar corretamente o cálculo de SLA de Resolução de Atividades Críticas", () => {
    const data = createEmptyData();
    const now = new Date();
    const dateCreated = new Date(now.getTime() - 10 * 60 * 60 * 1000).toISOString(); // 10h atrás
    const dateUpdated = now.toISOString();

    data.activities = [
      {
        id: "a1",
        title: "Atividade Crítica",
        priority: "critica",
        status: "concluida",
        created_at: dateCreated,
        updated_at: dateUpdated,
      } as Activity,
      {
        id: "a2",
        title: "Atividade Alta",
        priority: "alta",
        status: "concluida",
        created_at: dateCreated,
        updated_at: new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString(), // 4h de duração
      } as Activity,
      {
        id: "a3",
        title: "Atividade Média",
        priority: "media",
        status: "concluida",
        created_at: dateCreated,
        updated_at: dateUpdated,
      } as Activity, // Média não entra
    ];

    const results = calculateIndicators(data, [], "todos", "todos", 22, {});
    // Atividades válidas: a1 (10h) e a2 (4h). Média = (10+4)/2 = 7h
    expect(results["sla_resolucao_atividades_criticas"].value).toBe(7);
    // Target padrão é <= 48h
    expect(results["sla_resolucao_atividades_criticas"].benchmark).toBe(true);
  });

  it("deve calcular a ociosidade global mensal de FTE e ociosidade por setor", () => {
    const data = createEmptyData();
    const profiles: UserProfile[] = [
      { id: "u1", email: "user1@uefs.br", full_name: "User 1", active: true, role: "colaborador", setor: "dados", carga_horaria: 40 } as UserProfile,
      { id: "u2", email: "user2@uefs.br", full_name: "User 2", active: true, role: "colaborador", setor: "dados", carga_horaria: 20 } as UserProfile,
      { id: "u3", email: "user3@uefs.br", full_name: "User 3", active: false, role: "colaborador", setor: "sistemas", carga_horaria: 40 } as UserProfile, // Inativo não entra
    ];

    // Dias úteis: 10 dias
    // FTE Esperado de u1: (40 / 5) * 10 = 80h
    // FTE Esperado de u2: (20 / 5) * 10 = 40h
    // Total Esperado = 120h
    data.timeLogs = [
      { id: "t1", person_id: "u1", hours: 60 } as TimeLog,
      { id: "t2", person_id: "u2", hours: 30 } as TimeLog,
    ];

    const results = calculateIndicators(data, profiles, "todos", "todos", 10, {});
    // Total lançado = 60 + 30 = 90h
    // Ociosidade global = ((120 - 90) / 120) * 100 = 25%
    expect(results["tor_ociosidade_global_mensal"].value).toBe(25);
  });

  it("deve filtrar dados dinamicamente com base no Setor selecionado", () => {
    const data = createEmptyData();
    const profiles: UserProfile[] = [
      { id: "u1", email: "u1@uefs.br", full_name: "User 1", setor: "dados" } as UserProfile,
      { id: "u2", email: "u2@uefs.br", full_name: "User 2", setor: "sistemas" } as UserProfile,
    ];

    data.projects = [
      { id: "p1", name: "Proj 1", progress: 90, status: "em_andamento", archived: false, responsible_id: "u1" } as Project,
      { id: "p2", name: "Proj 2", progress: 30, status: "em_andamento", archived: false, responsible_id: "u2" } as Project,
    ];

    // Ao filtrar pelo setor "dados", apenas o projeto p1 deve ser processado. Média de progresso = 90%
    const results = calculateIndicators(data, profiles, "dados", "todos", 22, {});
    expect(results["pfm_carteira_geral"].value).toBe(90);
  });

  it("deve filtrar dados dinamicamente com base no Colaborador/GP selecionado", () => {
    const data = createEmptyData();
    data.projects = [
      { id: "p1", name: "Proj 1", progress: 90, status: "em_andamento", archived: false, responsible_id: "u1" } as Project,
      { id: "p2", name: "Proj 2", progress: 30, status: "em_andamento", archived: false, responsible_id: "u2" } as Project,
    ];

    // Ao filtrar pelo colaborador "u2", apenas o projeto p2 deve ser processado. Média = 30%
    const results = calculateIndicators(data, [], "todos", "u2", 22, {});
    expect(results["pfm_carteira_geral"].value).toBe(30);
  });

  it("deve calcular corretamente o percentual de horas dedicadas a reuniões e capacitação", () => {
    const data = createEmptyData();
    data.timeLogs = [
      { id: "t1", person_id: "u1", hours: 10, activity_title: "Reunião de Alinhamento", description: "Discussão de progresso" } as TimeLog,
      { id: "t2", person_id: "u1", hours: 20, activity_title: "Desenvolvimento de Feature", description: "Codificação do backend" } as TimeLog,
      { id: "t3", person_id: "u1", hours: 10, activity_title: "Capacitação Firebase", description: "Assistir vídeos de treinamento" } as TimeLog,
    ];

    const results = calculateIndicators(data, [], "todos", "todos", 22, {});
    // Total Geral = 10 + 20 + 10 = 40h
    // Reunião = 10h (25%)
    // Capacitação = 10h (25%)
    expect(results["horas_reuniao_percentual_mensal"].value).toBe(25);
    expect(results["horas_capacitacao_percentual_mensal"].value).toBe(25);
  });

  it("deve calcular a razão de horas de suporte vs projeto", () => {
    const data = createEmptyData();
    data.timeLogs = [
      { id: "t1", person_id: "u1", hours: 15, activity_title: "Suporte Técnico", description: "Ajustar bugs de produção" } as TimeLog,
      { id: "t2", person_id: "u1", hours: 30, project_id: "proj_abc", description: "Desenvolver módulo principal" } as TimeLog,
    ];

    const results = calculateIndicators(data, [], "todos", "todos", 22, {});
    // Suporte = 15h. Projeto = 30h. Razão = 15 / 30 = 0.5
    expect(results["horas_suporte_vs_projeto_mensal"].value).toBe(0.5);
  });

  it("deve calcular corretamente o FTE Efetivo da carteira baseado nos dias úteis do período", () => {
    const data = createEmptyData();
    // 10 dias úteis = 80 horas de trabalho esperado para 1 FTE.
    // 240 horas registradas devem resultar em exatamente 3.0 FTEs.
    data.timeLogs = [
      { id: "t1", person_id: "u1", project_id: "p1", hours: 100 } as TimeLog,
      { id: "t2", person_id: "u2", project_id: "p2", hours: 140 } as TimeLog,
    ];

    const results = calculateIndicators(data, [], "todos", "todos", 10, {});
    expect(results["fte_efetivo_carteira_mensal"].value).toBe(3.0);
  });

  it("deve calcular o FTE Efetivo da carteira utilizando o parâmetro de horas esperadas mensal dinâmico", () => {
    const data = createEmptyData();
    // 200 horas registradas. Se o parâmetro expectedHoursMonth for 100, deve resultar em 2.0 FTEs.
    data.timeLogs = [
      { id: "t1", person_id: "u1", project_id: "p1", hours: 120 } as TimeLog,
      { id: "t2", person_id: "u2", project_id: "p2", hours: 80 } as TimeLog,
    ];

    const results = calculateIndicators(data, [], "todos", "todos", 22, {}, 100);
    expect(results["fte_efetivo_carteira_mensal"].value).toBe(2.0);
  });

  it("deve marcar o benchmark de todos os indicadores como falso quando as coleções estiverem vazias (Empty States)", () => {
    const emptyData = createEmptyData();
    const results = calculateIndicators(emptyData, [], "todos", "todos", 22, {});
    ALL_INDICATORS.forEach((ind) => {
      expect(results[ind.id].benchmark).toBe(false);
    });
  });

  it("deve aplicar corretamente o filtro de GP / Responsável no cálculo de TOR (Taxa de Ociosidade Relativa)", () => {
    const data = createEmptyData();
    const profiles = [
      { id: "u1", email: "u1@uefs.br", full_name: "User 1", active: true, role: "colaborador", setor: "desenvolvimento", carga_horaria: 40 } as UserProfile,
      { id: "u2", email: "u2@uefs.br", full_name: "User 2", active: true, role: "colaborador", setor: "desenvolvimento", carga_horaria: 40 } as UserProfile,
    ];

    // u1 lança 80h (ociosidade 0% para 10 dias úteis com 40h semanais -> 80h totais)
    // u2 lança 0h (ociosidade 100%)
    data.timeLogs = [
      { id: "t1", person_id: "u1", hours: 80 } as TimeLog,
    ];

    // Sem filtro: Total esperado = 160h, Lançado = 80h -> TOR = 50%
    const resAll = calculateIndicators(data, profiles, "todos", "todos", 10, {});
    expect(resAll["tor_ociosidade_global_mensal"].value).toBe(50);

    // Filtrando por u1: Esperado = 80h, Lançado = 80h -> TOR = 0%
    const resU1 = calculateIndicators(data, profiles, "todos", "u1", 10, {});
    expect(resU1["tor_ociosidade_global_mensal"].value).toBe(0);

    // Filtrando por u2: Esperado = 80h, Lançado = 0h -> TOR = 100%
    const resU2 = calculateIndicators(data, profiles, "todos", "u2", 10, {});
    expect(resU2["tor_ociosidade_global_mensal"].value).toBe(100);
  });
});
