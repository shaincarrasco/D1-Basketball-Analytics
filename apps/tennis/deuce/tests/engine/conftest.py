import sys
from pathlib import Path

import warnings

import pytest

warnings.filterwarnings("ignore", message=".*eval_set.*")

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from engine_testutil import make_db  # noqa: E402


@pytest.fixture()
def league():
    return make_db()
