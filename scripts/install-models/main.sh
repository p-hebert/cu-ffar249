#!/usr/bin/env bash

INSTALL_DIR=../../src/nlp/models

poetry install;
poetry run python -m optimum.exporters.onnx \
--model RobroKools/vad-bert \
--task text-classification \
"$INSTALL_DIR/vad-bert-onnx";

mkdir -p "$INSTALL_DIR/vad-bert-onnx/onnx";
mv "$INSTALL_DIR/vad-bert-onnx/model.onnx" "$INSTALL_DIR/vad-bert-onnx/onnx/model.onnx";