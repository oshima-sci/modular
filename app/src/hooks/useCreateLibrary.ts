import { useMutation } from "@tanstack/react-query";

const API_URL = import.meta.env.VITE_API_URL;

export interface Library {
  id: string;
  owner_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface CreateLibraryRequest {
  paper_ids: string[];
  library_id?: string;
  library_name?: string;
}

export interface CreateLibraryResponse {
  library: Library;
  papers_added: number;
  created: boolean;
}

async function createLibrary(request: CreateLibraryRequest): Promise<CreateLibraryResponse> {
  const response = await fetch(`${API_URL}/library`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Failed to create library: ${response.statusText}`);
  }

  return response.json();
}

export function useCreateLibrary() {
  return useMutation({
    mutationFn: createLibrary,
  });
}
