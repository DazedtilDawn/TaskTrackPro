#!/bin/bash

# Set Node options for ESM support
export NODE_OPTIONS=--experimental-vm-modules

# Run Jest with our config
npx jest --config jest.config.ts --verbose "$@" 