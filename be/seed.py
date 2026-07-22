from datetime import datetime, timezone
from .models import User, Book, Word
from .database import db
from .api import app

words = [
    {
        "word": "feign",
        "definition": "pretend to be affected by",
        "smpl": "she faigned nervousness",
    },
    {
        "word": "deferential",
        "definition": "respectful",
        "smpl": "people were always deferential to him",
    },
    {
        "word": "despondent",
        "definition": "in low spirits from loss of hope or courage",
        "smpl": "despondent about his health",
    },
    {
        "word": "disconcerting",
        "definition": "causing one to feel unsettled",
        "smpl": "a disconcerting silence",
    },
    {
        "word": "disparate",
        "definition": "different in every way",
        "smpl": "disparate ideas",
    },
    {
        "word": "impalpable",
        "definition": "unable to be felt by touch",
        "smpl": "an impalpable ghost",
    },
    {
        "word": "imperious",
        "definition": "marked by arrogant assurance",
        "smpl": "an imperious person",
    },
    {
        "word": "impersonal",
        "definition": "not influenced by, showing, or involving personal feelings",
        "smpl": "She has a very cold and impersonal manner",
    },
    {
        "word": "stolid",
        "definition": "(of a person) calm and not showing emotion or exceitement",
        "smpl": "He is a very stolid, serious man.",
    },
    {
        "word": "insolent",
        "definition": "showing a rude and arrogant lack of respect.",
        "smpl": "she hated the insolent tone of his voice",
    },
]

with app.app_context():
    u = User(sub="test", email="test@test.com", name="test")
    db.session.add(u)
    db.session.commit()
    b = Book(user_id=u.id, name="book1", last_edited=datetime.now(timezone.utc))
    db.session.add(b)
    db.session.commit()
    for w in words:
        w = Word(
            word=w["word"], definition=w["definition"], sample=w["smpl"], book_id=b.id
        )
        db.session.add(w)
    db.session.commit()
