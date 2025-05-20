#!/bin/bash
# Use the specific Rust version known to work with Anchor 0.30.1
rustup run 1.68.0 anchor build "$@" 