import { describe, it, expect, beforeEach } from "vitest";
import "@/test/firebaseMock"; // Ativa mocks do Firebase
import { clearMockDb, setMockDoc, getMockCollectionData, mockCurrentUser } from "@/test/firebaseMock";
import { 
  getProjects, 
  createProject, 
  updateProject, 
  updateProjectStatus, 
  deleteProject 
} from "./projects";
import { Project } from "@/types";

describe("Serviço de Projetos (projects)", () => {
  beforeEach(() => {
    clearMockDb();
  });

  describe("createProject", () => {
    it("deve criar um projeto com progresso inicial zero e registrar a demanda em metrics/global", async () => {
      const newProj = await createProject({
        name: "Projeto Teste",
        description: "Descrição",
        status: "em_andamento",
        origem_demanda: "Dados",
        archived: false,
        responsible_id: "u1",
        responsible_name: "Responsável 1",
        category: "dados",
        start_date: "2026-06-01",
        end_date: "2026-06-30",
        members: []
      });

      expect(newProj.id).toBeDefined();
      expect(newProj.progress).toBe(0);
      expect(newProj.executed_hours).toBe(0);
      expect(newProj.created_at).toBeDefined();

      // Verifica se gravou no Firestore
      const projects = getMockCollectionData("projects");
      expect(projects.length).toBe(1);
      expect(projects[0]).toMatchObject({ name: "Projeto Teste", progress: 0 });

      // Verifica se registrou a origem de demanda na métrica global
      const metrics = getMockCollectionData("metrics");
      expect(metrics.length).toBe(1);
      expect(metrics[0]).toMatchObject({
        id: "global",
        demand_sources: ["Dados"]
      });
    });
  });

  describe("getProjects", () => {
    it("deve buscar projetos respeitando ordenação, limite de 25 e filtro de arquivamento", async () => {
      // Cria 3 projetos em datas diferentes
      setMockDoc("projects", "p1", { name: "P1", created_at: "2026-06-01T10:00:00Z", archived: false });
      setMockDoc("projects", "p2", { name: "P2", created_at: "2026-06-02T10:00:00Z", archived: false });
      setMockDoc("projects", "p3", { name: "P3", created_at: "2026-06-03T10:00:00Z", archived: true });

      // Sem incluir arquivados (padrão)
      const res = await getProjects();
      expect(res.projects.length).toBe(2);
      // Ordenado por criados de forma decrescente: p2 (dia 02) depois p1 (dia 01)
      expect(res.projects[0].name).toBe("P2");
      expect(res.projects[1].name).toBe("P1");

      // Incluindo arquivados
      const resAll = await getProjects({ includeArchived: true });
      expect(resAll.projects.length).toBe(3);
    });
  });

  describe("updateProjectStatus", () => {
    it("deve atualizar o status, logar auditoria e alterar contadores globais incrementalmente", async () => {
      // Configura estado inicial
      setMockDoc("projects", "p1", { name: "P1", status: "em_andamento", archived: false });
      setMockDoc("metrics", "global", {
        projects_active: 5,
        projects_done: 2
      });

      await updateProjectStatus({
        projectId: "p1",
        oldStatus: "em_andamento",
        newStatus: "concluido",
        userId: "user_123",
        userEmail: "gestor@uefs.br"
      });

      // 1. Verifica status atualizado no projeto
      const proj = getMockCollectionData("projects")[0] as any;
      expect(proj.status).toBe("concluido");

      // 2. Verifica se gerou log de auditoria
      const logs = getMockCollectionData("audit_logs");
      expect(logs.length).toBe(1);
      expect(logs[0]).toMatchObject({
        user_id: "user_123",
        user_email: "gestor@uefs.br",
        action: "UPDATE_STATUS",
        table_name: "projects",
        record_id: "p1",
        old_status: "em_andamento",
        new_status: "concluido"
      });

      // 3. Verifica contadores na métrica global
      const metrics = getMockCollectionData("metrics")[0] as any;
      expect(metrics.projects_active).toBe(4); // Decrementou 1 (5 - 1)
      expect(metrics.projects_done).toBe(3);   // Incrementou 1 (2 + 1)
    });
  });

  describe("deleteProject", () => {
    it("deve excluir o projeto, decrementar contador em metrics/global e registrar auditoria", async () => {
      mockCurrentUser({ uid: "user_admin", email: "admin@ngd.com" });

      const projectMock: Project = {
        id: "p1",
        name: "P1",
        status: "em_andamento"
      } as any;

      setMockDoc("projects", "p1", projectMock);
      setMockDoc("metrics", "global", {
        projects_active: 3
      });

      await deleteProject(projectMock);

      // 1. Verifica se excluiu o documento
      expect(getMockCollectionData("projects").length).toBe(0);

      // 2. Verifica se decrementou a métrica global
      const metrics = getMockCollectionData("metrics")[0] as any;
      expect(metrics.projects_active).toBe(2);

      // 3. Verifica se gerou o log com dados do usuário ativo
      const logs = getMockCollectionData("audit_logs");
      expect(logs.length).toBe(1);
      expect(logs[0]).toMatchObject({
        user_id: "user_admin",
        user_email: "admin@ngd.com",
        action: "DELETE_PROJECT",
        record_id: "p1",
        old_status: "em_andamento",
        new_status: "DELETED"
      });
    });
  });
});
