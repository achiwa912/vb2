from unittest.mock import patch
from sqlalchemy import select
from flask import Flask
from flask.testing import FlaskClient
from pydantic import BaseModel

from ..models import User  # for type annotation
from ..database import db


class AuthResponse(BaseModel):
    access_token: str
    user_id: int
    email: str


def test_auth_ggl_new_user(client: FlaskClient, test_app: Flask) -> None:
    """A new Google user should be created and get a valid JWT."""
    with patch("be.api.id_token.verify_oauth2_token") as mock_verify:
        mock_verify.return_value = {
            "sub": "google-sub-new",
            "email": "new@example.com",
            "name": "New User",
        }
        resp = client.post("/auth/ggl", json={"token": "fake-token"})

    assert resp.status_code == 200
    data = AuthResponse.model_validate(resp.get_json())
    assert data.user_id is not None
    assert data.access_token
    assert data.email == "new@example.com"

    # Verify user was persisted
    with test_app.app_context():
        user = db.session.execute(
            select(User).where(User.sub == "google-sub-new")
        ).scalar_one()
        assert user.email == "new@example.com"


def test_auth_ggl_existing_user(client: FlaskClient, user1: User) -> None:
    """An existing Google user should get a token for the same user."""
    with patch("be.api.id_token.verify_oauth2_token") as mock_verify:
        mock_verify.return_value = {
            "sub": user1.sub,
            "email": user1.email,
            "name": user1.name,
        }
        resp = client.post("/auth/ggl", json={"token": "fake-token"})

    assert resp.status_code == 200
    data = AuthResponse.model_validate(resp.get_json())
    assert data.user_id == user1.id
    assert data.email == user1.email


def test_auth_ggl_invalid_token(client: FlaskClient) -> None:
    """Invalid Google token should return 401."""
    with patch("be.api.id_token.verify_oauth2_token") as mock_verify:
        mock_verify.side_effect = ValueError("Invalid token")
        resp = client.post("/auth/ggl", json={"token": "bad-token"})

    assert resp.status_code == 401
    assert resp.get_json() == {"message": "Invalid Google token"}


def test_protected_endpoint_requires_jwt(client: FlaskClient) -> None:
    """Any protected endpoint without a token should return 401."""
    resp = client.get("/books")
    assert resp.status_code == 401
