import { ReactNode, createContext, useContext, useEffect } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import type { SelectUser, InsertUser } from "@db/schema";
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type AuthContextType = {
  user: SelectUser | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<SelectUser, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<SelectUser, Error, InsertUser>;
};

type LoginData = Pick<InsertUser, "username" | "password">;

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const {
    data: user,
    error,
    isLoading,
  } = useQuery<SelectUser | undefined, Error>({
    queryKey: ["/api/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    onSuccess: (data) => {
      console.log("[Auth] User data received:", data);
    },
    onError: (error) => {
      console.error("[Auth] Error fetching user:", error);
    }
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      console.log("[Auth] Attempting login...");
      const res = await apiRequest("POST", "/api/login", credentials);
      const data = await res.json();
      console.log("[Auth] Login response:", data);
      return data;
    },
    onSuccess: (user: SelectUser) => {
      console.log("[Auth] Login successful:", user);
      queryClient.setQueryData(["/api/user"], user);
      toast({
        title: "Welcome back!",
        description: `Logged in as ${user.username}`,
      });
    },
    onError: (error: Error) => {
      console.error("[Auth] Login failed:", error);
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (newUser: InsertUser) => {
      console.log("[Auth] Attempting registration...");
      const res = await apiRequest("POST", "/api/register", newUser);
      const data = await res.json();
      console.log("[Auth] Registration response:", data);
      return data;
    },
    onSuccess: (user: SelectUser) => {
      console.log("[Auth] Registration successful:", user);
      queryClient.setQueryData(["/api/user"], user);
      toast({
        title: "Welcome!",
        description: "Registration successful",
      });
    },
    onError: (error: Error) => {
      console.error("[Auth] Registration failed:", error);
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      console.log("[Auth] Attempting logout...");
      await apiRequest("POST", "/api/logout");
    },
    onSuccess: () => {
      console.log("[Auth] Logout successful");
      queryClient.setQueryData(["/api/user"], null);
      toast({
        title: "Goodbye!",
        description: "You have been logged out",
      });
    },
    onError: (error: Error) => {
      console.error("[Auth] Logout failed:", error);
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Debug effect for auth state changes
  useEffect(() => {
    console.log("[Auth] Auth state changed:", {
      user: user ?? null,
      isLoading,
      error: error?.message,
    });
  }, [user, isLoading, error]);

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error,
        loginMutation,
        logoutMutation,
        registerMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}