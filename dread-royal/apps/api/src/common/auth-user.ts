export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  roleCode: string;
  roleName: string;
  permissions: string[];
  staffId: string | null;
  sessionId: string;
}
