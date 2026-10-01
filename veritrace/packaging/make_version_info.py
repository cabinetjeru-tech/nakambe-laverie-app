"""Génère version_info.txt (propriétés du fichier .exe Windows : auteur, version, description)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from veritrace import __author__, __product__, __version__  # noqa: E402

nums = tuple(int(x) for x in (__version__.split(".") + ["0"] * 4)[:4])
TEMPLATE = f"""VSVersionInfo(
  ffi=FixedFileInfo(filevers={nums}, prodvers={nums}, mask=0x3f, flags=0x0, OS=0x40004, fileType=0x1,
                    subtype=0x0, date=(0, 0)),
  kids=[StringFileInfo([StringTable('040C04B0', [
      StringStruct('CompanyName', '{__author__}'),
      StringStruct('FileDescription', '{__product__} — forensique Android pour examens autorisés'),
      StringStruct('FileVersion', '{__version__}'),
      StringStruct('InternalName', 'veritrace'),
      StringStruct('LegalCopyright', '© {__author__}'),
      StringStruct('OriginalFilename', 'veritrace.exe'),
      StringStruct('ProductName', '{__product__}'),
      StringStruct('ProductVersion', '{__version__}')])]),
        VarFileInfo([VarStruct('Translation', [0x040C, 1200])])])
"""
(Path(__file__).parent / "version_info.txt").write_text(TEMPLATE, encoding="utf-8")
print("version_info.txt", __version__)
