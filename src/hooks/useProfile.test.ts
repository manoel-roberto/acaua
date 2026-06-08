import { vi, describe, it, expect, beforeEach } from "vitest";

// Rastreamento de estado do React mockado com suporte a dependências e loop síncrono
let stateValues: any[] = [];
let stateIndex = 0;

let effectIndex = 0;
let effectDeps: any[][] = [];
let effectCleanups: any[] = [];

let needsRerun = false;
let isRerunning = false;

vi.mock("react", () => {
  return {
    useState: (initialVal: any) => {
      const index = stateIndex;
      if (stateValues[index] === undefined) {
        stateValues[index] = initialVal;
      }
      const setter = (newVal: any) => {
        const oldVal = stateValues[index];
        const nextVal = typeof newVal === "function" ? (newVal as any)(oldVal) : newVal;
        if (oldVal !== nextVal) {
          stateValues[index] = nextVal;
          rerun();
        }
      };
      stateIndex++;
      return [stateValues[index], setter];
    },
    useEffect: (effect: () => any, deps?: any[]) => {
      const index = effectIndex;
      const prevDeps = effectDeps[index];
      let hasChanged = true;
      if (prevDeps && deps) {
        hasChanged = deps.length !== prevDeps.length || deps.some((dep, i) => dep !== prevDeps[i]);
      }
      if (hasChanged) {
        if (effectCleanups[index]) {
          try {
            effectCleanups[index]();
          } catch (e) {
            console.error("Erro no cleanup do efeito:", e);
          }
        }
        effectCleanups[index] = effect();
        effectDeps[index] = deps || [];
      }
      effectIndex++;
    }
  };
});

import "@/test/firebaseMock"; // Ativa mocks do Firebase
import { 
  clearMockDb, 
  setMockDoc, 
  getMockCollectionData,
  deleteMockDoc // Se necessário, mas podemos acessar a store
} from "@/test/firebaseMock";
import { useProfile } from "./useProfile";
import { User } from "firebase/auth";

let currentUserArg: User | null = null;
let currentResult: any = null;

function rerun() {
  if (isRerunning) {
    needsRerun = true;
    return;
  }
  isRerunning = true;
  try {
    do {
      needsRerun = false;
      stateIndex = 0;
      effectIndex = 0;
      currentResult = useProfile(currentUserArg);
    } while (needsRerun);
  } finally {
    isRerunning = false;
  }
}

