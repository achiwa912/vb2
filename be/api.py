import os
from datetime import UTC, timedelta, datetime, timezone
from dotenv import load_dotenv
from sqlalchemy.orm import selectinload

# from flask import Flask
# from flask_pydantic import validate
from flask_cors import CORS
from flask_openapi3 import OpenAPI, Info
from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    jwt_required,
    get_jwt_identity,
)
from sqlalchemy import select
from google.auth.transport import requests
from google.oauth2 import id_token
from .database import db
from .models import User, Book, Word, Practice, PracDir
from .schemas import (
    GglAuthReq,
    GglAuthResp,
    CreateBookReq,
    PatchBookReq,
    BookResp,
    ListBooksResp,
    ListWordsResp,
    BookPath,
    WordPath,
    CreateWordReq,
    PatchWordReq,
    WordResp,
    SyncBookReq,
    SyncBookResp,
    BookSchema,
    WordSchema,
    PracticeSchema,
    MessageResp,
)

basedir = os.path.abspath(os.path.dirname(__file__))
load_dotenv()

info = Info(title="vb2 server", version="0.0.1")
app = OpenAPI(__name__, info=info)
app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{os.path.join(basedir, 'db.db')}"
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {"echo": True}
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY")
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(days=14)
CORS(app, origins=["http://localhost:5173"])

jwt = JWTManager(app)
db.init_app(app)

if __name__ == "__main__":
    with app.app_context():
        db.create_all()


@app.post("/auth/ggl", responses={200: GglAuthResp, 401: MessageResp})
def auth_ggl(body: GglAuthReq) -> tuple[dict[str, str], int]:
    try:
        id_info = id_token.verify_oauth2_token(
            body.token, requests.Request(), os.getenv("GGL_CLIENT_ID")
        )
    except ValueError:
        return {"message": "Invalid Google token"}, 401
    user = db.session.execute(
        select(User).where(User.sub == id_info["sub"])
    ).scalar_one_or_none()
    if not user:
        user = User(
            sub=id_info["sub"], email=id_info.get("email"), name=id_info.get("name")
        )
        db.session.add(user)
        db.session.commit()
    atoken = create_access_token(identity=str(user.id))
    return (
        GglAuthResp.model_validate(
            {
                "user_id": user.id,
                "access_token": atoken,
                "email": user.email,
                "name": user.name,
            }
        ).model_dump(mode="json"),
        200,
    )


@app.get("/books", responses={200: ListBooksResp})
@jwt_required()
def list_books() -> dict[str, ListBooksResp]:
    user_id = int(get_jwt_identity())
    books = (
        db.session.execute(select(Book).where(Book.user_id == user_id)).scalars().all()
    )
    return ListBooksResp.model_validate({"books": books}).model_dump(mode="json")


@app.post("/books/<int:id>/words", responses={200: WordResp, 404: MessageResp})
@jwt_required()
def create_word(path: BookPath, body: CreateWordReq) -> tuple[dict[str, str], int]:
    user_id = int(get_jwt_identity())
    b = db.session.execute(
        select(Book).where(Book.id == path.id, Book.user_id == user_id)
    ).scalar_one_or_none()
    if not b:
        return {"message": "Book not found"}, 404
    w = Word(
        word=body.word, definition=body.definition, sample=body.sample, book_id=path.id
    )
    db.session.add(w)
    db.session.commit()
    return WordResp.model_validate({"word": w}).model_dump(mode="json"), 200


@app.patch(
    "/books/<int:bid>/words/<int:wid>", responses={200: WordResp, 404: MessageResp}
)
@jwt_required()
def edit_word(path: WordPath, body: PatchWordReq) -> tuple[dict[str, str], int]:
    user_id = int(get_jwt_identity())
    w = db.session.execute(
        select(Word)
        .join(Book)
        .where(Word.id == path.wid, Book.id == path.bid, Book.user_id == user_id)
    ).scalar_one_or_none()
    if not w:
        return {"message": "Word not found"}, 404
    if body.word is not None:
        w.word = body.word
    if body.definition is not None:
        w.definition = body.definition
    if body.sample is not None:
        w.sample = body.sample
    w.last_edited = datetime.now(timezone.utc)
    db.session.commit()
    return WordResp.model_validate({"word": w}).model_dump(mode="json"), 200


