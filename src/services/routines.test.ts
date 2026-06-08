import { describe, it, expect, beforeEach } from "vitest";
import "@/test/firebaseMock"; // Ativa mocks
import { clearMockDb, setMockDoc, getMockCollectionData } from "@/test/firebaseMock";
import { 
  getRoutines, 
  createRoutine, 
  updateRoutine, 
  deleteRoutine, 
  calculateNextRun 
} from "./routines";
import { RecurringRoutine } from "@/types";

describe("Serviço de Rotinas Recorrentes (routines)", () => {
  beforeEach(() => {
    clearMockDb();
  });

  describe("calculateNextRun", () => {
    it("deve calcular a próxima execução corretamente para frequência dia", () => {
      // Adiciona 3 dias a partir de 2026-06-01
      const res = calculateNextRun("2026-06-01", "dia", 3);
      expect(res).toBe("2026-06-04");
    });

    it("deve calcular a próxima execução para frequência semana sem week_days", () => {
      // Adiciona 2 semanas a partir de 2026-06-01
      const res = calculateNextRun("2026-06-01", "semana", 2);
      expect(res).toBe("2026-06-15");
    });

    it("deve calcular a próxima execução para frequência semana com week_days", () => {
      // Segunda-feira (1), a partir de 2026-06-08 (Segunda) -> próxima semana (intervalo 1)
      const res = calculateNextRun("2026-06-08", "semana", 1, [1]);
      expect(res).toBe("2026-06-15");

      // Terça-feira (2), a partir de 2026-06-08 (Segunda) -> deve cair no dia seguinte
      const resNextDay = calculateNextRun("2026-06-08", "semana", 1, [2]);
      expect(resNextDay).toBe("2026-06-09");
    });

    it("deve calcular a próxima execução para frequências mês e ano", () => {
      const resMonth = calculateNextRun("2026-06-01", "mes", 2);
      expect(resMonth).toBe("2026-08-01");

      const resYear = calculateNextRun("2026-06-01", "ano", 1);
      expect(resYear).toBe("2027-06-01");
    });
  });

  describe("createRoutine", () => {
    it("deve criar uma rotina e enfileirar a primeira atividade associada como pendente", async () => {
      const newRoutine = await createRoutine({
        title: "Limpeza de Logs",
        description: "Rotina de manutenção",
        frequency: "dia",
        interval: 2,
        next_run: "2026-06-01",
        created_by: "u1",
        project_id: "p1",
        project_name: "Projeto P1",
        priority: "baixa",
        active: true,
        type: "rotina",
        hours_planned: 0.5,
        tags: ["manutencao"]
      } as any, "Manoel");

      expect(newRoutine.id).toBeDefined();
      // O next_run da rotina deve ser incrementado: "2026-06-01" + 2 dias = "2026-06-03"
      expect(newRoutine.next_run).toBe("2026-06-03");
      expect(newRoutine.last_run).toBe("2026-06-01");

      // Verifica se a rotina foi salva no Firestore
      const routines = getMockCollectionData("recurring_routines");
      expect(routines.length).toBe(1);
      expect(routines[0]).toMatchObject({ title: "Limpeza de Logs", next_run: "2026-06-03" });

      // Verifica se a primeira atividade foi gerada como pendente para a data original de next_run (2026-06-01)
      const activities = getMockCollectionData("activities");
      expect(activities.length).toBe(1);
      expect(activities[0]).toMatchObject({
        title: "Limpeza de Logs",
        status: "pendente",
        activity_date: "2026-06-01",
        routine_id: newRoutine.id,
        responsible_name: "Manoel"
      });
    });
  });

  describe("updateRoutine & deleteRoutine & getRoutines", () => {
    it("deve gerenciar atualizações, deleções e listagem ordenada", async () => {
      setMockDoc("recurring_routines", "r1", { title: "R1", created_at: "2026-06-01" });
      setMockDoc("recurring_routines", "r2", { title: "R2", created_at: "2026-06-02" });

      // Listagem ordenada por criação descrescente: r2 depois r1
      const list = await getRoutines();
      expect(list.routines.map(r => r.title)).toEqual(["R2", "R1"]);

      // Atualização
      await updateRoutine("r1", { title: "R1-Alt" });
      const updated = getMockCollectionData("recurring_routines").find((r: any) => r.id === "r1") as any;
      expect(updated.title).toBe("R1-Alt");

      // Deleção
      await deleteRoutine("r1");
      expect(getMockCollectionData("recurring_routines").length).toBe(1);
    });
  });
});
