"use client";

import { createContext, useContext } from "react";

export type Me = {
  id: number | string;
  email: string;
  role: "requester" | "agent" | "admin";
};

const AuthContext = createContext<Me | null>(null);

export function AuthProvider({ me, children }: { me: Me; children: React.ReactNode }) {
  return <AuthContext.Provider value={me}>{children}</AuthContext.Provider>;
}

export function useMe() {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useMe must be used within AuthProvider");
  return v;
}