@app.delete("/books/<int:bid>/words/<int:wid>", responses={200: None, 404: MessageResp})
@jwt_required()
def delete_word(path: WordPath) -> tuple[dict[str, str], int]:
    user_id = int(get_jwt_identity())
    w = db.session.execute(
        select(Word)
        .options(selectinload(Word.practices))
        .join(Book)
        .where(Word.id == path.wid, Book.id == path.bid, Book.user_id == user_id)
    ).scalar_one_or_none()
    if not w:
        return {"message": "Word not found"}, 404
    db.session.delete(w)
    db.session.commit()
    return {"message": f"Deleted word id={path.wid} and associated practices"}, 200


@app.post("/books", responses={200: BookResp})
@jwt_required()
def create_book(body: CreateBookReq) -> dict[str, BookResp]:
    user_id = int(get_jwt_identity())
    b = Book(name=body.name, user_id=user_id)
    db.session.add(b)
    db.session.commit()
    return BookResp.model_validate({"book": b}).model_dump(mode="json")


@app.patch(
    "/books/<int:id>", responses={200: BookResp, 400: MessageResp, 404: MessageResp}
)
@jwt_required()
def edit_book(path: BookPath, body: PatchBookReq) -> tuple[dict[str, str], int]:
    if not body.name:
        return {"message": "Invalid book name"}, 400
    user_id = int(get_jwt_identity())
    b = db.session.execute(
        select(Book).where(Book.id == path.id, Book.user_id == user_id)
    ).scalar_one_or_none()
    if not b:
        return {"message": "Book not found"}, 404
    b.name = body.name
    b.last_edited = datetime.now(timezone.utc)
    db.session.commit()
    return BookResp.model_validate({"book": b}).model_dump(mode="json"), 200


@app.delete(
    "/books/<int:id>", responses={200: None, 400: MessageResp, 404: MessageResp}
)
@jwt_required()
def delete_book(path: BookPath):
    user_id = int(get_jwt_identity())
    b = db.session.execute(
        select(Book)
        .options(selectinload(Book.words))
        .where(Book.id == path.id, Book.user_id == user_id)
    ).scalar_one_or_none()
    if not b:
        return {"message": "Book not found"}, 404
    if b.words:
        return {"message": "Book not empty"}, 400
    db.session.delete(b)
    db.session.commit()
    return {"message": f"Deleted book id={path.id}"}, 200


@app.get("/books/<int:id>/words", responses={200: ListWordsResp, 404: MessageResp})
@jwt_required()
def list_book_words(path: BookPath) -> tuple[dict[str, str], int]:
    user_id = int(get_jwt_identity())
    book = db.session.execute(
        select(Book).where(Book.user_id == user_id, Book.id == path.id)
    ).scalar_one_or_none()
    if not book:
        return {"message": "Book not found"}, 404
    words = (
        db.session.execute(select(Word).where(Word.book_id == path.id)).scalars().all()
    )
    return ListWordsResp.model_validate({"words": words}).model_dump(mode="json"), 200


@app.post("/sync/<int:id>", responses={200: SyncBookResp, 404: MessageResp})
@jwt_required()
def sync_book(path: BookPath, body: SyncBookReq) -> tuple[dict[str, str], int]:
    user_id = int(get_jwt_identity())
    book = db.session.execute(
        select(Book).where(Book.user_id == user_id, Book.id == path.id)
    ).scalar_one_or_none()
    if not book:
        return {"message": "Book not found"}, 404

    # reconciliation
    wd_last_practiced = None
    dw_last_practiced = None
    for cp in body.practices:
        cp.last_edited = cp.last_edited.astimezone(UTC).replace(tzinfo=None)
        if cp.last_practiced:
            cp.last_practiced = cp.last_practiced.astimezone(UTC).replace(tzinfo=None)
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
            print(f"+++ {cp.last_edited} vs {sp.last_edited}")
            if cp.last_edited > sp.last_edited or (
                cp.status == "learning" and sp.status == "new"
            ):
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

    return (
        SyncBookResp(book=b, words=words, practices=practices).model_dump(mode="json"),
        200,
    )
