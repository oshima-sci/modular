import { useQuery } from "@tanstack/react-query";

const API_URL = import.meta.env.VITE_API_URL;

export interface Library {
  id: string;
  owner_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
}

async function fetchLibraries(): Promise<Library[]> {
  const response = await fetch(`${API_URL}/library`);
  if (!response.ok) {
    throw new Error(`Failed to fetch libraries: ${response.statusText}`);
  }
  return response.json();
}

export function useLibraries() {
  return useQuery({
    queryKey: ["libraries"],
    queryFn: fetchLibraries,
  });
}
