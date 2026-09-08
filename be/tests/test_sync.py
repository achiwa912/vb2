from datetime import datetime, UTC, timezone, timedelta
from zoneinfo import ZoneInfo
from typing import cast
from flask import Flask
from flask.testing import FlaskClient
from pydantic import TypeAdapter

from ..models import Book, Practice, User, Word, PracDir, PracStat
from ..database import db
from ..schemas import BookSchema, WordSchema, PracticeSchema, SyncBookReq, SyncBookResp


def test_sync_conflict_incoming_newer_wins(
    test_app: Flask,
    client: FlaskClient,
    user1: User,
    auth_headers1: dict[str, str],
) -> None:
    """
    When an incoming practice has a newer `last_edited` than the server's
    existing practice, the incoming fields (status, due_dates, due_counter,
    last_practiced) should overwrite the server's. Book aggregate timestamps
    (`wd_last_practiced`/`dw_last_practiced`) should reflect the incoming
    `last_practiced` if it is later.
    """
    dt_utc = datetime(
        2026, 9, 1, 15, 30, tzinfo=timezone.utc
    )  # 2026-09-01 15:30:00+00:00
    dt_jst_new = datetime(
        2026, 9, 10, 15, 30, tzinfo=timezone(timedelta(hours=9))
    )  # 2026-09-10 15:30:00+09:00
    with test_app.app_context():
        book = Book(name="test1", user_id=user1.id)
        db.session.add(book)
        book.wd_last_practiced = dt_utc.replace(tzinfo=None)
        book.dw_last_practiced = dt_utc.replace(tzinfo=None)
        db.session.commit()

        word = Word(word="word1", definition="def1", sample="smpl1", book_id=book.id)
        db.session.add(word)
        db.session.commit()

        prac = Practice(
            direction="wd",
            last_edited=dt_utc.replace(tzinfo=None),
            last_practiced=dt_utc.replace(tzinfo=None),
            user_id=user1.id,
            word_id=word.id,
            status="learning",
        )
        db.session.add(prac)
        db.session.commit()

        sync_payload = SyncBookReq(
            practices=[
                PracticeSchema(
                    id=prac.id,
                    direction=PracDir(prac.direction),
                    status=PracStat.WAITING,
                    last_practiced=dt_jst_new,
                    last_edited=dt_jst_new,
                    user_id=user1.id,
                    word_id=word.id,
                )
            ]
        )
        resp = client.post(
            f"/sync/{book.id}",
            json=sync_payload.model_dump(mode="json"),
            headers=auth_headers1,
        )
        assert resp.status_code == 200

        adapter = TypeAdapter(list[PracticeSchema])
        pracs: list[PracticeSchema] = adapter.validate_python(
            resp.get_json()["practices"]
        )
        assert len(pracs) == 1
        assert pracs[0].id == prac.id
        assert pracs[0].status == PracStat.WAITING
        assert pracs[0].last_practiced == dt_jst_new
        assert pracs[0].last_edited == dt_jst_new

        assert prac.status == "waiting"
        last_practiced_str: str = cast(
            str, pracs[0].model_dump(mode="json")["last_practiced"]
        )
        parsed = datetime.fromisoformat(last_practiced_str.replace("Z", "+00:00"))
        assert prac.last_practiced == parsed.replace(tzinfo=None)
        assert book.wd_last_practiced == parsed.replace(tzinfo=None)
        last_edited_str: str = cast(
            str, pracs[0].model_dump(mode="json")["last_edited"]
        )
        parsed = datetime.fromisoformat(last_edited_str.replace("Z", "+00:00"))
        assert prac.last_edited == parsed.replace(tzinfo=None)


