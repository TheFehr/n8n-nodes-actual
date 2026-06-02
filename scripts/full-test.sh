#!/bin/bash
set -eo pipefail

# Load fnm so that `node` and `npm` are on PATH (non-interactive bash skips .bashrc)
if command -v fnm &>/dev/null; then
    eval "$(fnm env --shell bash)"
fi

ACTUAL_TEST_URL="http://localhost:5006"
ACTUAL_TEST_PASS="test-password"
PACKAGE_NAME="n8n-nodes-actual"

# EXIT trap for teardown
on_exit() {
    EXIT_CODE=$?
    set +e
    if [ $EXIT_CODE -ne 0 ]; then
        echo "Integration test failed with exit code $EXIT_CODE"
        if [ -f workflow_output.txt ]; then
            echo "--- Workflow Execution Output ---"
            cat workflow_output.txt
            echo "--------------------------------"
        fi
        echo "--- Actual Budget Logs ---"
        docker compose -f docker-compose.test.yml logs actual || true
        echo "--------------------------"
        echo "--- n8n Logs ---"
        docker compose -f docker-compose.test.yml logs n8n || true
        echo "----------------"
    fi
    echo "Cleaning up..."
    docker compose -f docker-compose.test.yml down -v || true
    rm -f workflow_output.txt tests/workflows/integration_test.json
    exit $EXIT_CODE
}
trap on_exit EXIT

# Build nodes
echo "Building nodes..."
npm run build

# Build the custom n8n test image (compiles better-sqlite3 for Alpine)
echo "Building n8n test image (this compiles native modules for Alpine — takes ~2 min on first run)..."
docker compose -f docker-compose.test.yml build n8n

# Spin up services
docker compose -f docker-compose.test.yml up -d

# Readiness loop helper
wait_for_service() {
    local name=$1
    local url=$2
    local max_attempts=30
    local attempt=1
    echo "Waiting for $name to start..."
    until [ $attempt -gt $max_attempts ]; do
        status=$(curl -s --connect-timeout 2 --max-time 5 -o /dev/null -w "%{http_code}" "$url" || echo "000")
        if [[ "$status" =~ ^2 ]]; then
            echo "$name is ready!"
            return 0
        fi
        sleep 1
        attempt=$((attempt+1))
    done
    echo "Error: $name did not start in time at $url (last status: $status)"
    docker compose -f docker-compose.test.yml logs "$name"
    return 1
}

wait_for_service "actual" "$ACTUAL_TEST_URL/account/needs-bootstrap"
wait_for_service "n8n" "http://localhost:5678/healthz"

# Bootstrap Actual Budget server (no-op if already done)
echo "Bootstrapping Actual Budget server..."
BOOTSTRAP_STATUS=$(curl -sf "$ACTUAL_TEST_URL/account/needs-bootstrap" \
    | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['bootstrapped'])")
if [ "$BOOTSTRAP_STATUS" = "False" ]; then
    curl -sf -X POST "$ACTUAL_TEST_URL/account/bootstrap" \
        -H "Content-Type: application/json" \
        -d "{\"password\":\"$ACTUAL_TEST_PASS\"}" > /dev/null
    echo "✓ Server bootstrapped"
else
    echo "✓ Server already bootstrapped"
fi

# Create test budget and account via @actual-app/api
echo "Setting up test budget and account..."
# tail -1 strips the @actual-app/api breadcrumb logs that go to stdout; JSON is always last line
SETUP_OUTPUT=$(ACTUAL_TEST_URL="$ACTUAL_TEST_URL" ACTUAL_TEST_PASS="$ACTUAL_TEST_PASS" \
    node scripts/setup-actual-budget.mjs | tail -1)

BUDGET_ID=$(echo "$SETUP_OUTPUT" | python3 -c "import json,sys; print(json.load(sys.stdin)['budgetId'])")
ACCOUNT_ID=$(echo "$SETUP_OUTPUT" | python3 -c "import json,sys; print(json.load(sys.stdin)['accountId'])")
echo "✓ Budget ID: $BUDGET_ID"
echo "✓ Account ID: $ACCOUNT_ID"

# Generate workflow JSON with the real budget + account IDs
echo "Generating integration workflow..."
python3 - "$BUDGET_ID" "$ACCOUNT_ID" << 'PYEOF'
import json, sys

budget_id = sys.argv[1]
account_id = sys.argv[2]

