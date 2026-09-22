from typing import ClassVar, Literal
from datetime import datetime, timezone
from pydantic import BaseModel, ConfigDict, field_serializer, Field
from flask_openapi3.models.file import FileStorage
from .models import PracStat, PracDir


class BookSchema(BaseModel):
    id: int
    name: str
    last_edited: datetime
    wd_last_practiced: datetime | None
    dw_last_practiced: datetime | None
    user_id: int
    model_config: ClassVar[ConfigDict] = ConfigDict(from_attributes=True)

    @field_serializer("last_edited", "wd_last_practiced", "dw_last_practiced")
    def serialize_last_time(self, dt: datetime | None) -> datetime | None:
        if dt is None:
            return dt
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt


class WordSchema(BaseModel):
    id: int
    word: str
    definition: str
    sample: str | None
    last_edited: datetime
    book_id: int
    model_config: ClassVar[ConfigDict] = ConfigDict(from_attributes=True)

    @field_serializer("last_edited")
    def serialize_last_edited(self, dt: datetime) -> datetime:
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt


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

    @field_serializer("last_edited", "last_practiced")
    def serialize_last_time(self, dt: datetime | None) -> datetime | None:
        if dt is None:
            return dt
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt


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


class MessageResp(BaseModel):
    message: str


class ExportResp(BaseModel):
    books: list[BookSchema]
    words: list[WordSchema]
    practices: list[PracticeSchema]


class ImportCsvReq(BaseModel):
    file: FileStorage = Field(description="CSV file to import")


class ImportCsvResp(BaseModel):
    added: int
    skipped: int
    failed: int
    errors: list[tuple[int, str]]  # (line_number, word)
