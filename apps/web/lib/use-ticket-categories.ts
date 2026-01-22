"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type TicketCategory = {
  id: number;
  code: string;
  name: string;
  description?: string | null;
};

export function useTicketCategories() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["ticket-categories"],
    queryFn: () => api<TicketCategory[]>("/ticket-categories"),
    staleTime: 30_000,
  });
  const categories = Array.isArray(data) ? data : [];
  const errorMessage = (error as any)?.message ?? null;

  const map = useMemo(() => {
    const next: Record<number, string> = {};
    for (const c of categories) next[c.id] = c.name;
    return next;
  }, [categories]);

  return { categories, map, loading: isLoading, error: errorMessage, refetch };
}
