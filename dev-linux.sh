#!/usr/bin/env bash
# Workaround for WebKitGTK black screen on Linux (GBM buffer errors)
# See: https://github.com/nicegraph/nicegraph/issues/27
export WEBKIT_DISABLE_DMABUF_RENDERER=1
export WEBKIT_DISABLE_COMPOSITING_MODE=1
pnpm --filter @whiteboard/desktop dev