from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.engine.interfaces import DBAPIConnection
from sqlalchemy.pool import ConnectionPoolEntry
from .models import Base

db = SQLAlchemy(model_class=Base, session_options={"expire_on_commit": False})


@event.listens_for(Engine, "connect")
def set_sqlite_pragmas(
    dbapi_connection: DBAPIConnection, _connection_record: ConnectionPoolEntry
) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.close()
