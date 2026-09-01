from flask import Flask
from flask.testing import FlaskClient
from sqlalchemy import select
from pydantic import TypeAdapter

from ..database import db
from ..models import Book, Word, Practice, User
from ..schemas import BookSchema, PracticeSchema, WordSchema
