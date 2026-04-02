---
name: deploy
description: Deploy apps to Heyo cloud sandboxes — archive code, deploy to production, bind ports, set up custom domains, and manage deployed sandboxes. Use when the user wants to deploy, update, or manage a running app.
argument-hint: "[action] [args...]"
allowed-tools: Bash, Read, Grep
---

# Deploy — App Deployment with Heyo Sandboxes

You are helping the user deploy applications to Heyo's cloud sandbox infrastructure. The deployment workflow archives local code, deploys it to a cloud-hosted sandbox, and exposes it via public URLs.

## Authentication

All cloud API calls require a JWT Bearer token. The token is stored at `~/.heyo/token.json` after the user logs in via the TUI (`heyvm`). Extract it with:

```bash
TOKEN=$(python3 -c "import json; print(json.load(open('$HOME/.heyo/token.json'))['access_token'])")
```

If the token file does not exist, tell the user to run `heyvm` (the TUI) and log in first.

## Deployment Workflow

### Step 1: Archive the code

Package the app for deployment using the `heyvm` CLI:

**Archive a local directory (most common):**
```bash
heyvm archive-dir ./my-project --name <archive-name>
```

**Archive from an existing sandbox mount:**
```bash
heyvm archive <sandbox-id> --name <archive-name>
```

Both commands output the archive ID (e.g. `ar-ddcd890d`). Save this for Step 2.

Options for `archive-dir`:
- `--mount-path <PATH>` — Mount path prefix in the archive (default: `/workspace`)
- `--token <TOKEN>` — JWT token (or set `HEYO_ARCHIVE_TOKEN` env var)
- `--no-ignore` — Include build assets (`node_modules`, `target`, `dist`, etc.)

### Step 2: Deploy to cloud

There is no `heyvm deploy` CLI command. Use `curl` to call the cloud API directly:

```bash
TOKEN=$(python3 -c "import json; print(json.load(open('$HOME/.heyo/token.json'))['access_token'])")
curl -s -X POST https://server.heyo.computer/sandbox-deploy \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "<app-name>",
    "archive_id": "<archive-id>",
    "region": "US",
    "driver": "libvirt",
    "image": "ubuntu:24.04",
    "start_command": "<startup command>",
    "open_ports": [<port>],
    "working_directory": "/workspace"
  }'
```

**Response** (on success):
```json
{"archive_id":"ar-...","backend_server_id":"bkend_...","id":"sb-...","name":"my-app","status":"running"}
```

Save the `id` for Step 3.

**Deploy request fields:**

| Field | Description | Default |
|-------|-------------|---------|
| `name` | Sandbox name (required) | — |
| `archive_id` | Archive ID from Step 1 (required) | — |
| `region` | `US` or `EU` (**must be uppercase**) | — |
| `driver` | `libvirt` or `firecracker` | — |
| `image` | `ubuntu:24.04` or `alpine:3.23` | — |
| `start_command` | Shell command to run on startup | — |
| `open_ports` | Array of port numbers to expose | `[]` |
| `ttl_seconds` | Time-to-live in seconds | Plan default |
| `disk_size_gb` | Disk size (max 250 GB) | — |
| `working_directory` | Working directory inside sandbox | `/workspace` |
| `env_vars` | Environment variables map | `{}` |
| `setup_hooks` | Shell commands to run after creation | `[]` |
| `size_class` | `micro`, `mini`, `small`, `medium`, or `large` | `small` |

### Step 3: Bind a port (expose publicly)

**`heyvm bind` only works for local sandboxes.** For deployed sandboxes, use the cloud API:

```bash
TOKEN=$(python3 -c "import json; print(json.load(open('$HOME/.heyo/token.json'))['access_token'])")
curl -s -X POST https://server.heyo.computer/proxy-endpoints/for-deployed \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sandbox_id": "<sandbox-id>",
    "port": <port>
  }'
```

**Response:**
```json
{"subdomain":"wxw1nq","port":8080,"sandbox_id":"sb-...","backend_server_id":"bkend_..."}
```

The app is now accessible at `https://<subdomain>.heyo.computer/`.

### Step 4: Custom domain (optional)

Custom domains can be configured via the cloud API (`/custom-domains` endpoint). The domain must have a CNAME record pointing to `heyo.computer`. SSL certificates are provisioned automatically.

