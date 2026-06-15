"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { UserProfile, RolePermissions, ModulePermissions } from "@/types";
import { User } from "firebase/auth";
import { useRouter, usePathname } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { DEFAULT_PERMISSIONS } from "@/constants/permissions";

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  permissions: RolePermissions | null;
  hasPermission: (module: keyof RolePermissions, action: keyof ModulePermissions) => boolean;
  loading: boolean;
  error: string | null;
  loginWithGoogle: () => Promise<boolean>;
  loginWithEmail: (email: string, pass: string) => Promise<boolean>;
  registerWithEmail: (email: string, pass: string, fullName: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { 
    user, 
    loading: authLoading, 
    error: authError, 
    loginWithGoogle, 
    loginWithEmail, 
    registerWithEmail, 
    logout 
  } = useAuth();
  const { profile, loading: profileLoading, error: profileError } = useProfile(user);
  const [permissions, setPermissions] = useState<RolePermissions | null>(null);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!profile) {
      setPermissions(null);
      setPermissionsLoading(false);
      return;
    }

    setPermissionsLoading(true);
    const permissionsRef = doc(db, "permissions", profile.role);
    const unsubscribe = onSnapshot(
      permissionsRef,
      (docSnap) => {
        if (docSnap.exists()) {
          setPermissions(docSnap.data() as RolePermissions);
        } else {
          setPermissions(DEFAULT_PERMISSIONS[profile.role]);
        }
        setPermissionsLoading(false);
      },
      (err) => {
        console.error("Erro ao escutar permissões:", err);
        setPermissions(DEFAULT_PERMISSIONS[profile.role]);
        setPermissionsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [profile]);

  const hasPermission = (
    module: keyof RolePermissions,
    action: keyof ModulePermissions
  ): boolean => {
    if (!profile) return false;
    if (profile.role === "admin") return true; // Super admin sempre tem acesso completo

    const activePermissions = permissions || DEFAULT_PERMISSIONS[profile.role];
    if (!activePermissions || !activePermissions[module]) return false;
    return activePermissions[module][action] ?? false;
  };

  const loading = authLoading || (!!user && (profileLoading || permissionsLoading));
  const error = authError || profileError;

  useEffect(() => {
    if (!loading) {
      if (!user) {
        if (pathname !== "/login") {
          router.replace("/login");
        }
      } else if (pathname === "/login") {
        router.replace("/");
      }
    }
  }, [user, loading, pathname, router]);

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      permissions, 
      hasPermission, 
      loading, 
      error, 
      loginWithGoogle, 
      loginWithEmail, 
      registerWithEmail, 
      logout 
    }}>
      {loading ? (
        <div className="flex h-screen w-screen flex-col items-center justify-center bg-zinc-950 text-white">
          <div className="relative flex items-center justify-center">
            <div className="h-16 w-16 animate-spin rounded-full border-4 border-zinc-800 border-t-emerald-500"></div>
            <div className="absolute text-xs font-bold tracking-widest text-emerald-400">NGD</div>
          </div>
          <p className="mt-4 text-xs font-semibold tracking-wider text-zinc-400 uppercase animate-pulse">
            Carregando Sistema Acauã...
          </p>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthContext deve ser utilizado dentro de um AuthProvider");
  }
  return context;
}
