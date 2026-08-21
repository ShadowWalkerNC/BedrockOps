FROM golang:1.22-alpine AS builder

WORKDIR /app

# Copy Go mod files and source
COPY apps/agent/go.mod apps/agent/go.sum ./
RUN go mod download

COPY apps/agent ./
RUN CGO_ENABLED=0 GOOS=linux go build -o /bedrock-agent ./cmd/bedrock-agent/main.go

FROM alpine:3.19
WORKDIR /app
RUN apk add --no-cache ca-certificates curl

COPY --from=builder /bedrock-agent /usr/local/bin/bedrock-agent

EXPOSE 19132/udp 19133/tcp

ENTRYPOINT ["bedrock-agent"]
CMD ["-control-plane", "http://api:4000", "-node-id", "node_docker_agent_1", "-token", "dev_agent_token_change_me", "-server-path", "/var/bedrockops-world"]
