"""Muse Save Text — portable, dependency-free ComfyUI text output."""
from .nodes import MuseSaveText

NODE_CLASS_MAPPINGS = {"MuseSaveText": MuseSaveText}
NODE_DISPLAY_NAME_MAPPINGS = {"MuseSaveText": "Muse Save Text"}
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
