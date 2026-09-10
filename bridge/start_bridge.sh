#!/bin/bash
cd /workspace/projekty-most/most-autonomii
unset TELEGRAM_BOT_TOKEN
: > bridge/bridge.log
nohup /usr/bin/python3 bridge/bridge.py >> bridge/bridge.log 2>&1 &
echo $! > bridge/bridge.pid
echo "PID=$(cat bridge/bridge.pid)"
