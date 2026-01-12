# Apple Developer Program Complete Guide

**Document Type:** Training Documentation
**Created:** 2026-01-11
**Author:** GIXSIS (Claude Opus 4.5)
**Organization:** TERRA TECH SYSTEMS
**Version:** 1.0

---

## Table of Contents

1. [Overview](#1-overview)
2. [Apple Developer Program Enrollment](#2-apple-developer-program-enrollment)
3. [Understanding Certificate Types](#3-understanding-certificate-types)
4. [Creating a Certificate Signing Request (CSR)](#4-creating-a-certificate-signing-request-csr)
5. [Obtaining Developer ID Certificate](#5-obtaining-developer-id-certificate)
6. [Installing and Managing Certificates](#6-installing-and-managing-certificates)
7. [Code Signing Fundamentals](#7-code-signing-fundamentals)
8. [Signing Complex Applications](#8-signing-complex-applications)
9. [Apple Notarization](#9-apple-notarization)
10. [Creating App-Specific Passwords](#10-creating-app-specific-passwords)
11. [Notarization Submission Process](#11-notarization-submission-process)
12. [Stapling Notarization Tickets](#12-stapling-notarization-tickets)
13. [DMG and Installer Creation](#13-dmg-and-installer-creation)
14. [GitHub Actions CI/CD Integration](#14-github-actions-cicd-integration)
15. [Troubleshooting Guide](#15-troubleshooting-guide)
16. [Security Best Practices](#16-security-best-practices)
17. [Glossary](#17-glossary)

---

## 1. Overview

### What is Apple Developer Program?

The Apple Developer Program provides access to tools, resources, and distribution capabilities for developing and distributing macOS, iOS, iPadOS, watchOS, and tvOS applications.

### Why is Code Signing Required?

macOS includes a security feature called **Gatekeeper** that:
- Verifies downloaded applications are from identified developers
- Ensures applications haven't been tampered with since signing
- Blocks applications that don't meet security requirements

Starting with macOS 10.15 (Catalina), Apple requires **notarization** for all software distributed outside the Mac App Store.

### TerraTech Systems Credentials

| Field | Value |
|-------|-------|
| Organization | TERRA TECH SYSTEMS |
| Team ID | V2F8RR8GSR |
| Apple ID | tanenankh@gmail.com |
| Certificate Type | Developer ID Application |
| Keychain Profile | CodeEX-Notarization |

---

## 2. Apple Developer Program Enrollment

### Prerequisites

- Valid Apple ID
- Credit/debit card for $99/year fee
- D-U-N-S Number (for organizations)
- Legal authority to bind organization

### Enrollment Steps

1. **Visit**: https://developer.apple.com/programs/enroll/
2. **Sign in** with your Apple ID
3. **Select enrollment type**:
   - **Individual**: For solo developers
   - **Organization**: For companies (requires D-U-N-S)
4. **Complete identity verification**:
   - Organizations: Apple will contact your D-U-N-S listed contact
   - Individuals: May require phone verification
5. **Pay enrollment fee**: $99 USD/year
6. **Wait for approval**: Usually 24-48 hours

### D-U-N-S Number

For organizations, Apple requires a D-U-N-S Number:
- Free to obtain: https://www.dnb.com/duns-number.html
- Takes 1-5 business days
- Must match your legal business name exactly

### Verification Timeline

| Step | Duration |
|------|----------|
| D-U-N-S Lookup | 1-5 business days |
| Apple Verification | 24-48 hours |
| Total | 3-7 business days |

---

## 3. Understanding Certificate Types

### Developer ID Certificates (Outside App Store)

| Certificate | Purpose | Use Case |
|-------------|---------|----------|
| **Developer ID Application** | Sign applications (.app) | Desktop apps distributed via website |
| **Developer ID Installer** | Sign installer packages (.pkg) | Complex installations requiring PKG |

### Mac App Store Certificates

| Certificate | Purpose | Use Case |
|-------------|---------|----------|
| Mac App Distribution | Sign apps for App Store | Apps submitted to Mac App Store |
| Mac Installer Distribution | Sign App Store PKGs | Installers for App Store apps |

### Development Certificates

| Certificate | Purpose | Use Case |
|-------------|---------|----------|
| Apple Development | Local development & testing | Building/testing on your own devices |
| Mac Development (Legacy) | Older development workflow | Deprecated, use Apple Development |

### What TerraTech Uses

For CodeEX distribution via GitHub Releases:
- **Developer ID Application** - Signs the .app bundle
- Not using Developer ID Installer (DMG doesn't require PKG)

---

## 4. Creating a Certificate Signing Request (CSR)

### What is a CSR?

A Certificate Signing Request is a cryptographic message sent to a Certificate Authority (Apple) requesting a digital certificate. It contains:
- Your public key
- Your identification information
- Is signed with your private key (proving ownership)

### Creating CSR via Keychain Access

1. **Open Keychain Access**
   ```
   Applications → Utilities → Keychain Access
   ```

2. **Launch Certificate Assistant**
   ```
   Menu: Keychain Access → Certificate Assistant → Request a Certificate From a Certificate Authority...
   ```

3. **Fill in the form**:
   | Field | Value | Notes |
   |-------|-------|-------|
   | User Email Address | tanenankh@gmail.com | Your Apple ID email |
   | Common Name | TERRA TECH SYSTEMS | Your organization name |
   | CA Email Address | (leave blank) | Not needed |
   | Request is | Saved to disk | Creates .certSigningRequest file |
   | Let me specify key pair | Checked (optional) | For advanced configuration |

4. **Key Pair Settings** (if specified):
   | Setting | Value |
   |---------|-------|
   | Key Size | 2048 bits (minimum) or 4096 bits |
   | Algorithm | RSA |

5. **Save the file**
   - File name: `CertificateSigningRequest.certSigningRequest`
   - Location: A secure, accessible folder

### What Happens Behind the Scenes

When you create a CSR, Keychain Access:
1. Generates a **private key** (stored in Keychain, never leaves your Mac)
2. Generates a **public key** (included in CSR)
3. Creates the CSR file containing public key + your info
4. Signs the CSR with your private key

**CRITICAL**: The private key NEVER leaves your Mac. Apple only receives the public key.

### Verifying CSR Creation

After creating the CSR, you should see in Keychain Access under "Keys":
- A private key named with your Common Name
- A corresponding public key

---

## 5. Obtaining Developer ID Certificate

### Navigate to Certificates Portal

1. Go to: https://developer.apple.com/account/resources/certificates/list
2. Sign in with your Apple ID
3. You'll see the "Certificates, Identifiers & Profiles" page

### Create New Certificate

1. Click the **"+"** button (top left)
2. Under "Software" section, select **"Developer ID Application"**
3. Click **Continue**

### Upload CSR

1. Click **"Choose File"**
2. Select your `.certSigningRequest` file
3. Click **Continue**

### Download Certificate

1. Certificate is generated (nearly instant)
2. Click **Download**
3. File downloads as: `developerID_application.cer`

### Certificate Details

Your downloaded certificate contains:
- Your organization name
- Your Team ID
- Validity period (usually 5 years)
- Apple's signature verifying authenticity

---

## 6. Installing and Managing Certificates

### Installing the Certificate

**Method 1: Double-click**
1. Locate downloaded `.cer` file
2. Double-click to open
3. Keychain Access opens automatically
4. Certificate installs to "login" keychain

**Method 2: Keychain Access Import**
1. Open Keychain Access
2. Select "login" keychain (left sidebar)
3. Select "My Certificates" category
4. Drag `.cer` file into the window

### Verifying Installation

**Via Keychain Access:**
1. Open Keychain Access
2. Select "login" keychain → "My Certificates"
3. Look for "Developer ID Application: TERRA TECH SYSTEMS (V2F8RR8GSR)"
4. Certificate should show expandable arrow (indicating private key is attached)

**Via Terminal:**
```bash
security find-identity -v -p codesigning
```

Expected output:
```
1) 1234567890ABCDEF1234567890ABCDEF12345678 "Developer ID Application: TERRA TECH SYSTEMS (V2F8RR8GSR)"
     1 valid identities found
```

### Understanding the Certificate Chain

Your Developer ID certificate is part of a chain:
```
Apple Root CA
    └── Apple Worldwide Developer Relations Certification Authority
            └── Developer ID Certification Authority
                    └── Developer ID Application: TERRA TECH SYSTEMS
```

macOS automatically trusts Apple Root CA, which validates the entire chain.

### Private Key Association

**CRITICAL**: The certificate MUST be associated with its private key.

If you see the certificate but can't expand it (no arrow), the private key is missing. This means:
- CSR was created on a different Mac
- Private key was deleted from Keychain
- Certificate was imported without the associated private key

**Solution**: Create a new CSR on this Mac and request a new certificate.

---

## 7. Code Signing Fundamentals

### What is Code Signing?

Code signing is a cryptographic process that:
1. Creates a hash of your application's contents
2. Encrypts the hash with your private key
3. Embeds the encrypted hash (signature) in the application
4. Allows anyone to verify the signature using your public key (in the certificate)

### The `codesign` Command

Basic syntax:
```bash
codesign [options] --sign "identity" path/to/app
```

### Essential Options

| Option | Purpose | When to Use |
|--------|---------|-------------|
| `--force` | Replace existing signature | Always (ensures clean signature) |
| `--deep` | Sign nested code | Apps with frameworks/helpers |
| `--options runtime` | Enable hardened runtime | Required for notarization |
| `--timestamp` | Include secure timestamp | Required for notarization |
| `--entitlements` | Specify entitlements file | Apps needing special permissions |
| `--sign` | Specify signing identity | Always required |

### Hardened Runtime

The `--options runtime` flag enables **Hardened Runtime**, which:
- Protects against code injection
- Restricts debugging
- Prevents dylib hijacking
- Required for notarization since macOS 10.14.5

### Secure Timestamps

The `--timestamp` flag:
- Contacts Apple's timestamp server
- Proves when the signature was created
- Ensures signature remains valid even after certificate expires
- Required for notarization

### Basic Signing Example

```bash
codesign --force --deep --options runtime --timestamp \
    --sign "Developer ID Application: TERRA TECH SYSTEMS (V2F8RR8GSR)" \
    "/path/to/CodeEX.app"
```

### Verifying Signatures

**Basic verification:**
```bash
codesign --verify --verbose /path/to/CodeEX.app
```

**Deep verification (checks all nested code):**
```bash
codesign --verify --verbose --deep /path/to/CodeEX.app
```

**Display signature details:**
```bash
codesign --display --verbose=4 /path/to/CodeEX.app
```

---

## 8. Signing Complex Applications

### The Challenge with VS Code-based Apps

VS Code/VSCodium-based applications like CodeEX contain:
- Native Node.js addons (`.node` files)
- Dynamic libraries (`.dylib` files)
- Helper executables (rg, spawn-helper, etc.)
- Electron framework
- Helper apps (Squirrel, Crashpad, etc.)

**Each of these MUST be individually signed** before signing the main app.

### Why Order Matters

Code signing validates the entire bundle hierarchy. You must sign:
1. Innermost binaries first (deepest nested)
2. Work outward toward main app
3. Sign main app last

If you sign the main app first, then modify contents (by signing nested items), the main signature becomes invalid.

### CodeEX Signing Process

**Step 1: Sign all .node files**
```bash
find "/path/to/CodeEX.app" -name "*.node" -type f | while read file; do
    codesign --force --options runtime --timestamp \
        --sign "Developer ID Application: TERRA TECH SYSTEMS (V2F8RR8GSR)" \
        "$file"
done
```

**Step 2: Sign all .dylib files**
```bash
find "/path/to/CodeEX.app" -name "*.dylib" -type f | while read file; do
    codesign --force --options runtime --timestamp \
        --sign "Developer ID Application: TERRA TECH SYSTEMS (V2F8RR8GSR)" \
        "$file"
done
```

**Step 3: Sign specific executables**
```bash
for binary in rg codex-tunnel spawn-helper ShipIt; do
    find "/path/to/CodeEX.app" -name "$binary" -type f | while read file; do
        codesign --force --options runtime --timestamp \
            --sign "Developer ID Application: TERRA TECH SYSTEMS (V2F8RR8GSR)" \
            "$file"
    done
done
```

**Step 4: Sign frameworks**
```bash
find "/path/to/CodeEX.app/Contents/Frameworks" -name "*.framework" -type d | while read fw; do
    codesign --force --deep --options runtime --timestamp \
        --sign "Developer ID Application: TERRA TECH SYSTEMS (V2F8RR8GSR)" \
        "$fw"
done
```

**Step 5: Sign helper apps**
```bash
find "/path/to/CodeEX.app/Contents/Frameworks" -name "*.app" -type d | while read helper; do
    codesign --force --deep --options runtime --timestamp \
        --sign "Developer ID Application: TERRA TECH SYSTEMS (V2F8RR8GSR)" \
        "$helper"
done
```

**Step 6: Sign main app (last!)**
```bash
codesign --force --deep --options runtime --timestamp \
    --sign "Developer ID Application: TERRA TECH SYSTEMS (V2F8RR8GSR)" \
    "/path/to/CodeEX.app"
```

### Identifying Unsigned Binaries

If notarization fails, find unsigned Mach-O binaries:

```bash
find "/path/to/CodeEX.app" -type f -exec file {} \; | grep "Mach-O" | while read line; do
    file=$(echo "$line" | cut -d: -f1)
    if ! codesign --verify "$file" 2>/dev/null; then
        echo "Unsigned: $file"
    fi
done
```

---

## 9. Apple Notarization

### What is Notarization?

Notarization is Apple's automated security check that:
1. Scans your app for malicious content
2. Verifies proper code signing
3. Checks for hardened runtime
4. Issues a "ticket" confirming the app passed

### Notarization vs. App Review

| Notarization | App Review |
|--------------|------------|
| Automated scan | Human review |
| Takes minutes | Takes days |
| Security focused | Policy & quality focused |
| For outside App Store | For App Store only |
| Free | Included in developer fee |

### Requirements for Notarization

1. **Developer ID certificate** (not Mac App Store certificate)
2. **Hardened runtime** enabled (`--options runtime`)
3. **Secure timestamp** included (`--timestamp`)
4. **All nested binaries signed** with same requirements
5. **No prohibited components** (known malware, private APIs)

### Notarization Outcomes

| Status | Meaning | Action |
|--------|---------|--------|
| Accepted | App passed all checks | Staple ticket, distribute |
| Invalid | Submission format issue | Fix packaging, resubmit |
| Rejected | Security issues found | Review log, fix issues |

---

## 10. Creating App-Specific Passwords

### Why App-Specific Passwords?

Apple requires two-factor authentication (2FA) for developer accounts. For automated tools like `notarytool`, you can't use interactive 2FA, so Apple provides app-specific passwords.

### Creating an App-Specific Password

1. **Go to**: https://appleid.apple.com
2. **Sign in** with your Apple ID
3. **Navigate to**: Sign-In and Security → App-Specific Passwords
4. **Click**: Generate an app-specific password
5. **Enter a label**: "CodeEX Notarization" (or similar)
6. **Copy the password**: Format is `xxxx-xxxx-xxxx-xxxx`

### Password Format

App-specific passwords are always in the format:
```
xxxx-xxxx-xxxx-xxxx
```

Where each `x` is a lowercase letter.

Example: `sted-jrzo-seou-jlkg`

### Security Notes

- Each password can only be viewed once at creation
- Store immediately in a secure location
- Can be revoked at any time from Apple ID settings
- Create different passwords for different tools/services
- Maximum of 25 app-specific passwords per Apple ID

---

## 11. Notarization Submission Process

### Setting Up Credentials

**Option 1: Store in Keychain (Recommended)**
```bash
xcrun notarytool store-credentials "CodeEX-Notarization" \
    --apple-id "tanenankh@gmail.com" \
    --team-id "V2F8RR8GSR" \
    --password "xxxx-xxxx-xxxx-xxxx"
```

This stores credentials securely in macOS Keychain and you reference them by profile name.

**Option 2: Direct in Command (CI/CD)**
```bash
xcrun notarytool submit "app.dmg" \
    --apple-id "tanenankh@gmail.com" \
    --team-id "V2F8RR8GSR" \
    --password "xxxx-xxxx-xxxx-xxxx" \
    --wait
```

### Submitting for Notarization

**Using Keychain profile:**
```bash
xcrun notarytool submit "CodeEX-Ageixtic-IDE-0.1.0-arm64.dmg" \
    --keychain-profile "CodeEX-Notarization" \
    --wait
```

**The `--wait` flag:**
- Blocks until notarization completes
- Shows real-time status updates
- Returns exit code 0 on success
- Typically takes 2-10 minutes

### Understanding Output

**Successful submission:**
```
Conducting pre-submission checks for CodeEX-Ageixtic-IDE-0.1.0-arm64.dmg...
Submission ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
Successfully submitted for notarization.
Waiting for processing to complete...
Processing complete.
Status: Accepted
```

**Failed submission:**
```
Conducting pre-submission checks for app.dmg...
Error: The signature of the binary is invalid.
```

### Checking Status Manually

If you didn't use `--wait`:
```bash
xcrun notarytool info <submission-id> \
    --keychain-profile "CodeEX-Notarization"
```

### Viewing Notarization Log

Essential for debugging failures:
```bash
xcrun notarytool log <submission-id> \
    --keychain-profile "CodeEX-Notarization"
```

This downloads a JSON log with detailed information about each binary checked.

---

## 12. Stapling Notarization Tickets

### What is Stapling?

After Apple approves your app, they issue a "ticket" (digital receipt). Stapling:
- Embeds this ticket directly into your DMG/app
- Allows offline verification
- Users don't need internet to verify notarization

### How to Staple

```bash
xcrun stapler staple "CodeEX-Ageixtic-IDE-0.1.0-arm64.dmg"
```

### Verifying Stapled Ticket

```bash
xcrun stapler validate "CodeEX-Ageixtic-IDE-0.1.0-arm64.dmg"
```

Expected output:
```
Processing: CodeEX-Ageixtic-IDE-0.1.0-arm64.dmg
The validate action worked!
```

### What If You Don't Staple?

If you distribute without stapling:
- App still works (Apple's servers verify online)
- Users need internet connection on first launch
- Slower verification
- Not recommended for distribution

### Can You Staple .app Directly?

Yes, but for DMG distribution, staple the DMG instead:
- Stapling DMG covers the app inside
- Simpler distribution workflow
- Users get stapled app automatically when mounting DMG

---

## 13. DMG and Installer Creation

### Creating a Basic DMG

```bash
# Create temporary folder for DMG contents
mkdir -p /tmp/dmg-contents

# Copy app to temporary folder
cp -R "/path/to/CodeEX.app" /tmp/dmg-contents/

# Create Applications symlink (for drag-to-install)
ln -s /Applications /tmp/dmg-contents/Applications

# Create DMG
hdiutil create \
    -volname "CodeEX - Ageixtic IDE" \
    -srcfolder /tmp/dmg-contents \
    -ov \
    -format UDZO \
    "CodeEX-Ageixtic-IDE-0.1.0-arm64.dmg"
```

### DMG Format Options

| Format | Description | Size | Use Case |
|--------|-------------|------|----------|
| UDZO | Compressed (zlib) | Smallest | Distribution |
| UDBZ | Compressed (bzip2) | Smaller | Maximum compression |
| UDRO | Read-only | Medium | Simple distribution |
| UDRW | Read-write | Largest | Development only |

### Creating a Styled DMG

For professional appearance with background image:
```bash
# Create read-write DMG first
hdiutil create -volname "CodeEX" -srcfolder /tmp/dmg-contents \
    -ov -format UDRW "CodeEX-temp.dmg"

# Mount it
hdiutil attach "CodeEX-temp.dmg"

# Configure window (via AppleScript or manually)
# - Set background image
# - Arrange icons
# - Set window size

# Unmount
hdiutil detach "/Volumes/CodeEX"

# Convert to compressed format
hdiutil convert "CodeEX-temp.dmg" -format UDZO \
    -o "CodeEX-Ageixtic-IDE-0.1.0-arm64.dmg"

# Clean up
rm "CodeEX-temp.dmg"
```

### Complete DMG Workflow

```bash
#!/bin/bash
set -e

APP_NAME="CodeEX"
VERSION="0.1.0"
ARCH="arm64"
CERT_NAME="Developer ID Application: TERRA TECH SYSTEMS (V2F8RR8GSR)"
DMG_NAME="CodeEX-Ageixtic-IDE-${VERSION}-${ARCH}.dmg"

# 1. Sign the app (nested binaries first - see Section 8)
# ... signing commands ...

# 2. Create DMG
DMG_TEMP="/tmp/codex-dmg"
rm -rf "$DMG_TEMP"
mkdir -p "$DMG_TEMP"
cp -R "${APP_NAME}.app" "$DMG_TEMP/"
ln -s /Applications "$DMG_TEMP/Applications"

hdiutil create -volname "CodeEX - Ageixtic IDE" \
    -srcfolder "$DMG_TEMP" \
    -ov -format UDZO \
    "$DMG_NAME"

# 3. Sign the DMG
codesign --force --timestamp \
    --sign "$CERT_NAME" \
    "$DMG_NAME"

# 4. Notarize
xcrun notarytool submit "$DMG_NAME" \
    --keychain-profile "CodeEX-Notarization" \
    --wait

# 5. Staple
xcrun stapler staple "$DMG_NAME"

# 6. Generate checksum
shasum -a 256 "$DMG_NAME" > "${DMG_NAME}.sha256"

echo "Complete: $DMG_NAME"
```

---

## 14. GitHub Actions CI/CD Integration

### Overview

GitHub Actions can automate the entire build, sign, notarize, and release process.

### Required Secrets

Configure these in: Repository → Settings → Secrets and variables → Actions

| Secret | Description | How to Obtain |
|--------|-------------|---------------|
| `MACOS_CERTIFICATE` | Base64-encoded .p12 | Export from Keychain |
| `MACOS_CERTIFICATE_PWD` | Password for .p12 | Set during export |
| `KEYCHAIN_PWD` | Temporary keychain password | Generate random string |
| `APPLE_ID` | Apple ID email | Your Apple ID |
| `APPLE_TEAM_ID` | Team ID | V2F8RR8GSR |
| `APPLE_APP_PASSWORD` | App-specific password | appleid.apple.com |

### Exporting Certificate for CI

```bash
# 1. Open Keychain Access
# 2. Find "Developer ID Application: TERRA TECH SYSTEMS"
# 3. Right-click → Export
# 4. Save as .p12 with strong password

# 5. Convert to Base64
base64 -i certificate.p12 | pbcopy

# 6. Paste into GitHub secret MACOS_CERTIFICATE
```

### Workflow File Structure

```yaml
name: Build and Release CodeEX

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to build'
        required: true

jobs:
  build-macos:
    runs-on: macos-14  # Apple Silicon runner
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Import Certificate
        env:
          MACOS_CERTIFICATE: ${{ secrets.MACOS_CERTIFICATE }}
          MACOS_CERTIFICATE_PWD: ${{ secrets.MACOS_CERTIFICATE_PWD }}
          KEYCHAIN_PWD: ${{ secrets.KEYCHAIN_PWD }}
        run: |
          # Decode certificate
          echo $MACOS_CERTIFICATE | base64 --decode > certificate.p12

          # Create temporary keychain
          security create-keychain -p "$KEYCHAIN_PWD" build.keychain
          security default-keychain -s build.keychain
          security unlock-keychain -p "$KEYCHAIN_PWD" build.keychain

          # Import certificate
          security import certificate.p12 -k build.keychain \
              -P "$MACOS_CERTIFICATE_PWD" -T /usr/bin/codesign

          # Allow codesign access
          security set-key-partition-list -S apple-tool:,apple:,codesign: \
              -s -k "$KEYCHAIN_PWD" build.keychain

      - name: Build Application
        run: |
          # Your build steps here

      - name: Sign Application
        env:
          CERT_NAME: "Developer ID Application: TERRA TECH SYSTEMS (V2F8RR8GSR)"
        run: |
          # Sign nested binaries
          find "CodeEX.app" -name "*.node" -type f | while read file; do
            codesign --force --options runtime --timestamp \
                --sign "$CERT_NAME" "$file"
          done

          # ... additional signing steps ...

          # Sign main app
          codesign --force --deep --options runtime --timestamp \
              --sign "$CERT_NAME" "CodeEX.app"

      - name: Create DMG
        run: |
          mkdir -p /tmp/dmg
          cp -R "CodeEX.app" /tmp/dmg/
          ln -s /Applications /tmp/dmg/Applications

          hdiutil create -volname "CodeEX" \
              -srcfolder /tmp/dmg \
              -ov -format UDZO \
              "CodeEX-${{ github.ref_name }}-arm64.dmg"

      - name: Notarize
        env:
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          APPLE_APP_PASSWORD: ${{ secrets.APPLE_APP_PASSWORD }}
        run: |
          xcrun notarytool submit "CodeEX-${{ github.ref_name }}-arm64.dmg" \
              --apple-id "$APPLE_ID" \
              --team-id "$APPLE_TEAM_ID" \
              --password "$APPLE_APP_PASSWORD" \
              --wait

          xcrun stapler staple "CodeEX-${{ github.ref_name }}-arm64.dmg"

      - name: Upload Artifact
        uses: actions/upload-artifact@v4
        with:
          name: CodeEX-macos-arm64
          path: CodeEX-*.dmg
```

### Keychain Security in CI

**Why create a temporary keychain?**
- GitHub runners are shared (not fully trusted)
- Default keychain may have other credentials
- Temporary keychain is deleted after job
- Better isolation and security

**Critical: set-key-partition-list**
```bash
security set-key-partition-list -S apple-tool:,apple:,codesign: \
    -s -k "$KEYCHAIN_PWD" build.keychain
```

This allows `codesign` to access the private key without GUI prompts (essential for CI).

---

## 15. Troubleshooting Guide

### Certificate Issues

**Problem: "No identity found"**
```
error: No signing identity found
```

**Causes & Solutions:**
| Cause | Solution |
|-------|----------|
| Certificate not installed | Install .cer file |
| Private key missing | Create new CSR, get new certificate |
| Certificate expired | Renew at developer.apple.com |
| Wrong keychain | Check `security list-keychains` |

**Problem: "Certificate chain invalid"**
```
error: A certificate chain could not be verified
```

**Solution:**
```bash
# Download and install Apple certificates
curl -O https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer
curl -O https://www.apple.com/certificateauthority/DeveloperIDG2CA.cer
security import AppleWWDRCAG3.cer -k ~/Library/Keychains/login.keychain-db
security import DeveloperIDG2CA.cer -k ~/Library/Keychains/login.keychain-db
```

### Signing Issues

**Problem: "code object is not signed at all"**
```
/path/to/file: code object is not signed at all
```

**Solution:** Sign the specific file:
```bash
codesign --force --options runtime --timestamp \
    --sign "Developer ID Application: ..." \
    "/path/to/file"
```

**Problem: "invalid signature (code or signature have been modified)"**

**Cause:** File was modified after signing, or nested code was signed after parent.

**Solution:** Re-sign in correct order (inside-out).

### Notarization Issues

**Problem: "The signature of the binary is invalid"**

**Causes:**
1. Missing `--options runtime`
2. Missing `--timestamp`
3. Unsigned nested binaries

**Solution:** Re-sign with all required flags.

**Problem: "The executable requests the com.apple.security.get-task-allow entitlement"**

**Cause:** Debug entitlement present (development builds).

**Solution:** Remove or use production entitlements file.

### Getting Notarization Logs

```bash
# Get submission ID from notarytool output, then:
xcrun notarytool log <submission-id> \
    --keychain-profile "CodeEX-Notarization" \
    notarization-log.json

# View the log
cat notarization-log.json | python3 -m json.tool
```

**Log shows:**
- Each binary analyzed
- Issues found per binary
- Specific error codes and messages

### Common Notarization Errors

| Error | Meaning | Fix |
|-------|---------|-----|
| `NOTARIZATION_ERROR_UNSIGNED_BUNDLE` | App not signed | Sign the app |
| `NOTARIZATION_ERROR_HARDENED_RUNTIME` | Missing hardened runtime | Add `--options runtime` |
| `NOTARIZATION_ERROR_TIMESTAMP` | Missing timestamp | Add `--timestamp` |
| `NOTARIZATION_ERROR_STAPLE` | Stapling failed | Ensure valid notarization first |

---

## 16. Security Best Practices

### Private Key Protection

1. **Never export private keys** unless absolutely necessary
2. **Never commit certificates to Git** (add to .gitignore)
3. **Use separate certificates** for different apps if possible
4. **Revoke compromised certificates immediately**

### CI/CD Security

1. **Use GitHub Secrets** for all sensitive values
2. **Create temporary keychains** in CI, never use system keychain
3. **Delete keychains after use** (GitHub does this automatically)
4. **Rotate app-specific passwords** periodically
5. **Use minimum required permissions**

### App-Specific Password Security

1. **Create dedicated passwords** for each service
2. **Revoke unused passwords**
3. **Never hardcode in source**
4. **Store in secrets management** (GitHub Secrets, HashiCorp Vault, etc.)

### Certificate Expiration

Developer ID certificates are valid for 5 years. Set calendar reminders to renew before expiration.

Check expiration:
```bash
security find-certificate -c "Developer ID Application" -p | \
    openssl x509 -noout -enddate
```

---

## 17. Glossary

| Term | Definition |
|------|------------|
| **Certificate** | Digital document proving identity, issued by Apple |
| **Certificate Authority (CA)** | Entity that issues certificates (Apple) |
| **Certificate Signing Request (CSR)** | Request sent to CA for a certificate |
| **Code Signing** | Cryptographically signing code to prove identity and integrity |
| **Developer ID** | Apple program for distributing outside App Store |
| **DMG** | Disk Image, macOS installer format |
| **Entitlements** | Permissions requested by an app |
| **Gatekeeper** | macOS security feature checking app signatures |
| **Hardened Runtime** | Enhanced security mode for macOS apps |
| **Keychain** | macOS secure credential storage |
| **Mach-O** | macOS executable format |
| **Notarization** | Apple's automated security scan |
| **Private Key** | Secret key used to sign code (never shared) |
| **Public Key** | Key embedded in certificate (shared via certificate) |
| **Stapling** | Embedding notarization ticket in app/DMG |
| **Team ID** | Unique identifier for Apple Developer account |
| **Timestamp** | Proof of when signing occurred |
| **UDZO** | Compressed disk image format |

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-11 | GIXSIS | Initial creation |

---

## References

- [Apple Developer Documentation: Notarizing macOS Software](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [Apple Developer Documentation: Code Signing Guide](https://developer.apple.com/library/archive/documentation/Security/Conceptual/CodeSigningGuide/)
- [Apple Developer: Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/)
- [xcrun notarytool man page](https://keith.github.io/xcode-man-pages/notarytool.1.html)
- [codesign man page](https://keith.github.io/xcode-man-pages/codesign.1.html)

---

**Document prepared for TERRA TECH SYSTEMS training purposes.**
