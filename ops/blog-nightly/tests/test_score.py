import unittest
from datetime import date

import _ctx
import db
import score


def seed_db():
    conn = db.connect(":memory:")
    db.migrate(conn)
    rows = [
        {"phrase": "оформление диплома по госту", "source": "manual", "volume": 50000},
        {"phrase": "оформление диплома по госту", "source": "suggest"},
        {"phrase": "нумерация страниц в курсовой", "source": "suggest"},
        {"phrase": "оформление таблиц по госту", "source": "manual", "volume": 500},
        {"phrase": "купить телеграм бота для диплома", "source": "suggest"},
        {"phrase": "погода в москве", "source": "suggest"},
        {"phrase": "как оформить дипломатический паспорт", "source": "suggest"},
        {"phrase": "как оформить курсовую разницу в 1с", "source": "suggest"},
        {"phrase": "повысить уникальность текста", "source": "manual", "volume": 90000},
        {"phrase": "как оформить список литературы", "source": "gsc", "impressions": 9000},
    ]
    for r in rows:
        db.upsert_query(conn, r)
    conn.commit()
    return conn


POSTS = [{"slug": "spisok-literatury", "title": "Как оформить список литературы",
          "description": "", "keywords": ["список литературы", "гост"]}]


class TestShortlist(unittest.TestCase):
    def setUp(self):
        self.conn = seed_db()

    def tearDown(self):
        self.conn.close()

    def test_orders_by_score_desc(self):
        sl = score.shortlist(self.conn, _ctx.CFG, POSTS, _ctx.BANNED, today=date(2026, 5, 1))
        self.assertTrue(sl)
        scores = [c["score"] for c in sl]
        self.assertEqual(scores, sorted(scores, reverse=True))
        self.assertEqual(sl[0]["phrase"], "оформление диплома по госту")

    def test_filters_banned_and_offtopic(self):
        phrases = [c["phrase"] for c in
                   score.shortlist(self.conn, _ctx.CFG, POSTS, _ctx.BANNED)]
        self.assertNotIn("купить телеграм бота для диплома", phrases)
        self.assertNotIn("погода в москве", phrases)
        self.assertNotIn("как оформить дипломатический паспорт", phrases)
        self.assertNotIn("как оформить курсовую разницу в 1с", phrases)
        self.assertNotIn("повысить уникальность текста", phrases)

    def test_drops_covered_topic(self):
        phrases = [c["phrase"] for c in
                   score.shortlist(self.conn, _ctx.CFG, POSTS, _ctx.BANNED)]
        self.assertNotIn("как оформить список литературы", phrases)

    def test_respects_shortlist_size(self):
        cfg = {**_ctx.CFG, "score": {**_ctx.CFG["score"], "shortlist_size": 2}}
        self.assertLessEqual(len(score.shortlist(self.conn, cfg, POSTS, _ctx.BANNED)), 2)

    def test_topic_id_is_stable(self):
        a = score.topic_id_for(self.conn, "оформление таблиц по госту")
        b = score.topic_id_for(self.conn, "оформление таблиц по госту")
        self.assertEqual(a, b)


class TestSeasonality(unittest.TestCase):
    def test_diploma_peaks_in_may(self):
        self.assertGreater(score.seasonality("оформление диплома", date(2026, 5, 10)),
                           score.seasonality("оформление диплома", date(2026, 8, 10)))

    def test_neutral_phrase_is_one(self):
        self.assertEqual(score.seasonality("оформление таблиц", date(2026, 5, 10)), 1.0)


if __name__ == "__main__":
    unittest.main()
