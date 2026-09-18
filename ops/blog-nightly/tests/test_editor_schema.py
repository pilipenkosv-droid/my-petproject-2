import unittest

import _ctx
import editor

VALID = {
    "topic": "Как оформить приложения в дипломе",
    "cluster": "gost",
    "target_query": "оформление приложений в дипломе",
    "keywords": ["приложения в дипломе", "гост 7.32", "оформление приложений",
                 "нумерация приложений", "дипломная работа"],
    "intent": "понять правила оформления приложений",
    "must_cover": ["нумерация", "ссылки в тексте"],
    "internal_links": ["/create"],
    "avoid": ["spisok-literatury"],
    "gost_whitelist": ["ГОСТ 7.32-2017"],
    "tone": "на ты, практично",
}


class TestBriefSchema(unittest.TestCase):
    def setUp(self):
        self.schema = editor.load_schema()

    def test_valid_brief(self):
        self.assertEqual(editor.validate(VALID, self.schema), [])

    def test_missing_field(self):
        bad = {k: v for k, v in VALID.items() if k != "intent"}
        self.assertTrue(any("intent" in e for e in editor.validate(bad, self.schema)))

    def test_wrong_cluster(self):
        self.assertTrue(editor.validate({**VALID, "cluster": "second-brain"}, self.schema))

    def test_too_few_keywords(self):
        self.assertTrue(editor.validate({**VALID, "keywords": ["a", "b"]}, self.schema))

    def test_wrong_type(self):
        self.assertTrue(editor.validate({**VALID, "must_cover": "строка"}, self.schema))


class TestSanitize(unittest.TestCase):
    def test_drops_unknown_links_and_standards(self):
        brief = editor.sanitize(
            {**VALID, "internal_links": ["/create", "/bot", "/blog/spisok-literatury"],
             "gost_whitelist": ["ГОСТ 7.32-2017", "ГОСТ 99.9-2030"]},
            ["/create", "/pricing"], ["ГОСТ 7.32-2017"], {"spisok-literatury"})
        self.assertEqual(brief["internal_links"], ["/create", "/blog/spisok-literatury"])
        self.assertEqual(brief["gost_whitelist"], ["ГОСТ 7.32-2017"])
        self.assertEqual(brief["cluster"], "gost")


class TestExtractJson(unittest.TestCase):
    def test_strips_fences_and_prose(self):
        import llm
        raw = 'Вот бриф:\n```json\n{"topic": "а", "n": {"k": "}"}}\n```\nготово'
        self.assertEqual(llm.extract_json(raw), {"topic": "а", "n": {"k": "}"}})


if __name__ == "__main__":
    unittest.main()
