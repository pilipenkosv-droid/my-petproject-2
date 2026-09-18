import unittest

import _ctx
import recon

RSS = """<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>Оформление диплома</title><link>https://diplox.online/blog/oformlenie-diploma</link>
<description>Про ГОСТ</description><category>гост</category></item>
</channel></rss>"""

SITEMAP = """<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://diplox.online/blog/spisok-literatury</loc></url>
<url><loc>https://diplox.online/pricing</loc></url>
</urlset>"""

ROBOTS = "User-agent: *\nDisallow: /admin\nSitemap: https://kampus.ai/sitemap.xml\n"


class TestParsers(unittest.TestCase):
    def test_rss(self):
        posts = recon.parse_rss(RSS)
        self.assertEqual(posts[0]["slug"], "oformlenie-diploma")
        self.assertEqual(posts[0]["keywords"], ["гост"])

    def test_sitemap_prefix_filter(self):
        urls = recon.parse_sitemap_urls(SITEMAP, prefix="/blog/")
        self.assertEqual(urls, ["https://diplox.online/blog/spisok-literatury"])

    def test_robots_sitemap_regex(self):
        import re
        self.assertEqual(re.findall(r"(?im)^\s*sitemap:\s*(\S+)", ROBOTS),
                         ["https://kampus.ai/sitemap.xml"])


class TestWordstat(unittest.TestCase):
    def test_missing_file_is_tolerated(self):
        self.assertEqual(recon.wordstat_rows("/nonexistent/wordstat.json"), [])

    def test_repo_file_imports_as_manual(self):
        path = _ctx.ROOT.parents[1] / "docs" / "wordstat-raw-data.json"
        rows = recon.wordstat_rows(str(path))
        self.assertTrue(rows)
        self.assertTrue(all(r["source"] == "manual" for r in rows))
        self.assertTrue(all(isinstance(r["volume"], int) for r in rows))


if __name__ == "__main__":
    unittest.main()
