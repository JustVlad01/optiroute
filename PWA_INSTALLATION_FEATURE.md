# PWA Installation Feature

## Overview
The Around Noon app now includes a hidden PWA (Progressive Web App) installation feature that allows users to install the app on their devices for improved performance and offline access.

## How it Works

### Activation
- Users need to click on the **"AROUND NOON."** logo on the **login page** **5 times** to trigger the installation prompt
- The logo will show subtle hover effects (slight scale and text shadow) to indicate it's clickable
- The click counter resets after 10 seconds of inactivity to prevent accidental triggers
- This hidden feature prevents users from accidentally triggering installation prompts

### Installation Process

#### For Modern Browsers (Chrome, Edge, Firefox)
1. After 5 clicks on the login logo, a confirmation dialog appears asking if the user wants to install the app
2. If the user agrees, the browser's native PWA installation prompt is shown
3. Users can then install the app directly to their device's home screen

#### For iOS Safari
1. Shows specific instructions for iOS users:
   - Tap the Share button in Safari
   - Scroll down and tap "Add to Home Screen"
   - Tap "Add" to install the app

#### For Already Installed Apps
- If the app is already installed, users will see a confirmation message
- If PWA prompt is not available, users get general installation guidance

### Features
- **Login Page Activation**: Easy access from the first page users see
- **Visual Feedback**: Hover effects indicate the logo is interactive
- **Automatic Detection**: Detects if the app is already installed
- **Platform-Specific Instructions**: Provides appropriate guidance for iOS vs other platforms
- **User-Friendly**: Clear, emoji-enhanced prompts guide users through installation
- **Non-Intrusive**: Hidden activation prevents accidental interruptions
- **Smart Reset**: Click counter automatically resets to prevent false triggers

### Technical Implementation
- **Login Component**: PWA functionality integrated into login page
- **PwaService**: Handles PWA installation logic and browser compatibility
- **Clickable Logo**: "AROUND NOON." logo responds to clicks with visual feedback
- **Manifest Configuration**: Pre-configured with app icons and metadata
- **Service Worker**: Enables offline functionality and background updates

### Benefits of Installation
- ✅ **Faster Loading**: Cached resources for improved performance
- ✅ **Offline Access**: Continue using core features without internet
- ✅ **Home Screen Access**: Launch directly from device home screen
- ✅ **Native Feel**: Full-screen experience without browser UI
- ✅ **Background Updates**: Automatic updates when new versions are available

### Browser Support
- ✅ Chrome/Chromium-based browsers (Chrome, Edge, Opera)
- ✅ Firefox (with PWA support)
- ✅ Safari on iOS (with manual instructions)
- ✅ Samsung Internet
- ⚠️ Fallback instructions for unsupported browsers

## Testing the Feature
1. Navigate to the login page of the Around Noon app
2. Click on the **"AROUND NOON."** logo 5 times quickly
3. You should see hover effects when hovering over the logo
4. After 5 clicks, follow the installation prompts that appear
5. The app should now be available as a standalone application

## Development Notes
- The feature uses the browser's `beforeinstallprompt` event
- Includes fallback handling for browsers without native PWA support
- Console logging helps with debugging during development (check browser console)
- Service worker registration enables full PWA functionality
- Logo includes visual feedback (scale transform and text shadow on hover)
- User-select is disabled on the logo to prevent text selection during clicking 