import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import { useUploadPapers } from "@/hooks/useUploadPapers";
import { useCreateLibrary } from "@/hooks/useCreateLibrary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, X, Loader2, ArrowLeft } from "lucide-react";

type Stage = "upload" | "create-library";

export default function PaperUploader() {
  const navigate = useNavigate();
  const uploadMutation = useUploadPapers();
  const createLibraryMutation = useCreateLibrary();

  const [stage, setStage] = useState<Stage>("upload");
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [uploadedPaperIds, setUploadedPaperIds] = useState<string[]>([]);
  const [libraryName, setLibraryName] = useState("");

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setStagedFiles((prev) => [...prev, ...acceptedFiles]);
  }, []);

  const removeFile = (index: number) => {
    setStagedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = () => {
    if (stagedFiles.length === 0) return;
    uploadMutation.mutate(stagedFiles, {
      onSuccess: (data) => {
        // Extract paper IDs from successful uploads (including duplicates)
        const paperIds = data.uploaded
          .filter((result) => result.success || result.duplicate_of)
          .map((result) => result.duplicate_of || result.paper?.id)
          .filter((id): id is string => id !== null && id !== undefined);

        setUploadedPaperIds(paperIds);
        setStagedFiles([]);
        setStage("create-library");
      },
    });
  };

  const handleCreateLibrary = () => {
    if (!libraryName.trim() || uploadedPaperIds.length === 0) return;
    createLibraryMutation.mutate(
      {
        paper_ids: uploadedPaperIds,
        library_name: libraryName.trim(),
      },
      {
        onSuccess: (data) => {
          navigate(`/library/${data.library.id}`);
        },
      }
    );
  };

  const handleBack = () => {
    setStage("upload");
    setUploadedPaperIds([]);
    setLibraryName("");
    uploadMutation.reset();
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
    },
  });

  if (stage === "create-library") {
    return (
      <div className="flex flex-col gap-4">
        <button
          onClick={handleBack}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-fit"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="text-sm text-muted-foreground">
          {uploadedPaperIds.length} paper{uploadedPaperIds.length !== 1 ? "s" : ""} ready
        </div>

        <div className="space-y-2">
          <Input
            placeholder="Library name"
            value={libraryName}
            onChange={(e) => setLibraryName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateLibrary();
            }}
          />
          <Button
            onClick={handleCreateLibrary}
            disabled={!libraryName.trim() || createLibraryMutation.isPending}
            className="w-full"
          >
            {createLibraryMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Library"
            )}
          </Button>
          {createLibraryMutation.isError && (
            <p className="text-sm text-red-500">
              Failed to create library: {createLibraryMutation.error.message}
            </p>
          )}
        </div>
      </div>
    );
  }

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
        <div className="mt-4 space-y-2">
          <div className="text-sm font-medium">
            {stagedFiles.length} file{stagedFiles.length > 1 ? "s" : ""} staged
          </div>
          <Button
            onClick={handleUpload}
            disabled={uploadMutation.isPending}
            className="w-full mb-4"
          >
            {uploadMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              `Upload ${stagedFiles.length} file${stagedFiles.length > 1 ? "s" : ""}`
            )}
          </Button>
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
          {uploadMutation.isError && (
            <p className="text-sm text-red-500">
              Upload failed: {uploadMutation.error.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
