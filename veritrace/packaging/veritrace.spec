# -*- mode: python ; coding: utf-8 -*-
"""Exécutable autonome Veritrace (PyInstaller, un seul fichier).

    pyinstaller packaging/veritrace.spec --noconfirm      # depuis le dossier veritrace/

Produit dist/veritrace (Linux, macOS) ou dist/veritrace.exe (Windows) : aucun Python requis
sur le poste d'examen. Les outils externes (ADB, ALEAPP, MVT, Autopsy) restent à installer
séparément ; ALEAPP, livré en script Python, nécessite un Python sur le poste
(ou VERITRACE_ALEAPP_PYTHON).
"""
import os
import sys

from PyInstaller.utils.hooks import collect_data_files, collect_submodules

HERE = SPECPATH  # noqa: F821 (défini par PyInstaller)

datas = (collect_data_files("veritrace")          # schéma JSON, exemple, polices DejaVu
         + collect_data_files("reportlab")        # polices de repli, ressources ReportLab
         + collect_data_files("jsonschema")
         + collect_data_files("jsonschema_specifications")
         + (collect_data_files("tzdata") if sys.platform == "win32" else []))   # fuseaux IANA (Windows)
hidden = (collect_submodules("veritrace") + collect_submodules("reportlab.graphics.barcode")
          + (collect_submodules("tzdata") if sys.platform == "win32" else [])
          + ["PIL.Image", "PIL.TiffImagePlugin", "PIL.JpegImagePlugin"])

a = Analysis([os.path.join(HERE, "entry.py")], pathex=[os.path.dirname(HERE)], datas=datas, hiddenimports=hidden,
             excludes=["tkinter", "pytest", "IPython", "numpy"], noarchive=False)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, a.binaries, a.datas, [], name="veritrace", console=True, upx=False,
          version=os.path.join(HERE, "version_info.txt") if sys.platform == "win32" else None)
