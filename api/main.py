import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__, __release_notes__
from routes import jobs_router, libraries_router, papers_router

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Modular API",
    version=__version__,
    description=f"<p>{__release_notes__.strip()}</p>" if __release_notes__.strip() else None,
)

# Include routers
app.include_router(jobs_router)
app.include_router(libraries_router)
app.include_router(papers_router)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for local dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Hello from FastAPI!"}

@app.get("/api/health")
async def health():
    return {"status": "healthy", "version": __version__}
