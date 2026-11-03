#!/usr/bin/env python3
"""Measure a macOS app and its responsible XPC/WebKit processes without UI automation."""
import argparse
import ctypes
import datetime
import hashlib
import json
import os
import platform
from pathlib import Path
import subprocess
import tempfile
import time

parser = argparse.ArgumentParser()
parser.add_argument("pid", type=int)
parser.add_argument("--seconds", type=int, default=10)
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--binary", type=Path)
args = parser.parse_args()
if platform.system() != "Darwin" or args.seconds < 1:
    parser.error("Use macOS and a positive sampling duration")
responsible = ctypes.CDLL("/usr/lib/libSystem.B.dylib").responsibility_get_pid_responsible_for_pid
responsible.argtypes = [ctypes.c_int]
responsible.restype = ctypes.c_int

def processes():
    rows = {}
    for line in subprocess.check_output(["ps", "-axo", "pid=,ppid=,time=,rss=,comm="], text=True).splitlines():
        pid, parent, cpu, rss, name = line.strip().split(None, 4)
        seconds = 0.0
        for part in cpu.split(":"):
            seconds = seconds * 60 + float(part)
        rows[int(pid)] = {"pid": int(pid), "parent": int(parent), "cpuSeconds": seconds, "rssBytes": int(rss) * 1024, "name": os.path.basename(name)}
    owned = {args.pid}
    while True:
        children = {pid for pid, row in rows.items() if row["parent"] in owned or responsible(pid) == args.pid}
        expanded = owned | children
        if expanded == owned:
            break
        owned = expanded
    if args.pid not in rows:
        raise RuntimeError("The app exited during measurement")
    return {pid: rows[pid] for pid in owned if pid in rows}

samples = []
previous = processes()
started = time.monotonic()
cpu_seconds = 0.0
for _ in range(args.seconds):
    time.sleep(1)
    current = processes()
    cpu_seconds += sum(max(0, row["cpuSeconds"] - previous[pid]["cpuSeconds"]) for pid, row in current.items() if pid in previous)
    samples.append({"elapsedSeconds": round(time.monotonic() - started, 3), "rssBytes": sum(row["rssBytes"] for row in current.values()), "processCount": len(current)})
    previous = current
elapsed = time.monotonic() - started
with tempfile.TemporaryDirectory(prefix="waypoint-footprint-") as temporary:
    output = Path(temporary) / "footprint.json"
    command = ["footprint", "--noCategories", "-f", "bytes", "-j", str(output)]
    for pid in previous:
        command.extend(["-p", str(pid)])
    subprocess.run(command, check=True, stdout=subprocess.DEVNULL)
    footprint = json.loads(output.read_text())
report = {
    "measuredAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "macOS": platform.mac_ver()[0],
    "hardware": subprocess.check_output(["sysctl", "-n", "machdep.cpu.brand_string"], text=True).strip(),
    "durationSeconds": round(elapsed, 3),
    "cpuSeconds": round(cpu_seconds, 4),
    "averageCpuPercentOfOneCore": round(cpu_seconds / elapsed * 100, 3),
    "rssBytesRange": [min(sample["rssBytes"] for sample in samples), max(sample["rssBytes"] for sample in samples)],
    "physicalFootprintBytes": footprint["total footprint"],
    "processes": footprint["processes"],
    "samples": samples,
}
if args.binary:
    report["binarySha256"] = hashlib.sha256(args.binary.read_bytes()).hexdigest()
args.output.write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({key: value for key, value in report.items() if key not in {"processes", "samples"}}, indent=2))
