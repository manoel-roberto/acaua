import { describe, it, expect, beforeEach } from "vitest";
import "@/test/firebaseMock"; // Ativa mocks do Firebase
import { clearMockDb, setMockDoc, getMockCollectionData } from "@/test/firebaseMock";
import { updateArchiveDaysLimit } from "./settings";

describe("Serviço de Configurações (settings)", () => {
  beforeEach(() => {
    clearMockDb();
  });

  describe("updateArchiveDaysLimit", () => {
    it("deve atualizar o limite de dias para arquivamento no documento global de métricas", async () => {
      // Configura estado inicial das métricas
      setMockDoc("metrics", "global", {
        projects_active: 5,
        archive_days_limit: 30,
        last_updated: "2026-06-01T10:00:00.000Z"
      });

      await updateArchiveDaysLimit(45);

      const metrics = getMockCollectionData("metrics");
      expect(metrics.length).toBe(1);

      const globalMetrics = metrics[0] as any;
      expect(globalMetrics.id).toBe("global");
      expect(globalMetrics.archive_days_limit).toBe(45);
      expect(globalMetrics.projects_active).toBe(5); // Outros campos permanecem intactos
      expect(globalMetrics.last_updated).toBeDefined();
      expect(new Date(globalMetrics.last_updated).getTime()).toBeGreaterThan(new Date("2026-06-01T10:00:00.000Z").getTime());
    });
  });
});