workflow = {
    "id": "1",
    "name": "Actual Budget Integration Test",
    "nodes": [
        {
            "parameters": {},
            "id": "1",
            "name": "When clicking ‘Test workflow’",
            "type": "n8n-nodes-base.manualTrigger",
            "typeVersion": 1,
            "position": [100, 100]
        },
        {
            "parameters": {
                "budgetId": budget_id,
                "operation": "importTransactions",
                "accountId": account_id,
                "transactions": json.dumps([
                    {"date": "2024-06-01", "amount": -4200, "notes": "E2E test groceries"},
                    {"date": "2024-06-02", "amount": -1500, "notes": "E2E test coffee"}
                ])
            },
            "id": "2",
            "name": "ActualBudget Import",
            "type": "n8n-nodes-actual.actualBudget",
            "typeVersion": 1,
            "position": [300, 100],
            "credentials": {
                "actualBudgetApi": {
                    "id": "actual-cred-id"
                }
            }
        }
    ],
    "connections": {
        "When clicking ‘Test workflow’": {
            "main": [[{"node": "ActualBudget Import", "type": "main", "index": 0}]]
        }
    },
    "settings": {"executionOrder": "v1"},
    "active": False
}

with open("tests/workflows/integration_test.json", "w") as f:
    json.dump(workflow, f, indent=2)
print("✓ Workflow JSON written")
PYEOF

# Stop n8n to avoid port conflicts with docker compose run
docker compose -f docker-compose.test.yml stop n8n

# Import credentials + workflow and execute.
# The custom entrypoint copies dist/ from the mounted volume into the
# pre-built package dir (/n8n-nodes-actual) which has Alpine-compiled binaries.
echo "Running integration workflow..."
docker compose -f docker-compose.test.yml run --rm \
    --entrypoint /bin/sh n8n -c "
    cp -r /home/node/custom-nodes/dist /n8n-nodes-actual/dist && \
    mkdir -p /home/node/.n8n/nodes/node_modules && \
    rm -f /home/node/.n8n/nodes/node_modules/n8n-nodes-actual && \
    ln -sf /n8n-nodes-actual /home/node/.n8n/nodes/node_modules/n8n-nodes-actual && \
    n8n import:credentials --input=/home/node/custom-nodes/tests/workflows/integration_credentials.json && \
    n8n import:workflow --input=/home/node/custom-nodes/tests/workflows/integration_test.json && \
    n8n execute --id=1
" > workflow_output.txt 2>&1

# Verify workflow succeeded
echo "Verifying workflow execution..."
if grep -q '"status": *"success"' workflow_output.txt 2>/dev/null; then
    echo "✅ Workflow executed successfully"
else
    echo "❌ Workflow did not report success"
    echo "Execution output (last 20 lines):"
    tail -n 20 workflow_output.txt | sed 's/^/  /'
    exit 1
fi

# Verify transactions landed in Actual Budget
echo "Verifying transactions in Actual Budget..."
# tail -1 strips the @actual-app/api breadcrumb logs that go to stdout; JSON is always last line
VERIFY_RESULT=$(ACTUAL_TEST_URL="$ACTUAL_TEST_URL" ACTUAL_TEST_PASS="$ACTUAL_TEST_PASS" \
    ACTUAL_TEST_BUDGET_ID="$BUDGET_ID" ACTUAL_TEST_ACCOUNT_ID="$ACCOUNT_ID" \
    node scripts/verify-actual-transactions.mjs | tail -1)

TXN_COUNT=$(echo "$VERIFY_RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin)['count'])")
if [ "$TXN_COUNT" -ge 2 ]; then
    echo "✅ Found $TXN_COUNT E2E test transactions in Actual Budget"
else
    echo "❌ Expected at least 2 E2E test transactions, found $TXN_COUNT"
    echo "   Details: $VERIFY_RESULT"
    exit 1
fi

# Run unit and integration vitest tests
export RUN_ACTUAL_INTEGRATION="true"
export ACTUAL_TEST_URL
export ACTUAL_TEST_PASS
export ACTUAL_TEST_BUDGET_ID="$BUDGET_ID"
export ACTUAL_TEST_ACCOUNT_ID="$ACCOUNT_ID"

set +e
npm run test:run
TEST_EXIT=$?
set -e

if [ $TEST_EXIT -eq 0 ]; then
    echo "Tests passed!"
else
    echo "Tests failed."
    exit $TEST_EXIT
fi
