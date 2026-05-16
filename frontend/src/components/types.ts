export type UserRole = 'student' | 'admin' | 'parent';


export interface AppUser {
  id: string;
  email: string | undefined;
  name: string;
  role: UserRole;
}

export interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  logout: () => Promise<void>;
}