# Apple Developer Certificate Setup for CodeEX

## Prerequisites
- Apple Developer Program membership ($99/year)
- macOS with Keychain Access
- Xcode installed (optional but recommended)

## Step 1: Log into Developer Portal
1. Go to [developer.apple.com](https://developer.apple.com)
2. Sign in with your Apple ID

## Step 2: Create a Certificate Signing Request (CSR)
1. Open **Keychain Access** on your Mac (Applications → Utilities)
2. Menu: Keychain Access → Certificate Assistant → **Request a Certificate From a Certificate Authority**
3. Fill in:
   - **Email:** your Apple ID email
   - **Common Name:** "TerraTech Systems" (or your registered developer name)
   - **CA Email:** leave blank
   - **Request is:** Select "Saved to disk"
4. Save the `.certSigningRequest` file to a known location

## Step 3: Create Developer ID Certificate
1. In Developer Portal: [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/certificates/list)
2. Click **"+"** to create new certificate
3. Under "Software", select **"Developer ID Application"**
   - This is for distributing apps outside the Mac App Store
4. Click Continue
5. Upload the CSR file you created in Step 2
6. Click Continue
7. Download the certificate (`.cer` file)

## Step 4: Install Certificate
1. Double-click the downloaded `.cer` file
2. It will automatically install in Keychain Access
3. The certificate should appear under "My Certificates" in Keychain Access

## Step 5: Verify Installation
Run this command in Terminal:
```bash
security find-identity -v -p codesigning
```

Expected output:
```
1) ABCDEF123456... "Developer ID Application: TerraTech Systems (TEAMID)"
   1 valid identities found
```

## Step 6: Sign CodeEX
Once the certificate is installed, sign the app:
```bash
# Sign the app with your Developer ID
codesign --force --deep --options runtime \
    --sign "Developer ID Application: TerraTech Systems (TEAMID)" \
    "/path/to/CodeEX - Ageixtic IDE.app"

# Verify the signature
codesign --verify --verbose "/path/to/CodeEX - Ageixtic IDE.app"
```

## Step 7: Notarize the App
Notarization is required for apps to pass Gatekeeper on macOS 10.15+.

### Create App-Specific Password
1. Go to [appleid.apple.com](https://appleid.apple.com)
2. Sign In → Security → App-Specific Passwords
3. Generate a new password for "CodeEX Notarization"
4. Save this password securely

### Store Credentials in Keychain
```bash
xcrun notarytool store-credentials "CodeEX-Notarization" \
    --apple-id "your-apple-id@email.com" \
    --team-id "TEAMID" \
    --password "app-specific-password"
```

### Create and Notarize DMG
```bash
# Create DMG
hdiutil create -volname "CodeEX - Ageixtic IDE" \
    -srcfolder "/path/to/dmg-contents" \
    -ov -format UDZO \
    "CodeEX-Ageixtic-IDE-0.1.0-arm64.dmg"

# Submit for notarization
xcrun notarytool submit "CodeEX-Ageixtic-IDE-0.1.0-arm64.dmg" \
    --keychain-profile "CodeEX-Notarization" \
    --wait

# Staple the notarization ticket
xcrun stapler staple "CodeEX-Ageixtic-IDE-0.1.0-arm64.dmg"
```

## Step 8: Verify Notarization
```bash
# Check notarization status
spctl --assess --type open --context context:primary-signature -v "CodeEX-Ageixtic-IDE-0.1.0-arm64.dmg"

# Should output: accepted
```

## Troubleshooting

### Certificate Not Showing
- Ensure you downloaded "Developer ID Application" (not "Mac App Distribution")
- Check that the private key exists in Keychain (should show as expandable item)
- Try: Keychain Access → View → Show Expired Certificates (toggle off)

### Notarization Failed
- Check log: `xcrun notarytool log <submission-id> --keychain-profile "CodeEX-Notarization"`
- Common issues:
  - Missing hardened runtime (`--options runtime` flag)
  - Unsigned nested components
  - Invalid entitlements

### "Developer cannot be verified" Warning
- App was signed but not notarized
- Or notarization ticket not stapled to DMG

## Certificate Types Reference

| Certificate | Purpose |
|-------------|---------|
| Developer ID Application | Distribute apps outside Mac App Store |
| Developer ID Installer | Sign installer packages (.pkg) |
| Mac App Distribution | Distribute via Mac App Store |
| Mac Installer Distribution | Mac App Store installer packages |

## Resources
- [Apple Developer Documentation](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [Notarization Overview](https://developer.apple.com/documentation/notaryapi)
- [Code Signing Guide](https://developer.apple.com/library/archive/documentation/Security/Conceptual/CodeSigningGuide/Introduction/Introduction.html)
