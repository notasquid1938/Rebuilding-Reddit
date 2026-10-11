import os
import sys

import pytest

# The loaders are top-level scripts in reddit-clone/
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, ROOT)


def integration_enabled():
    # Only ever touch a database whose name says it is disposable
    return os.getenv('INTEGRATION') == '1' and os.getenv('POSTGRES_DB', '').endswith('_test')


def pytest_collection_modifyitems(config, items):
    if integration_enabled():
        return
    skip = pytest.mark.skip(reason='integration tests run via tests/run-integration.sh')
    for item in items:
        if 'integration' in item.keywords:
            item.add_marker(skip)


def pytest_configure(config):
    config.addinivalue_line('markers', 'integration: needs the loaded test database')
