import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class PwaService {
  private deferredPrompt: any;
  private clickCount = 0;
  private resetTimeout: any;

  constructor() {
    // Listen for the beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later
      this.deferredPrompt = e;
      console.log('PWA: beforeinstallprompt event fired');
    });

    // Listen for the app being installed
    window.addEventListener('appinstalled', () => {
      console.log('PWA: App was installed');
      this.deferredPrompt = null;
    });
  }

  handleAroundNoonClick(): void {
    this.clickCount++;
    console.log(`PWA: Click count: ${this.clickCount}`);
    console.log('PWA: handleAroundNoonClick() called');

    // Reset the count after 10 seconds of no clicks
    clearTimeout(this.resetTimeout);
    this.resetTimeout = setTimeout(() => {
      this.clickCount = 0;
      console.log('PWA: Click count reset');
    }, 10000);

    // Check if user has clicked 5 times
    if (this.clickCount >= 5) {
      console.log('PWA: 5 clicks reached! Showing install prompt...');
      this.showInstallPrompt();
      this.clickCount = 0; // Reset count after showing prompt
    }
  }

  public showInstallPrompt(): void {
    console.log('PWA: showInstallPrompt() called');
    console.log('PWA: deferredPrompt available:', !!this.deferredPrompt);
    console.log('PWA: isIos():', this.isIos());
    console.log('PWA: isStandalone():', this.isStandalone());
    
    if (this.deferredPrompt) {
      console.log('PWA: Using native browser prompt');
      // Show the installation prompt
      const userChoice = confirm(
        '🚀 Install Around Noon App?\n\n' +
        'Would you like to install the Around Noon app on your device for quick access? ' +
        'You can access it from your home screen'
      );

      if (userChoice) {
        console.log('PWA: User confirmed installation');
        // Show the install prompt
        this.deferredPrompt.prompt();
        
        // Wait for the user to respond to the prompt
        this.deferredPrompt.userChoice.then((choiceResult: any) => {
          if (choiceResult.outcome === 'accepted') {
            console.log('PWA: User accepted the install prompt');
          } else {
            console.log('PWA: User dismissed the install prompt');
          }
          this.deferredPrompt = null;
        });
      } else {
        console.log('PWA: User cancelled installation');
      }
    } else {
      console.log('PWA: Using fallback prompt');
      // Fallback if PWA prompt is not available
      if (this.isIos()) {
        console.log('PWA: Showing iOS instructions');
        alert(
          '📱 Install Around Noon App\n\n' +
          'To install this app on your iOS device:\n' +
          '1. Tap the Share button in Safari\n' +
          '2. Scroll down and tap "Add to Home Screen"\n' +
          '3. Tap "Add" to install the app'
        );
      } else if (this.isStandalone()) {
        console.log('PWA: App already installed');
        alert('✅ Around Noon app is already installed!');
      } else {
        console.log('PWA: Showing general instructions');
        alert(
          '💡 Install Around Noon App\n\n' +
          'This app can be installed for better performance and offline access. ' +
          'Look for the install option in your browser menu or address bar.'
        );
      }
    }
  }

  private isIos(): boolean {
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  }

  private isStandalone(): boolean {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
           (window.navigator as any).standalone ||
           document.referrer.includes('android-app://');
  }

  public canInstall(): boolean {
    return !!this.deferredPrompt || this.isIos();
  }

  public isInstalled(): boolean {
    return this.isStandalone();
  }
} 