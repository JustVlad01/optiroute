import { Component, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter, interval, Subject, takeUntil } from 'rxjs';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'Around Noon';
  updateAvailable = false;
  showUpdatePrompt = false;
  private destroy$ = new Subject<void>();
  private currentVersion: string | null = null;

  constructor(
    private swUpdate: SwUpdate,
    private http: HttpClient
  ) {}

  ngOnInit() {
    this.currentVersion = this.getAppVersion();
    console.log('App initialized with version:', this.currentVersion);
    
    if (this.swUpdate.isEnabled) {
      this.setupServiceWorkerUpdates();
    }

    // Check for server version updates
    this.checkServerVersion();
    // Check every 5 minutes for new versions (optimized from 1 minute)
    interval(300000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.checkServerVersion());
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupServiceWorkerUpdates() {
    // Listen for available updates
    this.swUpdate.versionUpdates
      .pipe(
        filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        console.log('New version available via service worker');
        this.showUpdateNotification();
      });

    // Handle unrecoverable state
    this.swUpdate.unrecoverable
      .pipe(takeUntil(this.destroy$))
      .subscribe(event => {
        console.error('Service worker in unrecoverable state:', event.reason);
        this.forceReload();
      });

    // Check for updates immediately
    this.checkForUpdates();
    
    // Check for updates every 2 minutes (optimized from 30 seconds)
    interval(120000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.checkForUpdates());
  }

  private getAppVersion(): string {
    // Try to get version from meta tag
    const metaTag = document.querySelector('meta[name="build-timestamp"]');
    const metaVersion = metaTag?.getAttribute('content');
    
    if (metaVersion) {
      console.log('Found meta version:', metaVersion);
      return metaVersion;
    }
    
    // Fallback to current timestamp
    const fallbackVersion = Date.now().toString();
    console.log('No meta version found, using fallback:', fallbackVersion);
    return fallbackVersion;
  }

  private checkServerVersion() {
    console.log('Checking server version...');
    this.http.get<any>('/api/version', {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    }).subscribe({
      next: (versionInfo) => {
        const serverVersion = versionInfo.version?.toString();
        console.log('Server version:', serverVersion, 'Current version:', this.currentVersion);
        
        if (serverVersion && this.currentVersion && serverVersion !== this.currentVersion) {
          const serverNum = parseInt(serverVersion, 10);
          const currentNum = parseInt(this.currentVersion, 10);
          
          // Check if server version is newer (higher timestamp)
          if (!isNaN(serverNum) && !isNaN(currentNum) && serverNum > currentNum) {
            // Additional check: versions different by more than 30 seconds to avoid false positives
            if (Math.abs(serverNum - currentNum) > 30000) {
              console.log('Newer server version detected, showing update notification');
              this.showUpdateNotification();
            }
          }
        }
      },
      error: (err) => {
        console.warn('Could not check server version:', err);
        // Don't show error to user, just log it
      }
    });
  }

  private checkForUpdates() {
    if (this.swUpdate.isEnabled) {
      this.swUpdate.checkForUpdate().then((hasUpdate) => {
        if (hasUpdate) {
          console.log('Service worker update found');
        }
      }).catch(err => {
        console.error('Error checking for updates:', err);
      });
    }
  }

  private showUpdateNotification() {
    // Prevent multiple simultaneous notifications
    if (this.showUpdatePrompt) {
      return;
    }
    
    this.updateAvailable = true;
    this.showUpdatePrompt = true;
    
    console.log('Showing update notification to user');
    
    // Show notification for 15 seconds, then auto-update (increased from 10 seconds)
    setTimeout(() => {
      if (this.showUpdatePrompt) {
        console.log('Auto-updating after timeout');
        this.updateApp();
      }
    }, 15000);
  }

  updateApp() {
    console.log('Updating app to latest version...');
    this.showUpdatePrompt = false;
    
    // First try to activate the service worker update
    if (this.swUpdate.isEnabled) {
      this.swUpdate.activateUpdate().then(() => {
        console.log('Service worker updated, reloading...');
        this.clearCachesAndReload();
      }).catch((error) => {
        console.log('No service worker update available or error occurred:', error);
        this.clearCachesAndReload();
      });
    } else {
      console.log('Service worker not enabled, performing manual reload');
      this.clearCachesAndReload();
    }
  }

  dismissUpdate() {
    this.showUpdatePrompt = false;
    this.updateAvailable = false;
  }

  private clearCachesAndReload() {
    // Clear all caches
    if ('caches' in window) {
      caches.keys().then(cacheNames => {
        const deletePromises = cacheNames.map(cacheName => {
          console.log('Deleting cache:', cacheName);
          return caches.delete(cacheName);
        });
        
        Promise.all(deletePromises).finally(() => {
          this.forceReload();
        });
      }).catch(() => {
        this.forceReload();
      });
    } else {
      this.forceReload();
    }
  }

  private forceReload() {
    // Add cache busting parameter
    const currentUrl = window.location.href;
    const separator = currentUrl.includes('?') ? '&' : '?';
    const newUrl = currentUrl + separator + 'cb=' + Date.now();
    
    // Force navigation to the new URL
    window.location.replace(newUrl);
  }
}