## Managing Deployed Sandboxes

These `heyvm` CLI commands work for both local and deployed sandboxes (the CLI resolves deployed sandboxes via the cloud API):

### List sandboxes
```bash
heyvm list                    # Shows both local and deployed sandboxes
heyvm list-inactive           # Shows stopped sandboxes
```

### Execute commands
```bash
heyvm exec <id-or-name> -- <command>
heyvm sh <id-or-name>        # Interactive shell
```

### Mount workspace locally
```bash
heyvm mount <id-or-name>                        # Mount and wait (Ctrl+C to unmount)
heyvm mount <id-or-name> -- code .              # Mount and open in editor
heyvm mount <id-or-name> --mount-path /app      # Mount a specific path
```

### Update a deployment
```bash
heyvm archive-dir ./my-project --name v2
heyvm update <id-or-name> --archive <new-archive-id>
```

### Resize
```bash
heyvm resize <id-or-name> --size-class <CLASS>
```

Available size classes: `micro` (0.25 CPU, 0.5 GB), `mini` (0.5 CPU, 1 GB), `small` (1 CPU, 2 GB), `medium` (2 CPU, 4 GB), `large` (4 CPU, 8 GB).

### SSH access
```bash
heyvm share <id-or-name> --name my-app
heyvm ssh my-app              # From another machine
```

### Manage archives
```bash
heyvm list-archives           # List all archives
heyvm delete-archive <id>     # Delete an archive
```

## Typical Deployment Examples

### Deploy a static site
```bash
# Archive the build output
heyvm archive-dir ./public --name my-site-v1

# Deploy with a simple HTTP server
TOKEN=$(python3 -c "import json; print(json.load(open('$HOME/.heyo/token.json'))['access_token'])")
RESULT=$(curl -s -X POST https://server.heyo.computer/sandbox-deploy \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-site",
    "archive_id": "ar-XXXXX",
    "region": "US",
    "driver": "libvirt",
    "image": "ubuntu:24.04",
    "start_command": "cd /workspace && python3 -m http.server 8080",
    "open_ports": [8080],
    "working_directory": "/workspace"
  }')
echo "$RESULT"

# Bind port to get a public URL
SANDBOX_ID=$(echo "$RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
curl -s -X POST https://server.heyo.computer/proxy-endpoints/for-deployed \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"sandbox_id\": \"$SANDBOX_ID\", \"port\": 8080}"
```

### Deploy a Node.js app
```bash
heyvm archive-dir ./my-node-app --name my-app-v1

# Deploy (use curl as shown above with start_command: "cd /workspace && npm start")
# Bind port (use curl as shown above)

# Update with new code later
heyvm archive-dir ./my-node-app --name my-app-v2
heyvm update my-app --archive <v2-archive-id>
```

### Deploy from a local sandbox
```bash
# Develop in a local sandbox
heyvm create --name staging --type node --mount ./app:/workspace
heyvm exec staging -- npm install
heyvm exec staging -- npm run build

# Archive the sandbox mounts and deploy
heyvm archive staging --name production-v1
# Then deploy via curl (as shown above)
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `HEYO_ARCHIVE_TOKEN` | JWT token for archive authentication |
| `HEYO_CLOUD_URL` | Cloud server URL (default: `https://server.heyo.computer`) |
| `API_HOSTNAME` | Required for `heyvm bind` on **local** sandboxes only |

## Workflow Guidance

When the user asks to deploy:

1. **Archive**: Use `heyvm archive-dir` for local directories or `heyvm archive` for existing sandbox mounts.
2. **Deploy**: Use `curl` to call `POST /sandbox-deploy` with the archive ID. Extract the token from `~/.heyo/token.json`.
3. **Expose**: Use `curl` to call `POST /proxy-endpoints/for-deployed` to bind a port and get a public subdomain.
4. **Verify**: Test the deployed URL (`https://<subdomain>.heyo.computer/`).
5. **Scale**: Use `heyvm resize` to adjust compute resources if needed.

When the user provides `$ARGUMENTS`, interpret them as deployment-related actions. For example, `/deploy ./my-app` should archive and deploy the directory.

If `$ARGUMENTS` is empty, ask the user what they want to deploy or manage.
