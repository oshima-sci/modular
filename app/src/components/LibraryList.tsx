import { Link, useNavigate } from "react-router-dom";
import { useLibraries } from "@/hooks/useLibraries";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import PaperUploader from "./PaperUploader";

export default function LibraryList() {
  const navigate = useNavigate();
  const { data: libraries, isLoading, error } = useLibraries();

  if (isLoading) return <div className="p-8">Loading...</div>;
  if (error) return <div className="p-8 text-red-500">Error loading libraries</div>;

  return (
    <div className="h-screen w-screen overflow-hidden">
      <div className="uppercase p-2 text-black font-semibold">Modular</div>
      <div className="max-w-2xl mx-auto p-8 space-y-16 h-full overflow-y-auto pb-64">
        <div className="flex flex-col gap-2">
          <h3>Create a Modular library by uploading papers</h3>
          <PaperUploader
            mode="create-library"
            onSuccess={(libraryId) => navigate(`/library/${libraryId}`)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <h3>Or view Modular libraries made by the community</h3>
          {libraries?.map((lib) => (
            <Link key={lib.id} to={`/library/${lib.id}`}>
              <Card className="py-4 hover:bg-accent/50 transition-colors cursor-pointer">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base font-semibold">{lib.title}</CardTitle>
                  <Button variant="ghost" size="icon" asChild>
                    <span>
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </Button>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
