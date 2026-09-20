"""Zone filter tests — point-in-polygon with known coordinates."""

from src.detection.zones import ZoneFilter


def test_point_inside_zone():
  zones = [{'name': 'porch', 'coordinates': [[0, 0], [100, 0], [100, 100], [0, 100]]}]
  zf = ZoneFilter(zones)
  in_zone, name = zf.is_in_zone([10, 10, 20, 20])  # center = (20, 20)
  assert in_zone is True
  assert name == 'porch'


def test_point_outside_zone():
  zones = [{'name': 'porch', 'coordinates': [[0, 0], [100, 0], [100, 100], [0, 100]]}]
  zf = ZoneFilter(zones)
  in_zone, _ = zf.is_in_zone([200, 200, 20, 20])  # center = (210, 210)
  assert in_zone is False


def test_no_zones_passes_everything():
  zf = ZoneFilter([])
  in_zone, name = zf.is_in_zone([500, 500, 50, 50])
  assert in_zone is True
  assert name is None


def test_multiple_zones_matched_in_order():
  zones = [
    {'name': 'left', 'coordinates': [[0, 0], [300, 0], [300, 360], [0, 360]]},
    {
      'name': 'right',
      'coordinates': [[300, 0], [640, 0], [640, 360], [300, 360]],
    },
  ]
  zf = ZoneFilter(zones)
  assert zf.is_in_zone([10, 10, 40, 40])[1] == 'left'
  assert zf.is_in_zone([500, 10, 40, 40])[1] == 'right'


def test_filter_detections_tags_zone():
  zones = [{'name': 'porch', 'coordinates': [[0, 0], [100, 0], [100, 100], [0, 100]]}]
  zf = ZoneFilter(zones)
  detections = [
    {'bbox': [10, 10, 20, 20], 'name': 'joynal'},  # inside
    {'bbox': [300, 300, 20, 20], 'name': 'x'},  # outside
  ]
  filtered = zf.filter_detections(detections)
  assert len(filtered) == 1
  assert filtered[0]['zone'] == 'porch'


def test_filter_detections_no_zones_passthrough():
  zf = ZoneFilter([])
  detections = [{'bbox': [900, 900, 10, 10]}, {'bbox': [0, 0, 10, 10]}]
  assert zf.filter_detections(detections) == detections
