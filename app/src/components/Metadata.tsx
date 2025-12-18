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
import { Plus, Loader2 } from "lucide-react";
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
          <Loader2 className="animate-spin h-4 w-4" />
          <span>
            {processing.papers_processing} paper
            {processing.papers_processing > 1 ? "s" : ""} processing...
          </span>
        </div>
      )}
      {processing?.library_linking && (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-full text-sm text-purple-700">
            <Loader2 className="animate-spin h-4 w-4" />
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
