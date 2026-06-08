import { useEffect, useState } from "react";
import { auth, googleProvider, isEmulatorActive } from "@/lib/firebase/client";
import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile
} from "firebase/auth";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        if (currentUser.email && (currentUser.email.endsWith("@uefs.br") || currentUser.email === "admin@ngd.com" || isEmulatorActive)) {
          setUser(currentUser);
          setError(null);
        } else {
          setError("Acesso permitido apenas para e-mails institucionais @uefs.br");
          setUser(null);
          await signOut(auth);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error("Erro na autenticação com o Google:", err);
      setError("Falha ao autenticar com o Google. Tente novamente.");
      setLoading(false);
    }
  };

  const loginWithEmail = async (email: string, pass: string) => {
    setLoading(true);
    setError(null);
    try {
      if (!email.endsWith("@uefs.br") && email !== "admin@ngd.com" && !isEmulatorActive) {
        throw new Error("Acesso permitido apenas para e-mails institucionais @uefs.br");
      }
      try {
        await signInWithEmailAndPassword(auth, email, pass);
      } catch (err: any) {
        // Inicialização do administrador master na primeira execução
        if (email === "admin@ngd.com" && pass === "Uefs@2026") {
          try {
            const res = await createUserWithEmailAndPassword(auth, email, pass);
            await updateProfile(res.user, { displayName: "Administrador Master" });
            return;
          } catch (createErr: any) {
            if (createErr.code === "auth/email-already-in-use") {
              throw err; // Lança o erro original de login (pois a conta já existe e a senha padrão não confere mais)
            }
            throw createErr;
          }
        }
        throw err;
      }
    } catch (err: any) {
      console.error("Erro ao fazer login:", err);
      if (err.code === "auth/invalid-credential" || err.code === "auth/user-not-found" || err.code === "auth/wrong-password") {
        setError("E-mail ou senha incorretos.");
      } else {
        setError(err.message || "Falha ao realizar login. Tente novamente.");
      }
      setLoading(false);
    }
  };

  const registerWithEmail = async (email: string, pass: string, fullName: string) => {
    setLoading(true);
    setError(null);
    try {
      if (!email.endsWith("@uefs.br") && !isEmulatorActive) {
        throw new Error("Cadastro permitido apenas com e-mails institucionais @uefs.br");
      }
      if (pass.length < 6) {
        throw new Error("A senha deve conter no mínimo 6 caracteres.");
      }
      const res = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(res.user, { displayName: fullName });
    } catch (err: any) {
      console.error("Erro ao cadastrar:", err);
      if (err.code === "auth/email-already-in-use") {
        setError("Este e-mail já está em uso.");
      } else {
        setError(err.message || "Falha ao realizar cadastro. Tente novamente.");
      }
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Erro ao sair:", err);
    } finally {
      setLoading(false);
    }
  };

  return { 
    user, 
    loading, 
    error, 
    loginWithGoogle, 
    loginWithEmail, 
    registerWithEmail, 
    logout 
  };
}
