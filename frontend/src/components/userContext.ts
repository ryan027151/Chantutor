import { createContext } from "react";
import { User } from "./types";

// undefined = still initializing, null = confirmed logged out, User = authenticated
export const UserContext = createContext<User | null | undefined>(undefined);
