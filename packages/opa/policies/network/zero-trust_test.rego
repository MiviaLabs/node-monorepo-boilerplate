package network

import future.keywords.contains
import future.keywords.if

test_allow_api_to_postgres if {
	data.network.allow with input as {
		"source": "api",
		"destination": "postgres",
		"port": 5432,
		"protocol": "tcp",
	}
}

test_allow_api_to_redis if {
	data.network.allow with input as {
		"source": "api",
		"destination": "redis",
		"port": 6379,
		"protocol": "tcp",
	}
}

test_allow_api_to_rabbitmq if {
	data.network.allow with input as {
		"source": "api",
		"destination": "rabbitmq",
		"port": 5672,
		"protocol": "tcp",
	}
}

test_allow_web_to_api if {
	data.network.allow with input as {
		"source": "web",
		"destination": "api",
		"port": 3000,
		"protocol": "http",
	}
}

test_deny_web_to_postgres_direct if {
	not data.network.allow with input as {
		"source": "web",
		"destination": "postgres",
		"port": 5432,
		"protocol": "tcp",
	}
}

test_deny_unauthorized_service if {
	not data.network.allow with input as {
		"source": "unknown",
		"destination": "postgres",
		"port": 5432,
		"protocol": "tcp",
	}
}

test_deny_wrong_port if {
	not data.network.allow with input as {
		"source": "api",
		"destination": "postgres",
		"port": 8080,
		"protocol": "tcp",
	}
}

test_deny_wrong_protocol if {
	not data.network.allow with input as {
		"source": "api",
		"destination": "postgres",
		"port": 5432,
		"protocol": "udp",
	}
}
