import os
from functools import lru_cache
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()


@lru_cache()
def get_supabase_client() -> Client:
    """Get cached Supabase client instance (service role, bypasses RLS)."""
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not url or not key:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")

    return create_client(url, key)


def user_client(jwt: str) -> Client:
    """Get a Supabase client bound to a user's JWT (RLS enforced)."""
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_ANON_KEY")

    if not url or not key:
        raise ValueError("SUPABASE_URL and SUPABASE_ANON_KEY must be set")

    client = create_client(url, key)
    client.auth.set_session(jwt, jwt)  # access_token, refresh_token
    return client
