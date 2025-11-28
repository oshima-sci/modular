import { useMutation } from "@tanstack/react-query";

const API_URL = import.meta.env.VITE_API_URL;

export interface Paper {
  id: string;
  title: string | null;
  filename: string;
  storage_path: string;
  parsed_path: string | null;
  file_size: number | null;
  content_type: string | null;
  sha256: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PaperUploadResult {
  paper: Paper | null;
  filename: string;
  success: boolean;
  error: string | null;
  duplicate_of: string | null;
}

export interface PapersUploadResponse {
  uploaded: PaperUploadResult[];
  total: number;
  successful: number;
  duplicates: number;
  failed: number;
}

async function uploadPapers(files: File[]): Promise<PapersUploadResponse> {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append("files", file);
  });

  const response = await fetch(`${API_URL}/papers/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Failed to upload papers: ${response.statusText}`);
  }

  return response.json();
}

export function useUploadPapers() {
  return useMutation({
    mutationFn: uploadPapers,
  });
}
