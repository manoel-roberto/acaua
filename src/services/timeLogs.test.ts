import { describe, it, expect, beforeEach } from "vitest";
import "@/test/firebaseMock"; // Ativa mocks do Firebase
import { clearMockDb, setMockDoc, getMockCollectionData } from "@/test/firebaseMock";
import { getTimeLogs, logHours, deleteTimeLog } from "./timeLogs";
import { TimeLog } from "@/types";

describe("Serviço de Lançamento de Horas (timeLogs)", () => {
  beforeEach(() => {
    clearMockDb();
  });

  describe("getTimeLogs", () => {
    it("deve buscar lançamentos de horas com filtros de pessoa, atividade e projeto", async () => {
      setMockDoc("time_logs", "l1", { person_id: "u1", activity_id: "a1", project_id: "p1", hours: 2, created_at: "2026-06-01" });
      setMockDoc("time_logs", "l2", { person_id: "u2", activity_id: "a2", project_id: "p1", hours: 4, created_at: "2026-06-02" });
      setMockDoc("time_logs", "l3", { person_id: "u1", activity_id: "a3", project_id: "p2", hours: 1, created_at: "2026-06-03" });

      // Filtro de pessoa
      const resPerson = await getTimeLogs({ personId: "u1" });
      expect(resPerson.logs.length).toBe(2);

      // Filtro de atividade
      const resAct = await getTimeLogs({ activityId: "a2" });
      expect(resAct.logs.length).toBe(1);
      expect(resAct.logs[0].hours).toBe(4);

      // Filtro de projeto
      const resProj = await getTimeLogs({ projectId: "p1" });
      expect(resProj.logs.length).toBe(2);
    });
  });

  describe("logHours", () => {
    it("deve registrar o lançamento, incrementar horas executadas na atividade/projeto e atualizar metrics/global", async () => {
      // 1. Configura estado inicial dos documentos relacionados
      setMockDoc("activities", "act_1", { title: "Atividade 1", hours_executed: 5 });
      setMockDoc("projects", "proj_1", { name: "Projeto 1", executed_hours: 10 });
      setMockDoc("metrics", "global", { total_hours_month: 20 });

      // 2. Efetua o lançamento de 3 horas
      await logHours({
        person_id: "u1",
        person_name: "Manoel",
        activity_id: "act_1",
        activity_title: "Atividade 1",
        project_id: "proj_1",
        project_name: "Projeto 1",
        hours: 3,
        description: "Desenvolvimento de testes unitários",
        date: "2026-06-03"
      });

      // 3. Verifica se o log de horas foi persistido
      const logs = getMockCollectionData("time_logs");
      expect(logs.length).toBe(1);
      expect(logs[0]).toMatchObject({
        person_id: "u1",
        hours: 3,
        activity_id: "act_1",
        project_id: "proj_1"
      });

      // 4. Verifica se incrementou a atividade
      const act = getMockCollectionData("activities").find((a: Record<string, unknown>) => a.id === "act_1") as Record<string, unknown>;
      expect(act.hours_executed).toBe(8); // 5 + 3

      // 5. Verifica se incrementou o projeto
      const proj = getMockCollectionData("projects").find((p: Record<string, unknown>) => p.id === "proj_1") as Record<string, unknown>;
      expect(proj.executed_hours).toBe(13); // 10 + 3

      // 6. Verifica se atualizou a métrica global
      const metrics = getMockCollectionData("metrics").find((m: Record<string, unknown>) => m.id === "global") as Record<string, unknown>;
      expect(metrics.total_hours_month).toBe(23); // 20 + 3
    });
  });

  describe("deleteTimeLog", () => {
    it("deve deletar o lançamento e decrementar horas executadas na atividade/projeto e metrics/global", async () => {
      // 1. Configura estado inicial dos documentos relacionados
      setMockDoc("activities", "act_1", { title: "Atividade 1", hours_executed: 8 });
      setMockDoc("projects", "proj_1", { name: "Projeto 1", executed_hours: 13 });
      setMockDoc("metrics", "global", { total_hours_month: 23 });
      setMockDoc("time_logs", "log_del", {
        id: "log_del",
        person_id: "u1",
        person_name: "Manoel",
        activity_id: "act_1",
        activity_title: "Atividade 1",
        project_id: "proj_1",
        project_name: "Projeto 1",
        hours: 3,
        description: "Desenvolvimento de testes unitários",
        date: "2026-06-03"
      });

      const log = getMockCollectionData("time_logs")[0] as unknown as TimeLog;

      // 2. Deleta o lançamento
      await deleteTimeLog(log);

      // 3. Verifica se o log foi removido
      const logs = getMockCollectionData("time_logs");
      expect(logs.length).toBe(0);

      // 4. Verifica se decrementou a atividade
      const act = getMockCollectionData("activities").find((a: Record<string, unknown>) => a.id === "act_1") as Record<string, unknown>;
      expect(act.hours_executed).toBe(5); // 8 - 3

      // 5. Verifica se decrementou o projeto
      const proj = getMockCollectionData("projects").find((p: Record<string, unknown>) => p.id === "proj_1") as Record<string, unknown>;
      expect(proj.executed_hours).toBe(10); // 13 - 3

      // 6. Verifica se decrementou a métrica global
      const metrics = getMockCollectionData("metrics").find((m: Record<string, unknown>) => m.id === "global") as Record<string, unknown>;
      expect(metrics.total_hours_month).toBe(20); // 23 - 3
    });
  });
});
