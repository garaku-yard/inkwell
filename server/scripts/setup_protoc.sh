#!/bin/bash

# Download and setup protoc
echo "Setting up protoc..."
cd /tmp
wget -q https://github.com/protocolbuffers/protobuf/releases/download/v25.1/protoc-25.1-linux-x86_64.zip -O protoc.zip
unzip -q protoc.zip -d protoc
sudo cp protoc/bin/protoc /usr/local/bin/
sudo cp -r protoc/include/* /usr/local/include/
rm -rf protoc protoc.zip

# Install Go protobuf plugins
echo "Installing protobuf plugins..."
go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest

echo "Protoc setup complete"