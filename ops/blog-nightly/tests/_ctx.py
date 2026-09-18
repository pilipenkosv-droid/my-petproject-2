"""Shared test setup: make the pipeline modules importable and load config."""

import re
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

CFG = tomllib.loads((ROOT / "config.toml").read_text("utf-8"))
BANNED = re.compile(CFG["checks"]["banned_product_regex"], re.IGNORECASE)
SAFETY = re.compile(CFG["checks"]["safety_regex"], re.IGNORECASE)
