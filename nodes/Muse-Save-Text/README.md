# Muse Save Text — 1.1.0

Save text to **any writable folder you choose**. No WAS dependency, whitelist,
model downloads or pip installation.

## Install

Extract the ZIP into ComfyUI's `custom_nodes` folder. The result should be
`custom_nodes/Muse-Save-Text/__init__.py` without an extra nested folder.
Replace the same folder if upgrading from version 1.0; do not install both.
Restart ComfyUI and refresh the browser.

Add **Muse Save Text** under **Muse → Files**, connect your text cable, then
remove the old **Save Text File** node so it no longer tries to save.

## Choose where to save

Enter the destination folder in **path**:

- `D:/My Prompts` — another Windows drive/folder.
- `E:/!AiSTUDIO/#OUTPUT/Output-Studio` — custom output location.
- `\\server\share\Prompts` — an accessible Windows network share.
- `/workspace/my-prompts` — Linux/RunPod folder or mounted volume.
- `/Users/yourname/Documents/Prompts` — macOS folder.
- Blank — ComfyUI's configured output folder.
- `Muse Collective/MiniMax H3 Prompt/{date}` — relative to ComfyUI output,
  grouped by date; this is the default.

Missing folders are created automatically. `{date}` and `[time(%Y-%m-%d)]`
use the server's date. Relative paths resolve from ComfyUI's output directory.
Absolute paths go to the chosen destination; there is no output-folder restriction.
Environment variables and `~` are supported.

Paths refer to the **machine running ComfyUI**. RunPod cannot write to your PC's
C: drive unless that storage is mounted on the server. Use a persistent volume
to keep files after deleting the pod.

Files use UTF-8 and unique numbers, e.g. `MiniMaxPrompt_0001.txt`. Existing files
are never overwritten. **text** passes the original text through; **saved_path**
returns the full saved path. Normal ComfyUI caching applies.

Temporary creation locks are retried. Genuine disk-full, unavailable-drive or
OS permission errors still need resolving; the node does not bypass them.

## Changes and testing

1.1.0 removes version 1.0's output-folder restriction and replaces **subfolder**
with **path**. Use this ZIP instead of version 1.0.

Automated Windows tests cover arbitrary destinations outside output, quoted
paths, custom output folders, Unicode, numbering, concurrency, locks and failed
write cleanup. Live network shares and Linux/macOS/RunPod installations have
not been exercised here.
