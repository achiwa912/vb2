import os
from datetime import UTC

# from flask import Flask
# from flask_pydantic import validate
from flask_cors import CORS
from flask_openapi3 import OpenAPI, Info
from sqlalchemy import select
from .database import db
from .models import User, Book, Word, Practice, PracDir
from .schemas import (
    ListBooksResp,
    ListWordsResp,
    BookPath,
    SyncBookReq,
    SyncBookResp,
    BookSchema,
    WordSchema,
    PracticeSchema,
)

basedir = os.path.abspath(os.path.dirname(__file__))

info = Info(title="vb2 server", version="0.0.1")
app = OpenAPI(__name__, info=info)
app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{os.path.join(basedir, 'db.db')}"
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {"echo": True}
CORS(app, origins=["http://localhost:5173"])

db.init_app(app)

if __name__ == "__main__":
    with app.app_context():
        db.create_all()


@app.get("/books", responses={200: ListBooksResp})
def list_books() -> dict[str, ListBooksResp]:
    books = db.session.execute(select(Book).where(Book.user_id == 1)).scalars().all()
    return ListBooksResp.model_validate({"books": books}).model_dump(mode="json")


@app.get("/books/<int:id>/words", responses={200: ListWordsResp})
def list_book_words(path: BookPath) -> dict[str, ListWordsResp]:
    words = (
        db.session.execute(select(Word).where(Word.book_id == path.id)).scalars().all()
    )
    return ListWordsResp.model_validate({"words": words}).model_dump(mode="json")


@app.post("/sync/<int:id>", responses={200: SyncBookResp})
def sync_book(path: BookPath, body: SyncBookReq):
    # reconciliation
    wd_last_practiced = None
    dw_last_practiced = None
    for cp in body.practices:
        cp.last_edited = cp.last_edited.astimezone(UTC)
        if cp.last_practiced:
            cp.last_practiced = cp.last_practiced.astimezone(UTC)
        sp = db.session.execute(
            select(Practice).where(
                Practice.word_id == cp.word_id,
                Practice.user_id == cp.user_id,
                Practice.direction == cp.direction,
            )
        ).scalar_one_or_none()
        if not sp:
            sp = Practice(
                direction=cp.direction,
                last_practiced=cp.last_practiced,
                last_edited=cp.last_edited,
                user_id=cp.user_id,
                word_id=cp.word_id,
                status=cp.status,
                due_dates=cp.due_dates,
                due_counter=cp.due_counter,
            )
            db.session.add(sp)
            if cp.direction == PracDir.WD:
                if not wd_last_practiced or (
                    cp.last_practiced and (cp.last_practiced > wd_last_practiced)
                ):
                    wd_last_practiced = cp.last_practiced
            else:
                if not dw_last_practiced or (
                    cp.last_practiced and (cp.last_practiced > dw_last_practiced)
                ):
                    dw_last_practiced = cp.last_practiced
        else:
            # sp = db.session.execute(
            #     select(Practice).where(Practice.id == cp.id)
            # ).scalar_one()
            print(f"+++ {cp.last_edited} vs {sp.last_edited}")
            if cp.last_edited > sp.last_edited:
                # sp.direction=cp.direction
                sp.last_practiced = cp.last_practiced
                sp.last_edited = cp.last_edited
                # sp.user_id=cp.user_id
                # sp.word_id=cp.word_id
                sp.status = cp.status
                sp.due_dates = cp.due_dates
                sp.due_counter = cp.due_counter
                db.session.add(sp)
                if cp.direction == PracDir.WD:
                    if not wd_last_practiced or (
                        cp.last_practiced and (cp.last_practiced > wd_last_practiced)
                    ):
                        wd_last_practiced = cp.last_practiced
                else:
                    if not dw_last_practiced or (
                        cp.last_practiced and (cp.last_practiced > dw_last_practiced)
                    ):
                        dw_last_practiced = cp.last_practiced
    b = db.session.execute(select(Book).where(Book.id == path.id)).scalar_one()
    if wd_last_practiced and (
        not b.wd_last_practiced or wd_last_practiced > b.wd_last_practiced
    ):
        b.wd_last_practiced = wd_last_practiced
    if dw_last_practiced and (
        not b.dw_last_practiced or dw_last_practiced > b.dw_last_practiced
    ):
        b.dw_last_practiced = dw_last_practiced
    # no need to update b.last_updated
    db.session.commit()

    words = (
        db.session.execute(select(Word).where(Word.book_id == path.id)).scalars().all()
    )
    practices = (
        db.session.execute(select(Practice).join(Word).where(Word.book_id == path.id))
        .scalars()
        .all()
    )
    b = BookSchema.model_validate(b)
    words = [WordSchema.model_validate(w) for w in words]
    practices = [PracticeSchema.model_validate(p) for p in practices]

    return SyncBookResp(book=b, words=words, practices=practices).model_dump(
        mode="json"
    )
