# Remote Server Operations

Server: `oshima` (Hetzner CX43 - 8 vCPU, 16GB RAM)

## Deploy

From the `api/` directory:

```bash
./deploy.sh
```

This will:
1. Check/bump version and update changelog
2. Backup current server code
3. Sync files to server
4. Update environment variables
5. Install dependencies
6. Restart the API with 16 workers
7. Verify health check

## Monitor Logs

```bash
# Live log alias (API + workers)
ssh oshima 'journalctl -u oshi-api -f'

# Last 100 lines
ssh oshima 'journalctl -u oshi-api -n 100 --no-pager'
```

## Service Control

```bash
# Check status
ssh oshima 'systemctl status oshi-api'

# Restart
ssh oshima 'systemctl restart oshi-api'

# Stop
ssh oshima 'systemctl stop oshi-api'

# Start
ssh oshima 'systemctl start oshi-api'
```

## GROBID (PDF Parser)

```bash
# Check if alive
ssh oshima 'curl http://localhost:8070/api/isalive'

# Health/metrics
ssh oshima 'curl http://localhost:8070/api/health'
ssh oshima 'curl http://localhost:8071/metrics'

# View logs
ssh oshima 'docker logs grobid --tail 100 -f'

# Restart GROBID
ssh oshima 'systemctl restart grobid'

# Check temp files (active processing)
ssh oshima 'docker exec grobid ls -la /opt/grobid/grobid-home/tmp/'
```

## Server Resources

```bash
# Check CPU, memory, disk
ssh oshima 'echo "=== CPU ===" && nproc && echo "" && echo "=== Memory ===" && free -h && echo "" && echo "=== Load ===" && uptime && echo "" && echo "=== Disk ===" && df -h /'
```

## Health Check

```bash
# API health
ssh oshima 'curl -s http://localhost:8000/api/health'

# Returns: {"status":"healthy","version":"X.X.X"}
```

## Endpoints

- API: `http://localhost:8000` (internal) / exposed via nginx
- GROBID: `http://localhost:8070` (internal only)
- GROBID Admin: `http://localhost:8071` (internal only)
