import type { Role } from "@prisma/client";

export type Permission =
  | "admin.access"
  | "users.view"
  | "users.manage"
  | "roles.manage"
  | "courses.review"
  | "courses.manage_all"
  | "categories.manage"
  | "finance.view"
  | "finance.manage"
  | "coupons.manage"
  | "certificates.manage"
  | "live.manage_all"
  | "reviews.moderate"
  | "tickets.manage"
  | "notifications.broadcast"
  | "content.manage"
  | "settings.manage"
  | "audit.view"
  | "reports.view"
  | "trainer.access"
  | "grading.access";

const ALL: Permission[] = [
  "admin.access", "users.view", "users.manage", "roles.manage", "courses.review", "courses.manage_all",
  "categories.manage", "finance.view", "finance.manage", "coupons.manage", "certificates.manage",
  "live.manage_all", "reviews.moderate", "tickets.manage", "notifications.broadcast", "content.manage",
  "settings.manage", "audit.view", "reports.view", "trainer.access", "grading.access",
];

export const rolePermissions: Record<Role, Permission[]> = {
  SUPERADMIN: ALL,
  // L'administrateur ne peut pas créer d'autres administrateurs (réservé au super-administrateur).
  ADMIN: ALL.filter((p) => p !== "roles.manage"),
  ASSISTANT: [
    "admin.access", "users.view", "tickets.manage", "reviews.moderate", "live.manage_all",
    "content.manage", "reports.view", "grading.access",
  ],
  TRAINER: ["trainer.access", "grading.access"],
  LEARNER: [],
};

export function can(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return rolePermissions[role].includes(permission);
}

export function isStaff(role: Role): boolean {
  return role === "SUPERADMIN" || role === "ADMIN" || role === "ASSISTANT";
}

export function homeFor(role: Role): string {
  if (role === "TRAINER") return "/formateur";
  if (role === "LEARNER") return "/espace";
  return "/admin";
}
