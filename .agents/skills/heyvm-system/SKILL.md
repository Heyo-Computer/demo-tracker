---
name: heyvm-system
description: Check if the host system meets all requirements to run Firecracker micro-VMs. Verifies KVM, Firecracker binary, kernel images, networking permissions, and runs a full end-to-end test. Use when the user wants to diagnose Firecracker setup issues or verify their host is ready.
argument-hint: "[--skip-test]"
allowed-tools: Bash, Read, Grep
---

# heyvm-system — Firecracker Host Readiness Check

Run a series of checks to verify the host can run Firecracker micro-VMs, then optionally run a full end-to-end test.

## Steps

Run each check in order. Print a clear PASS/FAIL for each. Stop on the first hard failure and explain what to fix.

### 1. KVM support

```bash
# Check /dev/kvm exists and is accessible
test -r /dev/kvm && test -w /dev/kvm && echo "PASS: /dev/kvm accessible" || echo "FAIL: /dev/kvm not accessible (add user to kvm group: sudo usermod -aG kvm $USER)"
```

### 2. Firecracker binary

```bash
firecracker --version 2>/dev/null && echo "PASS" || echo "FAIL: firecracker not found on PATH"
```

### 3. Kernel image

Check if a kernel exists at the default location or in `~/.heyo/images/firecracker/vmlinux.bin`. If missing, suggest:
```bash
heyvm mvm download-kernel
```

### 4. Firecracker guest images

```bash
heyvm mvm images
```

If no images are listed, inform the user they need to build one:
```bash
heyvm mvm build --local-only -f third-party/Dockerfile.firecracker-nginx -n nginx-fc
```

**IMPORTANT:** If an `nginx-fc` image already exists, the user must rebuild it after any changes to `Dockerfile.firecracker-nginx`:
```bash
heyvm mvm build --local-only -f third-party/Dockerfile.firecracker-nginx -n nginx-fc
```

### 5. Sudo / networking permissions

```bash
sudo -n ip link show >/dev/null 2>&1 && echo "PASS: passwordless sudo for ip" || echo "WARN: sudo requires password — run 'sudo -v' before tests or configure passwordless sudo (see docs/content/docs/host-requirements.md)"
```

### 6. e2fsprogs (mke2fs / debugfs)

```bash
which mke2fs >/dev/null 2>&1 && echo "PASS" || echo "FAIL: mke2fs not found (install e2fsprogs)"
```

### 7. End-to-end test (unless --skip-test)

Run the built-in Firecracker integration test:
```bash
heyvm test-firecracker
```

If this is the first run after changes to `Dockerfile.firecracker-nginx`, remind the user to rebuild the image first.

## Interpreting results

- **All checks pass + test succeeds**: Host is fully ready for Firecracker sandboxes.
- **Checks pass but test fails**: Likely a guest image issue. Rebuild with `heyvm mvm build`.
- **KVM or Firecracker fails**: Hardware/software prerequisites missing — refer user to `docs/content/docs/host-requirements.md`.
- **Sudo fails**: Networking commands need privileges — either cache credentials with `sudo -v` or set up passwordless sudo for `ip`, `iptables`, `sysctl`.
