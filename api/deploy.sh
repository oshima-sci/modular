#!/usr/bin/env bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SERVER_ALIAS="oshima"
LOCAL_API_PATH="$(cd "$(dirname "$0")" && pwd)"
REMOTE_API_PATH="/srv/oshi/oshimaweb/api"
VERSION_FILE="app/__init__.py"
CHANGELOG_FILE=".deploy_changelog.md"

# Print colored output
print_info() { echo -e "${BLUE}ℹ ${NC}$1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }

# Extract version from __init__.py
get_local_version() {
    grep '__version__ = ' "$LOCAL_API_PATH/$VERSION_FILE" | sed 's/__version__ = "\(.*\)"/\1/'
}

# Get remote version from health endpoint (try both old and new paths)
get_remote_version() {
    local version
    # Try new path first, then old path
    version=$(ssh "$SERVER_ALIAS" 'curl -s http://127.0.0.1:8000/api/health 2>/dev/null || curl -s http://127.0.0.1:8000/health 2>/dev/null' | grep -o '"version":"[^"]*"' | sed 's/"version":"\(.*\)"/\1/')
    echo "$version"
}

# Increment patch version (0.1.10 -> 0.1.11)
increment_version() {
    local version=$1
    echo "$version" | awk -F. -v OFS=. '{$NF++;print}'
}

# Update version in __init__.py
update_version() {
    local new_version=$1
    local release_notes=$2

    # Update version
    sed -i.bak "s/__version__ = \".*\"/__version__ = \"$new_version\"/" "$LOCAL_API_PATH/$VERSION_FILE"

    # Update release notes using awk (more reliable for multiline)
    awk -v notes="$release_notes" '
        /^__release_notes__ = """/ {
            print "__release_notes__ = \"\"\""
            print ""
            print notes
            print ""
            print "\"\"\""
            # Skip until we find the closing """
            while (getline > 0 && !/^"""/) { }
            next
        }
        { print }
    ' "$LOCAL_API_PATH/$VERSION_FILE" > "$LOCAL_API_PATH/${VERSION_FILE}.tmp"

    mv "$LOCAL_API_PATH/${VERSION_FILE}.tmp" "$LOCAL_API_PATH/$VERSION_FILE"
    rm -f "$LOCAL_API_PATH/${VERSION_FILE}.bak"
    print_success "Updated version to $new_version in $VERSION_FILE"
}

# Log deployment to changelog
log_deployment() {
    local version=$1
    local description=$2
    local timestamp=$(date -u +"%Y-%m-%d %H:%M:%S UTC")

    # Create changelog if it doesn't exist
    if [ ! -f "$LOCAL_API_PATH/$CHANGELOG_FILE" ]; then
        echo "# Deployment Changelog" > "$LOCAL_API_PATH/$CHANGELOG_FILE"
        echo "" >> "$LOCAL_API_PATH/$CHANGELOG_FILE"
    fi

    # Prepend new entry
    {
        echo ""
        echo "## Version $version - $timestamp"
        echo ""
        echo "$description"
        echo ""
        echo "---"
        cat "$LOCAL_API_PATH/$CHANGELOG_FILE"
    } > "$LOCAL_API_PATH/${CHANGELOG_FILE}.tmp"

    mv "$LOCAL_API_PATH/${CHANGELOG_FILE}.tmp" "$LOCAL_API_PATH/$CHANGELOG_FILE"
    print_success "Added deployment log to $CHANGELOG_FILE"
}

# Main deployment flow
main() {
    print_info "Starting deployment process..."
    echo ""

    # Load SSH key into agent if not already loaded
    if ! ssh-add -l 2>/dev/null | grep -q id_ed25519; then
        print_info "Loading SSH key into agent..."
        ssh-add ~/.ssh/id_ed25519
        echo ""
    fi

    # Check if we're in the right directory
    if [ ! -f "$LOCAL_API_PATH/$VERSION_FILE" ]; then
        print_error "Cannot find $VERSION_FILE in $LOCAL_API_PATH"
        exit 1
    fi

    # Get current versions
    print_info "Checking versions..."
    local_version=$(get_local_version)
    print_info "Local version: $local_version"

    remote_version=$(get_remote_version)
    if [ -z "$remote_version" ]; then
        print_warning "Could not fetch remote version (server may be down or first deploy)"
        remote_version="unknown"
    else
        print_info "Remote version: $remote_version"
    fi

    echo ""

    # Check if version needs to be bumped
    if [ "$local_version" == "$remote_version" ]; then
        print_warning "Local and remote versions are the same ($local_version)"
        new_version=$(increment_version "$local_version")
        print_info "Will bump version to: $new_version"
        echo ""

        # Ask for change description
        print_info "What has changed since the last deploy?"
        echo -n "Description: "
        read -r description

        if [ -z "$description" ]; then
            print_error "Description cannot be empty"
            exit 1
        fi

        # Update version and release notes
        update_version "$new_version" "$description"
        log_deployment "$new_version" "$description"

        local_version=$new_version
        echo ""
    else
        print_success "Version already updated: $local_version"
        echo ""

        # Check if there's a recent changelog entry
        print_info "Checking for changelog entry..."
        if [ -f "$LOCAL_API_PATH/$CHANGELOG_FILE" ] && grep -q "Version $local_version" "$LOCAL_API_PATH/$CHANGELOG_FILE"; then
            print_success "Changelog entry exists for version $local_version"
        else
            print_warning "No changelog entry found for version $local_version"
            echo -n "Add deployment description? (y/n): "
            read -r add_log
            if [[ "$add_log" =~ ^[Yy]$ ]]; then
                echo -n "Description: "
                read -r description
                if [ -n "$description" ]; then
                    log_deployment "$local_version" "$description"
                fi
            fi
        fi
        echo ""
    fi

    # Verify the current deployment
    print_info "Step 1: Checking current server status..."
    if ssh "$SERVER_ALIAS" 'curl -s http://127.0.0.1:8000/health' > /dev/null 2>&1; then
        print_success "Server is responding"
    else
        print_warning "Server not responding (may be down or first deploy)"
    fi
    echo ""

    # Create backup
    print_info "Step 2: Creating backup..."
    backup_name="modular-$(date +%F-%H%M%S).tgz"
    ssh "$SERVER_ALIAS" "mkdir -p /srv/backups && nohup tar -C /srv -czf /srv/backups/$backup_name oshi/oshimaweb >/dev/null 2>&1 &"
    sleep 2
    print_success "Backup started: $backup_name (running in background)"
    echo ""

    # Dry-run rsync
    print_info "Step 3: Performing dry-run sync..."
    rsync -avzn --delete \
        --exclude '.venv/' --exclude '__pycache__/' --exclude '.git/' \
        --exclude '.mypy_cache/' --exclude '.pytest_cache/' --exclude '.env' \
        "$LOCAL_API_PATH/" "$SERVER_ALIAS:$REMOTE_API_PATH/" | tail -n 15

    echo ""
    echo -n "Proceed with deployment? (y/n): "
    read -r confirm

    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        print_warning "Deployment cancelled"
        exit 0
    fi
    echo ""

    # Real rsync
    print_info "Step 4: Syncing files to server..."
    rsync -avz --delete \
        --exclude '.venv/' --exclude '__pycache__/' --exclude '.git/' \
        --exclude '.mypy_cache/' --exclude '.pytest_cache/' --exclude '.env' \
        "$LOCAL_API_PATH/" "$SERVER_ALIAS:$REMOTE_API_PATH/"
    print_success "Files synced successfully"

    # Sync environment variables
    if [ -f "$LOCAL_API_PATH/.env.production" ]; then
        print_info "Syncing .env.production → .env on server..."
        scp "$LOCAL_API_PATH/.env.production" "$SERVER_ALIAS:$REMOTE_API_PATH/.env"
        print_success "Environment variables updated"
    else
        print_warning "No .env.production found, skipping env sync"
    fi
    echo ""

    # Update systemd service if needed
    print_info "Step 5: Updating systemd service..."
    ssh "$SERVER_ALIAS" "cat > /etc/systemd/system/oshi-api.service << 'EOF'
[Unit]
Description=Modular API + Workers
After=network.target

[Service]
WorkingDirectory=/srv/oshi/oshimaweb/api
EnvironmentFile=/srv/oshi/oshimaweb/api/.env
ExecStart=/bin/bash /srv/oshi/oshimaweb/api/start.sh --workers 4
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload"
    print_success "Systemd service updated"

    # Install deps and restart
    print_info "Step 6: Installing dependencies and restarting service..."
    ssh "$SERVER_ALIAS" "cd $REMOTE_API_PATH && /root/.local/bin/uv sync && systemctl restart oshi-api"
    echo ""

    # Wait for service to start
    print_info "Step 7: Waiting for service to start..."
    sleep 3

    # Verify deployment
    print_info "Step 8: Verifying deployment..."
    deployed_version=$(get_remote_version)
    if [ "$deployed_version" == "$local_version" ]; then
        print_success "Deployment successful! Version $deployed_version is live"

        # Check health
        if ssh "$SERVER_ALIAS" 'curl -s http://127.0.0.1:8000/api/health' 2>/dev/null | grep -q 'healthy'; then
            print_success "Health check passed"
        else
            print_error "Health check failed!"
            print_warning "To rollback, run: ssh $SERVER_ALIAS 'tar -C /srv -xzf /srv/backups/$backup_name && systemctl restart oshi-api'"
            exit 1
        fi
    else
        print_warning "Could not verify version (got: $deployed_version, expected: $local_version)"
        # Still check health
        if ssh "$SERVER_ALIAS" 'curl -s http://127.0.0.1:8000/api/health' 2>/dev/null | grep -q 'healthy'; then
            print_success "Health check passed anyway"
        else
            print_error "Health check failed!"
            print_warning "To rollback, run: ssh $SERVER_ALIAS 'tar -C /srv -xzf /srv/backups/$backup_name && systemctl restart oshi-api'"
            exit 1
        fi
    fi

    echo ""
    print_success "Deployment complete!"
    print_info "Deployed version: $local_version"
    print_info "Backup available at: /srv/backups/$backup_name"
    echo ""
    print_info "To view logs: ssh $SERVER_ALIAS 'journalctl -u oshi-api -f'"
}

# Run main function
main
