"""Task R13 — data/cameras.json is the only camera store.

A stray root-level cameras.json (e.g. left over from the pre-R13 layout) must be
ignored: load_cameras reads data/, save_cameras writes data/, and nothing syncs
camera configs (or credentials) into the repo root.
"""

import json

import pytest

import src.config as config
from src.models import CameraConfig

ROOT_STRAY = [
    {
        'id': 'stray',
        'name': 'Stray Root Camera',
        'type': 'file',
        'rtsp_url': 'data/stray.mp4',
    }
]

DATA_REAL = [
    {
        'id': 'real',
        'name': 'Real Data Camera',
        'type': 'file',
        'rtsp_url': 'data/real.mp4',
    }
]


@pytest.fixture
def isolated_store(tmp_path, monkeypatch):
  """Point the config module's camera store at tmp_path, with a stray root file present."""
  data_dir = tmp_path / 'data'
  data_dir.mkdir()
  (tmp_path / 'cameras.json').write_text(json.dumps(ROOT_STRAY))  # must be ignored
  monkeypatch.setattr(config, 'DATA_DIR', data_dir)
  monkeypatch.setattr(config, 'DATA_CAMERAS_FILE', data_dir / 'cameras.json')
  monkeypatch.setattr(config, 'CAMERAS_FILE', data_dir / 'cameras.json')
  return data_dir / 'cameras.json'


def test_load_ignores_stray_root_file(isolated_store):
  isolated_store.write_text(json.dumps(DATA_REAL))
  cams = config.load_cameras()
  assert [c.id for c in cams] == ['real']


def test_load_falls_back_to_legacy_when_no_file(isolated_store, monkeypatch):
  monkeypatch.setattr(config, 'ACTIVE_CAMERAS', [{'name': 'Porch', 'type': 'macbook'}])
  cams = config.load_cameras()
  assert len(cams) == 1
  assert cams[0].type == 'macbook'


def test_save_writes_only_data_store(isolated_store, tmp_path):
  cams = [CameraConfig(**DATA_REAL[0])]
  config.save_cameras(cams)
  store = json.loads(isolated_store.read_text())
  assert store[0]['id'] == 'real'
  # No sync back to the repo-root stray — it still holds only the stray payload
  assert json.loads((tmp_path / 'cameras.json').read_text())[0]['id'] == 'stray'
  assert config.CAMERAS == cams


def test_save_is_atomic_no_tmp_left_behind(isolated_store):
  config.save_cameras([CameraConfig(**DATA_REAL[0])])
  assert not list(isolated_store.parent.glob('*.tmp'))
