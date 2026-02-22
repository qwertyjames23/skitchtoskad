# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for SKAD Floor Plan Generator."""

import os

block_cipher = None
ROOT = os.path.abspath(os.path.dirname(SPEC))

a = Analysis(
    [os.path.join(ROOT, 'backend', 'launcher.py')],
    pathex=[os.path.join(ROOT, 'backend')],
    binaries=[],
    datas=[
        # Bundle the built frontend
        (os.path.join(ROOT, 'frontend', 'dist'), 'frontend_dist'),
    ],
    hiddenimports=[
        # FastAPI / Starlette / Uvicorn internals
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'uvicorn.lifespan.off',
        # App modules
        'app',
        'app.main',
        'app.config',
        'app.api',
        'app.api.routes_parse',
        'app.api.routes_generate',
        'app.api.routes_export',
        'app.models',
        'app.models.schemas',
        'app.models.plan_model',
        'app.core',
        'app.core.parser',
        'app.core.parser.tokenizer',
        'app.core.parser.parser',
        'app.core.parser.validator',
        'app.core.parser.ast_nodes',
        'app.core.geometry',
        'app.core.geometry.wall',
        'app.core.geometry.room',
        'app.core.geometry.opening',
        'app.core.geometry.plan',
        'app.core.geometry.lot',
        'app.core.geometry.validation',
        'app.core.geometry.offset',
        'app.core.exporter',
        'app.core.exporter.dxf_writer',
        'app.core.exporter.dxf_layers',
        'app.core.exporter.dxf_blocks',
        'app.utils',
        'app.utils.units',
        # Pydantic
        'pydantic',
        'pydantic_settings',
        # ezdxf — must include submodules PyInstaller misses
        'ezdxf',
        'ezdxf.entities',
        'ezdxf.sections',
        'ezdxf.layouts',
        'ezdxf.addons',
        'ezdxf.tools',
        'ezdxf.math',
        'ezdxf.enums',
        # Shapely — use collect_submodules via hook instead
        'shapely',
        'shapely.geometry',
        'shapely.ops',
        'shapely.validation',
        'shapely._geos',
        # Starlette internals
        'starlette.responses',
        'starlette.staticfiles',
        'starlette.routing',
        'starlette.middleware',
        'starlette.middleware.cors',
        # Multipart (needed by FastAPI for form parsing)
        'multipart',
        'python_multipart',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'numpy.testing', 'pytest'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='SKAD',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,  # Show console so user can see the URL and Ctrl+C to quit
    icon=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='SKAD',
)
