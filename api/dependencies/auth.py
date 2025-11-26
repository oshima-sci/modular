"""
Auth dependencies:
- get_current_user: validates Supabase JWT from Authorization header, returns UserContext
- get_user_supabase: returns a Supabase client already bound to the caller's JWT
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

# ---- Settings ----------------------------------------------------------------

SUPABASE_URL = os.getenv("SUPABASE_URL")
if not SUPABASE_URL:
    raise RuntimeError("Missing SUPABASE_URL for auth verification")

# JWKS endpoint served by Supabase Auth
JWKS_URL = f"{SUPABASE_URL.rstrip('/')}/auth/v1/keys"
# Expected audience in Supabase JWTs (default "authenticated")
JWT_AUDIENCE = os.getenv("SUPABASE_JWT_AUDIENCE", "authenticated")
# Optional issuer check (recommended)
JWT_ISSUER = os.getenv("SUPABASE_JWT_ISSUER", f"{SUPABASE_URL.rstrip('/')}/auth/v1")

_jwks_client = PyJWKClient(JWKS_URL)
_auth_scheme = HTTPBearer(auto_error=False)


# ---- Data model ---------------------------------------------------------------


@dataclass(frozen=True)
class UserContext:
    user_id: str
    jwt: str
    email: Optional[str] = None
    role: Optional[str] = None  # e.g., "authenticated"


# ---- Core verification --------------------------------------------------------


def _verify_supabase_jwt(token: str) -> UserContext:
    """
    Verify RS256 Supabase JWT against project JWKS.
    Raises on failure; returns a minimal UserContext on success.
    """
    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(token).key
        claims = jwt.decode(
            token,
            signing_key,
            algorithms=["RS256"],
            audience=JWT_AUDIENCE,
            options={
                "require": ["sub", "exp"],
                "verify_signature": True,
                "verify_aud": True,
            },
        )
        # Optional issuer check (kept lenient for local env variability)
        iss = claims.get("iss")
        if JWT_ISSUER and iss and not iss.startswith(JWT_ISSUER):
            pass

        return UserContext(
            user_id=claims["sub"],
            jwt=token,
            email=claims.get("email"),
            role=claims.get("role"),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


# ---- FastAPI dependencies -----------------------------------------------------


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(_auth_scheme),
) -> UserContext:
    """
    Extracts and verifies the Supabase JWT from Authorization: Bearer <token>.
    Returns a UserContext for downstream dependencies/services.
    """
    if not creds or not creds.scheme.lower() == "bearer" or not creds.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization Bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _verify_supabase_jwt(creds.credentials)


def get_optional_user(
    creds: HTTPAuthorizationCredentials = Depends(_auth_scheme),
) -> Optional[UserContext]:
    """
    Like get_current_user, but returns None instead of raising if no token provided.
    Use for endpoints that work with or without authentication.
    """
    if not creds or not creds.scheme.lower() == "bearer" or not creds.credentials:
        return None
    try:
        return _verify_supabase_jwt(creds.credentials)
    except HTTPException:
        return None


from db.supabase_client import user_client


def get_user_supabase(
    user: UserContext = Depends(get_current_user),
):
    """
    Returns a Supabase client bound to the caller's JWT (RLS enforced).
    Typical endpoint usage:
        def handler(db = Depends(get_user_supabase)):
            db.from_("libraries").select("*")
    """
    return user_client(user.jwt)
