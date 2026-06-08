import { describe, it, expect, beforeEach } from "vitest";
import "@/test/firebaseMock"; // Ativa os mocks
import { clearMockDb, setMockDoc, getMockCollectionData } from "@/test/firebaseMock";
import { 
  getActivities, 
  createActivity, 
  duplicateActivity, 
  updateActivity, 
  updateActivityStatus, 
  deleteActivity, 
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

      const act = getMockCollectionData("activities")[0] as any;
      expect(act.status).toBe("concluida");
      // Diferença entre 10h00 e 11h30 é 1.5 horas
      expect(act.hours_executed).toBe(1.5);
      expect(act.start_time_executed).toBe("10:00");
      expect(act.end_time_executed).toBe("11:30");
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
      const rot = getMockCollectionData("recurring_routines")[0] as any;
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
