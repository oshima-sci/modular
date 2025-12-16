import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import PaperUploader from "./PaperUploader";

interface MetadataProps {
  libraryId: string | undefined;
  processing?: {
    papers_processing: number;
    library_linking: boolean;
  };
}

export default function Metadata({ libraryId, processing }: MetadataProps) {
  const [addPapersOpen, setAddPapersOpen] = useState(false);

  return (
    <div className="fixed z-50 flex items-center gap-3">
      <Link to={`/`}>
        <div className="uppercase p-2 text-black font-semibold">Modular</div>
      </Link>
      <Dialog open={addPapersOpen} onOpenChange={setAddPapersOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Add Papers
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add papers to library</DialogTitle>
          </DialogHeader>
          {libraryId && (
            <PaperUploader
              mode="add-to-library"
              libraryId={libraryId}
              onSuccess={() => setAddPapersOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
      {processing && processing.papers_processing > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-full text-sm text-blue-700">
          <svg
            className="animate-spin h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>
            {processing.papers_processing} paper
            {processing.papers_processing > 1 ? "s" : ""} processing...
          </span>
        </div>
      )}
      {processing?.library_linking && (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-full text-sm text-purple-700">
            <svg
              className="animate-spin h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Identifying links...</span>
          </div>
        </div>
      )}
      {processing?.library_linking && (
        <p className="text-xs text-gray-600">This might take a few minutes</p>
      )}
    </div>
  );
}
