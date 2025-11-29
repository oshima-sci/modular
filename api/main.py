import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from routes import jobs_router, libraries_router, papers_router

logger = logging.getLogger(__name__)

app = FastAPI()

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
