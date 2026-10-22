#!/usr/bin/env python3
"""Check coordinated beta identities without importing/executing package code."""
import ast
import json
import os
from pathlib import Path
import re
import tomllib

ROOT = Path(__file__).resolve().parents[1]


def verify(tag=None):
    cargo = tomllib.loads((ROOT / 'Cargo.toml').read_text())
    version = cargo['workspace']['package']['version']
    match = re.fullmatch(r'(\d+\.\d+\.\d+)-beta\.(\d+)', version)
    if not match:
        raise ValueError('This workflow packages beta versions, not an implicit product-v1 release')
    python_version = match[1] + 'b' + match[2]
    for path in ['packages/js/package.json', 'apps/demo/package.json']:
        if json.loads((ROOT / path).read_text())['version'] != version:
            raise ValueError('Package version differs: ' + path)
    demo = json.loads((ROOT / 'apps/demo/package.json').read_text())
    if demo['dependencies']['@arro000/valicore'] != version:
        raise ValueError('Demo package dependency differs')
    npm_lock = json.loads((ROOT / 'package-lock.json').read_text())
    for name in ['packages/js', 'apps/demo']:
        if npm_lock['packages'][name]['version'] != version:
            raise ValueError('npm lock version differs: ' + name)
    for package in tomllib.loads((ROOT / 'Cargo.lock').read_text())['package']:
        if package['name'] == 'valicore' or package['name'].startswith('valicore-'):
            if package['version'] != version:
                raise ValueError('Cargo lock version differs: ' + package['name'])
    if tomllib.loads((ROOT / 'packages/python/pyproject.toml').read_text())['project']['version'] != python_version:
        raise ValueError('Python distribution version differs')
    constants = {}
    for node in ast.parse((ROOT / 'packages/python/src/valicore/__init__.py').read_text()).body:
        if isinstance(node, ast.Assign) and isinstance(node.value, ast.Constant):
            for target in node.targets:
                if isinstance(target, ast.Name): constants[target.id] = node.value.value
    if constants.get('__version__') != python_version or constants.get('_ENGINE_VERSION') != version:
        raise ValueError('Python wrapper/engine constants differ')
    if tag and tag != 'v' + version:
        raise ValueError('Tag differs from coordinated source version')
    return {'engineVersion': version, 'pythonVersion': python_version, 'tagChecked': bool(tag)}


if __name__ == '__main__':
    print(json.dumps(verify(os.environ.get('RELEASE_TAG')), indent=2))
