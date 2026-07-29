from enum import Enum
from datetime import datetime
from sqlalchemy import Integer, String, ForeignKey, DateTime, func, UniqueConstraint
from sqlalchemy.orm import (
    Mapped,
    mapped_column as mc,
    relationship,
    DeclarativeBase,
    MappedAsDataclass,
)
from sqlalchemy.sql.schema import SchemaItem

# from .database import db


class Base(MappedAsDataclass, DeclarativeBase):
    pass


class User(Base):
    id: Mapped[int] = mc(Integer, primary_key=True, init=False)
    sub: Mapped[str] = mc(String(128), unique=True, nullable=False)
    email: Mapped[str] = mc(String(128), unique=True, nullable=False)
    name: Mapped[str] = mc(String(128), nullable=False)
    books: Mapped[list["Book"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", init=False
    )
    practices: Mapped[list["Practice"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", init=False
    )
    created_at: Mapped[datetime] = mc(
        DateTime(timezone=True), server_default=func.now(), init=False
    )
    __tablename__: str = "users"


class Book(Base):
    id: Mapped[int] = mc(Integer, primary_key=True, init=False)
    name: Mapped[str] = mc(String(128), nullable=False)
    last_edited: Mapped[datetime] = (
        mc(  # not updated when wd/dw_last_practiced gets updated
            DateTime(timezone=True), server_default=func.now(), init=False
        )
    )
    wd_last_practiced: Mapped[datetime] = mc(
        DateTime(timezone=True), nullable=True, init=False
    )
    dw_last_practiced: Mapped[datetime] = mc(
        DateTime(timezone=True), nullable=True, init=False
    )
    user_id: Mapped[int] = mc(ForeignKey("users.id"))
    user: Mapped["User"] = relationship(back_populates="books", init=False)
    words: Mapped[list["Word"]] = relationship(
        back_populates="book", cascade="all, delete-orphan", init=False
    )
    __tablename__: str = "books"


class Word(Base):
    id: Mapped[int] = mc(Integer, primary_key=True, init=False)
    word: Mapped[str] = mc(String(64), nullable=False)
    definition: Mapped[str] = mc(String(256), nullable=False)
    sample: Mapped[str] = mc(String(256), nullable=True)
    last_edited: Mapped[datetime] = mc(
        DateTime(timezone=True), server_default=func.now(), init=False
    )
    book_id: Mapped[int] = mc(ForeignKey("books.id"))
    book: Mapped["Book"] = relationship(back_populates="words", init=False)
    practices: Mapped[list["Practice"]] = relationship(
        back_populates="word", cascade="all, delete-orphan", init=False
    )
    __tablename__: str = "words"


class PracStat(str, Enum):
    NEW = "new"
    LEARNING = "learning"  # in leraning window
    WAITING = "waiting"  # in waiting window
    REVIEW = "review"
    # DUE = "due"


class PracDir(str, Enum):
    WD = "wd"  # word -> definition
    DW = "dw"  # definition -> word


class Practice(Base):
    id: Mapped[int] = mc(Integer, primary_key=True, init=False)
    direction: Mapped[str] = mc(String(16), nullable=False)
    last_edited: Mapped[datetime] = mc(  # initially filled by client
        DateTime(timezone=True), server_default=func.now()
    )  # updated when last_practiced is updated
    user_id: Mapped[int] = mc(ForeignKey("users.id"))
    user: Mapped["User"] = relationship(back_populates="practices", init=False)
    word_id: Mapped[int] = mc(ForeignKey("words.id"))
    word: Mapped["Word"] = relationship(back_populates="practices", init=False)
    last_practiced: Mapped[datetime | None] = mc(
        DateTime(timezone=True), nullable=True, default=None
    )
    due_dates: Mapped[int | None] = mc(Integer, default=None)
    due_counter: Mapped[int | None] = mc(Integer, default=None)
    status: Mapped[str] = mc(String(16), default=PracStat.NEW)
    __tablename__: str = "practices"
    __table_args__: tuple[SchemaItem] = (
        UniqueConstraint("direction", "user_id", "word_id", name="uq_dir_user_word"),
    )