// Helper para aguardar microtasks se necessário (por conta de chamadas assíncronas do Firestore)
async function flushPromises() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("Hook useProfile", () => {
  beforeEach(() => {
    clearMockDb();
    stateValues = [];
    stateIndex = 0;
    effectIndex = 0;
    effectDeps = [];
    effectCleanups.forEach((cleanup) => {
      if (cleanup) {
        try {
          cleanup();
        } catch (e) {}
      }
    });
    effectCleanups = [];
    needsRerun = false;
    isRerunning = false;
    currentUserArg = null;
    rerun();
  });

  it("deve carregar inicialmente sem perfil se o usuário logado for nulo", async () => {
    currentUserArg = null;
    rerun();
    await flushPromises();

    expect(currentResult.profile).toBeNull();
    expect(currentResult.loading).toBe(false);
    expect(currentResult.error).toBeNull();
  });

  it("deve carregar um perfil existente no Firestore com base no UID", async () => {
    setMockDoc("profiles", "user_abc", {
      full_name: "Maria Joana",
      email: "maria@uefs.br",
      cargo: "Gestora",
      funcao: "Líder de Equipe",
      setor: "NGD",
      carga_horaria: 40,
      role: "gestor",
      active: true,
    });

    currentUserArg = {
      uid: "user_abc",
      email: "maria@uefs.br",
      displayName: "Maria Joana",
    } as User;

    rerun();
    await flushPromises();

    expect(currentResult.loading).toBe(false);
    expect(currentResult.profile).not.toBeNull();
    expect(currentResult.profile.full_name).toBe("Maria Joana");
    expect(currentResult.profile.role).toBe("gestor");
    expect(currentResult.error).toBeNull();
  });

  it("deve criar perfil no UID e deletar pré-perfil se houver pré-registro por e-mail com ID diferente", async () => {
    // Registra pré-cadastro por email com ID 'temp_id'
    setMockDoc("profiles", "temp_id", {
      full_name: "Pre Cadastro",
      email: "pre@uefs.br",
      cargo: "Estagiário",
      funcao: "Suporte",
      setor: "NGD",
      carga_horaria: 20,
      role: "analista",
      active: true,
      created_at: "2026-06-01T10:00:00.000Z",
    });

    currentUserArg = {
      uid: "uid_novo",
      email: "pre@uefs.br",
      displayName: "Pre Cadastro Atualizado",
      photoURL: "http://photo.com/123",
    } as User;

    rerun();
    await flushPromises(); // Aguarda a execução da função assíncrona do useEffect

    // Verifica que o perfil foi criado no novo UID do usuário
    const profiles = getMockCollectionData("profiles");
    
    // Deve haver apenas 1 perfil ativo (o temp_id antigo foi deletado e o novo uid_novo foi criado)
    expect(profiles.length).toBe(1);
    
    const newProfile = profiles.find((p: any) => p.id === "uid_novo") as any;
    expect(newProfile).toBeDefined();
    expect(newProfile.full_name).toBe("Pre Cadastro"); // Mantém do pré-perfil
    expect(newProfile.avatar_url).toBe("http://photo.com/123");
    expect(newProfile.role).toBe("analista");
    expect(newProfile.carga_horaria).toBe(20);

    expect(currentResult.profile).not.toBeNull();
    expect(currentResult.profile.full_name).toBe("Pre Cadastro");
    expect(currentResult.loading).toBe(false);
  });

  it("deve criar um perfil de administrador master padrão para o e-mail admin@ngd.com se não houver cadastro", async () => {
    currentUserArg = {
      uid: "admin_uid",
      email: "admin@ngd.com",
      displayName: "",
    } as User;

    rerun();
    await flushPromises();

    const profiles = getMockCollectionData("profiles");
    expect(profiles.length).toBe(1);
    expect(profiles[0]).toMatchObject({
      id: "admin_uid",
      full_name: "Administrador Master",
      email: "admin@ngd.com",
      role: "admin",
      cargo: "Administrador",
      funcao: "Gestão do Sistema",
    });

    expect(currentResult.profile.role).toBe("admin");
    expect(currentResult.loading).toBe(false);
  });

  it("deve criar um perfil padrão de analista no primeiro login de um email comum se não houver cadastro", async () => {
    currentUserArg = {
      uid: "comum_uid",
      email: "comum@uefs.br",
      displayName: "Usuário Comum",
      photoURL: "http://avatar.com/comum",
    } as User;

    rerun();
    await flushPromises();

    const profiles = getMockCollectionData("profiles");
    expect(profiles.length).toBe(1);
    expect(profiles[0]).toMatchObject({
      id: "comum_uid",
      full_name: "Usuário Comum",
      email: "comum@uefs.br",
      role: "analista",
      cargo: "Analista",
      avatar_url: "http://avatar.com/comum",
    });

    expect(currentResult.profile.role).toBe("analista");
    expect(currentResult.loading).toBe(false);
  });

  it("deve tratar erros se a consulta ao banco de dados falhar", async () => {
    currentUserArg = {
      uid: "forcar_erro",
      email: "erro@uefs.br",
    } as User;

    rerun();
    await flushPromises();

    expect(currentResult.profile).toBeNull();
    expect(currentResult.loading).toBe(false);
    expect(currentResult.error).toBe("Erro ao carregar o perfil de usuário.");
  });
});
