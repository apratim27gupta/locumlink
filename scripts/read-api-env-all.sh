#!/usr/bin/env bash
pid=$(ps -eo pid,args | grep 'dist/main' | grep -v grep | awk '{print $1}' | head -1)
tr '\0' '\n' < "/proc/$pid/environ" | sort
