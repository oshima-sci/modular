import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import KnowledgeGraphView from "./components/KnowledgeGraphView";
import LibraryList from "./components/LibraryList";
import "./App.css";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="w-screen h-screen">
          <Routes>
            <Route path="/" element={<LibraryList />} />
            <Route path="/library/:libraryId" element={<KnowledgeGraphView />} />
          </Routes>
        </div>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export default App;
