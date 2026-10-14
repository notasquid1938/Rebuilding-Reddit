import os
import sys

import pytest

# The loaders are top-level scripts in reddit-clone/
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, ROOT)


def integration_mode():
    # Only ever touch a database whose name says it is disposable
    if not os.getenv('POSTGRES_DB', '').endswith('_test'):
        return None
    return os.getenv('INTEGRATION')


# Each marker runs only in its phase of tests/run-integration.sh:
# "integration" right after the fixtures load, "gapfill" once the website tests are done
PHASES = {'integration': '1', 'gapfill': 'gapfill'}


def pytest_collection_modifyitems(config, items):
    mode = integration_mode()
    for item in items:
        for marker, phase in PHASES.items():
            if marker in item.keywords and mode != phase:
                item.add_marker(pytest.mark.skip(reason=f'{marker} tests run via tests/run-integration.sh'))


def pytest_configure(config):
    config.addinivalue_line('markers', 'integration: needs the loaded test database')
    config.addinivalue_line('markers', 'gapfill: runs gapfill_loader.py against the loaded test database')
