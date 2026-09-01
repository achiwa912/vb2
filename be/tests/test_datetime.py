from datetime import UTC, datetime
from typing import cast
from flask import Flask
from flask.testing import FlaskClient
from sqlalchemy import select
from pydantic import TypeAdapter

from ..database import db
from ..models import Book, Word, Practice, User
from ..schemas import BookSchema, PracticeSchema, WordSchema

"""
- In DB, time data (eg, Book.last_edited) is stored as datatime value 
  in UTC, but w/o timezone info (ie, naive).
- With pydantic classes (eg, BookSchema), time data is converted
  by field_serializer to add UTC marker when they are serialized
"""


def test_edit_book_normalizes_datetime_to_utc_and_serializes_z(
    test_app: Flask, client: FlaskClient, user1: User, auth_headers1: dict[str, str]
) -> None:
    """
    When a book is edited, the stored last_edited should be naive UTC,
    and the serialized response should include a trailing 'Z' (UTC marker).
    """
    with test_app.app_context():
        book = Book(name="Original", user_id=user1.id)
        db.session.add(book)
        db.session.commit()
        book_id = book.id

    resp = client.patch(
        f"/books/{book_id}",
        json={"name": "Updated"},
        headers=auth_headers1,
    )
    assert resp.status_code == 200

    list_resp = client.get("/books", headers=auth_headers1)
    assert list_resp.status_code == 200

    adapter = TypeAdapter(list[BookSchema])
    books: list[BookSchema] = adapter.validate_python(list_resp.get_json()["books"])
    assert len(books) == 1
    book_data: BookSchema = books[0]
    assert book_data.id == book_id

    last_edited_str: str = cast(
        str, book_data.model_dump(mode="json")["last_edited"]
    )  # depends on field_serializer for adding 'Z'
    assert last_edited_str.endswith("Z")

    parsed = datetime.fromisoformat(last_edited_str.replace("Z", "+00:00"))
    assert parsed.tzinfo is not None
    assert parsed.tzinfo == UTC

    with test_app.app_context():
        db_book = db.session.execute(
            select(Book).where(Book.id == book_id)
        ).scalar_one()
        stored_last_edited = db_book.last_edited
        assert stored_last_edited is not None
        assert stored_last_edited.tzinfo is None  # naive
        assert stored_last_edited == parsed.astimezone(UTC).replace(tzinfo=None)


def test_create_word_normalizes_datetime(
    test_app: Flask,
    client: FlaskClient,
    user1: User,
    auth_headers1: dict[str, str],
) -> None:
    """
    Verify that the word creation endpoint correctly handles datetime fields,
    storing naive UTC in the database and serializing with 'Z' in responses.
    """
    with test_app.app_context():
        book = Book(name="test1", user_id=user1.id)
        db.session.add(book)
        db.session.commit()
        book_id = book.id

    resp = client.post(
        f"/books/{book_id}/words",
        json={
            "word": "word1",
            "definition": "def1",
        },
        headers=auth_headers1,
    )
    assert resp.status_code == 200

    word_data: WordSchema = WordSchema.model_validate(resp.get_json()["word"])
    assert word_data.last_edited is not None
    last_edited_str: str = cast(str, word_data.model_dump(mode="json")["last_edited"])
    assert last_edited_str.endswith("Z")

    parsed = datetime.fromisoformat(last_edited_str.replace("Z", "+00:00"))
    assert parsed.tzinfo is not None
    assert parsed.tzinfo == UTC

    with test_app.app_context():
        db_word = db.session.execute(
            select(Word).where(Word.id == word_data.id)
        ).scalar_one()
        stored_last_edited = db_word.last_edited
        assert stored_last_edited is not None
        assert stored_last_edited.tzinfo is None  # naive
        assert stored_last_edited == parsed.astimezone(UTC).replace(tzinfo=None)


def test_sync_book_normalizes_practice_datetimes(
    test_app: Flask,
    client: FlaskClient,
    user1: User,
    auth_headers1: dict[str, str],
) -> None:
    """
    When syncing practices, timezone-aware datetimes sent in the request
    must be converted to naive UTC before storage, and the response
    should serialize them with 'Z'.
    """
    with test_app.app_context():
        book = Book(name="book1", user_id=user1.id)
        db.session.add(book)
        db.session.commit()
        book_id = book.id
        word = Word(word="word1", definition="def1", sample="smpl1", book_id=book_id)
        db.session.add(word)
        db.session.commit()
        word_id = word.id

    now = datetime.now(UTC)
    resp = client.post(
        f"/sync/{book_id}",
        json={
            "practices": [
                {
                    "direction": "dw",
                    "status": "review",
                    "due_dates": 1,
                    "due_counter": 0,
                    "last_practiced": now.isoformat(),
                    "last_edited": now.isoformat(),
                    "user_id": user1.id,
                    "word_id": word_id,
                }
            ],
        },
        headers=auth_headers1,
    )
    assert resp.status_code == 200

    adapter = TypeAdapter(list[PracticeSchema])
    pracs: list[PracticeSchema] = adapter.validate_python(resp.get_json()["practices"])
    assert len(pracs) == 1
    prac_data: PracticeSchema = pracs[0]
    assert prac_data.id is not None
    assert prac_data.last_practiced is not None

    last_edited_str: str = cast(str, prac_data.model_dump(mode="json")["last_edited"])
    assert last_edited_str.endswith("Z")
    last_practiced_str: str = cast(
        str, prac_data.model_dump(mode="json")["last_practiced"]
    )
    assert last_practiced_str.endswith("Z")

    edited_parsed = datetime.fromisoformat(last_edited_str.replace("Z", "+00:00"))
    assert edited_parsed.tzinfo is not None
    assert edited_parsed.tzinfo == UTC
    practiced_parsed = datetime.fromisoformat(last_practiced_str.replace("Z", "+00:00"))
    assert practiced_parsed.tzinfo is not None
    assert practiced_parsed.tzinfo == UTC

    with test_app.app_context():
        db_prac = db.session.execute(
            select(Practice).where(Practice.id == prac_data.id)
        ).scalar_one()
        stored_last_edited = db_prac.last_edited
        assert stored_last_edited is not None
        assert stored_last_edited.tzinfo is None
        assert stored_last_edited == edited_parsed.astimezone(UTC).replace(tzinfo=None)
        stored_last_practiced = db_prac.last_practiced
        assert stored_last_practiced is not None
        assert stored_last_practiced.tzinfo is None
        assert stored_last_practiced == practiced_parsed.astimezone(UTC).replace(
            tzinfo=None
        )


# Note: I plan to add time format checks at each step in an export -> import
# (round-trip) integration test
