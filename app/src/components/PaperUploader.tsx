import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useQueryClient } from "@tanstack/react-query";
import { useUploadPapers } from "@/hooks/useUploadPapers";
import { useCreateLibrary } from "@/hooks/useCreateLibrary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, X, Loader2 } from "lucide-react";

type PaperUploaderProps =
  | {
      mode: "create-library";
      onSuccess: (libraryId: string) => void;
    }
  | {
      mode: "add-to-library";
      libraryId: string;
      onSuccess?: () => void;
    };

export default function PaperUploader(props: PaperUploaderProps) {
  const queryClient = useQueryClient();
  const uploadMutation = useUploadPapers();
  const createLibraryMutation = useCreateLibrary();

  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [libraryName, setLibraryName] = useState("");

  const isCreating = props.mode === "create-library";
  const isPending = uploadMutation.isPending || createLibraryMutation.isPending;

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setStagedFiles((prev) => [...prev, ...acceptedFiles]);
  }, []);

  const removeFile = (index: number) => {
    setStagedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (stagedFiles.length === 0) return;
    if (isCreating && !libraryName.trim()) return;

    uploadMutation.mutate(stagedFiles, {
      onSuccess: (data) => {
        // Extract paper IDs from successful uploads (including duplicates)
        const paperIds = data.uploaded
          .filter((result) => result.success || result.duplicate_of)
          .map((result) => result.duplicate_of || result.paper?.id)
          .filter((id): id is string => id !== null && id !== undefined);

        if (paperIds.length === 0) return;

        if (props.mode === "create-library") {
          createLibraryMutation.mutate(
            {
              paper_ids: paperIds,
              library_name: libraryName.trim(),
            },
            {
              onSuccess: (data) => {
                setStagedFiles([]);
                setLibraryName("");
                props.onSuccess(data.library.id);
              },
            }
          );
        } else {
          createLibraryMutation.mutate(
            {
              paper_ids: paperIds,
              library_id: props.libraryId,
            },
            {
              onSuccess: () => {
                setStagedFiles([]);
                // Invalidate library query to refetch
                queryClient.invalidateQueries({
                  queryKey: ["library", props.libraryId],
                });
                props.onSuccess?.();
              },
            }
          );
        }
      },
    });
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
    },
  });

  const buttonDisabled =
    isPending || stagedFiles.length === 0 || (isCreating && !libraryName.trim());

  const buttonText = isCreating ? "Create Library" : "Add Papers";
  const pendingText = isCreating ? "Creating..." : "Adding...";

  return (
    <div className="flex flex-col gap-2">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed bg-gray-100 flex flex-col justify-center rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragActive
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50"
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        {isDragActive ? (
          <p className="text-sm text-muted-foreground">Drop PDFs here...</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Drag & drop PDFs here, or click to select
          </p>
        )}
      </div>

      {stagedFiles.length > 0 && (
        <div className="mt-4 space-y-3">

          <h2 className="font-semibold">Name your new library</h2>

          {isCreating && (
            <Input
              placeholder="Library name"
              value={libraryName}
              onChange={(e) => setLibraryName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !buttonDisabled) handleSubmit();
              }}
            />
          )}

          <Button onClick={handleSubmit} disabled={buttonDisabled} className="w-full">
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {pendingText}
              </>
            ) : (
              buttonText
            )}
          </Button>

          <div className="text-sm font-medium">
            {stagedFiles.length} file{stagedFiles.length > 1 ? "s" : ""} staged
          </div>

          <div className="space-y-1">
            {stagedFiles.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded text-sm"
              >
                <span className="truncate">{file.name}</span>
                <button
                  onClick={() => removeFile(index)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          {(uploadMutation.isError || createLibraryMutation.isError) && (
            <p className="text-sm text-red-500">
              {uploadMutation.isError
                ? `Upload failed: ${uploadMutation.error.message}`
                : `Failed to ${isCreating ? "create library" : "add papers"}: ${createLibraryMutation.error?.message}`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
