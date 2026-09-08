import os
from datetime import datetime, UTC

os.environ["TESTING"] = "1"
os.environ["JWT_SECRET_KEY"] = "a-very-long-test-secret-key-for-jwt-1234567890"

from collections.abc import Generator
import pytest
from sqlalchemy.orm import scoped_session
from flask import Flask
from flask.testing import FlaskClient
from flask_jwt_extended import create_access_token
from flask_sqlalchemy.session import Session

from ..api import app
from ..database import db
from ..models import User

app.config["TESTING"] = True
# app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
app.config["JWT_SECRET_KEY"] = "a-very-long-test-secret-key-for-jwt-1234567890"
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {"echo": False}  # keep test output clean

# assert "db.db" not in app.config["SQLALCHEMY_DATABASE_URI"]
# db.init_app(app)


@pytest.fixture(scope="session")
def test_app():
    with app.app_context():
        db.create_all()
    yield app
    with app.app_context():
        db.drop_all()


@pytest.fixture(scope="function")
def db_session(test_app: Flask) -> Generator[scoped_session[Session], None, None]:
    """Provides a clean database for each test."""
    with test_app.app_context():
        db.session.remove()
        db.drop_all()
        db.create_all()
        yield db.session
        db.session.remove()


@pytest.fixture(scope="function")
def client(test_app: Flask, db_session: scoped_session[Session]) -> FlaskClient:
    return test_app.test_client()


# --- User fixtures ---
@pytest.fixture
def user1(test_app: Flask) -> User:
    user = User(sub="google-sub-1", email="user1@example.com", name="User One")
    with test_app.app_context():
        db.session.add(user)
        db.session.commit()
        db.session.refresh(user)
    return user


@pytest.fixture
def user2(test_app: Flask) -> User:
    user = User(sub="google-sub-2", email="user2@example.com", name="User Two")
    with test_app.app_context():
        db.session.add(user)
        db.session.commit()
        db.session.refresh(user)
    return user


# --- Token fixtures ---
@pytest.fixture
def token1(user1: User) -> str:
    return create_access_token(identity=str(user1.id))


@pytest.fixture
def token2(user2: User) -> str:
    return create_access_token(identity=str(user2.id))


@pytest.fixture
def auth_headers1(token1: str):
    return {"Authorization": f"Bearer {token1}"}


@pytest.fixture
def auth_headers2(token2: str):
    return {"Authorization": f"Bearer {token2}"}


# --- Utilities ---
def to_naive_utc(dt: datetime | None) -> datetime | None:
    if not dt:
        return dt
    if dt.tzinfo is not None:
        return dt.astimezone(UTC).replace(tzinfo=None)
    return dt
