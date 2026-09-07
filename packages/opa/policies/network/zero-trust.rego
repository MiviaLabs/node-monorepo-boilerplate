package network

import future.keywords.contains
import future.keywords.if

# Default deny all network access
default allow = false

# Allow only explicitly permitted traffic
allow if {
  some rule
  network_rules[rule]
  rule_matches(rule, input)
}

# Rule matching
rule_matches(rule, request) if {
  rule.source == request.source
  rule.destination == request.destination
  rule.port == request.port
  allowed_by_protocol(rule, request.protocol)
}

# Protocol validation
allowed_by_protocol(rule, protocol) if {
  not rule.protocols
}

allowed_by_protocol(rule, protocol) if {
  rule.protocols[protocol]
}

# Network rules - service to service communication
network_rules := {
  # API can talk to PostgreSQL
  {
    "source": "api",
    "destination": "postgres",
    "port": 5432,
    "protocols": {"tcp"}
  },
  # API can talk to Redis
  {
    "source": "api",
    "destination": "redis",
    "port": 6379,
    "protocols": {"tcp"}
  },
  # API can talk to RabbitMQ
  {
    "source": "api",
    "destination": "rabbitmq",
    "port": 5672,
    "protocols": {"tcp"}
  },
  # Web can talk to API
  {
    "source": "web",
    "destination": "api",
    "port": 3000,
    "protocols": {"http", "https"}
  },
}