def test_sync_conflict_server_newer_wins(
    test_app: Flask,
    client: FlaskClient,
    user1: User,
    auth_headers1: dict[str, str],
) -> None:
    """
    When the server's existing practice has a newer `last_edited` than the
    incoming practice, the incoming changes should be ignored. Server data
    remains unchanged and the response should reflect server values.
    """
    dt_utc = datetime(2026, 9, 1, 15, 30, tzinfo=timezone.utc)
    dt_jst = dt_utc.astimezone(ZoneInfo("Asia/Tokyo"))  # jst
    dt_jst_old = datetime(2026, 8, 20, 15, 30, tzinfo=timezone(timedelta(hours=9)))
    with test_app.app_context():
        book = Book(name="test1", user_id=user1.id)
        db.session.add(book)
        book.wd_last_practiced = dt_utc.replace(tzinfo=None)
        book.dw_last_practiced = dt_utc.replace(tzinfo=None)
        db.session.commit()

        word = Word(word="word1", definition="def1", sample="smpl1", book_id=book.id)
        db.session.add(word)
        db.session.commit()

        prac = Practice(
            direction="wd",
            last_edited=dt_utc.replace(tzinfo=None),
            last_practiced=dt_utc.replace(tzinfo=None),
            user_id=user1.id,
            word_id=word.id,
            status="learning",
        )
        db.session.add(prac)
        db.session.commit()

        sync_payload = SyncBookReq(
            practices=[
                PracticeSchema(
                    id=prac.id,
                    direction=PracDir(prac.direction),
                    status=PracStat.WAITING,
                    last_practiced=dt_jst_old,
                    last_edited=dt_jst_old,
                    user_id=user1.id,
                    word_id=word.id,
                )
            ]
        )
        resp = client.post(
            f"/sync/{book.id}",
            json=sync_payload.model_dump(mode="json"),
            headers=auth_headers1,
        )
        assert resp.status_code == 200

        adapter = TypeAdapter(list[PracticeSchema])
        pracs: list[PracticeSchema] = adapter.validate_python(
            resp.get_json()["practices"]
        )
        assert len(pracs) == 1
        assert pracs[0].id == prac.id
        assert pracs[0].status == PracStat.LEARNING
        assert pracs[0].last_practiced == dt_jst
        assert pracs[0].last_edited == dt_jst

        assert prac.status == "learning"
        last_practiced_str: str = cast(
            str, pracs[0].model_dump(mode="json")["last_practiced"]
        )
        parsed = datetime.fromisoformat(last_practiced_str.replace("Z", "+00:00"))
        assert prac.last_practiced == parsed.replace(tzinfo=None)
        last_edited_str: str = cast(
            str, pracs[0].model_dump(mode="json")["last_edited"]
        )
        parsed = datetime.fromisoformat(last_edited_str.replace("Z", "+00:00"))
        assert prac.last_edited == parsed.replace(tzinfo=None)

        assert book.wd_last_practiced == dt_utc.replace(tzinfo=None)


def test_sync_conflict_status_learning_overrides_new(
    test_app: Flask,
    client: FlaskClient,
    user1: User,
    auth_headers1: dict[str, str],
) -> None:
    """
    Even if the server's practice has a newer `last_edited`, an incoming
    practice with status "learning" should override a server practice with
    status "new". The transition from "new" to "learning" takes precedence
    over timestamp comparison.
    """
    dt_utc = datetime(2026, 9, 1, 15, 30, tzinfo=timezone.utc)
    dt_jst = dt_utc.astimezone(ZoneInfo("Asia/Tokyo"))  # jst
    dt_jst_old = datetime(2026, 8, 20, 15, 30, tzinfo=timezone(timedelta(hours=9)))
    with test_app.app_context():
        book = Book(name="test1", user_id=user1.id)
        db.session.add(book)
        book.wd_last_practiced = dt_utc.replace(tzinfo=None)
        book.dw_last_practiced = dt_utc.replace(tzinfo=None)
        db.session.commit()

        word = Word(word="word1", definition="def1", sample="smpl1", book_id=book.id)
        db.session.add(word)
        db.session.commit()

        prac = Practice(
            direction="wd",
            last_edited=dt_utc.replace(tzinfo=None),
            last_practiced=dt_utc.replace(tzinfo=None),
            user_id=user1.id,
            word_id=word.id,
            status="new",
        )
        db.session.add(prac)
        db.session.commit()

        sync_payload = SyncBookReq(
            practices=[
                PracticeSchema(
                    id=prac.id,
                    direction=PracDir(prac.direction),
                    status=PracStat.LEARNING,
                    last_practiced=dt_jst_old,
                    last_edited=dt_jst_old,
                    user_id=user1.id,
                    word_id=word.id,
                )
            ]
        )
        resp = client.post(
            f"/sync/{book.id}",
            json=sync_payload.model_dump(mode="json"),
            headers=auth_headers1,
        )
        assert resp.status_code == 200

        adapter = TypeAdapter(list[PracticeSchema])
        pracs: list[PracticeSchema] = adapter.validate_python(
            resp.get_json()["practices"]
        )
        assert len(pracs) == 1
        assert pracs[0].id == prac.id
        assert pracs[0].status == PracStat.LEARNING
        assert pracs[0].last_practiced == dt_jst_old
        assert pracs[0].last_edited == dt_jst_old

        assert prac.status == "learning"
        last_practiced_str: str = cast(
            str, pracs[0].model_dump(mode="json")["last_practiced"]
        )
        parsed = datetime.fromisoformat(last_practiced_str.replace("Z", "+00:00"))
        assert prac.last_practiced == parsed.replace(tzinfo=None)
        last_edited_str: str = cast(
            str, pracs[0].model_dump(mode="json")["last_edited"]
        )
        parsed = datetime.fromisoformat(last_edited_str.replace("Z", "+00:00"))
        assert prac.last_edited == parsed.replace(tzinfo=None)


