import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

FIX = Path(__file__).parent / "fixtures"


@pytest.fixture
def montevideo():
    return json.loads((FIX / "context_montevideo.json").read_text())


@pytest.fixture
def indoor():
    return json.loads((FIX / "context_indoor.json").read_text())
