export type UserRole = 'admin' | 'user';

export type AuthUser = {
  id: string;
  name: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
};

export type RegisterRequest = {
  email: string;
  password: string;
  name: string;
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type AuthResponse = {
  accessSessionId: string;
  refreshSessionId: string;
  user?: AuthUser;
};

export type RefreshSessionRequest = {
  refreshSessionId: string;
};

export type ValidateSessionRequest = {
  accessSessionId: string;
};

export type ValidateSessionResponse = {
  valid: boolean;
  user?: AuthUser;
};
