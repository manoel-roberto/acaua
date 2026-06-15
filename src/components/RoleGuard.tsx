"use client";

import React from "react";
import { useAuthContext } from "@/context/AuthContext";

interface RoleGuardProps {
  allowedRoles: Array<"admin" | "gestor" | "colaborador" | "visualizador">;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGuard({ allowedRoles, children, fallback = null }: RoleGuardProps) {
  const { profile } = useAuthContext();

  if (!profile || !allowedRoles.includes(profile.role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
