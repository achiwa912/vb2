from collections.abc import Sequence
from datetime import datetime, UTC
from flask import Flask
from flask.testing import FlaskClient
from sqlalchemy import select
from pydantic import TypeAdapter

from ..database import db
from ..models import Book, Word, Practice, User
from ..schemas import BookSchema, PracticeSchema, WordSchema, ExportResp
from .conftest import to_naive_utc


def test_export_import_roundtrip_different_users(
    test_app: Flask,
    client: FlaskClient,
    user1: User,
    user2: User,
    auth_headers1: dict[str, str],
    auth_headers2: dict[str, str],
) -> None:
    """
    Export and import as a different user.  Check if they match.
    """
    with test_app.app_context():
        book = Book(name="test1", user_id=user1.id)
        db.session.add(book)
        book.wd_last_practiced = datetime.now(UTC).replace(tzinfo=None)
        book.dw_last_practiced = datetime.now(UTC).replace(tzinfo=None)
        db.session.commit()
        book_id = book.id

        word = Word(word="word1", definition="def1", sample="smpl1", book_id=book_id)
        db.session.add(word)
        db.session.commit()
        word_id = word.id

        prac = Practice(
            direction="wd",
            last_edited=datetime.now(UTC).replace(tzinfo=None),
            last_practiced=datetime.now(UTC).replace(tzinfo=None),
            user_id=user1.id,
            word_id=word_id,
            status="new",
        )
        db.session.add(prac)
        db.session.commit()
        prac_id = prac.id

    # export
    resp_exp = client.get("/export", headers=auth_headers1)
    assert resp_exp.status_code == 200

    adapter_b = TypeAdapter(list[BookSchema])
    books_exp: list[BookSchema] = adapter_b.validate_python(
        resp_exp.get_json()["books"]
    )
    assert len(books_exp) == 1
    book_exp_data: BookSchema = books_exp[0]
    assert book_exp_data.id == book_id
    assert book_exp_data.name == book.name
    assert to_naive_utc(book_exp_data.last_edited) == book.last_edited
    assert to_naive_utc(book_exp_data.wd_last_practiced) == book.wd_last_practiced
    assert to_naive_utc(book_exp_data.dw_last_practiced) == book.dw_last_practiced

    adapter_w = TypeAdapter(list[WordSchema])
    words_exp: list[WordSchema] = adapter_w.validate_python(
        resp_exp.get_json()["words"]
    )
    assert len(words_exp) == 1
    word_exp_data: WordSchema = words_exp[0]
    assert word_exp_data.id == word_id
    assert word_exp_data.word == word.word
    assert word_exp_data.definition == word.definition
    assert word_exp_data.sample == word.sample
    assert to_naive_utc(word_exp_data.last_edited) == word.last_edited
    assert word_exp_data.book_id == book_id

    adapter_p = TypeAdapter(list[PracticeSchema])
    pracs_exp: list[PracticeSchema] = adapter_p.validate_python(
        resp_exp.get_json()["practices"]
    )
    assert len(pracs_exp) == 1
    prac_exp_data: PracticeSchema = pracs_exp[0]
    assert prac_exp_data.id == prac_id
    assert prac_exp_data.direction == prac.direction
    assert prac_exp_data.status == prac.status
    assert to_naive_utc(prac_exp_data.last_edited) == prac.last_edited
    assert to_naive_utc(prac_exp_data.last_practiced) == prac.last_practiced
    assert prac_exp_data.user_id == user1.id
    assert prac_exp_data.word_id == word.id

    # import as a different user
    export_data = ExportResp.model_validate(resp_exp.get_json())
    export_payload = export_data.model_dump(mode="json")
    resp_imp = client.post(
        "/import",
        json=export_payload,
        headers=auth_headers2,
    )
    assert resp_imp.status_code == 200

    with test_app.app_context():
        books_imp: Sequence[Book] = (
            db.session.execute(select(Book).where(Book.user_id == user2.id))
            .scalars()
            .all()
        )
        assert len(books_imp) == 1
        book_imp_db: Book = books_imp[0]
        assert book_imp_db.id != book_id
        assert book_imp_db.name == book.name
        assert book_imp_db.user_id == user2.id
        assert book_imp_db.last_edited == to_naive_utc(book_exp_data.last_edited)
        assert book_imp_db.wd_last_practiced == to_naive_utc(
            book_exp_data.wd_last_practiced
        )
        assert book_imp_db.dw_last_practiced == to_naive_utc(
            book_exp_data.dw_last_practiced
        )

        words_imp: Sequence[Word] = (
            db.session.execute(select(Word).where(Word.book_id == book_imp_db.id))
            .scalars()
            .all()
        )
        assert len(words_imp) == 1
        word_imp_db = words_imp[0]
        assert word_imp_db.id != word_id
        assert word_imp_db.word == word.word
        assert word_imp_db.definition == word.definition
        assert word_imp_db.sample == word.sample
        assert word_imp_db.book_id == book_imp_db.id
        assert word_imp_db.last_edited == to_naive_utc(word_exp_data.last_edited)

        pracs_imp: Sequence[Practice] = (
            db.session.execute(
                select(Practice).where(Practice.word_id == word_imp_db.id)
            )
            .scalars()
            .all()
        )
        assert len(pracs_imp) == 1
        prac_imp_db = pracs_imp[0]
        assert prac_imp_db.id != prac_id
        assert prac_imp_db.direction == prac.direction
        assert prac_imp_db.last_edited == to_naive_utc(prac_exp_data.last_edited)
        assert prac_imp_db.user_id == user2.id
        assert prac_imp_db.word_id == word_imp_db.id
        assert prac_imp_db.last_practiced == to_naive_utc(prac_exp_data.last_practiced)
        assert prac_imp_db.due_dates == prac_exp_data.due_dates
        assert prac_imp_db.due_counter == prac_exp_data.due_counter
        assert prac_imp_db.status == prac_exp_data.status