def test_sync_conflict_multiple_directions_updates_aggregates_correctly(
    test_app: Flask,
    client: FlaskClient,
    user1: User,
    auth_headers1: dict[str, str],
) -> None:
    """
    When syncing practices for both directions (wd and dw), the book's
    `wd_last_practiced` and `dw_last_practiced` should be updated only from
    the corresponding direction's winning practices, not cross-contaminated.
    """
    dt_wd_utc = datetime(
        2026, 9, 1, 15, 30, tzinfo=timezone.utc
    )  # 2026-09-01 15:30:00+00:00
    dt_dw_utc = datetime(
        2026, 9, 1, 8, 00, tzinfo=timezone.utc
    )  # 2026-09-01 8:00:00+00:00
    dt_wd_jst_new = datetime(
        2026, 9, 10, 15, 30, tzinfo=timezone(timedelta(hours=9))
    )  # 2026-09-10 15:30:00+09:00
    dt_dw_jst_new = datetime(
        2026, 9, 10, 8, 00, tzinfo=timezone(timedelta(hours=9))
    )  # 2026-09-10 8:00:00+09:00
    with test_app.app_context():
        book = Book(name="test1", user_id=user1.id)
        db.session.add(book)
        book.wd_last_practiced = dt_wd_utc.replace(tzinfo=None)
        book.dw_last_practiced = dt_dw_utc.replace(tzinfo=None)
        db.session.commit()

        word = Word(word="word1", definition="def1", sample="smpl1", book_id=book.id)
        db.session.add(word)
        db.session.commit()

        prac_wd = Practice(
            direction="wd",
            last_edited=dt_wd_utc.replace(tzinfo=None),
            last_practiced=dt_wd_utc.replace(tzinfo=None),
            user_id=user1.id,
            word_id=word.id,
            status="learning",
        )
        db.session.add(prac_wd)
        prac_dw = Practice(
            direction="dw",
            last_edited=dt_dw_utc.replace(tzinfo=None),
            last_practiced=dt_dw_utc.replace(tzinfo=None),
            user_id=user1.id,
            word_id=word.id,
            status="learning",
        )
        db.session.add(prac_dw)
        db.session.commit()

        sync_payload = SyncBookReq(
            practices=[
                PracticeSchema(
                    id=prac_wd.id,
                    direction=PracDir(prac_wd.direction),
                    status=PracStat.WAITING,
                    last_practiced=dt_wd_jst_new,
                    last_edited=dt_wd_jst_new,
                    user_id=user1.id,
                    word_id=word.id,
                ),
                PracticeSchema(
                    id=prac_dw.id,
                    direction=PracDir(prac_dw.direction),
                    status=PracStat.WAITING,
                    last_practiced=dt_dw_jst_new,
                    last_edited=dt_dw_jst_new,
                    user_id=user1.id,
                    word_id=word.id,
                ),
            ]
        )
        resp = client.post(
            f"/sync/{book.id}",
            json=sync_payload.model_dump(mode="json"),
            headers=auth_headers1,
        )
        assert resp.status_code == 200

        adapter = TypeAdapter(list[PracticeSchema])
        pracs: list[PracticeSchema] = adapter.validate_python(
            resp.get_json()["practices"]
        )
        assert len(pracs) == 2
        assert pracs[0].id == prac_wd.id
        assert pracs[0].status == PracStat.WAITING
        assert pracs[0].last_practiced == dt_wd_jst_new
        assert pracs[0].last_edited == dt_wd_jst_new

        assert prac_wd.status == "waiting"
        last_practiced_str: str = cast(
            str, pracs[0].model_dump(mode="json")["last_practiced"]
        )
        parsed = datetime.fromisoformat(last_practiced_str.replace("Z", "+00:00"))
        assert prac_wd.last_practiced == parsed.replace(tzinfo=None)
        assert book.wd_last_practiced == parsed.replace(tzinfo=None)
        last_edited_str: str = cast(
            str, pracs[0].model_dump(mode="json")["last_edited"]
        )
        parsed = datetime.fromisoformat(last_edited_str.replace("Z", "+00:00"))
        assert prac_wd.last_edited == parsed.replace(tzinfo=None)

        assert pracs[1].id == prac_dw.id
        assert pracs[1].status == PracStat.WAITING
        assert pracs[1].last_practiced == dt_dw_jst_new
        assert pracs[1].last_edited == dt_dw_jst_new

        assert prac_wd.status == "waiting"
        last_practiced_str = cast(
            str, pracs[1].model_dump(mode="json")["last_practiced"]
        )
        parsed = datetime.fromisoformat(last_practiced_str.replace("Z", "+00:00"))
        assert prac_dw.last_practiced == parsed.replace(tzinfo=None)
        assert book.dw_last_practiced == parsed.replace(tzinfo=None)
        last_edited_str = cast(str, pracs[1].model_dump(mode="json")["last_edited"])
        parsed = datetime.fromisoformat(last_edited_str.replace("Z", "+00:00"))
        assert prac_dw.last_edited == parsed.replace(tzinfo=None)
