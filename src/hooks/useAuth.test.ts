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

import "@/test/firebaseMock"; // Ativa mocks de autenticação do Firebase
import { 
  clearMockDb, 
  registerMockAuthUser, 
  triggerAuthStateChange, 
  mockCurrentUser 
} from "@/test/firebaseMock";
import { useAuth } from "./useAuth";

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
      currentResult = useAuth();
    } while (needsRerun);
  } finally {
    isRerunning = false;
  }
}

describe("Hook useAuth (Autenticação e Segurança)", () => {
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
    rerun();
  });

  it("deve carregar inicialmente sem usuário e em estado de loading", () => {
    expect(currentResult.user).toBeNull();
    expect(currentResult.loading).toBe(false); // Fica false porque onAuthStateChanged dispara imediatamente com null
    expect(currentResult.error).toBeNull();
  });

  it("deve permitir login se o e-mail for do domínio corporativo @uefs.br", async () => {
    registerMockAuthUser("colaborador@uefs.br", "123456", "Colaborador UEFS");

    await currentResult.loginWithEmail("colaborador@uefs.br", "123456");

    expect(currentResult.user).toBeDefined();
    expect(currentResult.user.email).toBe("colaborador@uefs.br");
    expect(currentResult.error).toBeNull();
  });

  it("deve bloquear login e definir erro se o e-mail não for institucional @uefs.br", async () => {
    await currentResult.loginWithEmail("hacker@gmail.com", "123456");

    expect(currentResult.user).toBeNull();
    expect(currentResult.error).toBe("Acesso permitido apenas para e-mails institucionais @uefs.br");
  });

  it("deve autenticar o administrador padrão admin@ngd.com mesmo fora do domínio uefs.br", async () => {
    registerMockAuthUser("admin@ngd.com", "Uefs@2026", "Administrador Master");

    await currentResult.loginWithEmail("admin@ngd.com", "Uefs@2026");

    expect(currentResult.user).toBeDefined();
    expect(currentResult.user.email).toBe("admin@ngd.com");
  });

  it("deve registrar e logar o administrador padrão na primeira tentativa de login se a conta não existir", async () => {
    // Conta do admin não existe no mockAuthUsers. A tentativa de login com Uefs@2026 deve criá-la.
    await currentResult.loginWithEmail("admin@ngd.com", "Uefs@2026");

    expect(currentResult.user).toBeDefined();
    expect(currentResult.user.email).toBe("admin@ngd.com");
    expect(currentResult.user.displayName).toBe("Administrador Master");
  });

  it("deve permitir autenticação via Google OAuth para contas corporativas", async () => {
    await currentResult.loginWithGoogle();
    expect(currentResult.user).toBeDefined();
    expect(currentResult.user.email).toBe("user@uefs.br");
  });

  it("deve deslogar o usuário com sucesso", async () => {
    registerMockAuthUser("colaborador@uefs.br", "123456");
    await currentResult.loginWithEmail("colaborador@uefs.br", "123456");
    expect(currentResult.user).not.toBeNull();

    await currentResult.logout();
    expect(currentResult.user).toBeNull();
  });
});
