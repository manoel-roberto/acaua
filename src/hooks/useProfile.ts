import { useEffect, useState } from "react";
import { db, isEmulatorActive } from "@/lib/firebase/client";
import { doc, getDoc, setDoc, collection, query, where, getDocs, deleteDoc } from "firebase/firestore";
import { User } from "firebase/auth";
import { UserProfile } from "@/types";

export function useProfile(user: User | null) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrCreateProfile = async () => {
      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const profileRef = doc(db, "profiles", user.uid);
        const profileSnap = await getDoc(profileRef);

        if (profileSnap.exists()) {
          const data = profileSnap.data() as UserProfile;
          setProfile(data);
        } else {
          // Document does not exist, check if there is a pre-registered profile by email
          const profilesRef = collection(db, "profiles");
          const q = query(profilesRef, where("email", "==", user.email));
          const querySnap = await getDocs(q);

          if (querySnap.docs.length > 0) {
            const preProfileDoc = querySnap.docs[0];
            const preProfileData = preProfileDoc.data();

            const newProfile: UserProfile = {
              full_name: preProfileData.full_name || user.displayName || "Usuário Sem Nome",
              email: user.email || "",
              cargo: preProfileData.cargo || "Analista",
              funcao: preProfileData.funcao || "Membro da Equipe",
              setor: preProfileData.setor || "NGD",
              carga_horaria: preProfileData.carga_horaria || 40,
              avatar_url: user.photoURL || "",
              role: preProfileData.role || "analista",
              active: preProfileData.active !== undefined ? preProfileData.active : true,
              created_at: preProfileData.created_at || new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };

            await setDoc(profileRef, newProfile);
            
            // Delete pre-registered document if its ID is different from UID
            if (preProfileDoc.id !== user.uid) {
              await deleteDoc(preProfileDoc.ref);
            }

            setProfile(newProfile);
          } else {
            // Default profile on first login without pre-registration
            // Emulate roles based on email content for local testing
            const getInitialRole = () => {
              if (user.email === "admin@ngd.com") return "admin";
              if (isEmulatorActive) {
                const emailLower = (user.email || "").toLowerCase();
                if (emailLower.includes("cliente")) return "cliente";
                if (emailLower.includes("analista")) return "analista";
                return "admin"; // Default admin for development login
              }
              return "analista";
            };

            const newProfile: UserProfile = {
              full_name: user.email === "admin@ngd.com" ? "Administrador Master" : (user.displayName || "Usuário Sem Nome"),
              email: user.email || "",
              cargo: user.email === "admin@ngd.com" ? "Administrador" : "Analista",
              funcao: user.email === "admin@ngd.com" ? "Gestão do Sistema" : "Membro da Equipe",
              setor: "NGD",
              carga_horaria: 40,
              avatar_url: user.photoURL || "",
              role: getInitialRole(),
              active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };

            await setDoc(profileRef, newProfile);
            setProfile(newProfile);
          }
        }
      } catch (err) {
        console.error("Erro ao obter/criar perfil:", err);
        setError("Erro ao carregar o perfil de usuário.");
      } finally {
        setLoading(false);
      }
    };

    fetchOrCreateProfile();
  }, [user]);

  return { profile, loading, error };
}
