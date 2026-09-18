import unittest

import _ctx
import llm


def ok_body(content='{"ok": 1}', pt=100, ct=200):
    import json
    return json.dumps({"choices": [{"message": {"content": content}}],
                       "usage": {"prompt_tokens": pt, "completion_tokens": ct}})


class FakeTransport:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = 0

    def __call__(self, url, payload, headers, timeout):
        self.calls += 1
        item = self.responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


def client(transport, **kw):
    return llm.LLMClient(base_url="https://api.example/v1", api_key="k",
                         transport=transport, sleep=lambda _s: None, **kw)


class TestRetry(unittest.TestCase):
    def test_retries_on_429_then_succeeds(self):
        t = FakeTransport([(429, "rate limit"), (200, ok_body())])
        c = client(t)
        self.assertEqual(c.chat("m", [{"role": "user", "content": "x"}]), '{"ok": 1}')
        self.assertEqual(t.calls, 2)
        self.assertEqual(c.usage.calls, 1)
        self.assertEqual(c.usage.total_tokens, 300)

    def test_retries_on_timeout(self):
        t = FakeTransport([TimeoutError("slow"), (200, ok_body())])
        self.assertEqual(client(t).chat("m", []), '{"ok": 1}')

    def test_gives_up_after_max_retries(self):
        t = FakeTransport([(503, "x"), (503, "x"), (503, "x")])
        with self.assertRaises(llm.LLMError):
            client(t).chat("m", [])
        self.assertEqual(t.calls, 3)

    def test_no_retry_on_400(self):
        t = FakeTransport([(400, "bad request")])
        with self.assertRaises(llm.LLMError):
            client(t).chat("m", [])
        self.assertEqual(t.calls, 1)


class TestCap(unittest.TestCase):
    def test_call_cap_enforced(self):
        t = FakeTransport([(200, ok_body()), (200, ok_body()), (200, ok_body())])
        c = client(t, max_calls=2)
        c.chat("m", [])
        c.chat("m", [])
        with self.assertRaises(llm.CallCapExceeded):
            c.chat("m", [])
        self.assertEqual(t.calls, 2)

    def test_failed_call_still_counts(self):
        t = FakeTransport([(400, "x")])
        c = client(t, max_calls=1)
        with self.assertRaises(llm.LLMError):
            c.chat("m", [])
        with self.assertRaises(llm.CallCapExceeded):
            c.chat("m", [])

    def test_cost_accounting(self):
        c = client(FakeTransport([(200, ok_body(pt=400_000, ct=600_000))]))
        c.chat("m", [])
        self.assertAlmostEqual(c.usage.cost_usd(1.0), 1.0)


if __name__ == "__main__":
    unittest.main()
