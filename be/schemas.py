from typing import ClassVar, Literal
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from .models import PracStat, PracDir


class BookSchema(BaseModel):
    id: int
    name: str
    last_edited: datetime
    wd_last_practiced: datetime
    dw_last_practiced: datetime
    user_id: int
    model_config: ClassVar[ConfigDict] = ConfigDict(from_attributes=True)


class WordSchema(BaseModel):
    id: int
    word: str
    definition: str
    sample: str
    last_edited: datetime
    book_id: int
    model_config: ClassVar[ConfigDict] = ConfigDict(from_attributes=True)


class PracticeSchema(BaseModel):
    id: int | None = None
    direction: PracDir
    status: PracStat
    due_dates: int | None = None
    due_counter: int | None = None
    last_practiced: datetime | None = None
    last_edited: datetime
    user_id: int
    word_id: int
    model_config: ClassVar[ConfigDict] = ConfigDict(from_attributes=True)


class GglAuthReq(BaseModel):
    token: str  # jwt token


class GglAuthResp(BaseModel):
    user_id: int
    access_token: str
    email: str
    name: str


class CreateBookReq(BaseModel):
    name: str


class PatchBookReq(BaseModel):
    name: str  # PATCH only update this


class BookResp(BaseModel):
    book: BookSchema


class ListBooksResp(BaseModel):
    books: list[BookSchema]


class BookPath(BaseModel):
    id: int


class WordPath(BaseModel):
    bid: int
    wid: int


class CreateWordReq(BaseModel):
    word: str
    definition: str
    sample: str | None = None


class PatchWordReq(BaseModel):
    word: str | None = None
    definition: str | None = None
    sample: str | None = None


class WordResp(BaseModel):
    word: WordSchema


class ListWordsResp(BaseModel):
    words: list[WordSchema]


class SyncBookReq(BaseModel):
    practices: list[PracticeSchema]


class SyncBookResp(BaseModel):
    book: BookSchema
    words: list[WordSchema]
    practices: list[PracticeSchema]
