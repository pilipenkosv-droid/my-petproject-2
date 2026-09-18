import unittest

import _ctx
import db


class TestMigrations(unittest.TestCase):
    def test_migrate_is_idempotent(self):
        conn = db.connect(":memory:")
        db.migrate(conn)
        db.migrate(conn)
        db.migrate(conn)
        tables = {r["name"] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertTrue({"posts", "queries", "competitor_posts", "topics",
                         "embeddings", "briefs", "runs"} <= tables)
        conn.close()

    def test_upserts_do_not_duplicate(self):
        conn = db.connect(":memory:")
        db.migrate(conn)
        for _ in range(2):
            db.upsert_post(conn, {"slug": "a", "title": "T", "keywords": ["k"]})
            db.upsert_query(conn, {"phrase": "Фраза ", "source": "suggest"})
            db.upsert_competitor_post(conn, "site", "u", "t")
            db.ensure_topics(conn, ["тема"])
        conn.commit()
        for table in ("posts", "queries", "competitor_posts", "topics"):
            n = conn.execute(f"SELECT COUNT(*) c FROM {table}").fetchone()["c"]
            self.assertEqual(n, 1, table)
        self.assertEqual(db.get_posts(conn)[0]["keywords"], ["k"])
        conn.close()

    def test_run_lifecycle(self):
        conn = db.connect(":memory:")
        db.migrate(conn)
        db.start_run(conn, "r1", "2026-09-18", True)
        db.save_brief(conn, "r1", None, {"topic": "т"}, "model-x")
        db.finish_run(conn, "r1", result="dry_run_ok", tokens=12,
                      stage_timings={"recon": 1.0})
        row = conn.execute("SELECT * FROM runs WHERE run_id='r1'").fetchone()
        self.assertEqual(row["result"], "dry_run_ok")
        self.assertEqual(row["dry_run"], 1)
        self.assertIn("recon", row["stage_timings"])
        conn.close()


if __name__ == "__main__":
    unittest.main()
