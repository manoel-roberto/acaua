import { describe, it, expect, beforeEach } from "vitest";
import "@/test/firebaseMock"; // Ativa os mocks globais do Firebase
import { clearMockDb, setMockDoc, getMockCollectionData } from "@/test/firebaseMock";
import { 
  normalizeKey, 
  getSectors, 
  createSector, 
  deleteSector,
  getActivityTypes,
  createActivityType,
  deleteActivityType,
  getCategories,
  createCategory,
  deleteCategory,
  cleanDuplicateRegistrations
} from "./registrations";

describe("Serviço de Cadastros/Registros (registrations)", () => {
  beforeEach(() => {
    clearMockDb();
  });

  describe("Função normalizeKey", () => {
    it("deve normalizar strings removendo acentos, espaços e caracteres especiais", () => {
      expect(normalizeKey("Gestão de Dados")).toBe("gestao_de_dados");
      expect(normalizeKey("Capacitação!")).toBe("capacitacao");
      expect(normalizeKey("  Setor_Teste 123 ")).toBe("setor_teste_123");
    });
  });

  describe("Gerenciamento de Setores", () => {
    it("deve criar um setor com sucesso e salvá-lo no Firestore", async () => {
      const sector = await createSector("Dados");
      expect(sector.id).toBeDefined();
      expect(sector.name).toBe("Dados");
      
      const stored = getMockCollectionData("sectors");
      expect(stored.length).toBe(1);
      expect(stored[0]).toMatchObject({ name: "Dados" });
    });

    it("deve rejeitar a criação de setores duplicados de forma case-insensitive e sem acentos", async () => {
      await createSector("Dados e Sistemas");

      // Deve lançar erro para "dados e sistemas"
      await expect(createSector("dados e sistemas")).rejects.toThrow();
      
      // Deve lançar erro para "Dados e Sístemas"
      await expect(createSector("Dados e Sístemas")).rejects.toThrow();
    });

    it("deve listar setores ordenados de forma ascendente pelo nome", async () => {
      setMockDoc("sectors", "s2", { name: "Sistemas" });
      setMockDoc("sectors", "s1", { name: "Dados" });
      setMockDoc("sectors", "s3", { name: "Administração" });

      const list = await getSectors();
      expect(list.map(s => s.name)).toEqual(["Administração", "Dados", "Sistemas"]);
    });

    it("deve impedir exclusão de setores que possuem usuários/perfis vinculados", async () => {
      // Cria setor e perfil vinculado
      setMockDoc("sectors", "s1", { name: "Dados" });
      setMockDoc("profiles", "p1", { email: "colab@uefs.br", setor: "Dados" });

      await expect(deleteSector("s1", "Dados")).rejects.toThrow(
        'Não é possível excluir o setor "Dados" pois ele está sendo utilizado por um ou mais usuários.'
      );
    });

    it("deve permitir exclusão de setores sem vínculos", async () => {
      setMockDoc("sectors", "s1", { name: "Dados" });
      await deleteSector("s1", "Dados");

      const list = await getSectors();
      expect(list.length).toBe(0);
    });
  });

  describe("Gerenciamento de Categorias de Projeto", () => {
    it("deve criar, listar e excluir categorias respeitando regras de unicidade", async () => {
      const category = await createCategory("Infraestrutura");
      expect(category.name).toBe("Infraestrutura");

      await expect(createCategory("infraestrutura")).rejects.toThrow();

      // Impede exclusão se houver projetos vinculados
      setMockDoc("projects", "pr1", { name: "Proj A", category: "infraestrutura" });
      await expect(deleteCategory(category.id, "infraestrutura", "Infraestrutura")).rejects.toThrow(
        'Não é possível excluir a categoria "Infraestrutura" pois existem projetos vinculados a ela.'
      );

      // Permite exclusão após remover vínculo
      clearMockDb();
      setMockDoc("categories", "c1", { name: "Infraestrutura", key: "infraestrutura" });
      await deleteCategory("c1", "infraestrutura", "Infraestrutura");
      const list = await getCategories();
      expect(list.length).toBe(0);
    });
  });

  describe("Gerenciamento de Tipos de Atividades", () => {
    it("deve gerenciar tipos de atividades com validação de vínculo", async () => {
      const actType = await createActivityType("Reunião");
      expect(actType.name).toBe("Reunião");

      // Impede se houver atividades vinculadas
      setMockDoc("activities", "a1", { title: "Daily", type: "reuniao" });
      await expect(deleteActivityType(actType.id, "reuniao", "Reunião")).rejects.toThrow(
        'Não é possível excluir o tipo de atividade "Reunião" pois existem atividades vinculadas a ele.'
      );
    });
  });

  describe("Limpeza de Duplicatas (cleanDuplicateRegistrations)", () => {
    it("deve identificar e remover registros duplicados mantendo o primeiro criado", async () => {
      // Setores duplicados
      setMockDoc("sectors", "s1", { name: "Dados" });
      setMockDoc("sectors", "s2", { name: "dados" });

      // Categorias duplicadas
      setMockDoc("categories", "c1", { name: "Automação", key: "automacao" });
      setMockDoc("categories", "c2", { name: "automacao", key: "automacao" });

      // Tipos duplicados
      setMockDoc("activity_types", "t1", { name: "Suporte", key: "suporte" });
      setMockDoc("activity_types", "t2", { name: "suporte", key: "suporte" });

      const stats = await cleanDuplicateRegistrations();
      expect(stats.sectorsRemoved).toBe(1);
      expect(stats.categoriesRemoved).toBe(1);
      expect(stats.typesRemoved).toBe(1);

      // Apenas os primeiros devem restar
      expect(getMockCollectionData("sectors").map((s: any) => s.id)).toEqual(["s1"]);
      expect(getMockCollectionData("categories").map((c: any) => c.id)).toEqual(["c1"]);
      expect(getMockCollectionData("activity_types").map((t: any) => t.id)).toEqual(["t1"]);
    });
  });
});
