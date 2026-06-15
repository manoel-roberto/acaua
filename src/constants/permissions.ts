import { RolePermissions } from "@/types";

export const DEFAULT_PERMISSIONS: Record<"admin" | "gestor" | "colaborador" | "visualizador", RolePermissions> = {
  admin: {
    projects: { create: true, read: true, update: true, delete: true },
    activities: { create: true, read: true, update: true, delete: true },
    routines: { create: true, read: true, update: true, delete: true },
    users: { create: true, read: true, update: true, delete: true },
    permissions: { create: true, read: true, update: true, delete: true },
    registrations: { create: true, read: true, update: true, delete: true },
  },
  gestor: {
    projects: { create: true, read: true, update: true, delete: false },
    activities: { create: true, read: true, update: true, delete: true },
    routines: { create: true, read: true, update: true, delete: true },
    users: { create: false, read: true, update: false, delete: false },
    permissions: { create: false, read: false, update: false, delete: false },
    registrations: { create: true, read: true, update: true, delete: false },
  },
  colaborador: {
    projects: { create: false, read: true, update: false, delete: false },
    activities: { create: true, read: true, update: true, delete: true },
    routines: { create: true, read: true, update: true, delete: true },
    users: { create: false, read: false, update: false, delete: false },
    permissions: { create: false, read: false, update: false, delete: false },
    registrations: { create: false, read: false, update: false, delete: false },
  },
  visualizador: {
    projects: { create: false, read: true, update: false, delete: false },
    activities: { create: false, read: true, update: false, delete: false },
    routines: { create: false, read: true, update: false, delete: false },
    users: { create: false, read: false, update: false, delete: false },
    permissions: { create: false, read: false, update: false, delete: false },
    registrations: { create: false, read: false, update: false, delete: false },
  },
};
