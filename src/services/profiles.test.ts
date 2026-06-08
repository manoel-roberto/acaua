import { describe, it, expect, beforeEach } from "vitest";
import "@/test/firebaseMock"; // Ativa mocks do Firebase
import { clearMockDb, setMockDoc, getMockCollectionData } from "@/test/firebaseMock";
import { 
  getProfiles, 
  createPreProfile, 
  updateProfile, 
  deleteProfile 
} from "./profiles";

describe("Serviço de Perfis (profiles)", () => {
  beforeEach(() => {
    clearMockDb();
  });

  describe("getProfiles", () => {
    it("deve buscar todos os perfis cadastrados ordenados por nome completo de forma ascendente", async () => {
      // Configura dados na coleção profiles do mock
      setMockDoc("profiles", "u1", { full_name: "Carlos Silva", email: "carlos@uefs.br", role: "analista" });
      setMockDoc("profiles", "u2", { full_name: "Ana Costa", email: "ana@uefs.br", role: "admin" });
      setMockDoc("profiles", "u3", { full_name: "Bruno Souza", email: "bruno@uefs.br", role: "gestor" });

      const profiles = await getProfiles();

      expect(profiles.length).toBe(3);
      
      // Verifica a ordenação por full_name ascendente: Ana Costa -> Bruno Souza -> Carlos Silva
      expect(profiles[0].id).toBe("u2");
      expect(profiles[0].full_name).toBe("Ana Costa");
      
      expect(profiles[1].id).toBe("u3");
      expect(profiles[1].full_name).toBe("Bruno Souza");
      
      expect(profiles[2].id).toBe("u1");
      expect(profiles[2].full_name).toBe("Carlos Silva");
    });

    it("deve retornar uma lista vazia se não houver perfis", async () => {
      const profiles = await getProfiles();
      expect(profiles).toEqual([]);
    });
  });

  describe("createPreProfile", () => {
    it("deve criar um pré-perfil com ID gerado, normalizando o e-mail em minúsculas e limpando espaços", async () => {
      const email = "  Colaborador@Uefs.Br   ";
      const profileData = {
        full_name: "Colaborador de Teste",
        cargo: "Estagiário",
        funcao: "Desenvolvedor",
        setor: "NGD",
        carga_horaria: 20,
        role: "analista" as const,
        active: true,
      };

      await createPreProfile(email, profileData);

      const profiles = getMockCollectionData("profiles");
      expect(profiles.length).toBe(1);

      const created = profiles[0] as any;
      expect(created.id).toBeDefined();
      expect(created.email).toBe("colaborador@uefs.br");
      expect(created.full_name).toBe("Colaborador de Teste");
      expect(created.cargo).toBe("Estagiário");
      expect(created.funcao).toBe("Desenvolvedor");
      expect(created.setor).toBe("NGD");
      expect(created.carga_horaria).toBe(20);
      expect(created.role).toBe("analista");
      expect(created.active).toBe(true);
      expect(created.avatar_url).toBe("");
      expect(created.created_at).toBeDefined();
      expect(created.updated_at).toBeDefined();
    });
  });

  describe("updateProfile", () => {
    it("deve atualizar os campos informados de um perfil e definir updated_at com o timestamp atual", async () => {
      setMockDoc("profiles", "user_123", {
        full_name: "Nome Antigo",
        email: "antigo@uefs.br",
        cargo: "Estagiário",
        role: "analista",
        created_at: "2026-06-01T10:00:00.000Z",
        updated_at: "2026-06-01T10:00:00.000Z"
      });

      await updateProfile("user_123", {
        full_name: "Nome Novo",
        cargo: "Analista Sênior"
      });

      const profiles = getMockCollectionData("profiles");
      expect(profiles.length).toBe(1);

      const updated = profiles[0] as any;
      expect(updated.full_name).toBe("Nome Novo");
      expect(updated.cargo).toBe("Analista Sênior");
      expect(updated.email).toBe("antigo@uefs.br"); // Não modificado
      expect(new Date(updated.updated_at).getTime()).toBeGreaterThan(new Date("2026-06-01T10:00:00.000Z").getTime());
    });
  });

  describe("deleteProfile", () => {
    it("deve excluir o documento do perfil correspondente", async () => {
      setMockDoc("profiles", "user_123", {
        full_name: "Perfil Excluir",
        email: "excluir@uefs.br"
      });

      expect(getMockCollectionData("profiles").length).toBe(1);

      await deleteProfile("user_123");

      expect(getMockCollectionData("profiles").length).toBe(0);
    });
  });
});
