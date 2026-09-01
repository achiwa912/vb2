from flask import Flask
from flask.testing import FlaskClient
from pydantic import TypeAdapter

from ..database import db
from ..models import Book, User, Word
from ..schemas import BookSchema


def test_list_books_only_own(
    test_app: Flask,
    client: FlaskClient,
    user1: User,
    user2: User,
    auth_headers1: dict[str, str],
    auth_headers2: dict[str, str],
) -> None:
    """GET /books should return only the current user's books."""
    with test_app.app_context():
        b1 = Book(name="User1 Book", user_id=user1.id)
        b2 = Book(name="User2 Book", user_id=user2.id)
        db.session.add_all([b1, b2])
        db.session.commit()

    resp = client.get("/books", headers=auth_headers1)
    assert resp.status_code == 200

    adapter = TypeAdapter(list[BookSchema])
    books = adapter.validate_python(resp.get_json()["books"])
    assert len(books) == 1
    assert books[0].name == "User1 Book"


def test_list_book_words_not_owned_returns_404(
    test_app: Flask,
    client: FlaskClient,
    user2: User,
    auth_headers1: dict[str, str],
) -> None:
    """GET /books/<id>/words should return 404 if the book is not owned."""
    with test_app.app_context():
        book = Book(name="User2 Book", user_id=user2.id)
        db.session.add(book)
        db.session.commit()
        book_id = book.id

    resp = client.get(f"/books/{book_id}/words", headers=auth_headers1)
    assert resp.status_code == 404


def test_edit_book_not_owned_returns_404(
    test_app: Flask, client: FlaskClient, user2: User, auth_headers1: dict[str, str]
) -> None:
    """PATCH on another user's book should return 404."""
    with test_app.app_context():
        book = Book(name="User2 Book", user_id=user2.id)
        db.session.add(book)
        db.session.commit()
        book_id = book.id

    resp = client.patch(
        f"/books/{book_id}", json={"name": "Hacked"}, headers=auth_headers1
    )
    assert resp.status_code == 404


def test_delete_book_not_owned_returns_404(
    test_app: Flask, client: FlaskClient, user2: User, auth_headers1: dict[str, str]
) -> None:
    """DELETE on another user's book should return 404."""
    with test_app.app_context():
        book = Book(name="User2 Book", user_id=user2.id)
        db.session.add(book)
        db.session.commit()
        book_id = book.id

    resp = client.delete(f"/books/{book_id}", headers=auth_headers1)
    assert resp.status_code == 404


def test_create_word_in_other_users_book_returns_404(
    test_app: Flask, client: FlaskClient, user2: User, auth_headers1: dict[str, str]
) -> None:
    """POST /books/<id>/words should return 404 if the book is not owned."""
    with test_app.app_context():
        book = Book(name="User2 Book", user_id=user2.id)
        db.session.add(book)
        db.session.commit()
        book_id = book.id

    resp = client.post(
        f"/books/{book_id}/words",
        json={"word": "test", "definition": "def", "sample": ""},
        headers=auth_headers1,
    )
    assert resp.status_code == 404


def test_edit_word_not_owned_returns_404(
    test_app: Flask,
    client: FlaskClient,
    user2: User,
    auth_headers1: dict[str, str],
) -> None:
    """PATCH on a word in another user's book should return 404."""
    with test_app.app_context():
        book = Book(name="User2 Book", user_id=user2.id)
        db.session.add(book)
        db.session.flush()
        word = Word(word="test", definition="def", sample="", book_id=book.id)
        db.session.add(word)
        db.session.commit()
        book_id = book.id
        word_id = word.id

    resp = client.patch(
        f"/books/{book_id}/words/{word_id}",
        json={"definition": "new"},
        headers=auth_headers1,
    )
    assert resp.status_code == 404


def test_delete_word_not_owned_returns_404(
    test_app: Flask,
    client: FlaskClient,
    user2: User,
    auth_headers1: dict[str, str],
) -> None:
    """DELETE on a word in another user's book should return 404."""
    with test_app.app_context():
        book = Book(name="User2 Book", user_id=user2.id)
        db.session.add(book)
        db.session.flush()
        word = Word(word="test", definition="def", sample="", book_id=book.id)
        db.session.add(word)
        db.session.commit()
        book_id = book.id
        word_id = word.id

    resp = client.delete(f"/books/{book_id}/words/{word_id}", headers=auth_headers1)
    assert resp.status_code == 404
