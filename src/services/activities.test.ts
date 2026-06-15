import { describe, it, expect, beforeEach } from "vitest";
import "@/test/firebaseMock"; // Ativa os mocks
import { clearMockDb, setMockDoc, getMockCollectionData } from "@/test/firebaseMock";
import { 
  getActivities, 
  createActivity, 
  duplicateActivity, 
  updateActivity, 
  updateActivityStatus, 
  deleteActivitiesBatch, 
  importActivitiesBatch 
} from "./activities";
import { Activity } from "@/types";

describe("Serviço de Atividades (activities)", () => {
  beforeEach(() => {
    clearMockDb();
  });

  describe("getActivities", () => {
    it("deve filtrar atividades por status, responsável e projeto", async () => {
      setMockDoc("activities", "a1", { title: "A1", status: "pendente", responsible_id: "u1", project_id: "p1", created_at: "2026-06-01" });
      setMockDoc("activities", "a2", { title: "A2", status: "concluida", responsible_id: "u2", project_id: "p1", created_at: "2026-06-02" });
      setMockDoc("activities", "a3", { title: "A3", status: "pendente", responsible_id: "u1", project_id: "p2", created_at: "2026-06-03" });

      // Filtro de status
      const resStatus = await getActivities({ status: "concluida" });
      expect(resStatus.activities.length).toBe(1);
      expect(resStatus.activities[0].title).toBe("A2");

      // Filtro de responsável
      const resResp = await getActivities({ responsibleId: "u1" });
      expect(resResp.activities.length).toBe(2);

      // Filtro de projeto
      const resProj = await getActivities({ projectId: "p1" });
      expect(resProj.activities.length).toBe(2);
    });
  });

  describe("createActivity & duplicateActivity", () => {
    it("deve criar atividade e duplicá-la limpando horas executadas", async () => {
      const created = await createActivity({
        title: "Daily",
        description: "Reunião rápida",
        responsible_id: "u1",
        responsible_name: "Colaborador 1",
        project_id: null,
        project_name: null,
        type: "reuniao",
        status: "pendente",
        priority: "media",
        activity_date: "2026-06-03",
        hours_planned: 1
      });

      expect(created.id).toBeDefined();
      expect(created.hours_executed).toBe(0);

      // Duplica a atividade
      const duplicated = await duplicateActivity(created, "user_solicitante");
      expect(duplicated.id).toBeDefined();
      expect(duplicated.id).not.toBe(created.id);
      expect(duplicated.hours_executed).toBe(0);
      expect(duplicated.status).toBe("pendente");
      expect(duplicated.created_by).toBe("user_solicitante");
    });
  });

  describe("Auto-preenchimento de horas de execução", () => {
    it("deve calcular horas de execução automaticamente a partir do planejamento se não informadas", async () => {
      const actId = "a1";
      setMockDoc("activities", actId, {
        id: actId,
        title: "Teste Auto-fill",
        status: "pendente",
        start_time_planned: "10:00",
        end_time_planned: "11:30",
        hours_planned: 1.5,
        type: "projeto"
      });

      // Transiciona para concluída
      await updateActivityStatus({
        activityId: actId,
        oldStatus: "pendente",
        newStatus: "concluida",
        userId: "u1",
        userEmail: "colab@uefs.br"
      });

      const act = getMockCollectionData("activities")[0] as Activity;
      expect(act.status).toBe("concluida");
      // Diferença entre 10h00 e 11h30 é 1.5 horas
      expect(act.hours_executed).toBe(1.5);
      expect(act.start_time_executed).toBe("10:00");
      expect(act.end_time_executed).toBe("11:30");
    });
  });

  describe("Sincronização de horas executadas com métricas e logs de tempo", () => {
    it("deve criar logs de tempo e atualizar métricas ao criar atividade com horários executados", async () => {
      setMockDoc("projects", "p1", { id: "p1", name: "Projeto 1", executed_hours: 10 });
      setMockDoc("metrics", "global", { total_hours_month: 20 });

      const act = await createActivity({
        title: "Atividade Executada",
        description: "Teste",
        responsible_id: "u1",
        responsible_name: "Colaborador 1",
        project_id: "p1",
        project_name: "Projeto 1",
        type: "projeto",
        status: "pendente",
        priority: "media",
        activity_date: "2026-06-03",
        start_time_executed: "08:00",
        end_time_executed: "09:30",
        hours_planned: 1.5,
        observations: "",
        tags: [],
        created_by: "u1"
      });

      // Deve ter calculado e salvo 1.5 horas executadas
      expect(act.hours_executed).toBe(1.5);

      // Deve ter criado um registro correspondente em time_logs
      const logs = getMockCollectionData("time_logs");
      expect(logs.length).toBe(1);
      expect(logs[0].hours).toBe(1.5);
      expect(logs[0].project_id).toBe("p1");
      expect(logs[0].activity_id).toBe(act.id);

      // Deve ter incrementado as horas do projeto
      const proj = getMockCollectionData("projects")[0] as Record<string, unknown>;
      expect(proj.executed_hours).toBe(11.5);

      // Deve ter incrementado as métricas globais
      const global = getMockCollectionData("metrics")[0] as Record<string, unknown>;
      expect(global.total_hours_month).toBe(21.5);
    });

    it("deve registrar a diferença de horas ao editar horas executadas diretamente", async () => {
      setMockDoc("projects", "p1", { id: "p1", name: "Projeto 1", executed_hours: 10 });
      setMockDoc("metrics", "global", { total_hours_month: 20 });
      setMockDoc("activities", "act_edit", {
        id: "act_edit",
        title: "Atividade Edição",
        responsible_id: "u1",
        responsible_name: "Colaborador 1",
        project_id: "p1",
        project_name: "Projeto 1",
        hours_executed: 1.5,
        activity_date: "2026-06-03"
      });

      // Edita aumentando as horas executadas para 2.5
      await updateActivity("act_edit", {
        hours_executed: 2.5
      });

      const act = getMockCollectionData("activities").find((a: Record<string, unknown>) => a.id === "act_edit") as Activity;
      expect(act.hours_executed).toBe(2.5);

      // Deve ter gerado um time_log com o delta (+1.0)
      const logs = getMockCollectionData("time_logs");
      expect(logs.length).toBe(1);
      expect(logs[0].hours).toBe(1.0);
      expect(logs[0].activity_id).toBe("act_edit");

      // Horas do projeto devem ir para 11.0 (10 + 1.0)
      const proj = getMockCollectionData("projects")[0] as Record<string, unknown>;
      expect(proj.executed_hours).toBe(11.0);

      // Métricas globais devem ir para 21.0 (20 + 1.0)
      const global = getMockCollectionData("metrics")[0] as Record<string, unknown>;
      expect(global.total_hours_month).toBe(21.0);
    });

    it("deve registrar delta negativo ao diminuir horas executadas diretamente", async () => {
      setMockDoc("projects", "p1", { id: "p1", name: "Projeto 1", executed_hours: 10 });
      setMockDoc("metrics", "global", { total_hours_month: 20 });
      setMockDoc("activities", "act_edit", {
        id: "act_edit",
        title: "Atividade Edição",
        responsible_id: "u1",
        responsible_name: "Colaborador 1",
        project_id: "p1",
        project_name: "Projeto 1",
        hours_executed: 3.0,
        activity_date: "2026-06-03"
      });

      // Edita diminuindo as horas executadas para 1.0
      await updateActivity("act_edit", {
        hours_executed: 1.0
      });

      // Deve ter gerado um time_log com o delta (-2.0)
      const logs = getMockCollectionData("time_logs");
      expect(logs.length).toBe(1);
      expect(logs[0].hours).toBe(-2.0);

      // Horas do projeto devem ir para 8.0 (10 - 2.0)
      const proj = getMockCollectionData("projects")[0] as Record<string, unknown>;
      expect(proj.executed_hours).toBe(8.0);

      // Métricas globais devem ir para 18.0 (20 - 2.0)
      const global = getMockCollectionData("metrics")[0] as Record<string, unknown>;
      expect(global.total_hours_month).toBe(18.0);
    });

    it("deve propagar horas corretamente no auto-preenchimento ao concluir status", async () => {
      setMockDoc("projects", "p1", { id: "p1", name: "Projeto 1", executed_hours: 10 });
      setMockDoc("metrics", "global", { total_hours_month: 20 });
      setMockDoc("activities", "act_status", {
        id: "act_status",
        title: "Atividade Conclusão",
        status: "pendente",
        responsible_id: "u1",
        responsible_name: "Colaborador 1",
        project_id: "p1",
        project_name: "Projeto 1",
        start_time_planned: "14:00",
        end_time_planned: "15:30",
        hours_executed: 0,
        activity_date: "2026-06-03"
      });

      await updateActivityStatus({
        activityId: "act_status",
        oldStatus: "pendente",
        newStatus: "concluida",
        userId: "u1",
        userEmail: "user@uefs.br"
      });

      const act = getMockCollectionData("activities").find((a: Record<string, unknown>) => a.id === "act_status") as Activity;
      expect(act.hours_executed).toBe(1.5);

      // Deve ter gerado um time_log com +1.5
      const logs = getMockCollectionData("time_logs");
      expect(logs.length).toBe(1);
      expect(logs[0].hours).toBe(1.5);

      // Horas do projeto e globais devem ser incrementadas em 1.5
      const proj = getMockCollectionData("projects")[0] as Record<string, unknown>;
      expect(proj.executed_hours).toBe(11.5);

      const global = getMockCollectionData("metrics")[0] as Record<string, unknown>;
      expect(global.total_hours_month).toBe(21.5);
    });
  });

  describe("Geração de Próxima Atividade de Rotina", () => {
    it("deve spawnar a próxima atividade de rotina com status pendente e atualizar a rotina de origem", async () => {
      const routineId = "rot_123";
      // 1. Cadastra rotina recorrente de periodicidade semanal
      setMockDoc("recurring_routines", routineId, {
        title: "Relatório de Atividades NGD",
        description: "Envio do reporte",
        frequency: "semana",
        interval: 1,
        week_days: [1],
        next_run: "2026-06-08", // Segunda-feira
        created_by: "user_scheduler",
        project_id: "p_abc",
        project_name: "Projeto ABC",
        active: true,
        priority: "alta"
      });

      // 2. Cadastra a atividade atual vinculada à rotina
      const actId = "act_curr";
      setMockDoc("activities", actId, {
        id: actId,
        title: "Relatório de Atividades NGD",
        routine_id: routineId,
        status: "pendente",
        type: "rotina",
        activity_date: "2026-06-01"
      });

      // 3. Conclui a atividade atual
      const nextAct = await updateActivityStatus({
        activityId: actId,
        oldStatus: "pendente",
        newStatus: "concluida",
        userId: "u1",
        userEmail: "colab@uefs.br"
      });

      expect(nextAct).toBeDefined();
      expect(nextAct!.status).toBe("pendente");
      expect(nextAct!.routine_id).toBe(routineId);
      expect(nextAct!.activity_date).toBe("2026-06-08"); // Data da próxima execução da rotina

      // 4. Verifica se atualizou os campos last_run e next_run na rotina
      const rot = getMockCollectionData("recurring_routines")[0] as Record<string, unknown>;
      expect(rot.last_run).toBe("2026-06-08");
      // Próxima execução calculada: somar 1 semana ao "2026-06-08" -> "2026-06-15"
      expect(rot.next_run).toBe("2026-06-15");
    });
  });

  describe("Operações em Lote (Batch)", () => {
    it("deve deletar em lote atômico", async () => {
      setMockDoc("activities", "a1", { title: "A1" });
      setMockDoc("activities", "a2", { title: "A2" });

      await deleteActivitiesBatch(["a1", "a2"]);
      expect(getMockCollectionData("activities").length).toBe(0);
    });

    it("deve importar atividades em lote com sucesso", async () => {
      const importData = [
        { title: "Task 1", type: "suporte", status: "pendente", priority: "media" } as Activity,
        { title: "Task 2", type: "suporte", status: "pendente", priority: "media" } as Activity,
      ];

      await importActivitiesBatch(importData);
      expect(getMockCollectionData("activities").length).toBe(2);
    });
  });
});
