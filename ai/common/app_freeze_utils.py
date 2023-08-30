import os
import sys
from pathlib import Path


def get_application_root() -> Path:
    if getattr(sys, 'frozen', False):
        # If the application is run as a bundle, the PyInstaller bootloader
        # extends the sys module by a flag frozen=True and sets the app 
        # path into variable _MEIPASS'.
        return Path(sys._MEIPASS)
    else:
        return Path(os.environ['METAVOICELIVE_ROOT'])
