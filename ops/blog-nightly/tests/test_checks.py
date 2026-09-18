import unittest

import _ctx
import checks


def article(**over):
    base = {
        "title": "Как оформить список литературы по ГОСТу",
        "description": "Разбираем требования к списку литературы.",
        "slug": "kak-oformit-spisok-literatury",
        "keywords": ["список литературы", "гост"],
        "content_markdown": ("## Список литературы\n\nЭто список литературы по ГОСТ Р 7.0.5-2008. "
                             + "слово " * 700),
        "reading_time": "5 мин",
    }
    base.update(over)
    return base


BRIEF = {
    "keywords": ["список литературы", "гост", "оформление источников",
                 "библиографическая запись", "курсовая"],
    "gost_whitelist": ["ГОСТ Р 7.0.5-2008", "ГОСТ 7.32-2017"],
}


class TestBannedProduct(unittest.TestCase):
    def test_clean_article_passes(self):
        self.assertIsNone(checks.check_banned_product(article(), _ctx.BANNED))

    def test_bot_in_body_is_fatal(self):
        f = checks.check_banned_product(
            article(content_markdown="Наш телеграм-бот оформит работу"), _ctx.BANNED)
        self.assertIsNotNone(f)
        self.assertEqual(f.code, "banned_product_mention")
        self.assertTrue(f.fatal)

    def test_bot_in_keywords_is_caught(self):
        f = checks.check_banned_product(article(keywords=["Second Brain"]), _ctx.BANNED)
        self.assertIsNotNone(f)

    def test_common_words_are_not_false_positives(self):
        body = ("Дипломная работа, работать с оборотом, ботинки и субботник — "
                "всё это не про несуществующий продукт. ") + "слово " * 700
        self.assertIsNone(checks.check_banned_product(article(content_markdown=body),
                                                      _ctx.BANNED))

    def test_inflected_bot_is_caught(self):
        for form in ("в боте", "ботами", "телеграмм", "Second Brain"):
            with self.subTest(form=form):
                self.assertIsNotNone(checks.check_banned_product(
                    article(content_markdown=f"{form} " + "слово " * 700), _ctx.BANNED))

    def test_safety_stopword(self):
        f = checks.check_safety(article(description="см. vault заметки"), _ctx.SAFETY)
        self.assertIsNotNone(f)
        self.assertTrue(f.fatal)


class TestGostWhitelist(unittest.TestCase):
    def test_whitelisted_passes(self):
        self.assertIsNone(checks.check_gost_whitelist(article(), BRIEF["gost_whitelist"]))

    def test_invented_standard_fails(self):
        f = checks.check_gost_whitelist(
            article(content_markdown="Смотри ГОСТ 9.99-2030 " + "слово " * 700),
            BRIEF["gost_whitelist"])
        self.assertEqual(f.code, "gost_not_whitelisted")

    def test_dash_variants_are_normalised(self):
        self.assertIsNone(checks.check_gost_whitelist(
            article(content_markdown="ГОСТ 7.32–2017 " + "слово " * 700),
            ["ГОСТ 7.32-2017"]))


class TestOtherChecks(unittest.TestCase):
    def test_min_words(self):
        f = checks.check_min_words(article(content_markdown="коротко"), 600)
        self.assertEqual(f.code, "too_short")
        self.assertFalse(f.fatal)

    def test_keywords_missing(self):
        f = checks.check_keywords(article(content_markdown="текст без ключей " * 400),
                                  BRIEF, 3)
        self.assertEqual(f.code, "keywords_missing")

    def test_keywords_present(self):
        body = " ".join(BRIEF["keywords"]) + " слово" * 700
        self.assertIsNone(checks.check_keywords(article(content_markdown=body), BRIEF, 3))

    def test_slug_unique(self):
        posts = [{"slug": "kak-oformit-spisok-literatury", "title": "t", "keywords": []}]
        f = checks.check_slug_unique(article(), {p["slug"] for p in posts})
        self.assertEqual(f.code, "slug_taken")

    def test_title_similarity_threshold(self):
        posts = [{"slug": "old", "title": "Как оформить список литературы по ГОСТу",
                  "keywords": [], "description": ""}]
        self.assertIsNotNone(checks.check_title_similarity(article(), posts, 0.7))
        distinct = article(title="Нумерация страниц в отчёте по практике")
        self.assertIsNone(checks.check_title_similarity(distinct, posts, 0.7))


if __name__ == "__main__":
    unittest.main()
